import { sceneRegistry, useScene } from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
} from 'three/webgpu'
import * as THREE from 'three/webgpu'
import { SHADOW_ONLY_LAYER } from '../../lib/layers'
import { getSceneTheme } from '../../lib/scene-themes'
import useViewer from '../../store/use-viewer'

// Diagnostic toggle: `?disable=shadows` skips the shadow-map render pass
// (which doubles draw calls for every shadow-casting mesh) so you can
// isolate how much of the baseline GPU cost is shadows vs. raw geometry.
const SHADOWS_DISABLED =
  typeof window !== 'undefined' &&
  new Set(
    (new URLSearchParams(window.location.search).get('disable') ?? '')
      .split(',')
      .map((s) => s.trim()),
  ).has('shadows')

// Diagnostic toggle: `?debug=shadowcamera` draws a CameraHelper for each
// shadow camera so the building-fit frustum (and thus shadow texel density)
// can be inspected while tuning margins/bias.
const SHADOW_CAMERA_DEBUG =
  typeof window !== 'undefined' &&
  new Set(
    (new URLSearchParams(window.location.search).get('debug') ?? '')
      .split(',')
      .map((s) => s.trim()),
  ).has('shadowcamera')

// Shadow darkness for the bright key lights (themes drive most lights past
// intensity 1). Runs high so shadowed areas actually lose the sun's
// contribution — the ambient/hemisphere/IBL stack provides the fill. The old
// 0.55 clamp leaked 45% of the key light into shadow and flattened interiors;
// 0.9 read too heavy in review.
const MAX_SHADOW_INTENSITY = 0.75

// `normalBias` is measured in world units. The previous 0.3 moved shadow
// lookups 30 cm off their surfaces, visibly detaching wall shadows at the
// floor; 0.07 and below still acnes on the building-fit 1024 map (large
// texels), so 0.08 is the smallest acne-free value at that resolution — even
// with the depth bias at -0.0005 (which is itself needed: 0.08 alone still
// showed faint acne at -0.0001).
const SHADOW_DEPTH_BIAS = -0.0005
const SHADOW_NORMAL_BIAS = 0.08

// Shadow frustum framing. The frustum is fit to the BUILDING geometry (not the
// camera): we union the bounds of all registered scene nodes, fit a sphere, and
// size the directional light's ortho shadow camera to that sphere plus a margin.
// This keeps shadows anchored to the building and a bit of surrounding ground no
// matter how the user zooms or pans — fixing the previous camera-following
// behaviour that fell apart when zoomed out (frustum too small) or zoomed into
// an empty corner (frustum centred on nothing).
//
// `site` nodes (the ground/site plane, which can be arbitrarily large) are
// excluded so they don't blow the frustum up to cover the whole lot.
const SHADOW_EXCLUDED_TYPES = ['site'] as const
// Extra coverage around the building bounds — the "and a bit nearby" margin so
// shadows don't get clipped right at the walls. Scales with building size.
const SHADOW_MARGIN_SCALE = 1.15
const SHADOW_MARGIN = 3
// Gap between the building bounds sphere and the light / near plane.
const SHADOW_BACKOFF = 10
// Fallback radius when the scene has no building geometry yet (empty scene).
const SHADOW_FALLBACK_RADIUS = 30

export const VIEWER_LIGHTING_OWNER = 'viewer'
export const VIEWER_LIGHTING_OWNER_USER_DATA_KEY = 'pascalLightingOwner'

export function viewerOwnsLighting(owner: unknown) {
  return owner === undefined || owner === null || owner === VIEWER_LIGHTING_OWNER
}

export function shouldRefreshShadowBounds(
  shadows: boolean,
  dirty: boolean,
  geometryRevision: number,
  lastGeometryRevision: number,
  registryRevision: number,
  lastRegistryRevision: number,
) {
  return (
    shadows &&
    (dirty ||
      geometryRevision !== lastGeometryRevision ||
      registryRevision !== lastRegistryRevision)
  )
}

const LIGHT_VALUE_EPSILON = 0.001
const LIGHT_COLOR_EPSILON = 1 / 1024

function advanceScalar(current: number, target: number, amount: number) {
  const next = THREE.MathUtils.lerp(current, target, amount)
  return Math.abs(next - target) <= LIGHT_VALUE_EPSILON ? target : next
}

function advanceColor(current: THREE.Color, target: THREE.Color, amount: number) {
  current.lerp(target, amount)
  const settled =
    Math.abs(current.r - target.r) <= LIGHT_COLOR_EPSILON &&
    Math.abs(current.g - target.g) <= LIGHT_COLOR_EPSILON &&
    Math.abs(current.b - target.b) <= LIGHT_COLOR_EPSILON
  if (settled) current.copy(target)
  return settled
}

export function Lights() {
  const sceneTheme = useViewer((state) => state.sceneTheme)
  const theme = getSceneTheme(sceneTheme)
  const shadows = useViewer((state) => state.shadows)

  const lightRefs = useRef<Array<DirectionalLight | null>>([])
  const shadowCamera = useRef<OrthographicCamera>(null)
  // Initial ortho half-size; overridden each refresh to fit the building.
  const shadowCameraSize = 50

  // Building bounds the shadow frustum is fit to when scene inputs change.
  const shadowFocus = useRef(new THREE.Vector3()) // sphere centre
  const shadowRadius = useRef(SHADOW_FALLBACK_RADIUS) // sphere radius
  const shadowDir = useRef(new THREE.Vector3()) // scratch: per-light direction
  const boundsBox = useRef(new THREE.Box3()) // scratch: union AABB
  const boundsSphere = useRef(new THREE.Sphere()) // scratch: fitted sphere
  const shadowBoundsDirty = useRef(true)
  const lastGeometryRevision = useRef(-1)
  const lastRegistryRevision = useRef(-1)
  const shadowHelpers = useRef<Array<THREE.CameraHelper | null>>([])

  const hemiRef = useRef<HemisphereLight>(null)
  const ambientRef = useRef<AmbientLight>(null)

  const initialized = useRef(false)
  const appliedTheme = useRef<typeof theme | null>(null)
  const transitioning = useRef(false)
  const hadViewerOwnership = useRef(true)

  const targets = useMemo(
    () => ({
      ambient: new THREE.Color(theme.ambient.color),
      hemiGround: theme.hemi ? new THREE.Color(theme.hemi.ground) : null,
      hemiSky: theme.hemi ? new THREE.Color(theme.hemi.sky) : null,
      lights: theme.lights.map((light) => new THREE.Color(light.color)),
    }),
    [theme],
  )

  useEffect(
    () =>
      useScene.subscribe(() => {
        shadowBoundsDirty.current = true
      }),
    [],
  )

  useFrame((state, delta) => {
    const owner = state.scene.userData[VIEWER_LIGHTING_OWNER_USER_DATA_KEY]
    if (!viewerOwnsLighting(owner)) {
      hadViewerOwnership.current = false
      return
    }
    if (!hadViewerOwnership.current) {
      hadViewerOwnership.current = true
      initialized.current = false
      shadowBoundsDirty.current = true
    }

    const themeChanged = appliedTheme.current !== theme
    if (themeChanged) shadowBoundsDirty.current = true

    // Fit each shadow-casting light's frustum to the BUILDING geometry rather
    // than the camera. We refresh the union bounds when scene inputs change,
    // fit a sphere, and size + place the
    // ortho shadow camera so the building (plus a margin) is fully covered from
    // the light's direction. The light DIRECTION stays exactly as the theme
    // specifies; only its position/distance and the frustum extents change.
    const geometryRevision = useViewer.getState().geometryRevision
    const registryRevision = sceneRegistry.revision
    if (
      shouldRefreshShadowBounds(
        shadows,
        shadowBoundsDirty.current,
        geometryRevision,
        lastGeometryRevision.current,
        registryRevision,
        lastRegistryRevision.current,
      )
    ) {
      const box = boundsBox.current.makeEmpty()
      for (const [id, obj] of sceneRegistry.nodes) {
        if (SHADOW_EXCLUDED_TYPES.some((t) => sceneRegistry.byType[t]!.has(id))) continue
        box.expandByObject(obj)
      }
      box.getBoundingSphere(boundsSphere.current)
      const center = boundsSphere.current.center
      const radius = boundsSphere.current.radius
      // Empty scene OR a node with a NaN position/geometry poisoning the union
      // box: fall back to the origin with a default radius. The directional
      // light's position is derived from `focus`, so a single non-finite mesh
      // must NOT be allowed to make `focus`/`radius` NaN — that breaks every
      // shadow-casting light's position and renders the whole scene black.
      const finiteBounds =
        !box.isEmpty() &&
        Number.isFinite(center.x) &&
        Number.isFinite(center.y) &&
        Number.isFinite(center.z) &&
        Number.isFinite(radius)
      if (finiteBounds) {
        shadowFocus.current.copy(center)
        shadowRadius.current = radius
      } else {
        shadowFocus.current.set(0, 0, 0)
        shadowRadius.current = SHADOW_FALLBACK_RADIUS
      }

      const focus = shadowFocus.current
      // Ortho half-extent: the building sphere plus a proportional margin.
      const size = shadowRadius.current * SHADOW_MARGIN_SCALE + SHADOW_MARGIN
      // Park the light just outside the sphere so the near plane stays positive
      // and the whole building fits between near and far along the light axis.
      const distance = size + SHADOW_BACKOFF
      const near = SHADOW_BACKOFF
      const far = distance + size

      for (let index = 0; index < theme.lights.length; index++) {
        const config = theme.lights[index]
        const light = lightRefs.current[index]
        if (!(config?.castShadow && light)) continue
        const [ox, oy, oz] = config.position
        const dir = shadowDir.current.set(ox, oy, oz)
        if (dir.lengthSq() === 0) dir.set(0, 1, 0)
        dir.normalize().multiplyScalar(distance)
        light.position.set(focus.x + dir.x, focus.y + dir.y, focus.z + dir.z)
        light.target.position.copy(focus)
        light.target.updateMatrixWorld()

        // Resize the ortho frustum to the fitted bounds. The shadow camera is
        // the <orthographicCamera attach="shadow-camera"> below.
        const cam = light.shadow?.camera as THREE.OrthographicCamera | undefined
        if (cam) {
          // Shadow-caster-only geometry (hidden roofs/levels in cutaway views)
          // is visible to the shadow pass alone — see lib/shadow-only.ts.
          cam.layers.enable(SHADOW_ONLY_LAYER)
          cam.left = -size
          cam.right = size
          cam.top = size
          cam.bottom = -size
          cam.near = near
          cam.far = far
          cam.updateProjectionMatrix()
          if (SHADOW_CAMERA_DEBUG) {
            let helper = shadowHelpers.current[index]
            if (!helper) {
              helper = new THREE.CameraHelper(cam)
              shadowHelpers.current[index] = helper
              state.scene.add(helper)
            }
            helper.update()
          }
        }
      }
      shadowBoundsDirty.current = false
      lastGeometryRevision.current = geometryRevision
      lastRegistryRevision.current = registryRevision
    }

    if (!initialized.current) {
      for (let index = 0; index < theme.lights.length; index++) {
        const config = theme.lights[index]
        const light = lightRefs.current[index]
        if (!(config && light)) continue
        light.intensity = config.intensity
        light.color.set(config.color)

        if (config.castShadow && light.shadow) {
          light.shadow.intensity = config.intensity <= 1 ? config.intensity : MAX_SHADOW_INTENSITY
        }
      }
      if (hemiRef.current && theme.hemi) {
        hemiRef.current.intensity = theme.hemi.intensity
        if (targets.hemiSky) hemiRef.current.color.copy(targets.hemiSky)
        if (targets.hemiGround) hemiRef.current.groundColor.copy(targets.hemiGround)
      }
      if (ambientRef.current) {
        ambientRef.current.intensity = theme.ambient.intensity
        ambientRef.current.color.copy(targets.ambient)
      }
      initialized.current = true
      appliedTheme.current = theme
      transitioning.current = false
      return
    }

    if (themeChanged) {
      appliedTheme.current = theme
      transitioning.current = true
    }
    if (!transitioning.current) return

    // Clamp delta to avoid huge jumps on tab switch, then stop touching light
    // state entirely once the theme transition reaches its targets.
    const dt = Math.min(delta, 0.1) * 4
    let stillTransitioning = false

    for (let index = 0; index < theme.lights.length; index++) {
      const config = theme.lights[index]
      const light = lightRefs.current[index]
      if (!(config && light)) continue

      light.intensity = advanceScalar(light.intensity, config.intensity, dt)
      stillTransitioning ||= Math.abs(light.intensity - config.intensity) > LIGHT_VALUE_EPSILON
      const target = targets.lights[index]
      if (target) {
        const colorTransitioning = !advanceColor(light.color, target, dt)
        stillTransitioning = colorTransitioning || stillTransitioning
      }

      if (config.castShadow && light.shadow) {
        if (light.shadow.intensity !== undefined) {
          const targetIntensity = config.intensity <= 1 ? config.intensity : MAX_SHADOW_INTENSITY
          light.shadow.intensity = advanceScalar(light.shadow.intensity, targetIntensity, dt)
          stillTransitioning ||=
            Math.abs(light.shadow.intensity - targetIntensity) > LIGHT_VALUE_EPSILON
        }
      }
    }

    if (hemiRef.current && theme.hemi) {
      hemiRef.current.intensity = advanceScalar(hemiRef.current.intensity, theme.hemi.intensity, dt)
      stillTransitioning ||=
        Math.abs(hemiRef.current.intensity - theme.hemi.intensity) > LIGHT_VALUE_EPSILON
      if (targets.hemiSky) {
        const skyTransitioning = !advanceColor(hemiRef.current.color, targets.hemiSky, dt)
        stillTransitioning = skyTransitioning || stillTransitioning
      }
      if (targets.hemiGround) {
        const groundTransitioning = !advanceColor(
          hemiRef.current.groundColor,
          targets.hemiGround,
          dt,
        )
        stillTransitioning = groundTransitioning || stillTransitioning
      }
    }

    if (ambientRef.current) {
      ambientRef.current.intensity = advanceScalar(
        ambientRef.current.intensity,
        theme.ambient.intensity,
        dt,
      )
      stillTransitioning ||=
        Math.abs(ambientRef.current.intensity - theme.ambient.intensity) > LIGHT_VALUE_EPSILON
      const ambientColorTransitioning = !advanceColor(ambientRef.current.color, targets.ambient, dt)
      stillTransitioning = ambientColorTransitioning || stillTransitioning
    }
    transitioning.current = stillTransitioning
  })

  return (
    <>
      {theme.lights.map((light, index) => (
        // The user-facing shadows toggle must NOT flip `castShadow` at runtime:
        // three r184's WebGPU node cache keys builder state by castShadow, but
        // evicts with the post-toggle key, so flipping off disposes the shadow
        // map's GPU texture while the shadows-on cache entry (still referencing
        // it) survives. Re-enabling then reuses that stale state and every
        // submit fails ("Invalid CommandBuffer ... renderContext_N"). The
        // toggle is applied via `renderer.shadowMap.enabled` (Canvas `shadows`
        // prop in viewer/index.tsx), which round-trips without disposing.
        <directionalLight
          castShadow={Boolean(light.castShadow) && !SHADOWS_DISABLED}
          key={`${index}-${light.position.join(',')}`}
          position={light.position}
          ref={(ref) => {
            lightRefs.current[index] = ref
          }}
          shadow-bias={SHADOW_DEPTH_BIAS}
          shadow-mapSize={[1024, 1024]}
          shadow-normalBias={SHADOW_NORMAL_BIAS}
          shadow-radius={2}
        >
          {light.castShadow && !SHADOWS_DISABLED ? (
            <orthographicCamera
              attach="shadow-camera"
              bottom={-shadowCameraSize}
              far={400}
              left={-shadowCameraSize}
              near={1}
              ref={shadowCamera}
              right={shadowCameraSize}
              top={shadowCameraSize}
            />
          ) : null}
        </directionalLight>
      ))}

      {theme.hemi ? <hemisphereLight ref={hemiRef} /> : null}

      <ambientLight ref={ambientRef} />
    </>
  )
}

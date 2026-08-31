'use client'

import { renderScheduler } from '@landrush/runtime'
import { getSceneTheme, useViewer } from '@pascal-app/viewer'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  FogExp2,
  type Group,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three'
import type { LandrushRoadSegment } from '@/components/landrush/types'
import {
  applyLandrushZombieNightSurfaceColorBindings,
  prepareLandrushZombieNightSurfaceMaterials,
  readPreparedLandrushZombieNightSurfaceRole,
  setLandrushZombieNightSurfaceAmount,
  setLandrushZombieNightSurfaceSunsetUniformAmount,
  setLandrushZombieNightSurfaceUniformAmount,
} from './landrush-zombie-night-presentation-material'
import {
  createLandrushZombieNightSceneLightCache,
  createLandrushZombieNightScenePresentationBinding,
  type LandrushZombieNightBeaconRuntime,
  type LandrushZombieNightSceneLightCache,
  updateLandrushZombieNightBeaconRuntime,
} from './landrush-zombie-night-presentation-runtime'
import {
  advanceLandrushZombieNightAmount,
  createLandrushZombieNightBeaconPlacements,
  LANDRUSH_ZOMBIE_NIGHT_BASE_EXPOSURE,
  LANDRUSH_ZOMBIE_NIGHT_CPU_PRESENTATION_INTERVAL_SECONDS,
  LANDRUSH_ZOMBIE_NIGHT_SEED,
  type LandrushZombieNightDebugMode,
  parseLandrushZombieNightDebugQuery,
  resolveLandrushZombieNightBeaconFrameMode,
  resolveLandrushZombieNightBeaconPulse,
  resolveLandrushZombieNightSunsetAmount,
  resolveLandrushZombieNightTargetExposure,
  resolveLandrushZombieNightTimelineAmount,
  resolveLandrushZombieNightVisualAmount,
  shouldApplyLandrushZombieNightCpuPresentation,
  shouldPublishLandrushZombieNightDebugSnapshot,
} from './landrush-zombie-night-presentation-state'
import {
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_ASSET_PATH,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAMP_POSITION,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_POSITION,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_ROTATION_Y,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_SCALE,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_ANGLE,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_DECAY,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_DISTANCE,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_PENUMBRA,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_TARGET_POSITION,
} from './landrush-zombie-night-street-lightpost'

const NIGHT_BACKGROUND = '#020611'
const NIGHT_FOG = '#081426'
const NIGHT_FOG_DENSITY = 0.0085
const SUNSET_BACKGROUND = '#b86252'
const SUNSET_FOG = '#6b4053'

const NIGHT_LIGHTS = [
  { color: '#b9caff', direction: [-0.58, 1, -0.42] as const, intensity: 1.08 },
  { color: '#3e78c5', direction: [0.7, 0.36, 0.5] as const, intensity: 0.24 },
] as const
const SUNSET_LIGHTS = [
  { color: '#ff9a5f', direction: [0.86, 0.28, 0.42] as const },
  { color: '#7d83c8', direction: [-0.62, 0.4, -0.68] as const },
] as const

const NIGHT_AMBIENT = { color: '#10203d', intensity: 0.07 } as const
const SUNSET_AMBIENT = '#b86f63'
const NIGHT_HEMISPHERE = {
  ground: '#050b16',
  intensity: 0.28,
  sky: '#314a79',
} as const
const SUNSET_HEMISPHERE = { ground: '#3b2d42', sky: '#cf7d72' } as const

const NIGHT_LIGHTING_OWNER = 'landrush-zombie-night'
const NIGHT_DEBUG_SNAPSHOT_INTERVAL_SECONDS = 0.25

type NightLightingOwnership = {
  claimed: boolean
  hadPrevious: boolean
  previous: unknown
}

type AppliedNightPresentation = {
  amount: number
  mode: LandrushZombieNightDebugMode | null
  sceneThemeId: string | null
  sunsetAmount: number
}

type AppliedNightCpuPresentation = AppliedNightPresentation & {
  treatmentAmount: number
}

type LandrushZombieNightDebugSnapshot = {
  active: boolean
  amount: number
  beaconCount: number
  drawCalls: number | null
  fixedSeed: number
  gpuFrameTimeMs: null
  mode: LandrushZombieNightDebugMode
  renderTargetCount: 0
  surfaceMaterialCount: number
  toneMappingExposure: number
  visibility: ReturnType<typeof parseLandrushZombieNightDebugQuery>['visibility']
}

declare global {
  interface Window {
    __LANDRUSH_ZOMBIE_NIGHT_PRESENTATION__?: LandrushZombieNightDebugSnapshot
  }
}

export function LandrushZombieNightPresentation({
  active,
  groundY,
  readCanonicalElapsedSeconds,
  roads,
}: {
  active: boolean
  groundY: number
  readCanonicalElapsedSeconds: () => number | null
  roads: readonly LandrushRoadSegment[]
}) {
  const scene = useThree((state) => state.scene)
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const sceneThemeId = useViewer((state) => state.sceneTheme)
  const dayTheme = getSceneTheme(sceneThemeId)
  const [settings] = useState(readLandrushZombieNightSettings)
  const amountRef = useRef(settings.fixedAmount ?? 0)
  const localNightStartedAtSecondsRef = useRef<number | null>(null)
  const surfaceMaterialsRef = useRef(new Set<Material>())
  const nextDebugSnapshotAtRef = useRef(0)
  const nextCpuPresentationAtRef = useRef(0)
  const debugSnapshotRef = useRef<LandrushZombieNightDebugSnapshot | null>(null)
  const sceneLightsRef = useRef<LandrushZombieNightSceneLightCache | null>(null)
  const beaconsActiveRef = useRef(false)
  const appliedPresentationRef = useRef<AppliedNightPresentation>({
    amount: Number.NaN,
    mode: null,
    sceneThemeId: null,
    sunsetAmount: Number.NaN,
  })
  const appliedCpuPresentationRef = useRef<AppliedNightCpuPresentation>({
    amount: Number.NaN,
    mode: null,
    sceneThemeId: null,
    sunsetAmount: Number.NaN,
    treatmentAmount: Number.NaN,
  })
  const lightingOwnershipRef = useRef<NightLightingOwnership>({
    claimed: false,
    hadPrevious: false,
    previous: undefined,
  })
  const background = useMemo(() => new Color(), [])
  const dayBackground = useMemo(() => new Color(), [])
  const nightBackground = useMemo(() => new Color(NIGHT_BACKGROUND), [])
  const sunsetBackground = useMemo(() => new Color(SUNSET_BACKGROUND), [])
  const contributionBackground = useMemo(() => new Color('#000000'), [])
  const fog = useMemo(() => new FogExp2(NIGHT_FOG, 0), [])
  const nightFogColor = useMemo(() => new Color(NIGHT_FOG), [])
  const sunsetFogColor = useMemo(() => new Color(SUNSET_FOG), [])
  const nightLightColors = useMemo(() => NIGHT_LIGHTS.map(({ color }) => new Color(color)), [])
  const sunsetLightColors = useMemo(() => SUNSET_LIGHTS.map(({ color }) => new Color(color)), [])
  const dayLightColors = useMemo(
    () => dayTheme.lights.map(({ color }) => new Color(color)),
    [dayTheme.lights],
  )
  const dayLightDirections = useMemo(
    () =>
      dayTheme.lights.map(({ position }) =>
        new Vector3(position[0], position[1], position[2]).normalize(),
      ),
    [dayTheme.lights],
  )
  const nightLightDirections = useMemo(
    () =>
      NIGHT_LIGHTS.map(({ direction }) =>
        new Vector3(direction[0], direction[1], direction[2]).normalize(),
      ),
    [],
  )
  const sunsetLightDirections = useMemo(
    () =>
      SUNSET_LIGHTS.map(({ direction }) =>
        new Vector3(direction[0], direction[1], direction[2]).normalize(),
      ),
    [],
  )
  const dayAmbientColor = useMemo(() => new Color(dayTheme.ambient.color), [dayTheme.ambient.color])
  const nightAmbientColor = useMemo(() => new Color(NIGHT_AMBIENT.color), [])
  const sunsetAmbientColor = useMemo(() => new Color(SUNSET_AMBIENT), [])
  const dayHemisphereGround = useMemo(
    () => new Color(dayTheme.hemi?.ground ?? '#777777'),
    [dayTheme.hemi?.ground],
  )
  const dayHemisphereSky = useMemo(
    () => new Color(dayTheme.hemi?.sky ?? '#ffffff'),
    [dayTheme.hemi?.sky],
  )
  const nightHemisphereGround = useMemo(() => new Color(NIGHT_HEMISPHERE.ground), [])
  const nightHemisphereSky = useMemo(() => new Color(NIGHT_HEMISPHERE.sky), [])
  const sunsetHemisphereGround = useMemo(() => new Color(SUNSET_HEMISPHERE.ground), [])
  const sunsetHemisphereSky = useMemo(() => new Color(SUNSET_HEMISPHERE.sky), [])
  const blendedDirection = useMemo(() => new Vector3(), [])
  const scenePresentationBinding = useMemo(
    () =>
      createLandrushZombieNightScenePresentationBinding({
        background,
        fog,
        renderer: gl,
        scene,
      }),
    [background, fog, gl, scene],
  )
  const placements = useMemo(
    () =>
      createLandrushZombieNightBeaconPlacements({
        groundY,
        quality: settings.quality,
        roads,
      }),
    [groundY, roads, settings.quality],
  )
  const beaconRuntimes = useMemo<LandrushZombieNightBeaconRuntime[]>(
    () =>
      placements.map(() => ({
        coreMaterial: null,
        fixtureMaterials: [],
        innerGlowMaterial: null,
        lastContributionOnly: null,
        lastEnvelope: Number.NaN,
        lastGlowTreatment: null,
        light: null,
        outerGlowMaterial: null,
      })),
    [placements],
  )

  useLayoutEffect(() => {
    const installed = scenePresentationBinding.install()
    if (installed) dayBackground.copy(background)
    if (installed) invalidate()
    return () => {
      if (scenePresentationBinding.dispose()) invalidate()
    }
  }, [background, dayBackground, invalidate, scenePresentationBinding])

  useLayoutEffect(() => {
    const sceneLights = createLandrushZombieNightSceneLightCache(scene, () => {
      appliedCpuPresentationRef.current.amount = Number.NaN
      invalidate()
    })
    sceneLightsRef.current = sceneLights
    discoverNightSurfaceBindings(scene, surfaceMaterialsRef.current)
    setLandrushZombieNightSurfaceAmount(amountRef.current)
    if (!settings.debugSnapshotEnabled) delete window.__LANDRUSH_ZOMBIE_NIGHT_PRESENTATION__
    if (amountRef.current > 0.001 || settings.debugSnapshotEnabled) invalidate()
    return () => {
      sceneLights.dispose()
      sceneLightsRef.current = null
      releaseNightLightingOwnership(scene, lightingOwnershipRef.current)
      setLandrushZombieNightSurfaceAmount(0)
      surfaceMaterialsRef.current.clear()
      debugSnapshotRef.current = null
      delete window.__LANDRUSH_ZOMBIE_NIGHT_PRESENTATION__
    }
  }, [invalidate, scene, settings.debugSnapshotEnabled])

  useLayoutEffect(() => {
    if (active || (settings.fixedAmount ?? 0) > 0.001) {
      claimNightLightingOwnership(scene, lightingOwnershipRef.current)
    }
  }, [active, scene, settings.fixedAmount])

  useFrame(({ clock }, delta) => {
    const elapsedSeconds = clock.elapsedTime
    const target = settings.fixedAmount ?? (active ? 1 : 0)
    let amount = target
    let sunsetAmount = 0
    if (settings.fixedAmount === null) {
      if (active) {
        localNightStartedAtSecondsRef.current ??= elapsedSeconds
        const canonicalElapsedSeconds = readCanonicalElapsedSeconds()
        const transitionElapsedSeconds =
          typeof canonicalElapsedSeconds === 'number' && Number.isFinite(canonicalElapsedSeconds)
            ? Math.max(0, canonicalElapsedSeconds)
            : Math.max(0, elapsedSeconds - localNightStartedAtSecondsRef.current)
        amount = resolveLandrushZombieNightTimelineAmount(transitionElapsedSeconds)
        sunsetAmount = resolveLandrushZombieNightSunsetAmount(transitionElapsedSeconds)
      } else {
        localNightStartedAtSecondsRef.current = null
        const advancedAmount = advanceLandrushZombieNightAmount(amountRef.current, 0, delta)
        amount = advancedAmount <= 0.001 ? 0 : advancedAmount
      }
    }
    amountRef.current = amount
    const visualAmount = resolveLandrushZombieNightVisualAmount(amount, sunsetAmount)
    const treatmentAmount = settings.mode === 'light-contribution' ? 1 : amount
    const nightExposure = resolveLandrushZombieNightTargetExposure({
      mode: settings.mode,
      nightExposure: LANDRUSH_ZOMBIE_NIGHT_BASE_EXPOSURE,
      visibility: settings.visibility,
    })
    const targetExposure =
      dayTheme.toneMappingExposure + (nightExposure - dayTheme.toneMappingExposure) * amount

    const appliedPresentation = appliedPresentationRef.current
    if (
      appliedPresentation.amount !== amount ||
      appliedPresentation.mode !== settings.mode ||
      appliedPresentation.sceneThemeId !== sceneThemeId ||
      appliedPresentation.sunsetAmount !== sunsetAmount
    ) {
      if (visualAmount > 0.001 && !scenePresentationBinding.claimed) {
        dayBackground.set(dayTheme.background)
        const currentBackground = scene.background as Color | null
        if (currentBackground?.isColor) dayBackground.copy(currentBackground)
        scenePresentationBinding.claim()
      }
      background
        .copy(dayBackground)
        .lerp(sunsetBackground, sunsetAmount)
        .lerp(
          settings.mode === 'light-contribution' ? contributionBackground : nightBackground,
          amount,
        )
      fog.color.copy(dayBackground).lerp(sunsetFogColor, sunsetAmount).lerp(nightFogColor, amount)
      fog.density = settings.mode === 'final' ? NIGHT_FOG_DENSITY * amount : 0
      setLandrushZombieNightSurfaceSunsetUniformAmount(sunsetAmount)
      setLandrushZombieNightSurfaceUniformAmount(treatmentAmount)

      const ownership = lightingOwnershipRef.current
      if (visualAmount > 0.001) claimNightLightingOwnership(scene, ownership)

      appliedPresentation.amount = amount
      appliedPresentation.mode = settings.mode
      appliedPresentation.sceneThemeId = sceneThemeId
      appliedPresentation.sunsetAmount = sunsetAmount
    }

    const appliedCpuPresentation = appliedCpuPresentationRef.current
    const cpuPresentationInvalidated =
      appliedCpuPresentation.mode !== settings.mode ||
      appliedCpuPresentation.sceneThemeId !== sceneThemeId
    if (
      shouldApplyLandrushZombieNightCpuPresentation(
        appliedCpuPresentation.amount,
        amount,
        target,
        elapsedSeconds,
        nextCpuPresentationAtRef.current,
        cpuPresentationInvalidated,
      )
    ) {
      if (
        appliedCpuPresentation.treatmentAmount !== treatmentAmount ||
        appliedCpuPresentation.sunsetAmount !== sunsetAmount
      ) {
        applyLandrushZombieNightSurfaceColorBindings()
      }

      const ownership = lightingOwnershipRef.current
      if (visualAmount > 0.001) claimNightLightingOwnership(scene, ownership)
      if (visualAmount > 0.001 || ownership.claimed) {
        const sceneLights = sceneLightsRef.current?.read()
        for (let index = 0; index < (sceneLights?.direct.length ?? 0); index += 1) {
          const light = sceneLights!.direct[index]!
          const day = dayTheme.lights[index] ?? dayTheme.lights.at(-1)
          const dayColor = dayLightColors[index] ?? dayLightColors.at(-1)
          const dayDirection = dayLightDirections[index] ?? dayLightDirections.at(-1)
          if (!day || !dayColor || !dayDirection) continue
          const night = NIGHT_LIGHTS[index] ?? NIGHT_LIGHTS.at(-1)!
          const nightIntensity = settings.mode === 'light-contribution' ? 0 : night.intensity
          light.intensity = day.intensity + (nightIntensity - day.intensity) * amount
          light.color
            .copy(dayColor)
            .lerp(sunsetLightColors[index] ?? sunsetLightColors.at(-1)!, sunsetAmount)
            .lerp(nightLightColors[index] ?? nightLightColors.at(-1)!, amount)

          const focus = light.target.position
          const distance = Math.max(12, light.position.distanceTo(focus))
          const nightDirection = nightLightDirections[index] ?? nightLightDirections.at(-1)!
          blendedDirection
            .copy(dayDirection)
            .lerp(sunsetLightDirections[index] ?? sunsetLightDirections.at(-1)!, sunsetAmount)
            .lerp(nightDirection, amount)
          if (blendedDirection.lengthSq() <= 0.000_001) blendedDirection.copy(nightDirection)
          else blendedDirection.normalize()
          light.position.copy(focus).addScaledVector(blendedDirection, distance)
          if (light.shadow?.intensity !== undefined) {
            light.shadow.intensity = 0.75 * (1 - amount * 0.08)
          }
        }

        const hemisphere = sceneLights?.hemisphere
        if (hemisphere) {
          const dayIntensity = dayTheme.hemi?.intensity ?? 0
          const nightIntensity =
            settings.mode === 'light-contribution' ? 0 : NIGHT_HEMISPHERE.intensity
          hemisphere.intensity = dayIntensity + (nightIntensity - dayIntensity) * amount
          hemisphere.color
            .copy(dayHemisphereSky)
            .lerp(sunsetHemisphereSky, sunsetAmount)
            .lerp(nightHemisphereSky, amount)
          hemisphere.groundColor
            .copy(dayHemisphereGround)
            .lerp(sunsetHemisphereGround, sunsetAmount)
            .lerp(nightHemisphereGround, amount)
        }

        const ambient = sceneLights?.ambient
        if (ambient) {
          const nightIntensity =
            settings.mode === 'light-contribution' ? 0 : NIGHT_AMBIENT.intensity
          ambient.intensity =
            dayTheme.ambient.intensity + (nightIntensity - dayTheme.ambient.intensity) * amount
          ambient.color
            .copy(dayAmbientColor)
            .lerp(sunsetAmbientColor, sunsetAmount)
            .lerp(nightAmbientColor, treatmentAmount)
        }
      }

      appliedCpuPresentation.amount = amount
      appliedCpuPresentation.mode = settings.mode
      appliedCpuPresentation.sceneThemeId = sceneThemeId
      appliedCpuPresentation.sunsetAmount = sunsetAmount
      appliedCpuPresentation.treatmentAmount = treatmentAmount
      nextCpuPresentationAtRef.current =
        elapsedSeconds + LANDRUSH_ZOMBIE_NIGHT_CPU_PRESENTATION_INTERVAL_SECONDS
    }

    if (target <= 0.001 && visualAmount <= 0.001) {
      releaseNightLightingOwnership(scene, lightingOwnershipRef.current)
      scenePresentationBinding.release()
    }
    // The Viewer theme effect can run after readiness, so retain ownership without a redundant write.
    if (amount > 0.001 && gl.toneMappingExposure !== targetExposure) {
      gl.toneMappingExposure = targetExposure
    }

    const beaconFrameMode = resolveLandrushZombieNightBeaconFrameMode(
      beaconsActiveRef.current,
      amount,
    )
    if (beaconFrameMode !== 'idle') {
      updateNightBeacons({
        amount,
        contributionOnly: settings.mode === 'light-contribution',
        elapsedSeconds: clock.elapsedTime,
        glowTreatment: settings.mode !== 'no-post',
        placements,
        runtimes: beaconRuntimes,
      })
    }
    beaconsActiveRef.current = beaconFrameMode === 'animate'

    if (settings.debugSnapshotEnabled && elapsedSeconds >= nextDebugSnapshotAtRef.current) {
      const snapshot =
        debugSnapshotRef.current ??
        ({
          active,
          amount,
          beaconCount: placements.length,
          drawCalls: null,
          fixedSeed: LANDRUSH_ZOMBIE_NIGHT_SEED,
          gpuFrameTimeMs: null,
          mode: settings.mode,
          renderTargetCount: 0,
          surfaceMaterialCount: 0,
          toneMappingExposure: gl.toneMappingExposure,
          visibility: settings.visibility,
        } satisfies LandrushZombieNightDebugSnapshot)
      snapshot.active = active
      snapshot.amount = amount
      snapshot.beaconCount = placements.length
      snapshot.drawCalls = readRenderCalls(gl)
      snapshot.mode = settings.mode
      snapshot.surfaceMaterialCount = surfaceMaterialsRef.current.size
      snapshot.toneMappingExposure = gl.toneMappingExposure
      snapshot.visibility = settings.visibility
      debugSnapshotRef.current = snapshot
      window.__LANDRUSH_ZOMBIE_NIGHT_PRESENTATION__ = snapshot
      nextDebugSnapshotAtRef.current = elapsedSeconds + NIGHT_DEBUG_SNAPSHOT_INTERVAL_SECONDS
    }

    if (Math.abs(target - amount) > 0.001 || amount > 0.001) {
      renderScheduler.requestFrame('animation')
    }
  })

  return (
    <group
      userData={{
        debugMode: settings.mode,
        deterministic: true,
        landrushZombieNight: true,
        quality: settings.quality,
        visibility: settings.visibility,
      }}
    >
      {placements.map((placement, index) => (
        <LandrushZombieNightBeacon
          key={placement.id}
          placement={placement}
          runtime={beaconRuntimes[index]!}
        />
      ))}
    </group>
  )
}

function discoverNightSurfaceBindings(scene: Group['parent'], surfaceMaterials: Set<Material>) {
  if (!scene) return
  scene.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    prepareLandrushZombieNightSurfaceMaterials(mesh, materials)
    for (const material of materials) {
      if (readPreparedLandrushZombieNightSurfaceRole(material)) surfaceMaterials.add(material)
    }
  })
}

function claimNightLightingOwnership(scene: Object3D, ownership: NightLightingOwnership) {
  if (ownership.claimed) return
  ownership.hadPrevious = Object.hasOwn(scene.userData, 'pascalLightingOwner')
  ownership.previous = scene.userData.pascalLightingOwner
  ownership.claimed = true
  scene.userData.pascalLightingOwner = NIGHT_LIGHTING_OWNER
}

function releaseNightLightingOwnership(scene: Object3D, ownership: NightLightingOwnership) {
  if (!ownership.claimed) return
  if (scene.userData.pascalLightingOwner === NIGHT_LIGHTING_OWNER) {
    if (ownership.hadPrevious) scene.userData.pascalLightingOwner = ownership.previous
    else delete scene.userData.pascalLightingOwner
  }
  ownership.claimed = false
  ownership.hadPrevious = false
  ownership.previous = undefined
}

function LandrushZombieNightBeacon({
  placement,
  runtime,
}: {
  placement: ReturnType<typeof createLandrushZombieNightBeaconPlacements>[number]
  runtime: LandrushZombieNightBeaconRuntime
}) {
  const { scene } = useGLTF(LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_ASSET_PATH)
  const fixture = useMemo(
    () => createLandrushZombieNightStreetLightpostModel(scene, placement.color),
    [placement.color, scene],
  )
  const lightTarget = useMemo(() => {
    const target = new Object3D()
    target.position.set(...LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_TARGET_POSITION)
    return target
  }, [])

  useLayoutEffect(() => {
    runtime.fixtureMaterials = fixture.materials
    runtime.lastEnvelope = Number.NaN
    return () => {
      if (runtime.fixtureMaterials === fixture.materials) runtime.fixtureMaterials = []
      for (const material of fixture.materials) material.dispose()
    }
  }, [fixture, runtime])

  return (
    <group position={placement.position} rotation={[0, placement.rotationY, 0]}>
      <group
        position={LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_POSITION}
        rotation={[0, LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_ROTATION_Y, 0]}
        scale={LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_SCALE}
      >
        <primitive dispose={null} object={fixture.model} />
      </group>
      <mesh
        position={LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAMP_POSITION}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.16, 16]} />
        <meshBasicMaterial
          color={placement.color}
          depthWrite={false}
          opacity={0}
          ref={(material) => {
            runtime.coreMaterial = material
            runtime.lastEnvelope = Number.NaN
          }}
          side={DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh
        position={LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAMP_POSITION}
        renderOrder={30}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.34, 16]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={placement.color}
          depthWrite={false}
          opacity={0}
          ref={(material) => {
            runtime.innerGlowMaterial = material
            runtime.lastEnvelope = Number.NaN
          }}
          side={DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh
        position={LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAMP_POSITION}
        renderOrder={29}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.62, 16]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={placement.color}
          depthWrite={false}
          opacity={0}
          ref={(material) => {
            runtime.outerGlowMaterial = material
            runtime.lastEnvelope = Number.NaN
          }}
          side={DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      <primitive object={lightTarget} />
      <spotLight
        angle={LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_ANGLE}
        color={placement.color}
        decay={LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_DECAY}
        distance={LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_DISTANCE}
        intensity={0}
        penumbra={LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_PENUMBRA}
        position={LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAMP_POSITION}
        ref={(light) => {
          runtime.light = light
          runtime.lastEnvelope = Number.NaN
        }}
        target={lightTarget}
        userData={{ landrushZombieNight: true }}
      />
    </group>
  )
}

function createLandrushZombieNightStreetLightpostModel(source: Object3D, color: string) {
  const model = source.clone(true)
  const clonedMaterials = new Map<Material, Material>()
  const materials: MeshStandardMaterial[] = []
  model.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    mesh.receiveShadow = false
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const nextMaterials = sourceMaterials.map((sourceMaterial) => {
      const cached = clonedMaterials.get(sourceMaterial)
      if (cached) return cached
      const material = sourceMaterial.clone()
      clonedMaterials.set(sourceMaterial, material)
      const standardMaterial = material as MeshStandardMaterial
      if (standardMaterial.isMeshStandardMaterial) {
        standardMaterial.emissive.set(color)
        standardMaterial.emissiveIntensity = 0
        materials.push(standardMaterial)
      }
      return material
    })
    mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0]!
  })
  return { materials, model }
}

function updateNightBeacons({
  amount,
  contributionOnly,
  elapsedSeconds,
  glowTreatment,
  placements,
  runtimes,
}: {
  amount: number
  contributionOnly: boolean
  elapsedSeconds: number
  glowTreatment: boolean
  placements: ReturnType<typeof createLandrushZombieNightBeaconPlacements>
  runtimes: readonly LandrushZombieNightBeaconRuntime[]
}) {
  for (let index = 0; index < runtimes.length; index += 1) {
    const runtime = runtimes[index]!
    const placement = placements[index]
    if (!placement) continue
    updateLandrushZombieNightBeaconRuntime({
      amount,
      contributionOnly,
      glowTreatment,
      lightPulse: resolveLandrushZombieNightBeaconPulse(elapsedSeconds, placement.phase),
      runtime,
    })
  }
}

function readLandrushZombieNightSettings() {
  if (typeof window === 'undefined') {
    const params = new URLSearchParams()
    return {
      ...parseLandrushZombieNightDebugQuery(params),
      debugSnapshotEnabled: false,
    }
  }
  const params = new URLSearchParams(window.location.search)
  return {
    ...parseLandrushZombieNightDebugQuery(params),
    debugSnapshotEnabled: shouldPublishLandrushZombieNightDebugSnapshot(params),
  }
}

function readRenderCalls(renderer: unknown) {
  const calls = (renderer as { info?: { render?: { calls?: unknown } } }).info?.render?.calls
  return typeof calls === 'number' && Number.isFinite(calls) ? calls : null
}

useGLTF.preload(LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_ASSET_PATH)

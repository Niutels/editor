'use client'

import { renderScheduler } from '@landrush/runtime'
import { getSceneTheme, useViewer } from '@pascal-app/viewer'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  Color,
  FogExp2,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
  Vector3,
} from 'three'
import type { LandrushRoadSegment } from '@/components/landrush/types'
import {
  prepareLandrushZombieNightSurfaceMaterials,
  readPreparedLandrushZombieNightSurfaceRole,
  setLandrushZombieNightSurfaceAmount,
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
  LANDRUSH_ZOMBIE_NIGHT_SEED,
  type LandrushZombieNightDebugMode,
  parseLandrushZombieNightDebugQuery,
  resolveLandrushZombieNightBeaconFrameMode,
  resolveLandrushZombieNightBeaconPulse,
  resolveLandrushZombieNightTargetExposure,
  shouldPublishLandrushZombieNightDebugSnapshot,
} from './landrush-zombie-night-presentation-state'

const NIGHT_BACKGROUND = '#020611'
const NIGHT_FOG = '#081426'
const NIGHT_FOG_DENSITY = 0.0085

const NIGHT_LIGHTS = [
  { color: '#b9caff', direction: [-0.58, 1, -0.42] as const, intensity: 1.08 },
  { color: '#3e78c5', direction: [0.7, 0.36, 0.5] as const, intensity: 0.24 },
] as const

const NIGHT_AMBIENT = { color: '#10203d', intensity: 0.07 } as const
const NIGHT_HEMISPHERE = {
  ground: '#050b16',
  intensity: 0.28,
  sky: '#314a79',
} as const

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
  roads,
}: {
  active: boolean
  groundY: number
  roads: readonly LandrushRoadSegment[]
}) {
  const scene = useThree((state) => state.scene)
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const sceneThemeId = useViewer((state) => state.sceneTheme)
  const dayTheme = getSceneTheme(sceneThemeId)
  const [settings] = useState(readLandrushZombieNightSettings)
  const amountRef = useRef(settings.fixedAmount ?? (active ? 1 : 0))
  const surfaceMaterialsRef = useRef(new Set<Material>())
  const nextDebugSnapshotAtRef = useRef(0)
  const debugSnapshotRef = useRef<LandrushZombieNightDebugSnapshot | null>(null)
  const sceneLightsRef = useRef<LandrushZombieNightSceneLightCache | null>(null)
  const beaconsActiveRef = useRef(false)
  const appliedPresentationRef = useRef<AppliedNightPresentation>({
    amount: Number.NaN,
    mode: null,
    sceneThemeId: null,
  })
  const lightingOwnershipRef = useRef<NightLightingOwnership>({
    claimed: false,
    hadPrevious: false,
    previous: undefined,
  })
  const background = useMemo(() => new Color(), [])
  const dayBackground = useMemo(() => new Color(), [])
  const nightBackground = useMemo(() => new Color(NIGHT_BACKGROUND), [])
  const contributionBackground = useMemo(() => new Color('#000000'), [])
  const fog = useMemo(() => new FogExp2(NIGHT_FOG, 0), [])
  const nightLightColors = useMemo(() => NIGHT_LIGHTS.map(({ color }) => new Color(color)), [])
  const nightAmbientColor = useMemo(() => new Color(NIGHT_AMBIENT.color), [])
  const nightHemisphereGround = useMemo(() => new Color(NIGHT_HEMISPHERE.ground), [])
  const nightHemisphereSky = useMemo(() => new Color(NIGHT_HEMISPHERE.sky), [])
  const dayDirection = useMemo(() => new Vector3(), [])
  const nightDirection = useMemo(() => new Vector3(), [])
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
        group: null,
        innerGlowMaterial: null,
        lastContributionOnly: null,
        lastEnvelope: Number.NaN,
        lastGlowTreatment: null,
        light: null,
        mastMaterial: null,
        outerGlowMaterial: null,
      })),
    [placements],
  )

  useLayoutEffect(() => {
    const installed = scenePresentationBinding.install()
    if (installed) invalidate()
    return () => {
      if (scenePresentationBinding.dispose()) invalidate()
    }
  }, [invalidate, scenePresentationBinding])

  useLayoutEffect(() => {
    const sceneLights = createLandrushZombieNightSceneLightCache(scene, () => {
      appliedPresentationRef.current.amount = Number.NaN
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
    const target = settings.fixedAmount ?? (active ? 1 : 0)
    const advancedAmount =
      settings.fixedAmount === null
        ? advanceLandrushZombieNightAmount(amountRef.current, target, delta)
        : target
    const amount = Math.abs(target - advancedAmount) <= 0.001 ? target : advancedAmount
    amountRef.current = amount
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
      appliedPresentation.sceneThemeId !== sceneThemeId
    ) {
      if (amount > 0.001 && !scenePresentationBinding.claimed) {
        dayBackground.set(dayTheme.background)
        const currentBackground = scene.background as Color | null
        if (currentBackground?.isColor) dayBackground.copy(currentBackground)
        scenePresentationBinding.claim()
      }
      background.lerpColors(
        dayBackground,
        settings.mode === 'light-contribution' ? contributionBackground : nightBackground,
        amount,
      )
      fog.density = settings.mode === 'final' ? NIGHT_FOG_DENSITY * amount : 0
      setLandrushZombieNightSurfaceAmount(treatmentAmount)

      const ownership = lightingOwnershipRef.current
      if (amount > 0.001) claimNightLightingOwnership(scene, ownership)
      if (amount > 0.001 || ownership.claimed) {
        const sceneLights = sceneLightsRef.current?.read()
        for (let index = 0; index < (sceneLights?.direct.length ?? 0); index += 1) {
          const light = sceneLights!.direct[index]!
          const day = dayTheme.lights[index] ?? dayTheme.lights.at(-1)
          if (!day) continue
          const night = NIGHT_LIGHTS[index] ?? NIGHT_LIGHTS.at(-1)!
          const nightIntensity = settings.mode === 'light-contribution' ? 0 : night.intensity
          light.intensity = day.intensity + (nightIntensity - day.intensity) * amount
          light.color
            .set(day.color)
            .lerp(nightLightColors[index] ?? nightLightColors.at(-1)!, amount)

          const focus = light.target.position
          const distance = Math.max(12, light.position.distanceTo(focus))
          dayDirection.set(day.position[0], day.position[1], day.position[2]).normalize()
          nightDirection.set(night.direction[0], night.direction[1], night.direction[2]).normalize()
          blendedDirection.lerpVectors(dayDirection, nightDirection, amount).normalize()
          light.position.copy(focus).addScaledVector(blendedDirection, distance)
          if (light.shadow?.intensity !== undefined) {
            light.shadow.intensity = 0.75 * (1 - amount * 0.08)
          }
        }

        const hemisphere = sceneLights?.hemisphere
        if (hemisphere) {
          const day = dayTheme.hemi ?? { ground: '#777777', intensity: 0, sky: '#ffffff' }
          const nightIntensity =
            settings.mode === 'light-contribution' ? 0 : NIGHT_HEMISPHERE.intensity
          hemisphere.intensity = day.intensity + (nightIntensity - day.intensity) * amount
          hemisphere.color.set(day.sky).lerp(nightHemisphereSky, amount)
          hemisphere.groundColor.set(day.ground).lerp(nightHemisphereGround, amount)
        }

        const ambient = sceneLights?.ambient
        if (ambient) {
          const nightIntensity =
            settings.mode === 'light-contribution' ? 0 : NIGHT_AMBIENT.intensity
          ambient.intensity =
            dayTheme.ambient.intensity + (nightIntensity - dayTheme.ambient.intensity) * amount
          ambient.color.set(dayTheme.ambient.color).lerp(nightAmbientColor, treatmentAmount)
        }
      }
      if (amount <= 0.001) {
        releaseNightLightingOwnership(scene, ownership)
        scenePresentationBinding.release()
      }

      appliedPresentation.amount = amount
      appliedPresentation.mode = settings.mode
      appliedPresentation.sceneThemeId = sceneThemeId
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

    if (settings.debugSnapshotEnabled && clock.elapsedTime >= nextDebugSnapshotAtRef.current) {
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
      nextDebugSnapshotAtRef.current = clock.elapsedTime + NIGHT_DEBUG_SNAPSHOT_INTERVAL_SECONDS
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
  return (
    <group
      position={placement.position}
      ref={(group) => {
        runtime.group = group
        runtime.lastEnvelope = Number.NaN
      }}
    >
      <mesh position={[0, 0.56, 0]}>
        <cylinderGeometry args={[0.035, 0.055, 1.12, 7]} />
        <meshStandardMaterial
          color="#08111f"
          depthWrite={false}
          metalness={0.5}
          opacity={0}
          ref={(material) => {
            runtime.mastMaterial = material
            runtime.lastEnvelope = Number.NaN
          }}
          roughness={0.48}
          transparent
        />
      </mesh>
      <mesh position={[0, 1.18, 0]}>
        <sphereGeometry args={[0.105, 12, 8]} />
        <meshBasicMaterial
          color={placement.color}
          depthWrite={false}
          opacity={0}
          ref={(material) => {
            runtime.coreMaterial = material
            runtime.lastEnvelope = Number.NaN
          }}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh position={[0, 1.18, 0]} renderOrder={30}>
        <sphereGeometry args={[0.29, 12, 8]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={placement.color}
          depthWrite={false}
          opacity={0}
          ref={(material) => {
            runtime.innerGlowMaterial = material
            runtime.lastEnvelope = Number.NaN
          }}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh position={[0, 1.18, 0]} renderOrder={29}>
        <sphereGeometry args={[0.7, 12, 8]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color={placement.color}
          depthWrite={false}
          opacity={0}
          ref={(material) => {
            runtime.outerGlowMaterial = material
            runtime.lastEnvelope = Number.NaN
          }}
          toneMapped={false}
          transparent
        />
      </mesh>
      <pointLight
        color={placement.color}
        decay={2}
        distance={12}
        intensity={0}
        position={[0, 1.18, 0]}
        ref={(light) => {
          runtime.light = light
          runtime.lastEnvelope = Number.NaN
        }}
        userData={{ landrushZombieNight: true }}
      />
    </group>
  )
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

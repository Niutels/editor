import type {
  AmbientLight,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Scene,
  SpotLight,
} from 'three'
import {
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_CONTRIBUTION_INTENSITY,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_EMISSIVE_INTENSITY,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_GROUND_POOL_OPACITY,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_INTENSITY,
} from './landrush-zombie-night-street-lightpost'

export const LANDRUSH_ZOMBIE_NIGHT_BEACON_CONTRIBUTION_START_AMOUNT = 0.08

export type LandrushZombieNightBeaconRuntime = {
  coreMaterial: MeshBasicMaterial | null
  fixtureMaterials: readonly MeshStandardMaterial[]
  groundPoolMaterial: MeshBasicMaterial | null
  innerGlowMaterial: MeshBasicMaterial | null
  lastContributionOnly: boolean | null
  lastEnvelope: number
  lastGlowTreatment: boolean | null
  light: SpotLight | null
  outerGlowMaterial: MeshBasicMaterial | null
}

export type LandrushZombieNightSceneLights = Readonly<{
  ambient: AmbientLight | null
  direct: readonly DirectionalLight[]
  hemisphere: HemisphereLight | null
}>

export type LandrushZombieNightSceneLightCache = Readonly<{
  dispose: () => void
  read: () => LandrushZombieNightSceneLights
}>

export type LandrushZombieNightScenePresentationBinding = Readonly<{
  claim: () => boolean
  claimed: boolean
  dispose: () => boolean
  install: () => boolean
  installed: boolean
  release: () => boolean
}>

export function updateLandrushZombieNightBeaconRuntime({
  amount,
  contributionOnly,
  glowTreatment,
  lightPulse,
  runtime,
}: {
  amount: number
  contributionOnly: boolean
  glowTreatment: boolean
  lightPulse: number
  runtime: LandrushZombieNightBeaconRuntime
}) {
  const envelope = smoothstep(LANDRUSH_ZOMBIE_NIGHT_BEACON_CONTRIBUTION_START_AMOUNT, 0.82, amount)
  if (
    runtime.lastEnvelope !== envelope ||
    runtime.lastContributionOnly !== contributionOnly ||
    runtime.lastGlowTreatment !== glowTreatment
  ) {
    for (const material of runtime.fixtureMaterials) {
      material.emissiveIntensity =
        envelope * LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_EMISSIVE_INTENSITY
    }
    if (runtime.groundPoolMaterial) {
      runtime.groundPoolMaterial.opacity = glowTreatment
        ? envelope * LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_GROUND_POOL_OPACITY
        : 0
    }
    if (runtime.coreMaterial) runtime.coreMaterial.opacity = envelope * 0.98
    if (runtime.innerGlowMaterial) {
      runtime.innerGlowMaterial.opacity = glowTreatment ? envelope * 0.24 : 0
    }
    if (runtime.outerGlowMaterial) {
      runtime.outerGlowMaterial.opacity = glowTreatment ? envelope * 0.075 : 0
    }
    runtime.lastEnvelope = envelope
    runtime.lastContributionOnly = contributionOnly
    runtime.lastGlowTreatment = glowTreatment
  }
  if (runtime.light) {
    runtime.light.intensity =
      envelope > 0
        ? envelope *
          lightPulse *
          (contributionOnly
            ? LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_CONTRIBUTION_INTENSITY
            : LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_INTENSITY)
        : 0
  }
  return envelope
}

type Object3DChildEvent = Readonly<{ child: Object3D | null | undefined }>

type Object3DChildEventTarget = {
  addEventListener: (
    type: 'childadded' | 'childremoved',
    listener: (event: Object3DChildEvent) => void,
  ) => void
  removeEventListener: (
    type: 'childadded' | 'childremoved',
    listener: (event: Object3DChildEvent) => void,
  ) => void
}

export function createLandrushZombieNightSceneLightCache(
  scene: Scene,
  onChange: () => void,
): LandrushZombieNightSceneLightCache {
  const eventTarget = scene as unknown as Object3DChildEventTarget
  let current = collectLandrushZombieNightSceneLights(scene)
  let disposed = false
  const handleTopologyChange = ({ child }: Object3DChildEvent) => {
    if (!isViewerThemeLight(child)) return
    current = collectLandrushZombieNightSceneLights(scene)
    onChange()
  }
  eventTarget.addEventListener('childadded', handleTopologyChange)
  eventTarget.addEventListener('childremoved', handleTopologyChange)
  return {
    dispose() {
      if (disposed) return
      disposed = true
      eventTarget.removeEventListener('childadded', handleTopologyChange)
      eventTarget.removeEventListener('childremoved', handleTopologyChange)
    },
    read: () => current,
  }
}

export function createLandrushZombieNightScenePresentationBinding({
  background,
  fog,
  renderer,
  scene,
}: {
  background: Color
  fog: FogExp2
  renderer: { toneMappingExposure: number }
  scene: Scene
}): LandrushZombieNightScenePresentationBinding {
  let claimed = false
  let installed = false
  let previousBackground: Scene['background'] = null
  let previousExposure = renderer.toneMappingExposure
  let previousFog: Scene['fog'] = null
  const binding: LandrushZombieNightScenePresentationBinding = {
    claim() {
      if (claimed) return false
      binding.install()
      claimed = true
      previousExposure = renderer.toneMappingExposure
      return true
    },
    get claimed() {
      return claimed
    },
    dispose() {
      const released = binding.release()
      if (!installed) return released
      installed = false
      const ownsFog = scene.fog === fog
      const ownsBackground = scene.background === background
      if (ownsFog) scene.fog = previousFog
      if (ownsBackground) scene.background = previousBackground
      return released || ownsFog || ownsBackground
    },
    install() {
      if (installed) return false
      installed = true
      previousBackground = scene.background
      previousFog = scene.fog
      if (previousBackground && 'isColor' in previousBackground && previousBackground.isColor) {
        background.copy(previousBackground)
      }
      scene.background = background
      scene.fog = fog
      return true
    },
    get installed() {
      return installed
    },
    release() {
      if (!claimed) return false
      claimed = false
      renderer.toneMappingExposure = previousExposure
      return true
    },
  }
  return binding
}

function collectLandrushZombieNightSceneLights(scene: Scene): LandrushZombieNightSceneLights {
  const direct: DirectionalLight[] = []
  let ambient: AmbientLight | null = null
  let hemisphere: HemisphereLight | null = null
  for (const child of scene.children) {
    if (child.userData.landrushZombieNight) continue
    if ((child as DirectionalLight).isDirectionalLight) direct.push(child as DirectionalLight)
    else if (!hemisphere && (child as HemisphereLight).isHemisphereLight) {
      hemisphere = child as HemisphereLight
    } else if (!ambient && (child as AmbientLight).isAmbientLight) {
      ambient = child as AmbientLight
    }
  }
  return { ambient, direct, hemisphere }
}

function isViewerThemeLight(object: Object3D | null | undefined) {
  if (!object) return false
  return (
    !object.userData.landrushZombieNight &&
    Boolean(
      (object as DirectionalLight).isDirectionalLight ||
        (object as HemisphereLight).isHemisphereLight ||
        (object as AmbientLight).isAmbientLight,
    )
  )
}

function smoothstep(minimum: number, maximum: number, value: number) {
  const amount = Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)))
  return amount * amount * (3 - 2 * amount)
}

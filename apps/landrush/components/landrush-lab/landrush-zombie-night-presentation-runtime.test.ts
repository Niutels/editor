import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  AmbientLight,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Scene,
  SpotLight,
} from 'three'
import {
  createLandrushZombieNightSceneLightCache,
  createLandrushZombieNightScenePresentationBinding,
  type LandrushZombieNightBeaconRuntime,
  updateLandrushZombieNightBeaconRuntime,
} from './landrush-zombie-night-presentation-runtime'
import {
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_EMISSIVE_INTENSITY,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_INTENSITY,
} from './landrush-zombie-night-street-lightpost'

describe('Landrush zombie night scene bindings', () => {
  test('keeps the street-light fixture opaque with zero light contribution by day', () => {
    const fixtureMaterials = [
      new MeshStandardMaterial({
        depthWrite: true,
        emissive: '#ffc36e',
        emissiveIntensity: 0,
        opacity: 1,
        transparent: false,
      }),
      new MeshStandardMaterial({
        depthWrite: true,
        emissive: '#ffc36e',
        emissiveIntensity: 0,
        opacity: 1,
        transparent: false,
      }),
    ]
    const coreMaterial = new MeshBasicMaterial({
      depthWrite: false,
      opacity: 0,
      transparent: true,
    })
    const innerGlowMaterial = coreMaterial.clone()
    const outerGlowMaterial = coreMaterial.clone()
    const light = new SpotLight('#ffc36e', 0, 11.5, 0.92, 0.68, 2)
    const runtime: LandrushZombieNightBeaconRuntime = {
      coreMaterial,
      fixtureMaterials,
      innerGlowMaterial,
      lastContributionOnly: null,
      lastEnvelope: Number.NaN,
      lastGlowTreatment: null,
      light,
      outerGlowMaterial,
    }
    const materialVersions = [
      ...fixtureMaterials.map((material) => material.version),
      coreMaterial.version,
      innerGlowMaterial.version,
      outerGlowMaterial.version,
    ]

    updateLandrushZombieNightBeaconRuntime({
      amount: 0,
      contributionOnly: false,
      glowTreatment: true,
      lightPulse: 1,
      runtime,
    })
    expect(fixtureMaterials.every((material) => material.opacity === 1)).toBe(true)
    expect(
      fixtureMaterials.every(
        (material) => !material.transparent && material.depthWrite && material.opacity === 1,
      ),
    ).toBe(true)
    expect(coreMaterial.opacity).toBe(0)
    expect(innerGlowMaterial.opacity).toBe(0)
    expect(outerGlowMaterial.opacity).toBe(0)
    expect(light.intensity).toBe(0)
    expect(
      [coreMaterial, innerGlowMaterial, outerGlowMaterial].every(
        (material) => material.transparent && material.depthWrite === false,
      ),
    ).toBe(true)
    expect([
      ...fixtureMaterials.map((material) => material.version),
      coreMaterial.version,
      innerGlowMaterial.version,
      outerGlowMaterial.version,
    ]).toEqual(materialVersions)
    const presentationSource = readFileSync(
      new URL('./landrush-zombie-night-presentation.tsx', import.meta.url),
      'utf8',
    )
    expect(presentationSource).toContain('const material = sourceMaterial.clone()')
    expect(presentationSource).not.toContain('material.opacity = 0')
    expect(presentationSource).not.toContain('material.transparent = true')
    expect(presentationSource).toContain('if (installed) dayBackground.copy(background)')
    expect(presentationSource).toContain(
      'if (currentBackground?.isColor) dayBackground.copy(currentBackground)',
    )

    updateLandrushZombieNightBeaconRuntime({
      amount: 1,
      contributionOnly: false,
      glowTreatment: true,
      lightPulse: 1,
      runtime,
    })
    expect(fixtureMaterials.every((material) => material.opacity === 1)).toBe(true)
    expect(
      fixtureMaterials.every(
        (material) =>
          material.emissiveIntensity === LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_EMISSIVE_INTENSITY,
      ),
    ).toBe(true)
    expect(coreMaterial.opacity).toBeCloseTo(0.98)
    expect(innerGlowMaterial.opacity).toBeCloseTo(0.24)
    expect(outerGlowMaterial.opacity).toBeCloseTo(0.075)
    expect(light.intensity).toBe(LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_INTENSITY)

    updateLandrushZombieNightBeaconRuntime({
      amount: 0,
      contributionOnly: false,
      glowTreatment: true,
      lightPulse: 1,
      runtime,
    })
    expect(fixtureMaterials.every((material) => material.opacity === 1)).toBe(true)
    expect(fixtureMaterials.every((material) => material.emissiveIntensity === 0)).toBe(true)
    expect(
      [coreMaterial, innerGlowMaterial, outerGlowMaterial].every(
        (material) => material.opacity === 0,
      ),
    ).toBe(true)
    expect(light.intensity).toBe(0)
    expect([
      ...fixtureMaterials.map((material) => material.version),
      coreMaterial.version,
      innerGlowMaterial.version,
      outerGlowMaterial.version,
    ]).toEqual(materialVersions)

    for (const material of fixtureMaterials) material.dispose()
    coreMaterial.dispose()
    innerGlowMaterial.dispose()
    outerGlowMaterial.dispose()
    light.dispose()
  })

  test('keeps background and zero-density fog topology stable through the night transition', () => {
    const scene = new Scene()
    const dayBackground = new Color('#43749a')
    const dayFog = new FogExp2('#57758c', 0.004)
    const nightBackground = new Color('#020611')
    const nightFog = new FogExp2('#081426', 0)
    const renderer = { toneMappingExposure: 1.17 }
    scene.background = dayBackground
    scene.fog = dayFog
    const binding = createLandrushZombieNightScenePresentationBinding({
      background: nightBackground,
      fog: nightFog,
      renderer,
      scene,
    })

    expect(binding.claimed).toBe(false)
    expect(binding.installed).toBe(false)
    expect(scene.background).toBe(dayBackground)
    expect(scene.fog).toBe(dayFog)
    expect(renderer.toneMappingExposure).toBe(1.17)
    expect(binding.install()).toBe(true)
    expect(binding.installed).toBe(true)
    expect(scene.background).toBe(nightBackground)
    expect(nightBackground.getHex()).toBe(dayBackground.getHex())
    expect(scene.fog).toBe(nightFog)
    expect(nightFog.density).toBe(0)
    const installedFog = scene.fog
    expect(binding.claim()).toBe(true)
    expect(scene.background).toBe(nightBackground)
    nightBackground.set('#020611')
    nightFog.density = 0.0001
    expect(scene.fog).toBe(installedFog)
    renderer.toneMappingExposure = 0.78
    expect(binding.release()).toBe(true)
    expect(scene.background).toBe(nightBackground)
    nightFog.density = 0
    expect(scene.fog).toBe(installedFog)
    expect(renderer.toneMappingExposure).toBe(1.17)
    expect(binding.release()).toBe(false)
    expect(binding.dispose()).toBe(true)
    expect(binding.installed).toBe(false)
    expect(scene.background).toBe(dayBackground)
    expect(scene.fog).toBe(dayFog)
  })

  test('refreshes cached viewer lights only when direct theme-light topology changes', () => {
    const scene = new Scene()
    const firstDirectional = new DirectionalLight()
    const ambient = new AmbientLight()
    const hemisphere = new HemisphereLight()
    scene.add(firstDirectional, ambient, hemisphere)
    let changes = 0
    const cache = createLandrushZombieNightSceneLightCache(scene, () => {
      changes += 1
    })

    expect(cache.read()).toEqual({
      ambient,
      direct: [firstDirectional],
      hemisphere,
    })
    scene.add(new PointLight())
    expect(changes).toBe(0)
    const replacementDirectional = new DirectionalLight()
    scene.remove(firstDirectional)
    scene.add(replacementDirectional)
    expect(changes).toBe(2)
    expect(cache.read().direct).toEqual([replacementDirectional])

    cache.dispose()
    scene.remove(replacementDirectional)
    expect(changes).toBe(2)
    expect(cache.read().direct).toEqual([replacementDirectional])
  })
})

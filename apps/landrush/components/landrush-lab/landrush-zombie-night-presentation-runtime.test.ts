import { describe, expect, test } from 'bun:test'
import {
  AmbientLight,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Scene,
} from 'three'
import {
  createLandrushZombieNightSceneLightCache,
  createLandrushZombieNightScenePresentationBinding,
  type LandrushZombieNightBeaconRuntime,
  updateLandrushZombieNightBeaconRuntime,
} from './landrush-zombie-night-presentation-runtime'

describe('Landrush zombie night scene bindings', () => {
  test('keeps beacon topology visible with exactly zero material and light contribution by day', () => {
    const group = new Group()
    const mastMaterial = new MeshStandardMaterial({
      depthWrite: false,
      opacity: 0,
      transparent: true,
    })
    const coreMaterial = new MeshBasicMaterial({
      depthWrite: false,
      opacity: 0,
      transparent: true,
    })
    const innerGlowMaterial = coreMaterial.clone()
    const outerGlowMaterial = coreMaterial.clone()
    const light = new PointLight('#ffc36e', 0, 12, 2)
    const runtime: LandrushZombieNightBeaconRuntime = {
      coreMaterial,
      group,
      innerGlowMaterial,
      lastContributionOnly: null,
      lastEnvelope: Number.NaN,
      lastGlowTreatment: null,
      light,
      mastMaterial,
      outerGlowMaterial,
    }
    const materialVersions = [
      mastMaterial.version,
      coreMaterial.version,
      innerGlowMaterial.version,
      outerGlowMaterial.version,
    ]

    updateLandrushZombieNightBeaconRuntime({
      amount: 1,
      contributionOnly: false,
      glowTreatment: true,
      lightPulse: 1,
      runtime,
    })
    expect(group.visible).toBe(true)
    expect(mastMaterial.opacity).toBe(1)
    expect(coreMaterial.opacity).toBeCloseTo(0.98)
    expect(innerGlowMaterial.opacity).toBeCloseTo(0.24)
    expect(outerGlowMaterial.opacity).toBeCloseTo(0.075)
    expect(light.intensity).toBe(58)

    updateLandrushZombieNightBeaconRuntime({
      amount: 0,
      contributionOnly: false,
      glowTreatment: true,
      lightPulse: 1,
      runtime,
    })
    expect(group.visible).toBe(true)
    expect(mastMaterial.opacity).toBe(0)
    expect(coreMaterial.opacity).toBe(0)
    expect(innerGlowMaterial.opacity).toBe(0)
    expect(outerGlowMaterial.opacity).toBe(0)
    expect(light.intensity).toBe(0)
    expect(
      [mastMaterial, coreMaterial, innerGlowMaterial, outerGlowMaterial].every(
        (material) => material.transparent && material.depthWrite === false,
      ),
    ).toBe(true)
    expect([
      mastMaterial.version,
      coreMaterial.version,
      innerGlowMaterial.version,
      outerGlowMaterial.version,
    ]).toEqual(materialVersions)

    mastMaterial.dispose()
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

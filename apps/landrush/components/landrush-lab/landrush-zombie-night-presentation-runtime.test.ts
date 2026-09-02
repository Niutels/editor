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
  countMountedLandrushZombieNightBeaconLights,
  createLandrushZombieNightSceneLightCache,
  createLandrushZombieNightScenePresentationBinding,
  type LandrushZombieNightBeaconRuntime,
  updateLandrushZombieNightBeaconRuntime,
} from './landrush-zombie-night-presentation-runtime'
import {
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_CONTRIBUTION_INTENSITY,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_EMISSIVE_INTENSITY,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_GROUND_POOL_OPACITY,
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
    const groundPoolMaterial = coreMaterial.clone()
    const light = new SpotLight('#ffc36e', 0, 11.5, 0.92, 0.68, 2)
    const runtime: LandrushZombieNightBeaconRuntime = {
      coreMaterial,
      fixtureMaterials,
      groundPoolMaterial,
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
      groundPoolMaterial.version,
      innerGlowMaterial.version,
      outerGlowMaterial.version,
    ]

    updateLandrushZombieNightBeaconRuntime(runtime, 0, false, true, 1)
    expect(fixtureMaterials.every((material) => material.opacity === 1)).toBe(true)
    expect(
      fixtureMaterials.every(
        (material) => !material.transparent && material.depthWrite && material.opacity === 1,
      ),
    ).toBe(true)
    expect(coreMaterial.opacity).toBe(0)
    expect(groundPoolMaterial.opacity).toBe(0)
    expect(innerGlowMaterial.opacity).toBe(0)
    expect(outerGlowMaterial.opacity).toBe(0)
    expect(light.intensity).toBe(0)
    expect(
      [coreMaterial, groundPoolMaterial, innerGlowMaterial, outerGlowMaterial].every(
        (material) => material.transparent && material.depthWrite === false,
      ),
    ).toBe(true)
    expect([
      ...fixtureMaterials.map((material) => material.version),
      coreMaterial.version,
      groundPoolMaterial.version,
      innerGlowMaterial.version,
      outerGlowMaterial.version,
    ]).toEqual(materialVersions)
    const presentationSource = readFileSync(
      new URL('./landrush-zombie-night-presentation.tsx', import.meta.url),
      'utf8',
    )
    const fixtureInstanceSource = readFileSync(
      new URL('./landrush-zombie-night-street-lightpost-instances.tsx', import.meta.url),
      'utf8',
    )
    const glowInstanceSource = readFileSync(
      new URL('./landrush-zombie-night-beacon-glow-instances.tsx', import.meta.url),
      'utf8',
    )
    expect(fixtureInstanceSource).toContain(
      'args={[sourceMesh.geometry, sourceMesh.material, matrices.length]}',
    )
    expect(fixtureInstanceSource).toContain('mesh.instanceMatrix.setUsage(StaticDrawUsage)')
    expect(fixtureInstanceSource).toContain('sourceMeshes.length !== 1')
    expect(fixtureInstanceSource).toContain('dispose={null}')
    expect(fixtureInstanceSource).not.toContain('.material.clone()')
    expect(glowInstanceSource.match(/<instancedMesh/g)).toHaveLength(4)
    expect(glowInstanceSource).toContain('LANDRUSH_ZOMBIE_NIGHT_GLOW_DRAW_CALL_BUDGET')
    expect(glowInstanceSource).toContain('const geometry = new CircleGeometry(1, 16)')
    expect(glowInstanceSource).toContain('name="landrush-zombie-night-beacon-ground-pools"')
    expect(glowInstanceSource).toContain('createLandrushZombieNightGroundPoolInstanceMatrices')
    expect(glowInstanceSource).toContain('additive ? AdditiveBlending : NormalBlending')
    expect(glowInstanceSource).not.toContain('blending: additive ? AdditiveBlending : undefined')
    expect(presentationSource).toContain("<group visible={settings.mode !== 'light-contribution'}>")
    expect(presentationSource).toContain('<group ref={glowGroupRef} visible={false}>')
    expect(presentationSource).toContain(
      '<LandrushZombieNightBeaconGlowInstances placements={placements} runtime={glowRuntime} />',
    )
    expect(presentationSource).toContain('{placements.map((placement, index) => (')
    expect(presentationSource).not.toContain('lightPlacements')
    expect(presentationSource).toContain("const glowTreatment = settings.mode === 'final'")
    expect(presentationSource).toContain('glowTreatment &&')
    expect(presentationSource).toContain('castShadow={false}')
    expect(presentationSource).toContain('intensity={0}')
    expect(presentationSource).toContain(
      'countMountedLandrushZombieNightBeaconLights(lightRuntimes)',
    )
    expect(presentationSource).not.toContain('updateNightBeacons({')
    expect(presentationSource).not.toContain('updateLandrushZombieNightBeaconRuntime({')
    expect(presentationSource).not.toContain('resolveLandrushZombieNightTargetExposure({')
    expect(presentationSource).not.toContain('{glowsVisible ?')
    expect(presentationSource).not.toContain('material.opacity = 0')
    expect(presentationSource).not.toContain('material.transparent = true')
    expect(presentationSource).toContain('if (installed) dayBackground.copy(background)')
    expect(presentationSource).toContain(
      'if (currentBackground?.isColor) dayBackground.copy(currentBackground)',
    )

    updateLandrushZombieNightBeaconRuntime(runtime, 1, false, true, 1)
    expect(fixtureMaterials.every((material) => material.opacity === 1)).toBe(true)
    expect(
      fixtureMaterials.every(
        (material) =>
          material.emissiveIntensity === LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_EMISSIVE_INTENSITY,
      ),
    ).toBe(true)
    expect(coreMaterial.opacity).toBeCloseTo(0.98)
    expect(groundPoolMaterial.opacity).toBeCloseTo(
      LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_GROUND_POOL_OPACITY,
    )
    expect(innerGlowMaterial.opacity).toBeCloseTo(0.24)
    expect(outerGlowMaterial.opacity).toBeCloseTo(0.075)
    expect(light.intensity).toBe(LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_INTENSITY)

    updateLandrushZombieNightBeaconRuntime(runtime, 1, true, false, 1)
    expect(fixtureMaterials.every((material) => material.emissiveIntensity === 0)).toBe(true)
    expect(coreMaterial.opacity).toBe(0)
    expect(groundPoolMaterial.opacity).toBe(0)
    expect(innerGlowMaterial.opacity).toBe(0)
    expect(outerGlowMaterial.opacity).toBe(0)
    expect(light.intensity).toBe(LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_CONTRIBUTION_INTENSITY)

    updateLandrushZombieNightBeaconRuntime(runtime, 0, false, true, 1)
    expect(fixtureMaterials.every((material) => material.opacity === 1)).toBe(true)
    expect(fixtureMaterials.every((material) => material.emissiveIntensity === 0)).toBe(true)
    expect(
      [coreMaterial, groundPoolMaterial, innerGlowMaterial, outerGlowMaterial].every(
        (material) => material.opacity === 0,
      ),
    ).toBe(true)
    expect(light.intensity).toBe(0)
    expect([
      ...fixtureMaterials.map((material) => material.version),
      coreMaterial.version,
      groundPoolMaterial.version,
      innerGlowMaterial.version,
      outerGlowMaterial.version,
    ]).toEqual(materialVersions)

    for (const material of fixtureMaterials) material.dispose()
    coreMaterial.dispose()
    groundPoolMaterial.dispose()
    innerGlowMaterial.dispose()
    outerGlowMaterial.dispose()
    light.dispose()
  })

  test('counts only mounted beacon light refs in debug snapshots', () => {
    const first = new SpotLight()
    const second = new SpotLight()

    expect(
      countMountedLandrushZombieNightBeaconLights([
        { light: first },
        { light: null },
        { light: second },
      ]),
    ).toBe(2)

    first.dispose()
    second.dispose()
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
    const eventTarget = scene as unknown as {
      dispatchEvent: (event: { child: null; type: 'childremoved' }) => void
    }

    expect(cache.read()).toEqual({
      ambient,
      direct: [firstDirectional],
      hemisphere,
    })
    expect(() => eventTarget.dispatchEvent({ child: null, type: 'childremoved' })).not.toThrow()
    expect(changes).toBe(0)
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

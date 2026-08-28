import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Bone, BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D, Vector3 } from 'three'
import {
  createZombieEscapeAttackClip,
  ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS,
} from './zombie-escape-attack-presentation'
import { ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS } from './zombie-escape-character-motion'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import { createZombieEscapeDeathClip } from './zombie-escape-death-presentation'
import {
  clearAndRecreateZombieEscapeGeneratedAssetCacheUrls,
  createZombieVisual,
  reconcileZombieEscapeGeneratedAssetRetryStatuses,
  resolveZombieEscapeGeneratedAssetCachePaths,
  resolveZombieEscapeGeneratedAssetSettlements,
  resolveZombieEscapeGeneratedVariantAdmissionCount,
  resolveZombieEscapeGeneratedVariantRenderCount,
  resolveZombieEscapeRenderPipelineSettlement,
  updateZombieEscapePresentationReadyVariant,
  updateZombieVisualLocomotion,
  ZOMBIE_ESCAPE_BALANCED_GENERATED_ASSET_KEYS,
  ZOMBIE_ESCAPE_CORE_GENERATED_ASSET_KEYS,
} from './zombie-escape-generated-assets'
import { createZombieEscapeZombieRenderRepresentativeKey } from './zombie-escape-render-readiness'
import { ZOMBIE_ESCAPE_ZOMBIE_INTENT } from './zombie-escape-simulation'
import { createZombieEscapeImpactVisualRegistry } from './zombie-escape-skinned-impact-attachment'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from './zombie-escape-zombie-catalog'
import { createZombieEscapeZombieShader } from './zombie-escape-zombie-material'

const MODEL_TRANSFORM = { offset: new Vector3(), scale: 1 }

describe('generated asset render-pipeline readiness', () => {
  test('releases timed-out or failed critical compilation through the bounded fallback', () => {
    expect(
      resolveZombieEscapeRenderPipelineSettlement({
        message: 'prewarm timed out',
        state: 'degraded',
      }),
    ).toEqual({
      contentReady: true,
      diagnostic: { level: 'warning', message: 'prewarm timed out' },
    })
    expect(
      resolveZombieEscapeRenderPipelineSettlement({
        message: 'shader compile rejected',
        state: 'failed',
      }),
    ).toEqual({
      contentReady: true,
      diagnostic: { level: 'error', message: 'shader compile rejected' },
    })
    expect(resolveZombieEscapeRenderPipelineSettlement({ state: 'ready' })).toEqual({
      contentReady: true,
      diagnostic: null,
    })
  })

  test('settles core weapons independently while preserving background zombie failures', () => {
    const coreKeySet = new Set<string>(ZOMBIE_ESCAPE_CORE_GENERATED_ASSET_KEYS)
    const failedZombieKey = ZOMBIE_ESCAPE_BALANCED_GENERATED_ASSET_KEYS.find(
      (key) => !coreKeySet.has(key),
    )!
    const statuses = new Map([
      ...ZOMBIE_ESCAPE_CORE_GENERATED_ASSET_KEYS.map(
        (key) => [key, { state: 'ready' as const }] as const,
      ),
      [failedZombieKey, { message: 'zombie GLB unavailable', state: 'failed' as const }] as const,
    ])

    const settlements = resolveZombieEscapeGeneratedAssetSettlements(
      statuses,
      ZOMBIE_ESCAPE_BALANCED_GENERATED_ASSET_KEYS,
    )
    expect(settlements.core).toMatchObject({ failed: [], pending: [], ready: true })
    expect(settlements.full).toMatchObject({
      failed: [{ key: failedZombieKey, message: 'zombie GLB unavailable' }],
      ready: false,
    })
  })

  test('preserves core readiness and its pipeline generation during a cosmetic-only retry', () => {
    const coreStatuses = ZOMBIE_ESCAPE_CORE_GENERATED_ASSET_KEYS.map(
      (key) => [key, { state: 'ready' as const }] as const,
    )
    const failedZombieKey = ZOMBIE_ESCAPE_BALANCED_GENERATED_ASSET_KEYS.find((key) =>
      key.startsWith('zombie:'),
    )!
    const statuses = new Map([
      ...coreStatuses,
      [failedZombieKey, { message: 'cosmetic failed', state: 'failed' as const }] as const,
    ])

    const cosmeticRetry = reconcileZombieEscapeGeneratedAssetRetryStatuses(
      statuses,
      { core: 4, cosmetic: 8 },
      { core: 4, cosmetic: 9 },
    )
    expect(cosmeticRetry.coreChanged).toBe(false)
    expect(cosmeticRetry.cosmeticChanged).toBe(true)
    expect(cosmeticRetry.statuses.get(failedZombieKey)).toBeUndefined()
    expect(
      resolveZombieEscapeGeneratedAssetSettlements(
        cosmeticRetry.statuses,
        ZOMBIE_ESCAPE_BALANCED_GENERATED_ASSET_KEYS,
      ).core,
    ).toMatchObject({ failed: [], pending: [], ready: true })

    const source = readFileSync(
      new URL('./zombie-escape-generated-assets.tsx', import.meta.url),
      'utf8',
    )
    expect(source).toContain('generation: coreRetryGeneration')
    expect(source).toContain('onAssetStatusChange={reportCoreAssetStatus}')
    expect(source).toContain('retryGeneration={coreRetryGeneration}')
    expect(source).toContain('onAssetStatusChange={reportCosmeticAssetStatus}')
    expect(source).toContain('retryGeneration={cosmeticRetryGeneration}')
    expect(source).toContain(
      'pipelineReadiness.generation !== coreRetryGeneration',
    )
    expect(source).not.toContain(
      'pipelineReadiness.generation !== cosmeticRetryGeneration',
    )
  })

  test('promotes a zombie variant only after ready and revokes it on degraded or failed compile', () => {
    const readyVariants = new Set<number>()
    const zombieKey = createZombieEscapeZombieRenderRepresentativeKey(
      ZOMBIE_ESCAPE_ZOMBIE_CATALOG[0]!.id,
    )

    expect(
      updateZombieEscapePresentationReadyVariant(readyVariants, zombieKey, { state: 'ready' }),
    ).toBe(true)
    expect(readyVariants).toEqual(new Set([0]))
    updateZombieEscapePresentationReadyVariant(readyVariants, zombieKey, {
      message: 'still compiling',
      state: 'degraded',
    })
    expect(readyVariants.size).toBe(0)
    updateZombieEscapePresentationReadyVariant(readyVariants, zombieKey, { state: 'ready' })
    updateZombieEscapePresentationReadyVariant(readyVariants, zombieKey, {
      message: 'compile rejected',
      state: 'failed',
    })
    expect(readyVariants.size).toBe(0)
    expect(
      updateZombieEscapePresentationReadyVariant(readyVariants, 'weapon-held:pistol', {
        state: 'ready',
      }),
    ).toBe(false)
  })

  test('admits one expensive zombie presentation only after the prior one settles', () => {
    const settled = new Set<number>()
    expect(resolveZombieEscapeGeneratedVariantAdmissionCount(0, settled, 3, false)).toBe(0)
    expect(resolveZombieEscapeGeneratedVariantAdmissionCount(0, settled, 3)).toBe(1)
    expect(resolveZombieEscapeGeneratedVariantAdmissionCount(1, settled, 3)).toBe(1)
    settled.add(0)
    expect(resolveZombieEscapeGeneratedVariantAdmissionCount(1, settled, 3)).toBe(2)
    expect(resolveZombieEscapeGeneratedVariantAdmissionCount(2, settled, 3)).toBe(2)
    settled.add(1)
    expect(resolveZombieEscapeGeneratedVariantAdmissionCount(2, settled, 3)).toBe(3)
    expect(resolveZombieEscapeGeneratedVariantAdmissionCount(3, settled, 3)).toBe(3)
  })

  test('mounts zero cosmetic variant hooks until cosmetic admission opens', () => {
    const admission = { count: 4, generation: 7 }
    expect(resolveZombieEscapeGeneratedVariantRenderCount(false, admission, 7)).toBe(0)
    expect(resolveZombieEscapeGeneratedVariantRenderCount(true, admission, 8)).toBe(0)
    expect(resolveZombieEscapeGeneratedVariantRenderCount(true, admission, 7)).toBe(4)
  })

  test('keeps transfer warming outside retry generations and hooks Blob URLs only after admission', () => {
    const source = readFileSync(
      new URL('./zombie-escape-generated-assets.tsx', import.meta.url),
      'utf8',
    )
    const warmupStart = source.indexOf('const settledPathCounts = new Uint8Array')
    const warmupEnd = source.indexOf('\n  }, [])', warmupStart)
    expect(warmupStart).toBeGreaterThan(-1)
    expect(warmupEnd).toBeGreaterThan(warmupStart)
    expect(source.slice(warmupStart, warmupEnd)).not.toContain('retryGeneration')
    expect(source).toContain('cosmeticAssetsAdmitted = true')
    expect(source).toContain('ZOMBIE_VARIANT_INDICES.slice(0, admittedVariantCount)')
    expect(source).toContain('assetUrls={assetUrls}')
    expect(source).toContain('useGLTFKTX2(assetUrls.riggedBase)')
    expect(source).toContain('useGLTF(assetUrls.run)')
    expect(source).toContain('useGLTF(assetUrls.walk)')
    expect(source).toContain(
      'for (const objectUrl of warmup.getOwnedObjectUrls()) useGLTF.clear(objectUrl)',
    )
  })

  test('clears and recreates every active Blob URL owned by a failed zombie key', () => {
    const zombie = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[0]!
    const failedKey = `zombie:${zombie.id}`
    const paths = resolveZombieEscapeGeneratedAssetCachePaths([failedKey])
    const cleared: string[] = []
    const recreated: string[][] = []
    const blobUrlByPath = new Map(paths.map((path) => [path, `blob:warmup:${path}`]))

    clearAndRecreateZombieEscapeGeneratedAssetCacheUrls(
      paths,
      [
        {
          getAssetUrl: (path) => blobUrlByPath.get(path) ?? null,
          recreateObjectUrls: (recreatedPaths) => {
            recreated.push([...recreatedPaths])
            return []
          },
        },
      ],
      (assetUrl) => cleared.push(assetUrl),
    )

    expect(paths).toEqual([zombie.glb.riggedBase.path, zombie.glb.run.path, zombie.glb.walk.path])
    expect(cleared).toEqual([...paths, ...paths.map((path) => `blob:warmup:${path}`)])
    expect(recreated).toEqual([paths])
  })
})

describe('generated zombie visual construction', () => {
  test('prewarms a skinned root without allocating an animation mixer', () => {
    const group = new Group()
    const source = new Group()
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial()
    source.add(new Mesh(geometry, material))

    const visual = createZombieVisual({
      active: false,
      attackClip: null,
      generation: 0,
      group,
      impactVisualRegistry: createZombieEscapeImpactVisualRegistry(),
      modelTransform: MODEL_TRANSFORM,
      runClip: null,
      slot: null,
      source,
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
      zombieShaderSeed: 0,
    })

    expect(visual.mixer).toBeNull()
    expect(visual.root.visible).toBe(false)
    for (const ownedMaterial of visual.ownedMaterials) ownedMaterial.dispose()
    geometry.dispose()
    material.dispose()
  })

  test('disposes materials cloned before a later material clone fails', () => {
    const group = new Group()
    const source = new Group()
    const firstGeometry = new BoxGeometry()
    const secondGeometry = new BoxGeometry()
    const firstMaterial = new MeshStandardMaterial()
    const secondMaterial = new MeshStandardMaterial()
    const cloneFirstMaterial = firstMaterial.clone.bind(firstMaterial)
    let disposedMaterials = 0
    firstMaterial.clone = () => {
      const clone = cloneFirstMaterial()
      clone.addEventListener('dispose', () => {
        disposedMaterials += 1
      })
      return clone
    }
    secondMaterial.clone = () => {
      throw new Error('material clone failed')
    }
    source.add(new Mesh(firstGeometry, firstMaterial), new Mesh(secondGeometry, secondMaterial))

    expect(() =>
      createZombieVisual({
        active: false,
        attackClip: null,
        generation: 0,
        group,
        impactVisualRegistry: createZombieEscapeImpactVisualRegistry(),
        modelTransform: MODEL_TRANSFORM,
        runClip: null,
        slot: null,
        source,
        walkClip: null,
        zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
        zombieShaderSeed: 0,
      }),
    ).toThrow('material clone failed')
    expect(group.children).toHaveLength(0)
    expect(disposedMaterials).toBe(1)

    firstGeometry.dispose()
    secondGeometry.dispose()
    firstMaterial.dispose()
    secondMaterial.dispose()
  })

  test('rolls back scene attachment, impact registration, and owned material after attach fails', () => {
    class ThrowAfterAttachGroup extends Group {
      override add(...objects: Object3D[]) {
        super.add(...objects)
        throw new Error('scene attachment failed')
      }
    }

    const group = new ThrowAfterAttachGroup()
    const source = new Group()
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial()
    const cloneMaterial = material.clone.bind(material)
    let disposedMaterials = 0
    material.clone = () => {
      const clone = cloneMaterial()
      clone.addEventListener('dispose', () => {
        disposedMaterials += 1
      })
      return clone
    }
    source.add(new Mesh(geometry, material))
    const impactVisualRegistry = createZombieEscapeImpactVisualRegistry()

    expect(() =>
      createZombieVisual({
        active: true,
        attackClip: null,
        generation: 4,
        group,
        impactVisualRegistry,
        modelTransform: MODEL_TRANSFORM,
        runClip: null,
        slot: 3,
        source,
        walkClip: null,
        zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
        zombieShaderSeed: 0,
      }),
    ).toThrow('scene attachment failed')
    expect(group.children).toHaveLength(0)
    expect(impactVisualRegistry.bindings.size).toBe(0)
    expect(disposedMaterials).toBe(1)

    geometry.dispose()
    material.dispose()
  })

  test('drives a detailed authored strike from semantic attack intent and cooldown', () => {
    const group = new Group()
    const source = new Group()
    for (const name of ['Spine', 'Spine01', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm']) {
      const bone = new Bone()
      bone.name = name
      source.add(bone)
    }
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial()
    source.add(new Mesh(geometry, material))
    const attackClip = createZombieEscapeAttackClip(source)
    const visual = createZombieVisual({
      active: true,
      attackClip,
      generation: 1,
      group,
      impactVisualRegistry: createZombieEscapeImpactVisualRegistry(),
      modelTransform: MODEL_TRANSFORM,
      runClip: null,
      slot: null,
      source,
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
      zombieShaderSeed: 0,
    })

    updateZombieVisualLocomotion({
      attackCooldown: ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS * 0.5,
      attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle,
      delta: 1 / 60,
      horizontalSpeed: 0,
      paused: false,
      runBlend: 0,
      runMetersPerSecond: 3,
      visual,
      walkMetersPerSecond: 1,
    })

    expect(visual.attackAction).not.toBeNull()
    expect(visual.attackAction?.getEffectiveWeight()).toBe(1)
    expect(visual.attackAction?.time).toBeCloseTo(
      ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS * 0.5,
      6,
    )
    visual.mixer?.stopAllAction()
    visual.mixer?.uncacheRoot(visual.animationRoot)
    for (const ownedMaterial of visual.ownedMaterials) ownedMaterial.dispose()
    geometry.dispose()
    material.dispose()
  })

  test('drives a detailed joint collapse to an exact nonmoving terminal pose', () => {
    const group = new Group()
    const source = new Group()
    for (const name of [
      'Hips',
      'Spine',
      'Spine01',
      'Head',
      'LeftArm',
      'LeftForeArm',
      'RightArm',
      'RightForeArm',
      'LeftUpLeg',
      'LeftLeg',
      'RightUpLeg',
      'RightLeg',
    ]) {
      const bone = new Bone()
      bone.name = name
      source.add(bone)
    }
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial()
    source.add(new Mesh(geometry, material))
    const deathClip = createZombieEscapeDeathClip(source)
    const visual = createZombieVisual({
      active: true,
      attackClip: null,
      deathClip,
      generation: 1,
      group,
      impactVisualRegistry: createZombieEscapeImpactVisualRegistry(),
      modelTransform: MODEL_TRANSFORM,
      runClip: null,
      slot: null,
      source,
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
      zombieShaderSeed: 0,
    })

    updateZombieVisualLocomotion({
      attackCooldown: 0,
      attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
      deathPresentationSeconds:
        ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds -
        ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS * 0.5,
      delta: 1 / 60,
      health: 0,
      horizontalSpeed: 0,
      paused: false,
      runBlend: 0,
      runMetersPerSecond: 3,
      visual,
      walkMetersPerSecond: 1,
    })
    expect(visual.deathAction?.getEffectiveWeight()).toBe(1)
    expect(visual.deathAction?.time).toBeCloseTo(
      ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS * 0.5,
      6,
    )

    updateZombieVisualLocomotion({
      attackCooldown: 0,
      attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
      deathPresentationSeconds: 0.2,
      delta: 1 / 60,
      health: 0,
      horizontalSpeed: 0,
      paused: false,
      runBlend: 0,
      runMetersPerSecond: 3,
      visual,
      walkMetersPerSecond: 1,
    })
    expect(visual.deathAction?.time).toBeCloseTo(ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS, 6)
    visual.mixer?.stopAllAction()
    visual.mixer?.uncacheRoot(visual.animationRoot)
    for (const ownedMaterial of visual.ownedMaterials) ownedMaterial.dispose()
    geometry.dispose()
    material.dispose()
  })
})

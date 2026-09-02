import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  AnimationClip,
  Bone,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  type Object3D,
  Vector3,
} from 'three'
import {
  createZombieEscapeAttackClip,
  ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS,
} from './zombie-escape-attack-presentation'
import { ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS } from './zombie-escape-character-motion'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import { createZombieEscapeDeathClip } from './zombie-escape-death-presentation'
import {
  activateZombieVisual,
  createZombieEscapeAuthoredVariantSlotBuckets,
  createZombieVisual,
  isZombieEscapeZombieSlotExternallyPresented,
  parkZombieVisual,
  reserveZombieEscapeSpecialVariantPresentationCapacity,
  resolveZombieEscapeGeneratedVariantAdmissionCount,
  resolveZombieEscapeRenderPipelineSettlement,
  updateZombieEscapeGeneratedZombiePresentationExclusions,
  updateZombieEscapeRenderPipelineProgress,
  updateZombieVisualLocomotion,
} from './zombie-escape-generated-assets'
import {
  createZombieEscapeSimulation,
  ZOMBIE_ESCAPE_ZOMBIE_INTENT,
} from './zombie-escape-simulation'
import { createZombieEscapeImpactVisualRegistry } from './zombie-escape-skinned-impact-attachment'
import { createZombieEscapeArena } from './zombie-escape-world'
import {
  ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT,
  ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT,
  ZOMBIE_ESCAPE_ZOMBIE_CATALOG,
} from './zombie-escape-zombie-catalog'
import { createZombieEscapeZombieShader } from './zombie-escape-zombie-material'

const MODEL_TRANSFORM = { offset: new Vector3(), scale: 1 }

describe('generated asset render-pipeline readiness', () => {
  test('runs only the final aggregate pipeline preparation after complete asset coverage', () => {
    const source = readFileSync(
      new URL('./zombie-escape-generated-assets.tsx', import.meta.url),
      'utf8',
    )
    expect(source).toContain('resolveZombieEscapeRenderReadinessProgressTotal(pipelineRenderer)')
    expect(source).toContain('representatives: renderReadinessSnapshot.representatives')
    expect(source).not.toContain('createZombieEscapeRenderPrewarmCoordinator')
    expect(source).not.toContain('prewarmCoordinator.request(')
    expect(source).toContain(
      'detailedZombies\n      ? loadedZombieVariantsRef.current\n      : EMPTY_READY_ZOMBIE_VARIANTS',
    )
    expect(source).toContain(
      'detailedZombies\n        ? reserveZombieEscapeSpecialVariantPresentationCapacity(',
    )
    expect(source).toContain('zombieMaterialPhaseActive && outsideTorchVisibility < 1')
  })

  test('keeps handoff exclusion storage and copying allocation-free after mount', () => {
    const source = readFileSync(
      new URL('./zombie-escape-generated-assets.tsx', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(/useRef\(\s*new Uint8Array\(/)
    expect(source).not.toContain('detailedSlots.subarray(')
    expect(source).toContain('const [zombiePresentationExclusionSlots] = useState(() => {')
    expect(source).toContain('authoredExclusionSlots[slot] =')
    expect(source).toContain('authoredByVariant: createZombieEscapeAuthoredVariantSlotBuckets(')
    expect(source).toContain('presentation.update(authoredSelection, zombies)')
    expect(source).not.toContain('collectZombieEscapeAuthoredInstanceSlots')
  })

  test('keeps timed-out and failed required preparation behind loading until ready or retried', () => {
    expect(
      resolveZombieEscapeRenderPipelineSettlement({
        message: 'prewarm timed out',
        state: 'degraded',
      }),
    ).toEqual({
      contentReady: false,
      diagnostic: { level: 'warning', message: 'prewarm timed out' },
    })
    expect(
      resolveZombieEscapeRenderPipelineSettlement({
        message: 'shader compile rejected',
        state: 'failed',
      }),
    ).toEqual({
      contentReady: false,
      diagnostic: { level: 'error', message: 'shader compile rejected' },
    })
    expect(resolveZombieEscapeRenderPipelineSettlement({ state: 'ready' })).toEqual({
      contentReady: true,
      diagnostic: null,
    })
  })

  test('admits one expensive zombie presentation only after the prior one settles', () => {
    const settled = new Set<number>()
    expect(resolveZombieEscapeGeneratedVariantAdmissionCount(0, settled, 3)).toBe(1)
    expect(resolveZombieEscapeGeneratedVariantAdmissionCount(1, settled, 3)).toBe(1)
    settled.add(0)
    expect(resolveZombieEscapeGeneratedVariantAdmissionCount(1, settled, 3)).toBe(2)
    expect(resolveZombieEscapeGeneratedVariantAdmissionCount(2, settled, 3)).toBe(2)
    settled.add(1)
    expect(resolveZombieEscapeGeneratedVariantAdmissionCount(2, settled, 3)).toBe(3)
    expect(resolveZombieEscapeGeneratedVariantAdmissionCount(3, settled, 3)).toBe(3)
  })

  test('publishes pipeline progress only when a genuine completed count changes', () => {
    const current = { completed: 0, total: 4 }
    expect(updateZombieEscapeRenderPipelineProgress(current, { completed: 0, total: 4 })).toBe(
      false,
    )
    expect(updateZombieEscapeRenderPipelineProgress(current, { completed: 1, total: 4 })).toBe(true)
    expect(current).toEqual({ completed: 1, total: 4 })
    expect(updateZombieEscapeRenderPipelineProgress(current, { completed: 1, total: 4 })).toBe(
      false,
    )
  })
})

describe('generated zombie visual construction', () => {
  test('preallocates exact per-variant capacities including empty variants', () => {
    const buckets = createZombieEscapeAuthoredVariantSlotBuckets(new Uint8Array([0, 2, 2, 2]), 4)

    expect(buckets.map(({ slots }) => slots.length)).toEqual([1, 0, 3, 0])
    expect(buckets.map(({ count }) => count)).toEqual([0, 0, 0, 0])
  })

  test('reserves one authored and detailed presentation for each timed boss', () => {
    const simulation = createZombieEscapeSimulation(createZombieEscapeArena(58_214))
    const buckets = createZombieEscapeAuthoredVariantSlotBuckets(
      simulation.variantByPoolSlot,
      ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length,
    )
    const detailedSlots = new Uint8Array(simulation.zombies.pool.capacity)
    const externallyPresentedSlots = new Uint8Array(simulation.zombies.pool.capacity)
    const authoredExclusionSlots = new Uint8Array(simulation.zombies.pool.capacity)

    expect(simulation.variantByPoolSlot).not.toContain(ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT)
    expect(simulation.variantByPoolSlot).not.toContain(ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT)
    expect(buckets[ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT]!.slots).toHaveLength(1)
    expect(buckets[ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT]!.slots).toHaveLength(1)
    expect(
      reserveZombieEscapeSpecialVariantPresentationCapacity(0, ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT),
    ).toBe(1)
    expect(
      reserveZombieEscapeSpecialVariantPresentationCapacity(0, ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT),
    ).toBe(1)
    expect(
      reserveZombieEscapeSpecialVariantPresentationCapacity(0, ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length),
    ).toBe(0)

    simulation.zombies.pool.active[0] = 1
    simulation.zombies.pool.active[1] = 1
    simulation.zombies.variant[0] = ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT
    simulation.zombies.variant[1] = ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT
    updateZombieEscapeGeneratedZombiePresentationExclusions(
      simulation,
      detailedSlots,
      externallyPresentedSlots,
      authoredExclusionSlots,
      buckets,
    )

    expect(buckets[ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT]!.count).toBe(1)
    expect(buckets[ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT]!.count).toBe(1)
  })

  test('matches the former per-variant collector across randomized pool states', () => {
    const simulation = createZombieEscapeSimulation(createZombieEscapeArena(58_212))
    const capacity = simulation.zombies.pool.capacity
    const variantCount = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length
    const detailedSlots = new Uint8Array(capacity)
    const externallyPresentedSlots = new Uint8Array(capacity)
    const authoredExclusionSlots = new Uint8Array(capacity)
    simulation.ambientHandoff.npcIndexBySlot.fill(-1)
    simulation.ambientHandoff.slotByNpcIndex.fill(-1)
    let randomState = 0x5a17_9e31
    const nextRandom = () => {
      randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0
      return randomState
    }

    for (let iteration = 0; iteration < 32; iteration += 1) {
      for (let slot = 0; slot < capacity; slot += 1) {
        const variantIndex = nextRandom() % variantCount
        simulation.variantByPoolSlot[slot] = variantIndex
        simulation.zombies.variant[slot] = variantIndex
        simulation.zombies.pool.active[slot] = nextRandom() % 5 === 0 ? 0 : 1
        detailedSlots[slot] = nextRandom() % 4 === 0 ? 1 : 0
      }
      const buckets = createZombieEscapeAuthoredVariantSlotBuckets(
        simulation.variantByPoolSlot,
        variantCount,
      )
      updateZombieEscapeGeneratedZombiePresentationExclusions(
        simulation,
        detailedSlots,
        externallyPresentedSlots,
        authoredExclusionSlots,
        buckets,
      )

      for (let variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
        const expected = collectFormerAuthoredSlots(
          simulation.zombies.pool.active,
          authoredExclusionSlots,
          simulation.zombies.variant,
          variantIndex,
        )
        const bucket = buckets[variantIndex]!
        expect(bucket.count).toBe(expected.length)
        expect(Array.from(bucket.slots.slice(0, bucket.count))).toEqual(expected)
      }
    }
  })

  test('reuses the same buckets through full and zero-selection lifecycle updates', () => {
    const simulation = createZombieEscapeSimulation(createZombieEscapeArena(58_213))
    const capacity = simulation.zombies.pool.capacity
    const variantCount = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length
    const detailedSlots = new Uint8Array(capacity)
    const externallyPresentedSlots = new Uint8Array(capacity)
    const authoredExclusionSlots = new Uint8Array(capacity)
    const buckets = createZombieEscapeAuthoredVariantSlotBuckets(
      simulation.variantByPoolSlot,
      variantCount,
    )
    const slotArrays = buckets.map(({ slots }) => slots)
    simulation.ambientHandoff.npcIndexBySlot.fill(-1)
    simulation.ambientHandoff.slotByNpcIndex.fill(-1)
    simulation.zombies.variant.set(simulation.variantByPoolSlot)
    simulation.zombies.pool.active.fill(1)

    updateZombieEscapeGeneratedZombiePresentationExclusions(
      simulation,
      detailedSlots,
      externallyPresentedSlots,
      authoredExclusionSlots,
      buckets,
    )
    for (let variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
      const bucket = buckets[variantIndex]!
      const expected = collectFormerAuthoredSlots(
        simulation.zombies.pool.active,
        authoredExclusionSlots,
        simulation.zombies.variant,
        variantIndex,
      )
      expect(bucket.count).toBe(expected.length)
      expect(bucket.slots).toBe(slotArrays[variantIndex])
      expect(Array.from(bucket.slots.slice(0, bucket.count))).toEqual(expected)
    }

    simulation.zombies.pool.active.fill(0)
    updateZombieEscapeGeneratedZombiePresentationExclusions(
      simulation,
      detailedSlots,
      externallyPresentedSlots,
      authoredExclusionSlots,
      buckets,
    )
    expect(buckets.every(({ count }) => count === 0)).toBe(true)
    expect(buckets.every(({ slots }, index) => slots === slotArrays[index])).toBe(true)

    simulation.zombies.pool.active.fill(1)
    detailedSlots.fill(1)
    updateZombieEscapeGeneratedZombiePresentationExclusions(
      simulation,
      detailedSlots,
      externallyPresentedSlots,
      authoredExclusionSlots,
      buckets,
    )
    expect(buckets.every(({ count }) => count === 0)).toBe(true)
    expect(buckets.every(({ slots }, index) => slots === slotArrays[index])).toBe(true)
  })

  test('excludes only active generation-matched handoffs and releases on death or reuse', () => {
    const simulation = createZombieEscapeSimulation(createZombieEscapeArena(58_211))
    const capacity = simulation.zombies.pool.capacity
    const slot = 3
    const npcIndex = 1
    const detailedSlots = new Uint8Array(capacity)
    const externallyPresentedSlots = new Uint8Array(capacity)
    const authoredExclusionSlots = new Uint8Array(capacity)
    const authoredVariantSlots = createZombieEscapeAuthoredVariantSlotBuckets(
      simulation.variantByPoolSlot,
      ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length,
    )
    detailedSlots[5] = 1
    simulation.zombies.pool.active[slot] = 1
    simulation.zombies.pool.generation[slot] = 7
    simulation.ambientHandoff.npcIndexBySlot[slot] = npcIndex
    simulation.ambientHandoff.slotByNpcIndex[npcIndex] = slot
    simulation.ambientHandoff.generationByNpcIndex[npcIndex] = 7

    updateZombieEscapeGeneratedZombiePresentationExclusions(
      simulation,
      detailedSlots,
      externallyPresentedSlots,
      authoredExclusionSlots,
      authoredVariantSlots,
    )
    expect(isZombieEscapeZombieSlotExternallyPresented(simulation, slot)).toBe(true)
    expect(externallyPresentedSlots[slot]).toBe(1)
    expect(authoredExclusionSlots[slot]).toBe(1)
    expect(authoredExclusionSlots[5]).toBe(1)

    simulation.zombies.pool.generation[slot] = 8
    updateZombieEscapeGeneratedZombiePresentationExclusions(
      simulation,
      detailedSlots,
      externallyPresentedSlots,
      authoredExclusionSlots,
      authoredVariantSlots,
    )
    expect(isZombieEscapeZombieSlotExternallyPresented(simulation, slot)).toBe(false)
    expect(externallyPresentedSlots[slot]).toBe(0)
    expect(authoredExclusionSlots[slot]).toBe(0)

    simulation.ambientHandoff.generationByNpcIndex[npcIndex] = 8
    simulation.zombies.pool.active[slot] = 0
    updateZombieEscapeGeneratedZombiePresentationExclusions(
      simulation,
      detailedSlots,
      externallyPresentedSlots,
      authoredExclusionSlots,
      authoredVariantSlots,
    )
    expect(isZombieEscapeZombieSlotExternallyPresented(simulation, slot)).toBe(false)
    expect(externallyPresentedSlots[slot]).toBe(0)
    expect(authoredExclusionSlots[slot]).toBe(0)
  })

  test('prepares a stopped animation mixer before a hidden pooled root is ready', () => {
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

    expect(visual.mixer).not.toBeNull()
    expect(visual.mixer?.time).toBe(0)
    expect(visual.mixer?.stats.actions.inUse).toBe(0)
    expect(visual.root.visible).toBe(false)
    for (const ownedMaterial of visual.ownedMaterials) ownedMaterial.dispose()
    geometry.dispose()
    material.dispose()
  })

  test('binds during preparation and reuses stopped actions across activation without changing the rest pose', () => {
    const source = new Group()
    const bone = new Bone()
    bone.name = 'Hips'
    bone.position.x = 2
    source.add(bone)
    const walkClip = new AnimationClip('walk', 1, [
      new NumberKeyframeTrack('Hips.position[x]', [0, 1], [10, 20]),
    ])
    const registry = createZombieEscapeImpactVisualRegistry()
    const visual = createZombieVisual({
      active: false,
      attackClip: null,
      generation: 0,
      group: new Group(),
      impactVisualRegistry: registry,
      modelTransform: MODEL_TRANSFORM,
      runClip: null,
      slot: null,
      source,
      walkClip,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
      zombieShaderSeed: 0,
    })
    const mixer = visual.mixer!
    const action = visual.walkAction!
    const animatedBone = visual.animationRoot.getObjectByName('Hips')!
    const bindingCount = mixer.stats.bindings.total
    expect(bindingCount).toBeGreaterThan(0)
    expect(animatedBone.position.x).toBe(2)
    expect(action.isRunning()).toBe(false)
    expect(registry.bindings.size).toBe(0)
    mixer.clipAction = () => {
      throw new Error('Activation must reuse the prepared action')
    }

    for (let generation = 1; generation <= 8; generation += 1) {
      activateZombieVisual(visual, registry, 3, generation)
      expect(visual.mixer).toBe(mixer)
      expect(visual.walkAction).toBe(action)
      expect(visual.generation).toBe(generation)
      expect(visual.root.visible).toBe(true)
      expect(registry.bindings.size).toBe(1)
      expect(action.time).toBe(0)
      mixer.update(0.25)
      expect(animatedBone.position.x).toBeCloseTo(12.5)

      parkZombieVisual(visual)
      expect(visual.root.visible).toBe(false)
      expect(action.isRunning()).toBe(false)
      expect(animatedBone.position.x).toBe(2)
      expect(registry.bindings.size).toBe(0)
      expect(mixer.stats.bindings.total).toBe(bindingCount)
      expect(mixer.stats.actions.inUse).toBe(0)
    }
    mixer.uncacheRoot(visual.animationRoot)
    expect(mixer.stats.bindings.total).toBe(0)
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

function collectFormerAuthoredSlots(
  active: Uint8Array,
  excluded: Uint8Array,
  variant: Uint8Array,
  variantIndex: number,
) {
  const selected: number[] = []
  for (let slot = 0; slot < active.length; slot += 1) {
    if (active[slot] === 0 || excluded[slot] !== 0 || variant[slot] !== variantIndex) continue
    selected.push(slot)
  }
  return selected
}

import { describe, expect, test } from 'bun:test'
import { Bone, BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D, Vector3 } from 'three'
import {
  createZombieEscapeAttackClip,
  ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS,
} from './zombie-escape-attack-presentation'
import { ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS } from './zombie-escape-character-motion'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import { createZombieEscapeDeathClip } from './zombie-escape-death-presentation'
import {
  createZombieVisual,
  resolveZombieEscapeGeneratedVariantAdmissionCount,
  resolveZombieEscapeRenderPipelineSettlement,
  updateZombieVisualLocomotion,
} from './zombie-escape-generated-assets'
import { ZOMBIE_ESCAPE_ZOMBIE_INTENT } from './zombie-escape-simulation'
import { createZombieEscapeImpactVisualRegistry } from './zombie-escape-skinned-impact-attachment'
import { createZombieEscapeZombieShader } from './zombie-escape-zombie-material'

const MODEL_TRANSFORM = { offset: new Vector3(), scale: 1 }

describe('generated asset render-pipeline readiness', () => {
  test('keeps timed-out prewarm behind loading but releases failed compilation as a fallback', () => {
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
      contentReady: true,
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

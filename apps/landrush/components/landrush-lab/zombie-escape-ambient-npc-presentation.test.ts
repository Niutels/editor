import { describe, expect, test } from 'bun:test'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import {
  createAmbientNpcZombieActionTargets,
  resolveAmbientNpcZombieActionTargets,
  resolveAmbientNpcZombieLocomotionPhase,
} from './landrush-island-ambient-life'
import { createZombieEscapeAmbientNpcPresentationResource } from './zombie-escape-ambient-npc-presentation'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import { ZOMBIE_ESCAPE_ZOMBIE_INTENT } from './zombie-escape-simulation'

describe('Zombie Escape exact ambient NPC presentation', () => {
  test('prepares and reuses one phase-switched material set', () => {
    const geometry = new BoxGeometry(1, 2, 1)
    const source = new MeshStandardMaterial({ color: '#91a55f', emissive: '#071006' })
    const mesh = new Mesh(geometry, source)
    const root = new Group()
    root.add(mesh)
    const resource = createZombieEscapeAmbientNpcPresentationResource(root, 23, 0.8)
    const zombieMaterial = mesh.material as MeshStandardMaterial

    try {
      expect(zombieMaterial).not.toBe(source)
      expect(resource.shader.getOutsideTorchVisibility()).toBe(0.8)
      expect(resource.shader.getPhaseAmount()).toBe(0)
      resource.setZombiePhase(1)
      expect(resource.shader.getPhaseAmount()).toBe(1)
      resource.setZombiePhase(0)
      expect(resource.shader.getPhaseAmount()).toBe(0)
      resource.setZombiePhase(1)
      expect(resource.shader.getPhaseAmount()).toBe(1)

      const baseEmissive = zombieMaterial.emissive.clone()
      resource.setHitFlash(1)
      expect(zombieMaterial.emissive.getHexString()).toBe('ff1738')
      resource.setHitFlash(0)
      expect(zombieMaterial.emissive).toEqual(baseEmissive)
    } finally {
      resource.dispose()
      expect(mesh.material).toBe(source)
      geometry.dispose()
      source.dispose()
    }
  })

  test('resolves idle, running, attacking, and death blends into a reused target', () => {
    const target = createAmbientNpcZombieActionTargets()
    expect(resolveAmbientNpcZombieActionTargets(0, 0, 1.1, 3.2, 0, 0, 100, 0, target)).toBe(target)
    expect(target.idleWeight).toBe(1)
    expect(target.walkWeight).toBe(0)
    expect(target.runWeight).toBe(0)

    resolveAmbientNpcZombieActionTargets(3.2, 1, 1.1, 3.2, 0, 0, 100, 0, target)
    expect(target.idleWeight).toBe(0)
    expect(target.runWeight).toBe(1)

    resolveAmbientNpcZombieActionTargets(
      0,
      0,
      1.1,
      3.2,
      ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer,
      ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds * 0.5,
      100,
      0,
      target,
    )
    expect(target.attackWeight).toBe(1)
    expect(target.idleWeight).toBe(0)
    expect(target.attackPhase).toBeCloseTo(0.5, 5)

    resolveAmbientNpcZombieActionTargets(
      0,
      0,
      1.1,
      3.2,
      0,
      0,
      0,
      ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds * 0.5,
      target,
    )
    expect(target.deathWeight).toBeGreaterThan(0)
    expect(target.idleWeight).toBeLessThan(1)
  })

  test('normalizes the captured live clip clock into the simulation cycle', () => {
    expect(resolveAmbientNpcZombieLocomotionPhase(0.75, 3)).toBeCloseTo(Math.PI / 2, 6)
    expect(resolveAmbientNpcZombieLocomotionPhase(3.75, 3)).toBeCloseTo(Math.PI / 2, 6)
    expect(resolveAmbientNpcZombieLocomotionPhase(-0.75, 3)).toBeCloseTo(Math.PI * 1.5, 6)
    expect(resolveAmbientNpcZombieLocomotionPhase(1, 0)).toBe(0)
  })
})

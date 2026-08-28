import { describe, expect, test } from 'bun:test'
import { Euler, Matrix3, Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import {
  doesZombieEscapeBloodEventMatchVariant,
  isZombieEscapeBloodAttachmentGenerationCurrent,
  isZombieEscapeBloodPoolVisible,
  resolveZombieEscapeBloodFramePriorities,
  resolveZombieEscapeBloodSlotAction,
  shouldAttachZombieEscapeBloodLayer,
  shouldUpdateZombieEscapeBloodPresentation,
  transformZombieEscapeBloodWorldAttachmentToLocal,
} from './zombie-escape-blood-presentation'
import { getZombieEscapeBloodVariantProfile } from './zombie-escape-blood-variants'

describe('Zombie Escape shared blood presentation', () => {
  test('strictly brackets the producer while staying inside the integrated render gap', () => {
    const presentationFramePriority = 0.85
    const producerFramePriority = 0.9
    const viewerRenderFramePriority = 1
    const priorities = resolveZombieEscapeBloodFramePriorities(producerFramePriority)

    expect(presentationFramePriority).toBeLessThan(priorities.lifecycle)
    expect(priorities.lifecycle).toBeLessThan(producerFramePriority)
    expect(producerFramePriority).toBeLessThan(priorities.presentation)
    expect(priorities.presentation).toBeLessThan(viewerRenderFramePriority)
  })

  test('hides stale matrices after reset and renders a same-frame replacement', () => {
    expect(resolveZombieEscapeBloodSlotAction(false, true)).toBe('hide')
    expect(resolveZombieEscapeBloodSlotAction(false, false)).toBe('idle')
    expect(resolveZombieEscapeBloodSlotAction(true, true)).toBe('render')
    expect(resolveZombieEscapeBloodSlotAction(true, false)).toBe('render')
  })

  test('moves an overwritten slot between fixed variant passes', () => {
    const wet = getZombieEscapeBloodVariantProfile('wet-hybrid').code
    const heavy = getZombieEscapeBloodVariantProfile('heavy-clots').code

    expect(doesZombieEscapeBloodEventMatchVariant(wet, wet)).toBe(true)
    expect(doesZombieEscapeBloodEventMatchVariant(heavy, wet)).toBe(false)
    expect(doesZombieEscapeBloodEventMatchVariant(heavy, heavy)).toBe(true)
  })

  test('removes every pooled layer from rendering while no blood event is active', () => {
    expect(isZombieEscapeBloodPoolVisible(0)).toBe(false)
    expect(isZombieEscapeBloodPoolVisible(1)).toBe(true)
    expect(isZombieEscapeBloodPoolVisible(Number.NaN)).toBe(false)
  })

  test('sleeps only after the last visible blood layer has been cleared', () => {
    expect(shouldUpdateZombieEscapeBloodPresentation(0, 0)).toBe(false)
    expect(shouldUpdateZombieEscapeBloodPresentation(0, 1)).toBe(true)
    expect(shouldUpdateZombieEscapeBloodPresentation(1, 0)).toBe(true)
  })

  test('allows only generation-current residue to follow an attachment', () => {
    expect(shouldAttachZombieEscapeBloodLayer('residue')).toBe(true)
    expect(shouldAttachZombieEscapeBloodLayer('splash')).toBe(false)
    expect(shouldAttachZombieEscapeBloodLayer('droplet')).toBe(false)
    expect(isZombieEscapeBloodAttachmentGenerationCurrent(7, 7)).toBe(true)
    expect(isZombieEscapeBloodAttachmentGenerationCurrent(7, 6)).toBe(false)
    expect(isZombieEscapeBloodAttachmentGenerationCurrent(0, 0)).toBe(false)
  })

  test('converts attached points and normals through a translated rotated nonuniform root', () => {
    const root = new Object3D()
    root.position.set(3, -2, 5)
    root.quaternion.copy(new Quaternion().setFromEuler(new Euler(0.42, -0.71, 0.19)))
    root.scale.set(2.4, 0.75, 1.35)
    root.updateMatrixWorld(true)

    const expectedPoint = new Vector3(0.7, 1.1, -0.4)
    const expectedNormal = new Vector3(0.35, 0.82, -0.44).normalize()
    const worldPoint = expectedPoint.clone().applyMatrix4(root.matrixWorld)
    const worldNormal = expectedNormal
      .clone()
      .applyMatrix3(new Matrix3().getNormalMatrix(root.matrixWorld))
      .normalize()
    const localPoint = new Vector3()
    const localNormal = new Vector3()

    expect(
      transformZombieEscapeBloodWorldAttachmentToLocal(
        root.matrixWorld,
        worldPoint,
        worldNormal,
        localPoint,
        localNormal,
        new Matrix4(),
        new Matrix3(),
      ),
    ).toBe(true)
    expect(localPoint.distanceTo(expectedPoint)).toBeLessThan(0.000_001)
    expect(localNormal.distanceTo(expectedNormal)).toBeLessThan(0.000_001)
  })
})

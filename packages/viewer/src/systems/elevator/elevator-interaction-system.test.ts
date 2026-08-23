// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { afterEach, describe, expect, test } from 'bun:test'
import { sceneRegistry } from '@pascal-app/core'
import { Group, Object3D } from 'three'
import {
  collectRegisteredElevatorButtonTargets,
  getElevatorButtonData,
  shouldHandleElevatorPointerDown,
} from './elevator-interaction-system'

describe('viewer elevator interaction targeting', () => {
  afterEach(() => sceneRegistry.clear())

  test('does no native picking while another owner disabled viewer pointer events', () => {
    expect(shouldHandleElevatorPointerDown({ button: 0, eventManagerEnabled: false })).toBe(false)
    expect(shouldHandleElevatorPointerDown({ button: 1, eventManagerEnabled: true })).toBe(false)
    expect(shouldHandleElevatorPointerDown({ button: 0, eventManagerEnabled: true })).toBe(true)
  })

  test('collects button groups only below registered elevator roots', () => {
    const elevatorId = 'elevator-registered' as never
    const registeredRoot = new Group()
    const registeredButton = createButtonGroup({
      action: 'request-level',
      disabled: false,
      elevatorId,
      kind: 'landing',
      levelId: 'level-2' as never,
    })
    registeredRoot.add(registeredButton)
    sceneRegistry.byType.elevator?.add(elevatorId)
    sceneRegistry.nodes.set(elevatorId, registeredRoot)

    const outsideRoot = new Group()
    outsideRoot.add(
      createButtonGroup({
        action: 'open-door',
        disabled: false,
        elevatorId: 'elevator-outside' as never,
        kind: 'cab',
      }),
    )

    expect(collectRegisteredElevatorButtonTargets()).toEqual([registeredButton])
  })

  test('resolves nested hit meshes and preserves disabled and level metadata', () => {
    const data = {
      action: 'request-level' as const,
      disabled: true,
      elevatorId: 'elevator-a' as never,
      kind: 'landing' as const,
      levelId: 'level-3' as never,
    }
    const button = createButtonGroup(data)
    const hitMesh = new Object3D()
    button.add(hitMesh)

    expect(getElevatorButtonData(hitMesh)).toEqual(data)
  })

  test('ignores stale registered elevator ids without a mounted root', () => {
    sceneRegistry.byType.elevator?.add('elevator-stale' as never)
    expect(collectRegisteredElevatorButtonTargets()).toEqual([])
  })
})

function createButtonGroup(data: NonNullable<ReturnType<typeof getElevatorButtonData>>) {
  const group = new Group()
  group.userData.elevatorButton = data
  return group
}

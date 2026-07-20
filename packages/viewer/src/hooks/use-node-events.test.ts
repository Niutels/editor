// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { afterEach, describe, expect, test } from 'bun:test'
import { emitter, WallNode } from '@pascal-app/core'
import type { ThreeEvent } from '@react-three/fiber'
import { Object3D, Vector3 } from 'three'
import useViewer from '../store/use-viewer'
import { useNodeEvents } from './use-node-events'

const wall = WallNode.parse({ end: [4, 0], start: [0, 0] })
const object = new Object3D()

function pointerEvent(
  overrides: Partial<Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'pointerId'>> = {},
) {
  return {
    button: 0,
    clientX: 120,
    clientY: 80,
    face: null,
    faceIndex: null,
    object,
    point: new Vector3(1, 2, 3),
    pointerId: 7,
    stopPropagation: () => {},
    ...overrides,
  } as unknown as ThreeEvent<PointerEvent>
}

afterEach(() => {
  useViewer.setState({ cameraDragging: false, inputDragging: false })
})

describe('useNodeEvents click synthesis', () => {
  test('does not turn a pointer release that merely lands on a wall into a click', () => {
    const handlers = useNodeEvents(wall, 'wall')
    let clickCount = 0
    const onClick = () => {
      clickCount += 1
    }
    emitter.on('wall:click', onClick)

    handlers.onPointerUp(pointerEvent())

    emitter.off('wall:click', onClick)
    expect(clickCount).toBe(0)
  })

  test('emits one click when pointer-down and pointer-up complete on the wall', () => {
    const handlers = useNodeEvents(wall, 'wall')
    let clickCount = 0
    const onClick = () => {
      clickCount += 1
    }
    emitter.on('wall:click', onClick)

    handlers.onPointerDown(pointerEvent())
    handlers.onPointerUp(pointerEvent({ clientX: 123, clientY: 83 }))

    emitter.off('wall:click', onClick)
    expect(clickCount).toBe(1)
  })

  test('does not emit a click after the pointer has dragged across the wall', () => {
    const handlers = useNodeEvents(wall, 'wall')
    let clickCount = 0
    const onClick = () => {
      clickCount += 1
    }
    emitter.on('wall:click', onClick)

    handlers.onPointerDown(pointerEvent())
    handlers.onPointerMove(pointerEvent({ clientX: 132, clientY: 80 }))
    handlers.onPointerUp(pointerEvent({ clientX: 132, clientY: 80 }))

    emitter.off('wall:click', onClick)
    expect(clickCount).toBe(0)
  })
})

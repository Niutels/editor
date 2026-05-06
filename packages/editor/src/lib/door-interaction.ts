import { type AnyNodeId, isOperationDoorType, useInteractive, useScene } from '@pascal-app/core'

export const DOOR_SWING_OPEN_ANGLE = Math.PI / 2

const DOOR_TOGGLE_ANIMATION_MS = 520
const activeDoorAnimations = new Map<AnyNodeId, number>()

export { isOperationDoorType }

type DoorOpenAnimationOptions = {
  persist?: boolean
}

export function updateDoorOpenState(
  doorId: AnyNodeId,
  data: { operationState?: number; swingAngle?: number },
) {
  const scene = useScene.getState()
  const node = scene.nodes[doorId]
  scene.updateNode(doorId, data)
  scene.dirtyNodes.add(doorId)
  if (node?.parentId) scene.dirtyNodes.add(node.parentId as AnyNodeId)
}

function setRuntimeDoorOpenState(
  doorId: AnyNodeId,
  data: { operationState?: number; swingAngle?: number },
) {
  const scene = useScene.getState()
  const node = scene.nodes[doorId]
  useInteractive.getState().setDoorOpenState(doorId, data)
  scene.dirtyNodes.add(doorId)
  if (node?.parentId) scene.dirtyNodes.add(node.parentId as AnyNodeId)
}

function clearRuntimeDoorOpenState(doorId: AnyNodeId) {
  const scene = useScene.getState()
  const node = scene.nodes[doorId]
  useInteractive.getState().removeDoorOpenState(doorId)
  scene.dirtyNodes.add(doorId)
  if (node?.parentId) scene.dirtyNodes.add(node.parentId as AnyNodeId)
}

export function animateDoorOpenState(
  doorId: AnyNodeId,
  field: 'operationState' | 'swingAngle',
  from: number,
  to: number,
  onComplete?: () => void,
  options?: DoorOpenAnimationOptions,
) {
  const existingFrame = activeDoorAnimations.get(doorId)
  if (existingFrame !== undefined) {
    window.cancelAnimationFrame(existingFrame)
  }

  const startedAt = performance.now()
  const ease = (value: number) => value * value * (3 - 2 * value)

  const tick = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / DOOR_TOGGLE_ANIMATION_MS)
    const value = from + (to - from) * ease(progress)
    setRuntimeDoorOpenState(doorId, { [field]: value })

    if (progress < 1) {
      activeDoorAnimations.set(doorId, window.requestAnimationFrame(tick))
    } else {
      activeDoorAnimations.delete(doorId)
      if (options?.persist ?? true) {
        updateDoorOpenState(doorId, { [field]: to })
        clearRuntimeDoorOpenState(doorId)
      } else {
        setRuntimeDoorOpenState(doorId, { [field]: to })
      }
      onComplete?.()
    }
  }

  activeDoorAnimations.set(doorId, window.requestAnimationFrame(tick))
}

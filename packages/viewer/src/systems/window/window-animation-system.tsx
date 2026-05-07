import {
  type AnyNodeId,
  emitter,
  sceneRegistry,
  useInteractive,
  useScene,
  type WindowNode,
} from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import {
  AWNING_WINDOW_SASH_NAME,
  CASEMENT_WINDOW_SASH_NAME,
  FRENCH_CASEMENT_LEFT_SASH_NAME,
  FRENCH_CASEMENT_RIGHT_SASH_NAME,
  HOPPER_WINDOW_SASH_NAME,
} from './window-system'

const easeWindowAnimation = (value: number) => value * value * (3 - 2 * value)

function markWindowDirty(windowId: AnyNodeId) {
  const scene = useScene.getState()
  const node = scene.nodes[windowId]
  scene.dirtyNodes.add(windowId)
}

function applyDirectWindowAnimation(windowId: AnyNodeId, value: number) {
  const node = useScene.getState().nodes[windowId]
  if (node?.type !== 'window') return false

  const mesh = sceneRegistry.nodes.get(windowId)

  if (node.windowType === 'casement') {
    if ((node.casementStyle ?? 'single') === 'french') {
      const leftSash = mesh?.getObjectByName(FRENCH_CASEMENT_LEFT_SASH_NAME)
      const rightSash = mesh?.getObjectByName(FRENCH_CASEMENT_RIGHT_SASH_NAME)
      if (!(leftSash && rightSash)) return false

      leftSash.rotation.y = -value * (Math.PI / 2)
      rightSash.rotation.y = value * (Math.PI / 2)
      return true
    }

    const sash = mesh?.getObjectByName(CASEMENT_WINDOW_SASH_NAME)
    if (!sash) return false

    const hingeSign = (node.hingesSide ?? 'left') === 'left' ? -1 : 1
    sash.rotation.y = hingeSign * value * (Math.PI / 2)
    return true
  }

  if (node.windowType === 'awning') {
    const sash = mesh?.getObjectByName(AWNING_WINDOW_SASH_NAME)
    if (!sash) return false

    sash.rotation.x = -value * (Math.PI / 3)
    return true
  }

  if (node.windowType === 'hopper') {
    const sash =
      mesh?.getObjectByName(AWNING_WINDOW_SASH_NAME) ??
      mesh?.getObjectByName(HOPPER_WINDOW_SASH_NAME)
    if (!sash) return false

    sash.rotation.x = -value * (Math.PI / 3)
    return true
  }

  return false
}

export const WindowAnimationSystem = () => {
  useFrame(({ clock }) => {
    const interactive = useInteractive.getState()
    const entries = Object.entries(interactive.windowAnimations)
    if (entries.length === 0) return

    const now = clock.getElapsedTime() * 1000

    for (const [windowId, animation] of entries) {
      const typedWindowId = windowId as AnyNodeId
      const scene = useScene.getState()
      const node = scene.nodes[typedWindowId]
      if (node?.type !== 'window') {
        interactive.cancelWindowAnimation(typedWindowId)
        interactive.removeWindowOpenState(typedWindowId)
        continue
      }

      const startedAt = animation.startedAt ?? now
      if (animation.startedAt === null) {
        interactive.startWindowAnimation(typedWindowId, { ...animation, startedAt })
      }

      const progress = Math.min(1, (now - startedAt) / animation.durationMs)
      const value = animation.from + (animation.to - animation.from) * easeWindowAnimation(progress)
      interactive.setWindowOpenState(typedWindowId, { [animation.field]: value })
      const appliedDirectly = applyDirectWindowAnimation(typedWindowId, value)
      if (!appliedDirectly) markWindowDirty(typedWindowId)

      if (progress < 1) continue

      interactive.cancelWindowAnimation(typedWindowId)
      if (animation.persist) {
        scene.updateNode(typedWindowId, { [animation.field]: animation.to })
        interactive.removeWindowOpenState(typedWindowId)
        markWindowDirty(typedWindowId)
      } else {
        interactive.setWindowOpenState(typedWindowId, { [animation.field]: animation.to })
      }
      emitter.emit('window:animation-completed', {
        windowId: typedWindowId as WindowNode['id'],
        field: animation.field,
      })
    }
  }, 2)

  return null
}

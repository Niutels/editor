import { events as createPointerEvents } from '@react-three/fiber'

export const createViewerPointerEvents: typeof createPointerEvents = (store) => {
  const manager = createPointerEvents(store)
  const connect = manager.connect

  return {
    ...manager,
    connect(target) {
      // Canvas can finish an async WebGPU configure after its wrapper ref was detached.
      // Provider then retries with the captured canvas, so only the stale null target is skipped.
      if (target == null) return
      connect?.(target)
    },
  }
}

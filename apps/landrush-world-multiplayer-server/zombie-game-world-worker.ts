import { parentPort } from 'node:worker_threads'
import { captureLandrushIslandAmbientPreparedNavigationWorld } from '@landrush/runtime/landrush-island-ambient-navigation'
import { createZombieGameWorld } from './zombie-game-world'
import type { ZombieGameWorldCompileRequest } from './zombie-game-world-compiler'

if (!parentPort) throw new Error('Zombie world compiler requires a worker thread')
const port = parentPort
port.on('message', ({ id, input }: { id: number; input: ZombieGameWorldCompileRequest }) => {
  try {
    const startedAt = performance.now()
    const world = createZombieGameWorld(input)
    const ambient = captureLandrushIslandAmbientPreparedNavigationWorld(world.ambientWorld)
    port.postMessage({ id, ok: true, world, ambient, compileMs: performance.now() - startedAt })
  } catch (error) {
    port.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

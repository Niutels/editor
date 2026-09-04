import { Worker } from 'node:worker_threads'
import {
  hydrateLandrushIslandAmbientPreparedNavigationWorld,
  type LandrushIslandAmbientPreparedNavigationWorld,
} from '@landrush/runtime/landrush-island-ambient-navigation'
import type { createZombieGameWorld } from './zombie-game-world'

export type ZombieGameWorldCompileRequest = Omit<
  Parameters<typeof createZombieGameWorld>[0],
  'manifest'
>
type World = ReturnType<typeof createZombieGameWorld>
type Job = {
  id: number
  deadline: number
  superseded: boolean
  input: ZombieGameWorldCompileRequest
  resolve: (world: World) => void
  reject: (error: Error) => void
}
type Response = { id: number } & (
  | {
      ok: true
      world: World
      ambient: LandrushIslandAmbientPreparedNavigationWorld
      compileMs: number
    }
  | { ok: false; error: string }
)

export function createZombieGameWorldCompiler({
  workerUrl = new URL('./zombie-game-world-worker.mjs', import.meta.url),
  timeoutMs = 30_000,
  maxRooms = 4,
}: {
  workerUrl?: URL
  timeoutMs?: number
  maxRooms?: number
} = {}) {
  const queued = new Map<string, Job>()
  let worker: Worker | null = null
  let active: Job | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let sequence = 0
  let closed = false
  let compileCount = 0
  let supersededCount = 0
  let lastCompileMs = 0
  let lastHydrateMs = 0

  function stopWorker() {
    if (timer) clearTimeout(timer)
    timer = null
    const stopped = worker
    worker = null
    if (stopped) void stopped.terminate()
  }

  function fail(error: Error) {
    stopWorker()
    active?.reject(error)
    active = null
    for (const job of queued.values()) job.reject(error)
    queued.clear()
  }

  function dispatch() {
    if (active || closed || queued.size === 0) {
      if (!active) worker?.unref()
      return
    }
    const job = queued.values().next().value!
    queued.delete(job.input.roomId)
    const remainingMs = job.deadline - performance.now()
    if (remainingMs <= 0) {
      job.reject(new Error('Zombie world compilation timed out in queue'))
      dispatch()
      return
    }
    active = job
    try {
      if (!worker) {
        const created = new Worker(workerUrl, {
          resourceLimits: {
            maxOldGenerationSizeMb: 512,
            maxYoungGenerationSizeMb: 64,
            stackSizeMb: 8,
          },
        })
        worker = created
        created.on('error', (error) => {
          if (worker === created) fail(error)
        })
        created.on('exit', (code) => {
          if (worker === created) fail(new Error(`Zombie world compiler exited (${code})`))
        })
        created.on('message', (response: Response) => {
          if (worker !== created || !active || response.id !== active.id) return
          if (timer) clearTimeout(timer)
          timer = null
          const completed = active
          active = null
          compileCount += 1
          if (!response.ok) completed.reject(new Error(response.error))
          else if (completed.superseded) {
            completed.reject(new Error('Zombie world compilation superseded'))
          } else {
            try {
              const startedAt = performance.now()
              response.world.ambientWorld = hydrateLandrushIslandAmbientPreparedNavigationWorld(
                response.ambient,
              )
              lastCompileMs = response.compileMs
              lastHydrateMs = performance.now() - startedAt
              completed.resolve(response.world)
            } catch (error) {
              const failure = error instanceof Error ? error : new Error(String(error))
              completed.reject(failure)
              fail(failure)
              return
            }
          }
          dispatch()
        })
      }
      worker.ref()
      timer = setTimeout(() => fail(new Error('Zombie world compilation timed out')), remainingMs)
      worker.postMessage({ id: job.id, input: job.input })
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)))
    }
  }

  return {
    compile(input: ZombieGameWorldCompileRequest): Promise<World> {
      if (closed) return Promise.reject(new Error('Zombie world compiler is closed'))
      const previous = queued.get(input.roomId)
      if (
        !previous &&
        active?.input.roomId !== input.roomId &&
        new Set([...queued.keys(), ...(active ? [active.input.roomId] : [])]).size >= maxRooms
      ) {
        return Promise.reject(new Error('Zombie world compiler room capacity exceeded'))
      }
      if (previous) {
        previous.reject(new Error('Zombie world compilation superseded'))
        supersededCount += 1
      }
      if (active?.input.roomId === input.roomId && !active.superseded) {
        active.reject(new Error('Zombie world compilation superseded'))
        active.superseded = true
        supersededCount += 1
      }
      return new Promise((resolve, reject) => {
        queued.set(input.roomId, {
          id: ++sequence,
          deadline: performance.now() + timeoutMs,
          superseded: false,
          input,
          resolve,
          reject,
        })
        dispatch()
      })
    },
    cancel(roomId: string) {
      const error = new Error('Zombie room compilation cancelled')
      queued.get(roomId)?.reject(error)
      queued.delete(roomId)
      if (active?.input.roomId === roomId) {
        active.reject(error)
        active = null
        stopWorker()
      }
      if (!active && queued.size === 0) stopWorker()
      else dispatch()
    },
    dispose() {
      closed = true
      fail(new Error('Zombie world compiler disposed'))
    },
    metrics: () => ({
      queued: queued.size,
      active: active ? 1 : 0,
      compileCount,
      supersededCount,
      lastCompileMs,
      lastHydrateMs,
    }),
  }
}

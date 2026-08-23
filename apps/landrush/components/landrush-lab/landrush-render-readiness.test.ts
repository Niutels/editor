import { describe, expect, test } from 'bun:test'
import { Group, PerspectiveCamera, Scene } from 'three'
import {
  createLandrushRenderReadinessCoordinator,
  type LandrushPipelineRenderer,
} from './landrush-render-readiness'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function flushMicrotasksUntil(condition: () => boolean) {
  for (let attempt = 0; attempt < 20 && !condition(); attempt += 1) {
    await Promise.resolve()
  }
}

function createRequest(renderer: LandrushPipelineRenderer) {
  return {
    camera: new PerspectiveCamera(),
    generation: 1,
    identity: {},
    renderer,
    representatives: [{ key: 'root', root: new Group() }],
    targetScene: new Scene(),
  }
}

describe('Landrush render readiness compile coordination', () => {
  test('serializes separate coordinators that share one renderer device context', async () => {
    const firstCompilation = deferred<void>()
    const secondCompilation = deferred<void>()
    const device = {}
    const firstRenderer = { backend: { device }, compileAsync: async () => undefined }
    const secondRenderer = { backend: { device }, compileAsync: async () => undefined }
    const calls: string[] = []
    let active = 0
    let maximumActive = 0
    const firstCoordinator = createLandrushRenderReadinessCoordinator({
      compile: async () => {
        calls.push('first')
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await firstCompilation.promise
        active -= 1
      },
    })
    const secondCoordinator = createLandrushRenderReadinessCoordinator({
      compile: async () => {
        calls.push('second')
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await secondCompilation.promise
        active -= 1
      },
    })

    const first = firstCoordinator.request(createRequest(firstRenderer), () => undefined)
    await flushMicrotasksUntil(() => calls.length === 1)
    const second = secondCoordinator.request(createRequest(secondRenderer), () => undefined)
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toEqual(['first'])

    firstCompilation.resolve()
    expect(await first).toBe('ready')
    await flushMicrotasksUntil(() => calls.length === 2)
    expect(calls).toEqual(['first', 'second'])
    secondCompilation.resolve()
    expect(await second).toBe('ready')
    expect(maximumActive).toBe(1)
  })

  test('does not serialize separate renderer device contexts', async () => {
    const compilation = deferred<void>()
    let active = 0
    let maximumActive = 0
    const createCoordinator = () =>
      createLandrushRenderReadinessCoordinator({
        compile: async () => {
          active += 1
          maximumActive = Math.max(maximumActive, active)
          await compilation.promise
          active -= 1
        },
      })
    const firstCoordinator = createCoordinator()
    const secondCoordinator = createCoordinator()
    const first = firstCoordinator.request(
      createRequest({ backend: { device: {} }, compileAsync: async () => undefined }),
      () => undefined,
    )
    const second = secondCoordinator.request(
      createRequest({ backend: { device: {} }, compileAsync: async () => undefined }),
      () => undefined,
    )

    await flushMicrotasksUntil(() => active === 2)
    expect(maximumActive).toBe(2)
    compilation.resolve()
    expect(await first).toBe('ready')
    expect(await second).toBe('ready')
  })
})

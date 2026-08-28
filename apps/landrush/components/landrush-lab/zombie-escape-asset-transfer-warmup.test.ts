import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  startZombieEscapeAssetTransferWarmup,
  ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS,
} from './zombie-escape-asset-transfer-warmup'

type DeferredRequest = {
  init: Readonly<{ credentials: 'same-origin'; signal: AbortSignal }>
  path: string
  reject: (error: Error) => void
  resolve: (response: {
    blob: () => Promise<Blob>
    ok: boolean
    status: number
    statusText: string
  }) => void
}

function createTransferHost() {
  const requests: DeferredRequest[] = []
  const created: Array<{ blob: Blob; objectUrl: string }> = []
  const revoked: string[] = []
  const abortController = new AbortController()
  let abortCount = 0
  return {
    get abortCount() {
      return abortCount
    },
    created,
    options: {
      createAbortController: () => ({
        abort: () => {
          abortCount += 1
          abortController.abort()
        },
        signal: abortController.signal,
      }),
      createObjectUrl: (blob: Blob) => {
        const objectUrl = `blob:zombie-test-${created.length}`
        created.push({ blob, objectUrl })
        return objectUrl
      },
      fetchImpl: (
        path: string,
        init: Readonly<{ credentials: 'same-origin'; signal: AbortSignal }>,
      ) =>
        new Promise<{
          blob: () => Promise<Blob>
          ok: boolean
          status: number
          statusText: string
        }>((resolve, reject) => {
          requests.push({ init, path, reject, resolve })
        }),
      revokeObjectUrl: (objectUrl: string) => {
        revoked.push(objectUrl)
      },
    },
    requests,
    revoked,
  }
}

function successfulResponse(byteLength: number) {
  return {
    blob: () => Promise.resolve(new Blob([new Uint8Array(byteLength)])),
    ok: true,
    status: 200,
    statusText: 'OK',
  }
}

describe('Zombie Escape asset transfer warmup', () => {
  test('launches all 30 native fetches synchronously and retains successful Blob URLs', async () => {
    const host = createTransferHost()
    const settlements: Array<{ assetUrl: string; path: string; state: 'failed' | 'ready' }> = []
    const warmup = startZombieEscapeAssetTransferWarmup({
      ...host.options,
      onSettled: (settlement) => settlements.push(settlement),
    })

    expect(ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS).toHaveLength(30)
    expect(new Set(ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS).size).toBe(30)
    expect(host.requests.map(({ path }) => path)).toEqual(ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS)
    expect(host.requests.every(({ init }) => init.credentials === 'same-origin')).toBe(true)
    expect(new Set(host.requests.map(({ init }) => init.signal)).size).toBe(1)

    host.requests.forEach(({ resolve }, index) => {
      resolve(successfulResponse(index + 1))
    })
    const summary = await warmup.completion

    expect(summary.completedPaths).toEqual(ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS)
    expect(summary.failed).toEqual([])
    expect(summary.totalByteLength).toBe((30 * 31) / 2)
    expect(settlements).toHaveLength(30)
    expect(settlements.every(({ state }) => state === 'ready')).toBe(true)
    expect(
      ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS.map((path) => warmup.getAssetUrl(path)),
    ).toEqual(host.created.map(({ objectUrl }) => objectUrl))
    expect(warmup.getOwnedObjectUrls()).toEqual(host.created.map(({ objectUrl }) => objectUrl))

    warmup.cleanup()
    expect(host.abortCount).toBe(1)
    expect(host.revoked).toEqual(host.created.map(({ objectUrl }) => objectUrl))
    expect(warmup.getOwnedObjectUrls()).toEqual([])
  })

  test('reports failures without rejecting and leaves their original URLs available for retry', async () => {
    const host = createTransferHost()
    const paths = ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS.slice(0, 3)
    const settlements: Array<{ assetUrl: string; path: string; state: 'failed' | 'ready' }> = []
    const warmup = startZombieEscapeAssetTransferWarmup({
      ...host.options,
      onSettled: (settlement) => settlements.push(settlement),
      paths,
    })
    host.requests[0]?.resolve(successfulResponse(11))
    host.requests[1]?.resolve({
      blob: () => Promise.resolve(new Blob()),
      ok: false,
      status: 503,
      statusText: 'Unavailable',
    })
    host.requests[2]?.reject(new Error('network offline'))

    const summary = await warmup.completion

    expect(summary.completedPaths).toEqual([paths[0]])
    expect(summary.failed).toEqual([
      {
        message: `Fetch for ${paths[1]} responded with 503 Unavailable.`,
        path: paths[1],
      },
      { message: 'network offline', path: paths[2] },
    ])
    expect(warmup.getAssetUrl(paths[0]!)).toBe('blob:zombie-test-0')
    expect(warmup.getAssetUrl(paths[1]!)).toBe(paths[1])
    expect(warmup.getAssetUrl(paths[2]!)).toBe(paths[2])
    expect(settlements.map(({ state }) => state)).toEqual(['failed', 'failed', 'ready'])
  })

  test('cleanup before response settlement aborts only this owner and publishes no URLs', async () => {
    const host = createTransferHost()
    const paths = ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS.slice(0, 2)
    const settlements: unknown[] = []
    let blobReadCount = 0
    const warmup = startZombieEscapeAssetTransferWarmup({
      ...host.options,
      onSettled: (settlement) => settlements.push(settlement),
      paths,
    })

    warmup.cleanup()
    host.requests.forEach(({ resolve }) => {
      resolve({
        ...successfulResponse(5),
        blob: () => {
          blobReadCount += 1
          return Promise.resolve(new Blob([new Uint8Array(5)]))
        },
      })
    })
    await warmup.completion

    expect(host.abortCount).toBe(1)
    expect(blobReadCount).toBe(0)
    expect(host.created).toEqual([])
    expect(host.revoked).toEqual([])
    expect(settlements).toEqual([])
    expect(warmup.getAssetUrl(paths[0]!)).toBeNull()
  })

  test('cleanup while response bodies are pending cannot create or leak late object URLs', async () => {
    const host = createTransferHost()
    const path = ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS[0]!
    let resolveBlob: ((blob: Blob) => void) | null = null
    let blobReadCount = 0
    const settlements: unknown[] = []
    const warmup = startZombieEscapeAssetTransferWarmup({
      ...host.options,
      onSettled: (settlement) => settlements.push(settlement),
      paths: [path],
    })
    host.requests[0]?.resolve({
      blob: () => {
        blobReadCount += 1
        return new Promise<Blob>((resolve) => {
          resolveBlob = resolve
        })
      },
      ok: true,
      status: 200,
      statusText: 'OK',
    })
    await Promise.resolve()
    expect(blobReadCount).toBe(1)

    warmup.cleanup()
    resolveBlob?.(new Blob([new Uint8Array(9)]))
    await warmup.completion

    expect(host.created).toEqual([])
    expect(host.revoked).toEqual([])
    expect(settlements).toEqual([])
    expect(warmup.getOwnedObjectUrls()).toEqual([])
  })

  test('cleanup revokes only URLs owned by that warmup instance', async () => {
    const firstHost = createTransferHost()
    const secondHost = createTransferHost()
    const first = startZombieEscapeAssetTransferWarmup({
      ...firstHost.options,
      paths: ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS.slice(0, 1),
    })
    const second = startZombieEscapeAssetTransferWarmup({
      ...secondHost.options,
      paths: ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS.slice(1, 2),
    })
    firstHost.requests[0]?.resolve(successfulResponse(1))
    secondHost.requests[0]?.resolve(successfulResponse(1))
    await Promise.all([first.completion, second.completion])

    first.cleanup()

    expect(firstHost.abortCount).toBe(1)
    expect(secondHost.abortCount).toBe(0)
    expect(firstHost.revoked).toEqual(['blob:zombie-test-0'])
    expect(secondHost.revoked).toEqual([])
    expect(second.getOwnedObjectUrls()).toEqual(['blob:zombie-test-0'])
    second.cleanup()
  })

  test('recreates a successful transfer URL from the retained Blob and revokes each owned URL once', async () => {
    const host = createTransferHost()
    const path = ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS[0]!
    const warmup = startZombieEscapeAssetTransferWarmup({
      ...host.options,
      paths: [path],
    })
    host.requests[0]?.resolve(successfulResponse(17))
    await warmup.completion

    const originalUrl = warmup.getAssetUrl(path)
    const changes = warmup.recreateObjectUrls([path, path, '/not-owned.glb'])

    expect(originalUrl).toBe('blob:zombie-test-0')
    expect(changes).toEqual([
      {
        assetUrl: 'blob:zombie-test-1',
        path,
        previousAssetUrl: 'blob:zombie-test-0',
      },
    ])
    expect(host.created).toHaveLength(2)
    expect(host.created[1]?.blob).toBe(host.created[0]?.blob)
    expect(host.revoked).toEqual(['blob:zombie-test-0'])
    expect(warmup.getAssetUrl(path)).toBe('blob:zombie-test-1')
    expect(warmup.getOwnedObjectUrls()).toEqual(['blob:zombie-test-1'])

    expect(warmup.recreateObjectUrls([path])).toEqual([
      {
        assetUrl: 'blob:zombie-test-2',
        path,
        previousAssetUrl: 'blob:zombie-test-1',
      },
    ])
    expect(host.created[2]?.blob).toBe(host.created[0]?.blob)
    expect(host.revoked).toEqual(['blob:zombie-test-0', 'blob:zombie-test-1'])
    expect(warmup.getAssetUrl(path)).toBe('blob:zombie-test-2')
    expect(warmup.getOwnedObjectUrls()).toEqual(['blob:zombie-test-2'])

    warmup.cleanup()
    expect(host.revoked).toEqual(['blob:zombie-test-0', 'blob:zombie-test-1', 'blob:zombie-test-2'])
    expect(warmup.recreateObjectUrls([path])).toEqual([])
  })

  test('does not recreate failed or still-pending transfer paths', async () => {
    const host = createTransferHost()
    const paths = ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS.slice(0, 2)
    const warmup = startZombieEscapeAssetTransferWarmup({
      ...host.options,
      paths,
    })
    host.requests[0]?.resolve({
      blob: () => Promise.resolve(new Blob()),
      ok: false,
      status: 503,
      statusText: 'Unavailable',
    })
    await Promise.resolve()

    expect(warmup.recreateObjectUrls(paths)).toEqual([])
    expect(host.created).toEqual([])
    expect(host.revoked).toEqual([])
    warmup.cleanup()
    host.requests[1]?.resolve(successfulResponse(9))
    await warmup.completion
  })

  test('has no Three cache or GLTF parsing dependency', () => {
    const source = readFileSync(
      new URL('./zombie-escape-asset-transfer-warmup.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toContain("from 'three'")
    expect(source).not.toContain('THREE.Cache')
    expect(source).not.toContain('FileLoader')
    expect(source).not.toContain('GLTFLoader')
  })
})

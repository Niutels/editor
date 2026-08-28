import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from './zombie-escape-zombie-catalog'

type ZombieEscapeAssetTransferAbortController = Readonly<{
  abort: () => void
  signal: AbortSignal
}>

type ZombieEscapeAssetTransferResponse = Readonly<{
  blob: () => Promise<Blob>
  ok: boolean
  status: number
  statusText: string
}>

export type ZombieEscapeAssetTransferFailure = Readonly<{
  message: string
  path: string
}>

export type ZombieEscapeAssetTransferSettlement = Readonly<{
  assetUrl: string
  path: string
  state: 'failed' | 'ready'
}>

export type ZombieEscapeAssetTransferWarmupSummary = Readonly<{
  completedPaths: readonly string[]
  failed: readonly ZombieEscapeAssetTransferFailure[]
  requestedPaths: readonly string[]
  totalByteLength: number
}>

export type ZombieEscapeAssetTransferWarmup = Readonly<{
  cleanup: () => void
  completion: Promise<ZombieEscapeAssetTransferWarmupSummary>
  getAssetUrl: (path: string) => string | null
  getOwnedObjectUrls: () => readonly string[]
  recreateObjectUrls: (paths: readonly string[]) => readonly ZombieEscapeAssetTransferUrlChange[]
  requestedPaths: readonly string[]
}>

export type ZombieEscapeAssetTransferUrlChange = Readonly<{
  assetUrl: string
  path: string
  previousAssetUrl: string
}>

export type ZombieEscapeAssetTransferWarmupOptions = Readonly<{
  createAbortController?: () => ZombieEscapeAssetTransferAbortController
  createObjectUrl?: (blob: Blob) => string
  fetchImpl?: (
    path: string,
    init: Readonly<{ credentials: 'same-origin'; signal: AbortSignal }>,
  ) => Promise<ZombieEscapeAssetTransferResponse>
  onSettled?: (settlement: ZombieEscapeAssetTransferSettlement) => void
  paths?: readonly string[]
  revokeObjectUrl?: (objectUrl: string) => void
}>

export const ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS = Object.freeze(
  Array.from(
    new Set(
      ZOMBIE_ESCAPE_ZOMBIE_CATALOG.flatMap((zombie) => [
        zombie.glb.riggedBase.path,
        zombie.glb.run.path,
        zombie.glb.walk.path,
      ]),
    ),
  ),
)

function getFailureMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function createCancelledTransferError() {
  return new Error('Zombie asset transfer warmup was cleaned up.')
}

export function startZombieEscapeAssetTransferWarmup(
  options: ZombieEscapeAssetTransferWarmupOptions = {},
): ZombieEscapeAssetTransferWarmup {
  const requestedPaths = Object.freeze(
    Array.from(new Set(options.paths ?? ZOMBIE_ESCAPE_ZOMBIE_ASSET_TRANSFER_PATHS)),
  )
  const abortController = (options.createAbortController ?? (() => new AbortController()))()
  const fetchImpl = options.fetchImpl ?? ((path, init) => fetch(path, init))
  const createObjectUrl = options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob))
  const revokeObjectUrl = options.revokeObjectUrl ?? ((objectUrl) => URL.revokeObjectURL(objectUrl))
  const assetUrls = new Map<string, string>()
  const fetchedBlobs = new Map<string, Blob>()
  const ownedObjectUrls = new Set<string>()
  const objectUrlsByPath = new Map<string, string>()
  let cleanedUp = false

  const revokeOwnedObjectUrl = (objectUrl: string) => {
    if (!ownedObjectUrls.delete(objectUrl)) return
    try {
      revokeObjectUrl(objectUrl)
    } catch {}
  }

  const publishSettlement = (settlement: ZombieEscapeAssetTransferSettlement) => {
    if (cleanedUp) return
    try {
      options.onSettled?.(settlement)
    } catch (error) {
      console.error('[zombie-escape] Asset transfer settlement subscriber failed.', error)
    }
  }
  const createTransfer = (path: string) => {
    let responsePromise: Promise<ZombieEscapeAssetTransferResponse>
    try {
      responsePromise = fetchImpl(path, {
        credentials: 'same-origin',
        signal: abortController.signal,
      })
    } catch (error) {
      responsePromise = Promise.reject(error)
    }
    return Promise.resolve(responsePromise)
      .then((response) => {
        if (cleanedUp) throw createCancelledTransferError()
        if (!response.ok) {
          throw new Error(
            `Fetch for ${path} responded with ${response.status} ${response.statusText}.`,
          )
        }
        return response.blob()
      })
      .then((blob) => {
        if (cleanedUp) throw createCancelledTransferError()
        const objectUrl = createObjectUrl(blob)
        if (cleanedUp) {
          revokeObjectUrl(objectUrl)
          throw createCancelledTransferError()
        }
        fetchedBlobs.set(path, blob)
        ownedObjectUrls.add(objectUrl)
        objectUrlsByPath.set(path, objectUrl)
        assetUrls.set(path, objectUrl)
        publishSettlement({ assetUrl: objectUrl, path, state: 'ready' })
        return { byteLength: blob.size, path }
      })
      .catch((error: unknown) => {
        if (!cleanedUp) {
          assetUrls.set(path, path)
          publishSettlement({ assetUrl: path, path, state: 'failed' })
        }
        throw error
      })
  }

  const transfers = requestedPaths.map((path) => createTransfer(path))
  const completion = Promise.allSettled(transfers).then((results) => {
    const completedPaths: string[] = []
    const failed: ZombieEscapeAssetTransferFailure[] = []
    let totalByteLength = 0
    results.forEach((result, index) => {
      const path = requestedPaths[index]
      if (!path) return
      if (result.status === 'fulfilled') {
        completedPaths.push(path)
        totalByteLength += result.value.byteLength
        return
      }
      failed.push({ message: getFailureMessage(result.reason), path })
    })
    return {
      completedPaths: Object.freeze(completedPaths),
      failed: Object.freeze(failed),
      requestedPaths,
      totalByteLength,
    }
  })

  return {
    cleanup: () => {
      if (cleanedUp) return
      cleanedUp = true
      try {
        abortController.abort()
      } finally {
        for (const objectUrl of Array.from(ownedObjectUrls)) revokeOwnedObjectUrl(objectUrl)
        fetchedBlobs.clear()
        objectUrlsByPath.clear()
        ownedObjectUrls.clear()
        assetUrls.clear()
      }
    },
    completion,
    getAssetUrl: (path) => assetUrls.get(path) ?? null,
    getOwnedObjectUrls: () => Object.freeze(Array.from(ownedObjectUrls)),
    recreateObjectUrls: (paths) => {
      if (cleanedUp) return []
      const changes: ZombieEscapeAssetTransferUrlChange[] = []
      for (const path of new Set(paths)) {
        const blob = fetchedBlobs.get(path)
        const previousAssetUrl = objectUrlsByPath.get(path)
        if (!(blob && previousAssetUrl)) continue
        let assetUrl: string
        try {
          assetUrl = createObjectUrl(blob)
        } catch {
          continue
        }
        if (cleanedUp) {
          try {
            revokeObjectUrl(assetUrl)
          } catch {}
          continue
        }
        ownedObjectUrls.add(assetUrl)
        objectUrlsByPath.set(path, assetUrl)
        assetUrls.set(path, assetUrl)
        revokeOwnedObjectUrl(previousAssetUrl)
        changes.push({ assetUrl, path, previousAssetUrl })
      }
      return Object.freeze(changes)
    },
    requestedPaths,
  }
}

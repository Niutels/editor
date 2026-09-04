type ZombieEscapeSharedRouteStorage = {
  routeGeneration: Uint32Array
  targetRevision: Uint32Array
  waypointNode: Int32Array
  worldGeneration: Uint32Array
}

export type ZombieEscapeSharedRouteCache = {
  fallbackComponentRoutes: ZombieEscapeSharedRouteStorage
  fallbackByRegion: Uint8Array
  routeGenerationByRegion: Uint32Array
  strictComponentRoutes: ZombieEscapeSharedRouteStorage
  targetRevisionByRegion: Uint32Array
  waypointNodeByRegion: Int32Array
  worldGenerationByRegion: Uint32Array
}

export function createZombieEscapeSharedRouteCache({
  fallbackSameLayerComponentIndices,
  regionCount,
  strictSameLayerComponentIndices,
}: {
  fallbackSameLayerComponentIndices: ArrayLike<number>
  regionCount: number
  strictSameLayerComponentIndices: ArrayLike<number>
}): ZombieEscapeSharedRouteCache {
  const capacity = Number.isFinite(regionCount) ? Math.max(0, Math.trunc(regionCount)) : 0
  return {
    fallbackComponentRoutes: createZombieEscapeSharedRouteStorage(
      resolveZombieEscapeSharedRouteComponentCount(fallbackSameLayerComponentIndices),
    ),
    fallbackByRegion: new Uint8Array(capacity),
    routeGenerationByRegion: new Uint32Array(capacity),
    strictComponentRoutes: createZombieEscapeSharedRouteStorage(
      resolveZombieEscapeSharedRouteComponentCount(strictSameLayerComponentIndices),
    ),
    targetRevisionByRegion: new Uint32Array(capacity),
    waypointNodeByRegion: new Int32Array(capacity).fill(-1),
    worldGenerationByRegion: new Uint32Array(capacity),
  }
}

export function clearZombieEscapeSharedRouteCache(cache: ZombieEscapeSharedRouteCache) {
  clearZombieEscapeSharedRouteStorage(cache.fallbackComponentRoutes)
  cache.fallbackByRegion.fill(0)
  cache.routeGenerationByRegion.fill(0)
  clearZombieEscapeSharedRouteStorage(cache.strictComponentRoutes)
  cache.targetRevisionByRegion.fill(0)
  cache.waypointNodeByRegion.fill(-1)
  cache.worldGenerationByRegion.fill(0)
}

export function publishZombieEscapeSharedRoute(
  cache: ZombieEscapeSharedRouteCache,
  regionIndex: number,
  waypointNode: number,
  fallback: boolean,
  routeGeneration: number,
  targetRevision: number,
  worldGeneration: number,
) {
  if (
    regionIndex < 0 ||
    regionIndex >= cache.waypointNodeByRegion.length ||
    waypointNode < 0 ||
    routeGeneration <= 0 ||
    worldGeneration <= 0
  ) {
    return false
  }
  const normalizedRouteGeneration = routeGeneration >>> 0
  const normalizedTargetRevision = targetRevision >>> 0
  const normalizedWorldGeneration = worldGeneration >>> 0
  if (
    cache.waypointNodeByRegion[regionIndex]! >= 0 &&
    cache.routeGenerationByRegion[regionIndex] === normalizedRouteGeneration &&
    cache.targetRevisionByRegion[regionIndex] === normalizedTargetRevision &&
    cache.worldGenerationByRegion[regionIndex] === normalizedWorldGeneration
  ) {
    return false
  }
  cache.fallbackByRegion[regionIndex] = fallback ? 1 : 0
  cache.routeGenerationByRegion[regionIndex] = normalizedRouteGeneration
  cache.targetRevisionByRegion[regionIndex] = normalizedTargetRevision
  cache.waypointNodeByRegion[regionIndex] = waypointNode
  cache.worldGenerationByRegion[regionIndex] = normalizedWorldGeneration
  return true
}

export function readZombieEscapeSharedRouteWaypoint(
  cache: ZombieEscapeSharedRouteCache,
  regionIndex: number,
  routeGeneration: number,
  targetRevision: number,
  worldGeneration: number,
) {
  const expectedRouteGeneration = routeGeneration >>> 0
  const expectedTargetRevision = targetRevision >>> 0
  const expectedWorldGeneration = worldGeneration >>> 0
  if (
    regionIndex < 0 ||
    regionIndex >= cache.waypointNodeByRegion.length ||
    cache.routeGenerationByRegion[regionIndex] !== expectedRouteGeneration ||
    cache.targetRevisionByRegion[regionIndex] !== expectedTargetRevision ||
    cache.worldGenerationByRegion[regionIndex] !== expectedWorldGeneration
  ) {
    return -1
  }
  return cache.waypointNodeByRegion[regionIndex] ?? -1
}

export function publishZombieEscapeSharedComponentRoute(
  cache: ZombieEscapeSharedRouteCache,
  componentIndex: number,
  waypointNode: number,
  fallback: boolean,
  routeGeneration: number,
  targetRevision: number,
  worldGeneration: number,
) {
  return publishZombieEscapeSharedRouteStorage(
    fallback ? cache.fallbackComponentRoutes : cache.strictComponentRoutes,
    componentIndex,
    waypointNode,
    routeGeneration,
    targetRevision,
    worldGeneration,
  )
}

export function readZombieEscapeSharedComponentRouteWaypoint(
  cache: ZombieEscapeSharedRouteCache,
  componentIndex: number,
  fallback: boolean,
  routeGeneration: number,
  targetRevision: number,
  worldGeneration: number,
) {
  return readZombieEscapeSharedRouteStorage(
    fallback ? cache.fallbackComponentRoutes : cache.strictComponentRoutes,
    componentIndex,
    routeGeneration,
    targetRevision,
    worldGeneration,
  )
}

function createZombieEscapeSharedRouteStorage(capacity: number): ZombieEscapeSharedRouteStorage {
  return {
    routeGeneration: new Uint32Array(capacity),
    targetRevision: new Uint32Array(capacity),
    waypointNode: new Int32Array(capacity).fill(-1),
    worldGeneration: new Uint32Array(capacity),
  }
}

function clearZombieEscapeSharedRouteStorage(storage: ZombieEscapeSharedRouteStorage) {
  storage.routeGeneration.fill(0)
  storage.targetRevision.fill(0)
  storage.waypointNode.fill(-1)
  storage.worldGeneration.fill(0)
}

function resolveZombieEscapeSharedRouteComponentCount(componentIndices: ArrayLike<number>) {
  let maximumComponentIndex = -1
  for (let index = 0; index < componentIndices.length; index += 1) {
    maximumComponentIndex = Math.max(maximumComponentIndex, componentIndices[index] ?? -1)
  }
  return maximumComponentIndex + 1
}

function publishZombieEscapeSharedRouteStorage(
  storage: ZombieEscapeSharedRouteStorage,
  key: number,
  waypointNode: number,
  routeGeneration: number,
  targetRevision: number,
  worldGeneration: number,
) {
  if (
    key < 0 ||
    key >= storage.waypointNode.length ||
    waypointNode < 0 ||
    routeGeneration <= 0 ||
    worldGeneration <= 0
  ) {
    return false
  }
  const normalizedRouteGeneration = routeGeneration >>> 0
  const normalizedTargetRevision = targetRevision >>> 0
  const normalizedWorldGeneration = worldGeneration >>> 0
  if (
    storage.waypointNode[key]! >= 0 &&
    storage.routeGeneration[key] === normalizedRouteGeneration &&
    storage.targetRevision[key] === normalizedTargetRevision &&
    storage.worldGeneration[key] === normalizedWorldGeneration
  ) {
    return false
  }
  storage.routeGeneration[key] = normalizedRouteGeneration
  storage.targetRevision[key] = normalizedTargetRevision
  storage.waypointNode[key] = waypointNode
  storage.worldGeneration[key] = normalizedWorldGeneration
  return true
}

function readZombieEscapeSharedRouteStorage(
  storage: ZombieEscapeSharedRouteStorage,
  key: number,
  routeGeneration: number,
  targetRevision: number,
  worldGeneration: number,
) {
  if (
    key < 0 ||
    key >= storage.waypointNode.length ||
    storage.routeGeneration[key] !== routeGeneration >>> 0 ||
    storage.targetRevision[key] !== targetRevision >>> 0 ||
    storage.worldGeneration[key] !== worldGeneration >>> 0
  ) {
    return -1
  }
  return storage.waypointNode[key] ?? -1
}

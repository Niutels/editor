import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { PascalOpenworldIntegrationSnapshot } from './pascal-openworld-integration-contract'

const LOCAL_STATE_RELATIVE_PATH = '.landrush-local/world-multiplayer-state.json'

type PersistedWorld = Omit<
  PascalOpenworldIntegrationSnapshot,
  'buildNodeCount' | 'savedAt' | 'schemaVersion'
>

export async function loadPascalOpenworldIntegrationSnapshot() {
  for (const path of localStateCandidates()) {
    try {
      const parsed = parsePascalOpenworldIntegrationSnapshot(
        JSON.parse(await readFile(path, 'utf8')),
      )
      if (parsed) return parsed
    } catch {
      // The next candidate covers both repository-root and app-root dev-server launches.
    }
  }
  return null
}

export function parsePascalOpenworldIntegrationSnapshot(
  value: unknown,
): PascalOpenworldIntegrationSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.worlds)) return null

  const worlds = value.worlds.filter(isPersistedWorld)
  if (worlds.length === 0) return null
  const world = [...worlds].sort(comparePersistedWorlds)[0]
  if (!world) return null

  return {
    buildNodeCount: world.builds.reduce((count, build) => count + build.nodes.length, 0),
    builds: world.builds,
    ownerships: world.ownerships,
    savedAt:
      typeof value.savedAt === 'number' && Number.isFinite(value.savedAt) ? value.savedAt : null,
    schemaVersion: value.schemaVersion,
    tvMediaStates: world.tvMediaStates,
    worldId: world.worldId,
  }
}

function localStateCandidates() {
  return [
    resolve(process.cwd(), LOCAL_STATE_RELATIVE_PATH),
    resolve(process.cwd(), '..', '..', LOCAL_STATE_RELATIVE_PATH),
  ]
}

function comparePersistedWorlds(left: PersistedWorld, right: PersistedWorld) {
  const leftIsIsland = left.worldId.startsWith('landrush-world:landrush-island:')
  const rightIsIsland = right.worldId.startsWith('landrush-world:landrush-island:')
  if (leftIsIsland !== rightIsIsland) return leftIsIsland ? -1 : 1
  const updateDifference = latestWorldUpdate(right) - latestWorldUpdate(left)
  return updateDifference || left.worldId.localeCompare(right.worldId)
}

function latestWorldUpdate(world: PersistedWorld) {
  return Math.max(
    0,
    ...world.builds.map((build) => build.updatedAt),
    ...world.ownerships.map((ownership) => ownership.claimedAt),
    ...world.tvMediaStates.map((tv) => tv.updatedAt),
  )
}

function isPersistedWorld(value: unknown): value is PersistedWorld {
  if (
    !isRecord(value) ||
    typeof value.worldId !== 'string' ||
    !Array.isArray(value.builds) ||
    !Array.isArray(value.ownerships) ||
    !Array.isArray(value.tvMediaStates)
  ) {
    return false
  }

  return (
    value.builds.every(
      (build) =>
        isRecord(build) &&
        build.worldId === value.worldId &&
        typeof build.parcelId === 'string' &&
        typeof build.updatedAt === 'number' &&
        typeof build.updatedBy === 'string' &&
        Array.isArray(build.nodes),
    ) &&
    value.ownerships.every(
      (ownership) =>
        isRecord(ownership) &&
        ownership.worldId === value.worldId &&
        typeof ownership.parcelId === 'string' &&
        typeof ownership.claimedAt === 'number' &&
        isRecord(ownership.owner),
    ) &&
    value.tvMediaStates.every(
      (tv) => isRecord(tv) && tv.worldId === value.worldId && typeof tv.tvId === 'string',
    )
  )
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

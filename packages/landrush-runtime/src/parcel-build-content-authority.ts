import type { ParcelBuildNode, ParcelBuildSnapshot, ParcelOwnership } from '@landrush/protocol'

export type ParcelBuildContentAuthorityScope = {
  enabled: boolean
  localProfileId: string
  roomId: string
}

export type ParcelBuildContentAuthorityTransition = {
  changed: boolean
  epoch: number
}

export type ParcelBuildAuthoritySnapshotUpdate = {
  build: ParcelBuildSnapshot<ParcelBuildNode> | null
  parcelId: string
  source: 'snapshot'
  worldId: string
}

export function createOfflineParcelBuildAuthorityUpdates({
  builds,
  ownerships,
  worldId,
}: {
  builds: readonly ParcelBuildSnapshot<ParcelBuildNode>[]
  ownerships: readonly ParcelOwnership[]
  worldId: string
}): ParcelBuildAuthoritySnapshotUpdate[] {
  const buildByParcelId = new Map(
    builds
      .filter((build) => build.worldId === worldId)
      .map((build) => [build.parcelId, build] as const),
  )
  const parcelIds = new Set(buildByParcelId.keys())
  for (const ownership of ownerships) {
    if (ownership.worldId === worldId) parcelIds.add(ownership.parcelId)
  }
  return createParcelBuildAuthorityUpdates(worldId, parcelIds, buildByParcelId)
}

export function createClaimedParcelBuildAuthorityUpdate({
  builds,
  parcelId,
  worldId,
}: {
  builds: readonly ParcelBuildSnapshot<ParcelBuildNode>[]
  parcelId: string
  worldId: string
}): ParcelBuildAuthoritySnapshotUpdate {
  const buildByParcelId = new Map(
    builds
      .filter((build) => build.worldId === worldId)
      .map((build) => [build.parcelId, build] as const),
  )
  return createParcelBuildAuthorityUpdates(worldId, [parcelId], buildByParcelId)[0]!
}

export function shouldRefreshParcelBuildAuthorityAfterClaim(
  messageType: 'parcel-claim-result' | 'parcel-owned',
) {
  return messageType === 'parcel-claim-result'
}

export function isParcelBuildContentUpdateAuthorityCurrent(
  publishedAuthorityEpoch: number,
  currentAuthorityEpoch: number,
) {
  return publishedAuthorityEpoch === currentAuthorityEpoch
}

export class ParcelBuildContentAuthorityEpoch {
  #epoch = 0
  #scope: ParcelBuildContentAuthorityScope
  #worldId: string | null = null

  constructor(scope: ParcelBuildContentAuthorityScope) {
    this.#scope = scope
  }

  get current() {
    return this.#epoch
  }

  updateScope(scope: ParcelBuildContentAuthorityScope) {
    if (
      scope.enabled === this.#scope.enabled &&
      scope.localProfileId === this.#scope.localProfileId &&
      scope.roomId === this.#scope.roomId
    ) {
      return this.#transition(false)
    }

    this.#scope = scope
    return this.#transition(true)
  }

  watchWorld(worldId: string) {
    if (worldId === this.#worldId) return this.#transition(false)
    this.#worldId = worldId
    return this.#transition(true)
  }

  #transition(changed: boolean): ParcelBuildContentAuthorityTransition {
    if (changed) this.#epoch += 1
    return { changed, epoch: this.#epoch }
  }
}

function createParcelBuildAuthorityUpdates(
  worldId: string,
  parcelIds: Iterable<string>,
  buildByParcelId: ReadonlyMap<string, ParcelBuildSnapshot<ParcelBuildNode>>,
) {
  return [...parcelIds]
    .sort((first, second) => first.localeCompare(second))
    .map((parcelId) => ({
      build: buildByParcelId.get(parcelId) ?? null,
      parcelId,
      source: 'snapshot' as const,
      worldId,
    }))
}

export const PARCEL_BUILD_SCHEMA_VERSION: 1

export type ParcelBuildSnapshot<Node = unknown> = {
  nodes: Node[]
  operationId: string
  parcelId: string
  revision: number
  schemaVersion: typeof PARCEL_BUILD_SCHEMA_VERSION
  updatedAt: number
  updatedBy: string
  worldId: string
}

export type SyncParcelBuildNodesMessage<Node = unknown> = {
  baseRevision: number
  nodes: readonly Node[]
  operationId: string
  parcelId: string
  schemaVersion: typeof PARCEL_BUILD_SCHEMA_VERSION
  type: 'sync-parcel-build-nodes'
  worldId: string
}

export function isParcelBuildSchemaVersion(
  value: unknown,
): value is typeof PARCEL_BUILD_SCHEMA_VERSION
export function normalizeParcelBuildRevision(value: unknown, fallback?: number): number

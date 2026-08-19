export const PARCEL_BUILD_SCHEMA_VERSION: 1
export const DEFAULT_MULTIPLAYER_ROOM_ID: 'landrush-lab-world-multiplayer'
export const MAX_MULTIPLAYER_ROOM_ID_LENGTH: 80

export type LocalPlayerProfile = {
  color: string
  id: string
  name: string
}

export type MultiplayerPlayerSnapshot = LocalPlayerProfile & {
  heading: number
  moving: boolean
  pose?: 'falling'
  position: [number, number, number]
  speed: number
  updatedAt: number
}

export type ParcelOwnership = {
  claimedAt: number
  owner: LocalPlayerProfile
  parcelId: string
  worldId: string
}

export type ParcelClaimError = {
  code: string
  message: string
  parcelId?: string
  worldId?: string
}

export type TvMediaStateSnapshot = {
  muted: boolean
  parcelId: string
  playbackSeconds: number
  playbackUpdatedAt: number
  playing: boolean
  tvId: string
  updatedAt: number
  updatedBy: string
  url: string
  userVolume: number
  worldId: string
}

export type ConnectionStatus = 'connected' | 'connecting' | 'offline' | 'reconnecting'

export type SpatialVoiceSignalPayload =
  | {
      description: { sdp: string; type: 'answer' | 'offer' }
      type: 'description'
    }
  | {
      candidate: {
        candidate?: string
        sdpMid?: null | string
        sdpMLineIndex?: null | number
        usernameFragment?: null | string
      }
      type: 'ice-candidate'
    }
  | { type: 'disconnect' }
  | { type: 'ready' }

export type SpatialVoiceSignalMessage = {
  from: string
  sequence?: number
  signal: SpatialVoiceSignalPayload
}

export type ParcelBuildNode = {
  id: string
  type: string
}

export type ParcelBuildSnapshot<Node = ParcelBuildNode> = {
  nodes: Node[]
  operationId: string
  parcelId: string
  revision: number
  schemaVersion: typeof PARCEL_BUILD_SCHEMA_VERSION
  updatedAt: number
  updatedBy: string
  worldId: string
}

export type SyncParcelBuildNodesMessage<Node = ParcelBuildNode> = {
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
export function sanitizeMultiplayerRoomId(value: unknown): string
export function isSpatialVoiceSignalPayload(value: unknown): value is SpatialVoiceSignalPayload

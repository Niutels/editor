export const LEGACY_PARCEL_BUILD_SCHEMA_VERSION: 1
export const PARCEL_BUILD_SCHEMA_VERSION: 2
export const PARCEL_WRITER_SESSION_CLOSE_CODE: 4009
export const MAX_PARCEL_WRITER_SESSION_ID_LENGTH: 120
export const DEFAULT_MULTIPLAYER_ROOM_ID: 'landrush-lab-world-multiplayer'
export const MAX_MULTIPLAYER_ROOM_ID_LENGTH: 80
export const MAX_MULTIPLAYER_COMBAT_SHOTS: 64
export const MULTIPLAYER_ZOMBIE_ESCAPE_BUILD_DURATION_MS: 60000
export const MULTIPLAYER_ZOMBIE_ESCAPE_NIGHT_DURATION_MS: 180000
export const DEFAULT_PROFILE_MONEY: 0
export const MAX_PROFILE_MONEY: 1000000000
export const MAX_PROFILE_MONEY_OPERATION_ID_LENGTH: 120
export const ZOMBIE_ESCAPE_KILL_REWARD: 10

export type ParcelBuildReadableSchemaVersion =
  | typeof LEGACY_PARCEL_BUILD_SCHEMA_VERSION
  | typeof PARCEL_BUILD_SCHEMA_VERSION

export type LocalPlayerProfile = {
  color: string
  id: string
  name: string
}

export type ProfileWalletSnapshot = {
  balance: number
  profileId: string
  revision: number
  updatedAt: number
}

export type ProfileMoneyOperation =
  | {
      baseRevision: number
      kind: 'zombie-kill-reward'
      operationId: string
    }
  | {
      baseRevision: number
      cost: number
      kind: 'weapon-purchase'
      operationId: string
    }

export type ReportZombieEscapeDeathMessage = {
  night: number
  sessionId: string
  type: 'report-zombie-escape-death'
}

export type MultiplayerPlayerSnapshot = LocalPlayerProfile & {
  combat?: MultiplayerPlayerCombatSnapshot
  heading: number
  moving: boolean
  pose?: MultiplayerPlayerPose
  position: [number, number, number]
  speed: number
  updatedAt: number
}

export type MultiplayerPlayerPose = 'crouching' | 'falling'

export type MultiplayerZombieEscapeStateSnapshot = {
  night: number
  phase: 'build' | 'night'
  phaseEndsAt: number | null
  revision: number
  sessionId: string
}

export type MultiplayerPlayerShotSnapshot = {
  id: number
  impactAge: number | null
  position: [number, number, number]
  previousPosition: [number, number, number]
  weaponIndex: number
}

export type MultiplayerPlayerCombatSnapshot = {
  aimAngle: number
  ammo: number
  meleePhase: 'active' | 'idle' | 'recovery' | 'windup'
  meleeProgress: number
  shotSequence: number
  shots: MultiplayerPlayerShotSnapshot[]
  weaponIndex: number
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
  schemaVersion: ParcelBuildReadableSchemaVersion
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
  writerEpoch: number
  writerSessionId: string
  worldId: string
}

export type ParcelWriterSession = {
  writerEpoch: number
  writerSessionId: string
}

export type ApplyProfileMoneyOperationMessage = ParcelWriterSession & {
  operation: ProfileMoneyOperation
  type: 'apply-profile-money-operation'
}

export type ParcelBuildNodesAckMessage = ParcelWriterSession & {
  operationId: string
  parcelId: string
  revision: number
  roomId: string
  serverTime: number
  type: 'parcel-build-nodes-ack'
  updatedAt: number
  updatedBy: string
  worldId: string
}

export type ParcelBuildNodesRejectedMessage = {
  code: string
  operationId: string
  parcelId: string
  reason: string
  roomId: string
  serverTime: number
  type: 'parcel-build-nodes-rejected'
  worldId: string
}

export function isParcelBuildSchemaVersion(
  value: unknown,
): value is typeof PARCEL_BUILD_SCHEMA_VERSION
export function isSupportedParcelBuildSchemaVersion(
  value: unknown,
): value is ParcelBuildReadableSchemaVersion
export function isParcelWriterEpoch(value: unknown): value is number
export function sanitizeParcelWriterSessionId(value: unknown): string
export function normalizeParcelBuildRevision(value: unknown, fallback?: number): number
export function sanitizeMultiplayerRoomId(value: unknown): string
export function sanitizeProfileMoneyOperationId(value: unknown): string
export function isProfileWalletSnapshot(value: unknown): value is ProfileWalletSnapshot
export function sanitizeProfileWalletSnapshot(
  value: unknown,
): ProfileWalletSnapshot | undefined
export function isProfileMoneyOperation(value: unknown): value is ProfileMoneyOperation
export function sanitizeProfileMoneyOperation(value: unknown): ProfileMoneyOperation | undefined
export function isApplyProfileMoneyOperationMessage(
  value: unknown,
): value is ApplyProfileMoneyOperationMessage
export function isReportZombieEscapeDeathMessage(
  value: unknown,
): value is ReportZombieEscapeDeathMessage
export function isSpatialVoiceSignalPayload(value: unknown): value is SpatialVoiceSignalPayload
export function isMultiplayerPlayerPose(value: unknown): value is MultiplayerPlayerPose
export function isMultiplayerPlayerCombatSnapshot(
  value: unknown,
): value is MultiplayerPlayerCombatSnapshot
export function sanitizeMultiplayerPlayerCombatSnapshot(
  value: unknown,
): MultiplayerPlayerCombatSnapshot | undefined
export function isMultiplayerZombieEscapeStateSnapshot(
  value: unknown,
): value is MultiplayerZombieEscapeStateSnapshot
export function sanitizeMultiplayerZombieEscapeStateSnapshot(
  value: unknown,
): MultiplayerZombieEscapeStateSnapshot | undefined

import type { ParcelBuildContentAuthority } from './parcel-build-content-authority'

export type MultiplayerTransportScope = {
  contentAuthority: ParcelBuildContentAuthority
  gameMode: 'zombie-escape' | null
  localProfileId: string
  parcelWorldId: string | null
  roomId: string
  spectator: boolean
}

export type MultiplayerTransportScopeGeneration = {
  generation: number
  scope: MultiplayerTransportScope
}

export function createMultiplayerTransportScopeGeneration(
  scope: MultiplayerTransportScope,
): MultiplayerTransportScopeGeneration {
  return { generation: 0, scope }
}

export function advanceMultiplayerTransportScopeGeneration(
  current: MultiplayerTransportScopeGeneration,
  scope: MultiplayerTransportScope,
): MultiplayerTransportScopeGeneration {
  if (
    current.scope.contentAuthority === scope.contentAuthority &&
    current.scope.gameMode === scope.gameMode &&
    current.scope.localProfileId === scope.localProfileId &&
    current.scope.parcelWorldId === scope.parcelWorldId &&
    current.scope.roomId === scope.roomId &&
    current.scope.spectator === scope.spectator
  ) {
    return current
  }

  return { generation: current.generation + 1, scope }
}

export function isMultiplayerTransportCallbackCurrent<T>({
  capturedGeneration,
  currentGeneration,
  currentTransport,
  transport,
}: {
  capturedGeneration: number
  currentGeneration: number
  currentTransport: T | null
  transport: T
}) {
  return currentTransport === transport && capturedGeneration === currentGeneration
}

export function isMultiplayerTransportSessionCallbackCurrent<T>({
  capturedConnectionId,
  capturedGeneration,
  currentConnectionId,
  currentGeneration,
  currentTransport,
  transport,
}: {
  capturedConnectionId: string
  capturedGeneration: number
  currentConnectionId: string | null
  currentGeneration: number
  currentTransport: T | null
  transport: T
}) {
  return (
    capturedConnectionId === currentConnectionId &&
    isMultiplayerTransportCallbackCurrent({
      capturedGeneration,
      currentGeneration,
      currentTransport,
      transport,
    })
  )
}

import { describe, expect, test } from 'bun:test'
import type { ParcelBuildNode, ParcelBuildSnapshot } from '@landrush/protocol'
import {
  createClaimedParcelBuildAuthorityUpdate,
  createOfflineParcelBuildAuthorityUpdates,
  isParcelBuildContentUpdateAuthorityCurrent,
  ParcelBuildContentAuthorityEpoch,
  resolveLocalParcelBuildContentAuthority,
  shouldRefreshParcelBuildAuthorityAfterClaim,
} from './parcel-build-content-authority'

const ONLINE_SCOPE = {
  contentAuthority: 'online',
  localProfileId: 'player-a',
  roomId: 'room-a',
} as const

const OFFLINE_OWNERSHIP = {
  claimedAt: 1,
  owner: { color: '#fff', id: 'player-a', name: 'Player A' },
  parcelId: 'parcel-a',
  worldId: 'world-a',
} as const

const OFFLINE_BUILD = {
  nodes: [{ id: 'offline-building', type: 'Building' }],
  operationId: 'offline-operation',
  parcelId: 'parcel-a',
  revision: 2,
  schemaVersion: 2,
  updatedAt: 2,
  updatedBy: 'player-a',
  worldId: 'world-a',
} satisfies ParcelBuildSnapshot<ParcelBuildNode>

describe('ParcelBuildContentAuthorityEpoch', () => {
  test('assigns a fresh epoch every time world authority changes from A to B to A', () => {
    const authority = new ParcelBuildContentAuthorityEpoch(ONLINE_SCOPE)

    expect(authority.current).toBe(0)
    expect(authority.watchWorld('world-a')).toEqual({ changed: true, epoch: 1 })
    expect(authority.watchWorld('world-b')).toEqual({ changed: true, epoch: 2 })
    expect(authority.watchWorld('world-a')).toEqual({ changed: true, epoch: 3 })
  })

  test('changes across online, offline, and online-pending authority in the same world', () => {
    const authority = new ParcelBuildContentAuthorityEpoch(ONLINE_SCOPE)
    authority.watchWorld('world-a')

    expect(authority.updateScope({ ...ONLINE_SCOPE, contentAuthority: 'offline' })).toEqual({
      changed: true,
      epoch: 2,
    })
    expect(authority.watchWorld('world-a')).toEqual({ changed: false, epoch: 2 })
    expect(authority.updateScope({ ...ONLINE_SCOPE, contentAuthority: 'online-pending' })).toEqual({
      changed: true,
      epoch: 3,
    })
    expect(authority.updateScope(ONLINE_SCOPE)).toEqual({ changed: true, epoch: 4 })
  })

  test('changes for distinct room and local session authority', () => {
    const authority = new ParcelBuildContentAuthorityEpoch(ONLINE_SCOPE)
    authority.watchWorld('world-a')

    expect(authority.updateScope({ ...ONLINE_SCOPE, roomId: 'room-b' })).toEqual({
      changed: true,
      epoch: 2,
    })
    expect(
      authority.updateScope({ ...ONLINE_SCOPE, localProfileId: 'player-b', roomId: 'room-b' }),
    ).toEqual({ changed: true, epoch: 3 })
  })

  test('stays stable through a same-authority reconnect', () => {
    const authority = new ParcelBuildContentAuthorityEpoch(ONLINE_SCOPE)
    authority.watchWorld('world-a')
    const connectedEpoch = authority.current

    expect(authority.updateScope(ONLINE_SCOPE)).toEqual({
      changed: false,
      epoch: connectedEpoch,
    })
    expect(authority.watchWorld('world-a')).toEqual({
      changed: false,
      epoch: connectedEpoch,
    })
    expect(authority.current).toBe(connectedEpoch)
  })

  test('hydrates online to offline from offline authority, never old online content', () => {
    const authority = new ParcelBuildContentAuthorityEpoch(ONLINE_SCOPE)
    authority.watchWorld('world-a')
    const transition = authority.updateScope({ ...ONLINE_SCOPE, contentAuthority: 'offline' })
    const updates = createOfflineParcelBuildAuthorityUpdates({
      builds: [OFFLINE_BUILD],
      ownerships: [OFFLINE_OWNERSHIP],
      worldId: 'world-a',
    })

    expect(transition).toEqual({ changed: true, epoch: 2 })
    expect(updates).toEqual([
      {
        build: OFFLINE_BUILD,
        parcelId: 'parcel-a',
        source: 'snapshot',
        worldId: 'world-a',
      },
    ])
  })

  test('hydrates a fresh offline claimed parcel with explicit empty content', () => {
    expect(
      createOfflineParcelBuildAuthorityUpdates({
        builds: [],
        ownerships: [OFFLINE_OWNERSHIP],
        worldId: 'world-a',
      }),
    ).toEqual([{ build: null, parcelId: 'parcel-a', source: 'snapshot', worldId: 'world-a' }])
    expect(
      createClaimedParcelBuildAuthorityUpdate({
        builds: [],
        parcelId: 'parcel-a',
        worldId: 'world-a',
      }),
    ).toEqual({ build: null, parcelId: 'parcel-a', source: 'snapshot', worldId: 'world-a' })
  })

  test('moves offline to online into a new authority epoch', () => {
    const authority = new ParcelBuildContentAuthorityEpoch({
      ...ONLINE_SCOPE,
      contentAuthority: 'offline',
    })
    authority.watchWorld('world-a')

    expect(authority.updateScope(ONLINE_SCOPE)).toEqual({ changed: true, epoch: 2 })
  })

  test('requests authoritative server content after a fresh online claim', () => {
    expect(shouldRefreshParcelBuildAuthorityAfterClaim('parcel-claim-result')).toBe(true)
    expect(shouldRefreshParcelBuildAuthorityAfterClaim('parcel-owned')).toBe(false)
  })

  test('drops delayed offline hydration after online authority takes over', () => {
    const authority = new ParcelBuildContentAuthorityEpoch({
      ...ONLINE_SCOPE,
      contentAuthority: 'offline',
    })
    authority.watchWorld('world-a')
    const offlineEpoch = authority.current

    authority.updateScope(ONLINE_SCOPE)

    expect(isParcelBuildContentUpdateAuthorityCurrent(offlineEpoch, authority.current)).toBe(false)
    expect(isParcelBuildContentUpdateAuthorityCurrent(authority.current, authority.current)).toBe(
      true,
    )
  })

  test('leaves online-pending and online local authority unresolved while offline is explicit', () => {
    const resolve = (contentAuthority: 'offline' | 'online' | 'online-pending') =>
      resolveLocalParcelBuildContentAuthority({
        builds: [],
        contentAuthority,
        ownerships: [],
        worldId: 'world-a',
      })

    expect(resolve('online-pending')).toEqual({ snapshotWorldId: null, updates: [] })
    expect(resolve('online')).toEqual({ snapshotWorldId: null, updates: [] })
    expect(resolve('offline')).toEqual({ snapshotWorldId: 'world-a', updates: [] })
  })
})

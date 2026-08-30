import { describe, expect, test } from 'bun:test'
import {
  isZombieEscapeFirstHouseReady,
  type ParcelBuildNode,
  type ParcelBuildSnapshot,
} from '@landrush/protocol'
import {
  createClaimedParcelBuildAuthorityUpdate,
  createOfflineParcelBuildAuthorityUpdates,
  isParcelBuildContentUpdateAuthorityCurrent,
  ParcelBuildContentAuthorityEpoch,
  resolveLocalParcelBuildContentAuthority,
  shouldRefreshParcelBuildAuthorityAfterClaim,
} from './parcel-build-content-authority'
import { isCanonicalZombieEscapeFirstHouseReady } from './world-multiplayer-client'

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

const ZOMBIE_HOUSE_METADATA = { landrushParcelId: 'shared-zombie-house' }

function buildNode(
  id: string,
  type: string,
  parentId: string | null,
  properties: Record<string, unknown> = {},
) {
  return {
    id,
    object: 'node',
    parentId,
    type,
    visible: true,
    ...properties,
  } as ParcelBuildNode
}

function closedZombieHouseNodes({ door = false } = {}) {
  const wallIds = ['wall-north', 'wall-east', 'wall-south', 'wall-west']
  return [
    buildNode('building-house', 'building', null, { children: ['level-house'] }),
    buildNode('level-house', 'level', 'building-house', { children: wallIds }),
    buildNode(wallIds[0]!, 'wall', 'level-house', {
      children: door ? ['door-house'] : [],
      end: [4, 0],
      metadata: ZOMBIE_HOUSE_METADATA,
      start: [0, 0],
    }),
    buildNode(wallIds[1]!, 'wall', 'level-house', {
      children: [],
      end: [4, 3],
      metadata: ZOMBIE_HOUSE_METADATA,
      start: [4, 0],
    }),
    buildNode(wallIds[2]!, 'wall', 'level-house', {
      children: [],
      end: [0, 3],
      metadata: ZOMBIE_HOUSE_METADATA,
      start: [4, 3],
    }),
    buildNode(wallIds[3]!, 'wall', 'level-house', {
      children: [],
      end: [0, 0],
      metadata: ZOMBIE_HOUSE_METADATA,
      start: [0, 3],
    }),
    ...(door
      ? [
          buildNode('door-house', 'door', wallIds[0]!, {
            metadata: ZOMBIE_HOUSE_METADATA,
          }),
        ]
      : []),
  ]
}

function standaloneDoorWallNodes() {
  return [
    buildNode('building-door', 'building', null, { children: ['level-house'] }),
    buildNode('level-house', 'level', 'building-door', {
      children: ['wall-door-host'],
    }),
    buildNode('wall-door-host', 'wall', 'level-house', {
      children: ['door-cross-parcel'],
      end: [4, 0],
      metadata: ZOMBIE_HOUSE_METADATA,
      start: [0, 0],
    }),
    buildNode('door-cross-parcel', 'door', 'wall-door-host', {
      metadata: ZOMBIE_HOUSE_METADATA,
    }),
  ]
}

function canonicalBuild(parcelId: string, worldId: string, nodes: readonly ParcelBuildNode[]) {
  return {
    nodes: [...nodes],
    operationId: `operation-${parcelId}`,
    parcelId,
    revision: 1,
    schemaVersion: 2,
    updatedAt: 1,
    updatedBy: 'player-a',
    worldId,
  } satisfies ParcelBuildSnapshot<ParcelBuildNode>
}

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

describe('canonical Zombie Escape first-house authority', () => {
  const ready = (
    parcelBuildNodes: readonly ParcelBuildSnapshot<ParcelBuildNode>[],
    watchedParcelWorldId = 'world-a',
    parcelBuildSnapshotWorldId: string | null = 'world-a',
  ) =>
    isCanonicalZombieEscapeFirstHouseReady({
      parcelBuildNodes,
      parcelBuildSnapshotWorldId,
      watchedParcelWorldId,
    })

  test('rejects empty and spawn-only canonical authority', () => {
    expect(ready([])).toBe(false)
    expect(
      ready([canonicalBuild('parcel-spawn', 'world-a', [buildNode('spawn-only', 'spawn', null)])]),
    ).toBe(false)
  })

  test('accepts one qualifying canonical build in the watched world', () => {
    expect(
      ready([canonicalBuild('parcel-house', 'world-a', closedZombieHouseNodes({ door: true }))]),
    ).toBe(true)
  })

  test('rejects a qualifying build from a different world', () => {
    expect(
      ready([canonicalBuild('parcel-house', 'world-b', closedZombieHouseNodes({ door: true }))]),
    ).toBe(false)
    expect(
      ready(
        [canonicalBuild('parcel-house', 'world-a', closedZombieHouseNodes({ door: true }))],
        'world-a',
        'world-b',
      ),
    ).toBe(false)
  })

  test('does not compose closed walls and a hosted door across canonical builds', () => {
    const walls = closedZombieHouseNodes()
    const hostedDoorWall = standaloneDoorWallNodes()
    expect(isZombieEscapeFirstHouseReady([...walls, ...hostedDoorWall])).toBe(true)
    expect(
      ready([
        canonicalBuild('parcel-walls', 'world-a', walls),
        canonicalBuild('parcel-door', 'world-a', hostedDoorWall),
      ]),
    ).toBe(false)
  })
})

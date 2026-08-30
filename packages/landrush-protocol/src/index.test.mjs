import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateParcelBuildPriceDelta,
  DEFAULT_PROFILE_MONEY,
  DEFAULT_MULTIPLAYER_ROOM_ID,
  isApplyProfileMoneyOperationMessage,
  isMultiplayerPlayerCombatSnapshot,
  isMultiplayerZombieEscapeStateSnapshot,
  isParcelBuildFixedPriceNodeType,
  isParcelBuildSchemaVersion,
  isParcelWriterEpoch,
  isMultiplayerPlayerPose,
  isProfileMoneyOperation,
  isProfileWalletSnapshot,
  isReportZombieEscapeDeathMessage,
  isSpatialVoiceSignalPayload,
  isSupportedParcelBuildSchemaVersion,
  isZombieEscapeFirstHouseReady,
  LEGACY_PARCEL_BUILD_SCHEMA_VERSION,
  MAX_PROFILE_MONEY,
  MAX_PROFILE_MONEY_OPERATION_ID_LENGTH,
  MAX_MULTIPLAYER_ROOM_ID_LENGTH,
  MAX_MULTIPLAYER_COMBAT_SHOTS,
  MULTIPLAYER_ZOMBIE_ESCAPE_BUILD_DURATION_MS,
  MULTIPLAYER_ZOMBIE_ESCAPE_NIGHT_DURATION_MS,
  normalizeParcelBuildRevision,
  PARCEL_BUILD_FIXED_NODE_PRICE,
  PARCEL_BUILD_ITEM_PRICE,
  PARCEL_BUILD_PRICE_EPSILON,
  PARCEL_BUILD_SCHEMA_VERSION,
  PARCEL_BUILD_WALL_PRICE_PER_METER,
  sanitizeParcelWriterSessionId,
  sanitizeMultiplayerRoomId,
  sanitizeMultiplayerPlayerCombatSnapshot,
  sanitizeMultiplayerZombieEscapeStateSnapshot,
  sanitizeProfileMoneyOperation,
  sanitizeProfileMoneyOperationId,
  sanitizeProfileWalletSnapshot,
  ZOMBIE_ESCAPE_KILL_REWARD,
} from './index.js'

test('accepts only the current parcel-build schema', () => {
  assert.equal(isParcelBuildSchemaVersion(PARCEL_BUILD_SCHEMA_VERSION), true)
  assert.equal(isParcelBuildSchemaVersion(LEGACY_PARCEL_BUILD_SCHEMA_VERSION), false)
  assert.equal(isParcelBuildSchemaVersion(PARCEL_BUILD_SCHEMA_VERSION + 1), false)
  assert.equal(isSupportedParcelBuildSchemaVersion(LEGACY_PARCEL_BUILD_SCHEMA_VERSION), true)
  assert.equal(isSupportedParcelBuildSchemaVersion(PARCEL_BUILD_SCHEMA_VERSION), true)
  assert.equal(isSupportedParcelBuildSchemaVersion(PARCEL_BUILD_SCHEMA_VERSION + 1), false)
})

test('validates and sanitizes parcel writer sessions consistently', () => {
  assert.equal(isParcelWriterEpoch(1), true)
  assert.equal(isParcelWriterEpoch(0), false)
  assert.equal(isParcelWriterEpoch(1.5), false)
  assert.equal(sanitizeParcelWriterSessionId(' tab / one '), 'tab---one')
})

test('validates the spatial voice wire payload once for clients and servers', () => {
  assert.equal(isSpatialVoiceSignalPayload({ type: 'ready' }), true)
  assert.equal(
    isSpatialVoiceSignalPayload({
      description: { sdp: 'offer-sdp', type: 'offer' },
      type: 'description',
    }),
    true,
  )
  assert.equal(isSpatialVoiceSignalPayload({ candidate: null, type: 'ice-candidate' }), false)
  assert.equal(
    isSpatialVoiceSignalPayload({
      description: { sdp: 'x'.repeat(120_001), type: 'answer' },
      type: 'description',
    }),
    false,
  )
})

test('normalizes parcel-build revisions without accepting fractions or negative values', () => {
  assert.equal(normalizeParcelBuildRevision(4), 4)
  assert.equal(normalizeParcelBuildRevision(-1, 2), 2)
  assert.equal(normalizeParcelBuildRevision(1.5, 3), 3)
})

test('requires a closed wall room with a hosted door for the first Zombie Escape house', () => {
  const closedWalls = [
    wallNode('wall-north', [0, 0], [4, 0]),
    wallNode('wall-east', [4, 0], [4, 3]),
    wallNode('wall-south', [4, 3], [0, 3]),
    wallNode('wall-west', [0, 3], [0, 0]),
  ].map((wall) => ({ ...wall, parentId: 'level' }))
  const door = { id: 'door', parentId: 'wall-north', type: 'door' }

  assert.equal(isZombieEscapeFirstHouseReady([]), false)
  assert.equal(isZombieEscapeFirstHouseReady([{ id: 'spawn', type: 'spawn' }]), false)
  assert.equal(isZombieEscapeFirstHouseReady(closedWalls), false)
  assert.equal(isZombieEscapeFirstHouseReady([...closedWalls.slice(0, 3), door]), false)
  assert.equal(isZombieEscapeFirstHouseReady([...closedWalls, door]), true)
})

test('rejects hidden, transient, non-door, and non-boundary openings for the first house', () => {
  const closedWalls = [
    wallNode('wall-north', [0, 0], [4, 0]),
    wallNode('wall-east', [4, 0], [4, 3]),
    wallNode('wall-south', [4, 3], [0, 3]),
    wallNode('wall-west', [0, 3], [0, 0]),
  ].map((wall) => ({ ...wall, parentId: 'level' }))
  const door = { id: 'door', parentId: 'wall-north', type: 'door' }
  const interiorWall = {
    ...wallNode('wall-interior', [2, 0.5], [2, 2.5]),
    parentId: 'level',
  }

  assert.equal(isZombieEscapeFirstHouseReady([...closedWalls, { ...door, visible: false }]), false)
  assert.equal(
    isZombieEscapeFirstHouseReady([
      ...closedWalls,
      { ...door, metadata: { isTransient: true } },
    ]),
    false,
  )
  assert.equal(
    isZombieEscapeFirstHouseReady([...closedWalls, { ...door, openingKind: 'opening' }]),
    false,
  )
  assert.equal(
    isZombieEscapeFirstHouseReady([
      ...closedWalls,
      interiorWall,
      { ...door, parentId: interiorWall.id },
    ]),
    false,
  )
})

test('shares canonical parcel-build price constants and straight or curved wall pricing', () => {
  assert.equal(PARCEL_BUILD_FIXED_NODE_PRICE, 10)
  assert.equal(PARCEL_BUILD_ITEM_PRICE, 50)
  assert.equal(PARCEL_BUILD_PRICE_EPSILON, 1e-6)
  assert.equal(PARCEL_BUILD_WALL_PRICE_PER_METER, 10)

  assert.deepEqual(calculateParcelBuildPriceDelta([], [wallNode('straight', [0, 0], [4, 0])]), {
    cost: 40,
    ok: true,
  })
  assert.deepEqual(
    calculateParcelBuildPriceDelta([], [wallNode('curved', [0, 0], [4, 0], 2)]),
    { cost: 63, ok: true },
  )
})

test('charges only positive canonical contribution deltas', () => {
  const fourMeterWall = wallNode('wall', [0, 0], [4, 0])
  const fiveMeterWall = wallNode('wall', [0, 0], [5, 0])
  assert.deepEqual(calculateParcelBuildPriceDelta([fourMeterWall], [fiveMeterWall]), {
    cost: 10,
    ok: true,
  })
  assert.deepEqual(calculateParcelBuildPriceDelta([fiveMeterWall], [fourMeterWall]), {
    cost: 0,
    ok: true,
  })
  assert.deepEqual(calculateParcelBuildPriceDelta([{ id: 'item', type: 'item' }], []), {
    cost: 0,
    ok: true,
  })
})

test('prices walls by aggregate snapshot value across splits and re-IDs', () => {
  const original = [wallNode('original', [0, 0], [4, 0])]
  const split = [
    wallNode('split-a', [0, 0], [2, 0]),
    wallNode('split-b', [2, 0], [4, 0]),
  ]
  assert.deepEqual(calculateParcelBuildPriceDelta(original, split), { cost: 0, ok: true })

  const crossing = [...split, wallNode('crossing', [2, -1], [2, 1])]
  assert.deepEqual(calculateParcelBuildPriceDelta(original, crossing), { cost: 20, ok: true })
})

test('does not refund or recharge wall value lost through shrinking or deletion', () => {
  const original = [
    wallNode('retained', [0, 0], [4, 0]),
    wallNode('deleted', [0, 1], [2, 1]),
  ]
  const reduced = [wallNode('retained', [0, 0], [3, 0])]
  assert.deepEqual(calculateParcelBuildPriceDelta(original, reduced), { cost: 0, ok: true })
})

test('validates every wall in both snapshots even when its identity is removed', () => {
  assert.deepEqual(calculateParcelBuildPriceDelta([], [wallNode('invalid-next', [0, 0], [0, 0])]), {
    code: 'unpriced-build-node',
    message: 'Wall invalid-next has invalid pricing geometry',
    ok: false,
  })
  assert.deepEqual(
    calculateParcelBuildPriceDelta([wallNode('invalid-previous', [0, 0], [0, 0])], []),
    {
      code: 'unpriced-build-node',
      message: 'Existing build node invalid-previous has no canonical price',
      ok: false,
    },
  )
})

test('rounds wall value once after summing the full snapshot length', () => {
  assert.deepEqual(
    calculateParcelBuildPriceDelta([], [
      wallNode('short-a', [0, 0], [0.04, 0]),
      wallNode('short-b', [1, 0], [1.04, 0]),
    ]),
    { cost: 1, ok: true },
  )
  assert.deepEqual(
    calculateParcelBuildPriceDelta(
      [wallNode('previous', [0, 0], [0.04, 0])],
      [wallNode('next', [0, 0], [0.11, 0])],
    ),
    { cost: 1, ok: true },
  )
})

test('prices items and every fixed-price authored build node', () => {
  const fixedTypes = [
    'block',
    'box-vent',
    'ceiling',
    'chimney',
    'column',
    'cupola',
    'door',
    'dormer',
    'downspout',
    'duct-fitting',
    'duct-segment',
    'duct-terminal',
    'elevator',
    'eyebrow-vent',
    'gutter',
    'hvac-equipment',
    'lean-to-extension',
    'lineset',
    'liquid-line',
    'pipe-fitting',
    'pipe-segment',
    'pipe-trap',
    'ridge-vent',
    'roof',
    'roof-segment',
    'shelf',
    'skylight',
    'slab',
    'solar-panel',
    'spawn',
    'stair',
    'stair-segment',
    'structural-grid',
    'turbine-vent',
    'window',
  ]
  const nodes = [
    { id: 'item', type: 'item' },
    ...fixedTypes.map((type) => ({ id: `fixed-${type}`, type })),
  ]
  assert.deepEqual(calculateParcelBuildPriceDelta([], nodes), {
    cost: PARCEL_BUILD_ITEM_PRICE + fixedTypes.length * PARCEL_BUILD_FIXED_NODE_PRICE,
    ok: true,
  })
  for (const type of fixedTypes) assert.equal(isParcelBuildFixedPriceNodeType(type), true)
  assert.equal(isParcelBuildFixedPriceNodeType(' BLOCK '), true)
  for (const type of ['cabinet', 'fence', 'item', 'plugin:unknown', 'wall']) {
    assert.equal(isParcelBuildFixedPriceNodeType(type), false)
  }
})

test('prices a cabinet graph as one item and keeps its derived module chain free', () => {
  const cabinetGraph = [
    { id: 'cabinet', type: 'cabinet' },
    { id: 'cabinet-module-a', parentId: 'cabinet', type: 'cabinet-module' },
    { id: 'cabinet-module-b', parentId: 'cabinet-module-a', type: 'cabinet-module' },
  ]
  assert.deepEqual(calculateParcelBuildPriceDelta([], cabinetGraph), {
    cost: PARCEL_BUILD_ITEM_PRICE,
    ok: true,
  })
  assert.deepEqual(calculateParcelBuildPriceDelta(cabinetGraph, cabinetGraph), {
    cost: 0,
    ok: true,
  })
})

test('rejects an orphan cabinet module instead of treating it as free', () => {
  assert.deepEqual(
    calculateParcelBuildPriceDelta([], [
      { id: 'orphan-module', parentId: 'missing-cabinet', type: 'cabinet-module' },
    ]),
    {
      code: 'unpriced-build-node',
      message: 'Build node type cabinet-module has no canonical price',
      ok: false,
    },
  )
})

test('prices a valid lean-to composite once with direct and nested managed descendants free', () => {
  const { baseline, graph } = leanToCompositeGraph()
  assert.deepEqual(calculateParcelBuildPriceDelta(baseline, graph), {
    cost: PARCEL_BUILD_FIXED_NODE_PRICE,
    ok: true,
  })
  assert.deepEqual(calculateParcelBuildPriceDelta(graph, graph), { cost: 0, ok: true })
})

test('retains normal prices for orphaned, wrong-root, and wrong-role lean-to descendants', () => {
  const { graph, ids } = leanToCompositeGraph()
  const otherLeanTo = {
    id: 'lean-to-other',
    parentId: ids.wall,
    type: 'lean-to-extension',
  }
  const baseline = [...graph, otherLeanTo]
  const invalidManagedNodes = [
    {
      id: 'orphan-post',
      metadata: { leanToRole: 'post', managedByLeanTo: 'missing-lean-to' },
      parentId: ids.leanTo,
      type: 'column',
    },
    {
      id: 'wrong-root-post',
      metadata: { leanToRole: 'post', managedByLeanTo: otherLeanTo.id },
      parentId: ids.leanTo,
      type: 'column',
    },
    {
      id: 'wrong-role-post',
      metadata: { leanToRole: 'gutter', managedByLeanTo: ids.leanTo },
      parentId: ids.leanTo,
      type: 'column',
    },
    {
      id: 'wrong-parent-gutter',
      metadata: { leanToRole: 'gutter', managedByLeanTo: ids.leanTo },
      parentId: ids.leanTo,
      type: 'gutter',
    },
  ]
  for (const node of invalidManagedNodes) {
    assert.deepEqual(calculateParcelBuildPriceDelta(baseline, [...baseline, node]), {
      cost: PARCEL_BUILD_FIXED_NODE_PRICE,
      ok: true,
    })
  }
})

test('does not exempt duplicate singleton roles in a managed lean-to topology', () => {
  const { graph, ids } = leanToCompositeGraph()
  const duplicateCases = [
    {
      expectedCost: 5 * PARCEL_BUILD_FIXED_NODE_PRICE,
      node: {
        children: [],
        id: 'duplicate-roof',
        metadata: { leanToRole: 'roof', managedByLeanTo: ids.leanTo },
        parentId: ids.leanTo,
        type: 'roof',
      },
      parentId: ids.leanTo,
    },
    {
      expectedCost: 4 * PARCEL_BUILD_FIXED_NODE_PRICE,
      node: {
        children: [],
        id: 'duplicate-segment',
        metadata: { leanToRole: 'roof-segment', managedByLeanTo: ids.leanTo },
        parentId: ids.roof,
        type: 'roof-segment',
      },
      parentId: ids.roof,
    },
    {
      expectedCost: 2 * PARCEL_BUILD_FIXED_NODE_PRICE,
      node: {
        children: [],
        id: 'duplicate-gutter',
        metadata: { leanToRole: 'gutter', managedByLeanTo: ids.leanTo },
        parentId: ids.segment,
        type: 'gutter',
      },
      parentId: ids.segment,
    },
    {
      expectedCost: 2 * PARCEL_BUILD_FIXED_NODE_PRICE,
      node: {
        children: [],
        id: 'duplicate-downspout',
        metadata: { leanToRole: 'downspout', managedByLeanTo: ids.leanTo },
        parentId: ids.segment,
        type: 'downspout',
      },
      parentId: ids.segment,
    },
  ]

  for (const { expectedCost, node, parentId } of duplicateCases) {
    const next = graph.map((candidate) =>
      candidate.id === parentId
        ? { ...candidate, children: [...candidate.children, node.id] }
        : candidate,
    )
    assert.deepEqual(calculateParcelBuildPriceDelta(graph, [...next, node]), {
      cost: expectedCost,
      ok: true,
    })
  }
})

test('requires reciprocal membership and a unique valid identity for managed lean-to posts', () => {
  const { graph, ids } = leanToCompositeGraph()
  const duplicatePost = {
    children: [],
    id: 'duplicate-post',
    metadata: {
      leanToPostIndex: 0,
      leanToPostSide: 'low',
      leanToRole: 'post',
      managedByLeanTo: ids.leanTo,
    },
    parentId: ids.leanTo,
    type: 'column',
  }
  const duplicateGraph = graph.map((node) =>
    node.id === ids.leanTo ? { ...node, children: [...node.children, duplicatePost.id] } : node,
  )
  assert.deepEqual(calculateParcelBuildPriceDelta(graph, [...duplicateGraph, duplicatePost]), {
    cost: 2 * PARCEL_BUILD_FIXED_NODE_PRICE,
    ok: true,
  })

  const invalidIdentities = [
    { leanToPostIndex: 0.5, leanToPostSide: 'low' },
    { leanToPostIndex: Number.MAX_SAFE_INTEGER + 1, leanToPostSide: 'high' },
    { leanToPostIndex: 1, leanToPostSide: 'middle' },
  ]
  for (const [index, identity] of invalidIdentities.entries()) {
    const invalidPost = {
      children: [],
      id: `invalid-post-${index}`,
      metadata: {
        ...identity,
        leanToRole: 'post',
        managedByLeanTo: ids.leanTo,
      },
      parentId: ids.leanTo,
      type: 'column',
    }
    const next = graph.map((node) =>
      node.id === ids.leanTo ? { ...node, children: [...node.children, invalidPost.id] } : node,
    )
    assert.deepEqual(calculateParcelBuildPriceDelta(graph, [...next, invalidPost]), {
      cost: PARCEL_BUILD_FIXED_NODE_PRICE,
      ok: true,
    })
  }

  const unlistedPost = {
    children: [],
    id: 'unlisted-post',
    metadata: {
      leanToPostIndex: 1,
      leanToPostSide: 'high',
      leanToRole: 'post',
      managedByLeanTo: ids.leanTo,
    },
    parentId: ids.leanTo,
    type: 'column',
  }
  assert.deepEqual(calculateParcelBuildPriceDelta(graph, [...graph, unlistedPost]), {
    cost: PARCEL_BUILD_FIXED_NODE_PRICE,
    ok: true,
  })

  const arbitraryPost = {
    ...unlistedPost,
    id: 'arbitrary-post',
    metadata: { ...unlistedPost.metadata, leanToPostIndex: 99, leanToPostSide: 'low' },
  }
  const arbitraryGraph = graph.map((node) =>
    node.id === ids.leanTo ? { ...node, children: [...node.children, arbitraryPost.id] } : node,
  )
  assert.deepEqual(calculateParcelBuildPriceDelta(graph, [...arbitraryGraph, arbitraryPost]), {
    cost: PARCEL_BUILD_FIXED_NODE_PRICE,
    ok: true,
  })
})

test('allows only configured high-side and metadata-proven corner lean-to posts', () => {
  const { graph, ids } = leanToCompositeGraph()
  const highPost = {
    children: [],
    id: 'high-post',
    metadata: {
      leanToPostIndex: 1,
      leanToPostSide: 'high',
      leanToRole: 'post',
      managedByLeanTo: ids.leanTo,
    },
    parentId: ids.leanTo,
    type: 'column',
  }
  const withHighPost = (nodes) => [
    ...nodes.map((node) =>
      node.id === ids.leanTo ? { ...node, children: [...node.children, highPost.id] } : node,
    ),
    highPost,
  ]
  assert.deepEqual(calculateParcelBuildPriceDelta(graph, withHighPost(graph)), {
    cost: PARCEL_BUILD_FIXED_NODE_PRICE,
    ok: true,
  })
  const independentGraph = graph.map((node) =>
    node.id === ids.leanTo ? { ...node, highSideMode: 'independent-high-beam' } : node,
  )
  assert.deepEqual(calculateParcelBuildPriceDelta(independentGraph, withHighPost(independentGraph)), {
    cost: 0,
    ok: true,
  })

  const validLeftJoint = {
    beamExtension: 0,
    gutterMitre: Math.PI / 4,
    seam: null,
    sharedPostOwner: true,
  }
  const ownedCornerGraph = graph.map((node) =>
    node.id === ids.leanTo
      ? {
          ...node,
          metadata: { leanToCornerJoints: { left: validLeftJoint } },
        }
      : node,
  )
  const cornerPost = {
    children: [],
    id: 'left-corner-post',
    metadata: {
      leanToPostIndex: -1001,
      leanToPostSide: 'low',
      leanToRole: 'post',
      managedByLeanTo: ids.leanTo,
    },
    parentId: ids.leanTo,
    type: 'column',
  }
  const withCornerPost = (nodes, post = cornerPost) => [
    ...nodes.map((node) =>
      node.id === ids.leanTo ? { ...node, children: [...node.children, post.id] } : node,
    ),
    post,
  ]
  assert.deepEqual(
    calculateParcelBuildPriceDelta(ownedCornerGraph, withCornerPost(ownedCornerGraph)),
    { cost: 0, ok: true },
  )

  for (const invalidJoint of [
    { ...validLeftJoint, sharedPostOwner: false },
    { sharedPostOwner: true },
  ]) {
    const invalidCornerGraph = graph.map((node) =>
      node.id === ids.leanTo
        ? { ...node, metadata: { leanToCornerJoints: { left: invalidJoint } } }
        : node,
    )
    assert.deepEqual(
      calculateParcelBuildPriceDelta(invalidCornerGraph, withCornerPost(invalidCornerGraph)),
      { cost: PARCEL_BUILD_FIXED_NODE_PRICE, ok: true },
    )
  }
})

test('does not exempt ordinary low posts removed by a persisted concave corner joint', () => {
  const { graph, ids } = leanToCompositeGraph()
  const withoutPost = graph
    .filter((node) => node.id !== ids.post)
    .map((node) =>
      node.id === ids.leanTo
        ? {
            ...node,
            children: node.children.filter((childId) => childId !== ids.post),
            metadata: {
              leanToCornerJoints: {
                left: {
                  beamExtension: 0,
                  gutterMitre: -Math.PI / 4,
                  seam: null,
                  sharedPostOwner: false,
                },
              },
            },
          }
        : node,
    )
  const removedEndpointPost = {
    children: [],
    id: 'removed-endpoint-post',
    metadata: {
      leanToPostIndex: 0,
      leanToPostSide: 'low',
      leanToRole: 'post',
      managedByLeanTo: ids.leanTo,
    },
    parentId: ids.leanTo,
    type: 'column',
  }
  const next = withoutPost.map((node) =>
    node.id === ids.leanTo
      ? { ...node, children: [...node.children, removedEndpointPost.id] }
      : node,
  )
  assert.deepEqual(calculateParcelBuildPriceDelta(withoutPost, [...next, removedEndpointPost]), {
    cost: PARCEL_BUILD_FIXED_NODE_PRICE,
    ok: true,
  })
})

test('rejects an unknown node that spoofs managed lean-to metadata', () => {
  const { graph, ids } = leanToCompositeGraph()
  assert.deepEqual(
    calculateParcelBuildPriceDelta(graph, [
      ...graph,
      {
        id: 'spoofed-managed-node',
        metadata: { leanToRole: 'post', managedByLeanTo: ids.leanTo },
        parentId: ids.leanTo,
        type: 'plugin:spoofed-post',
      },
    ]),
    {
      code: 'unpriced-build-node',
      message: 'Build node type plugin:spoofed-post has no canonical price',
      ok: false,
    },
  )
})

test('keeps scaffold and canonically derived build nodes free', () => {
  const level = { id: 'level', type: 'Level' }
  const roof = { id: 'roof', type: 'Roof' }
  const stair = { id: 'stair', type: 'Stair' }
  const parents = [level, roof, stair]
  const nextNodes = [
    ...parents,
    { id: 'site', type: 'Site' },
    { id: 'building', type: 'Building' },
    { id: 'fence', type: 'fence' },
    { autoFromWalls: true, id: 'auto-ceiling', parentId: level.id, type: 'ceiling' },
    { autoFromWalls: true, id: 'auto-slab', parentId: level.id, type: 'slab' },
    { id: 'roof-segment', parentId: roof.id, type: 'roof-segment' },
    { id: 'stair-segment', parentId: stair.id, type: 'stair-segment' },
  ]
  assert.deepEqual(calculateParcelBuildPriceDelta(parents, nextNodes), { cost: 0, ok: true })
  assert.deepEqual(
    calculateParcelBuildPriceDelta(
      [{ id: 'case-stable', type: 'Building' }],
      [{ id: 'case-stable', type: 'building' }],
    ),
    { cost: 0, ok: true },
  )
  assert.deepEqual(
    calculateParcelBuildPriceDelta([], [
      { autoFromWalls: true, id: 'orphan-slab', parentId: 'missing', type: 'slab' },
    ]),
    { cost: PARCEL_BUILD_FIXED_NODE_PRICE, ok: true },
  )
})

test('rejects unpriced nodes, type changes, and invalid current or previous wall geometry', () => {
  assert.deepEqual(calculateParcelBuildPriceDelta([], [{ id: 'unknown', type: 'plugin:unknown' }]), {
    code: 'unpriced-build-node',
    message: 'Build node type plugin:unknown has no canonical price',
    ok: false,
  })
  assert.deepEqual(
    calculateParcelBuildPriceDelta(
      [{ id: 'same-id', type: 'item' }],
      [wallNode('same-id', [0, 0], [1, 0])],
    ),
    {
      code: 'unpriced-build-node',
      message: 'Build node same-id cannot change type from item to wall',
      ok: false,
    },
  )
  assert.deepEqual(calculateParcelBuildPriceDelta([], [wallNode('invalid', [0, 0], [0, 0])]), {
    code: 'unpriced-build-node',
    message: 'Wall invalid has invalid pricing geometry',
    ok: false,
  })
  assert.deepEqual(
    calculateParcelBuildPriceDelta(
      [wallNode('existing', [0, 0], [0, 0])],
      [wallNode('existing', [0, 0], [1, 0])],
    ),
    {
      code: 'unpriced-build-node',
      message: 'Existing build node existing has no canonical price',
      ok: false,
    },
  )
})

test('accepts the profile-money price limit and rejects prices above it', () => {
  const maximumLength = MAX_PROFILE_MONEY / PARCEL_BUILD_WALL_PRICE_PER_METER
  assert.deepEqual(
    calculateParcelBuildPriceDelta([], [wallNode('maximum', [0, 0], [maximumLength, 0])]),
    { cost: MAX_PROFILE_MONEY, ok: true },
  )
  assert.deepEqual(
    calculateParcelBuildPriceDelta([], [wallNode('over-limit', [0, 0], [maximumLength + 1, 0])]),
    {
      code: 'build-price-limit',
      message: 'Build price exceeds the supported profile-money limit',
      ok: false,
    },
  )
})

test('normalizes multiplayer room ids consistently for clients and servers', () => {
  assert.equal(sanitizeMultiplayerRoomId(undefined), DEFAULT_MULTIPLAYER_ROOM_ID)
  assert.equal(sanitizeMultiplayerRoomId('  island room/1  '), 'island-room-1')
  assert.equal(
    sanitizeMultiplayerRoomId('x'.repeat(MAX_MULTIPLAYER_ROOM_ID_LENGTH + 1)),
    'x'.repeat(MAX_MULTIPLAYER_ROOM_ID_LENGTH),
  )
})

test('shares a bounded persistent profile wallet contract', () => {
  assert.equal(DEFAULT_PROFILE_MONEY, 100)
  assert.equal(MAX_PROFILE_MONEY, 1_000_000_000)
  assert.equal(ZOMBIE_ESCAPE_KILL_REWARD, 10)

  const wallet = {
    balance: 37,
    ignored: true,
    profileId: 'player-1',
    revision: 4,
    updatedAt: 123_456,
  }
  assert.equal(isProfileWalletSnapshot(wallet), true)
  assert.deepEqual(sanitizeProfileWalletSnapshot(wallet), {
    balance: 37,
    profileId: 'player-1',
    revision: 4,
    updatedAt: 123_456,
  })

  for (const overrides of [
    { profileId: '' },
    { balance: -1 },
    { balance: 1.5 },
    { balance: MAX_PROFILE_MONEY + 1 },
    { revision: -1 },
    { updatedAt: Number.POSITIVE_INFINITY },
  ]) {
    const value = { ...wallet, ...overrides }
    assert.equal(isProfileWalletSnapshot(value), false)
    assert.equal(sanitizeProfileWalletSnapshot(value), undefined)
  }
})

test('validates stable idempotent profile money operations and writer envelopes', () => {
  assert.equal(sanitizeProfileMoneyOperationId(' reward / 1 '), 'reward---1')
  assert.equal(
    sanitizeProfileMoneyOperationId('x'.repeat(MAX_PROFILE_MONEY_OPERATION_ID_LENGTH + 1)),
    'x'.repeat(MAX_PROFILE_MONEY_OPERATION_ID_LENGTH),
  )

  const reward = {
    baseRevision: 2,
    kind: 'zombie-kill-reward',
    operationId: 'reward:session-1:night-2:zombie-3',
  }
  const purchase = {
    baseRevision: 3,
    cost: 50,
    kind: 'weapon-purchase',
    operationId: 'purchase:player-1:4',
  }
  assert.equal(isProfileMoneyOperation(reward), true)
  assert.equal(isProfileMoneyOperation(purchase), true)
  assert.deepEqual(sanitizeProfileMoneyOperation({ ...purchase, ignored: true }), purchase)
  assert.equal(
    isApplyProfileMoneyOperationMessage({
      operation: purchase,
      type: 'apply-profile-money-operation',
      writerEpoch: 2,
      writerSessionId: 'writer-1',
    }),
    true,
  )

  for (const value of [
    { ...reward, baseRevision: -1 },
    { ...reward, operationId: ' reward ' },
    { ...purchase, cost: 0 },
    { ...purchase, cost: 1.5 },
    { ...purchase, cost: MAX_PROFILE_MONEY + 1 },
  ]) {
    assert.equal(isProfileMoneyOperation(value), false)
    assert.equal(sanitizeProfileMoneyOperation(value), undefined)
  }
  assert.equal(
    isApplyProfileMoneyOperationMessage({
      operation: purchase,
      type: 'apply-profile-money-operation',
      writerSessionId: 'writer-1',
    }),
    false,
  )
})

test('validates Zombie Escape death reports against a positive session night', () => {
  const report = {
    night: 2,
    sessionId: 'zombie-session',
    type: 'report-zombie-escape-death',
  }
  assert.equal(isReportZombieEscapeDeathMessage(report), true)
  for (const overrides of [
    { night: 0 },
    { night: 1.5 },
    { sessionId: '' },
    { sessionId: 'x'.repeat(81) },
    { type: 'player-died' },
  ]) {
    assert.equal(isReportZombieEscapeDeathMessage({ ...report, ...overrides }), false)
  }
})

test('accepts only supported multiplayer presentation poses', () => {
  assert.equal(isMultiplayerPlayerPose('crouching'), true)
  assert.equal(isMultiplayerPlayerPose('falling'), true)
  assert.equal(isMultiplayerPlayerPose('standing'), false)
  assert.equal(isMultiplayerPlayerPose(undefined), false)
})

test('preserves bounded combat state and strips unrelated payload fields', () => {
  const combat = combatSnapshot()
  const sanitized = sanitizeMultiplayerPlayerCombatSnapshot({
    ...combat,
    ignored: 'not part of the wire contract',
    shots: combat.shots.map((shot) => ({ ...shot, ignored: true })),
  })
  assert.equal(isMultiplayerPlayerCombatSnapshot(combat), true)
  assert.deepEqual(sanitized, combat)
  combat.shots[0].position[0] = 999
  assert.equal(sanitized.shots[0].position[0], 1)
})

test('rejects malformed combat state before it reaches a remote weapon rig', () => {
  for (const overrides of [
    { aimAngle: Number.NaN },
    { ammo: -1 },
    { ammo: 1.5 },
    { weaponIndex: -1 },
    { weaponIndex: 5 },
    { weaponIndex: 0.5 },
    { meleePhase: 'unknown' },
    { meleeProgress: 1.1 },
    { shotSequence: -1 },
    { shotSequence: 0x1_0000_0000 },
    { shots: Array(MAX_MULTIPLAYER_COMBAT_SHOTS + 1).fill(combatSnapshot().shots[0]) },
    { shots: [{ ...combatSnapshot().shots[0], position: [0, Number.POSITIVE_INFINITY, 0] }] },
    { shots: [{ ...combatSnapshot().shots[0], previousPosition: [0, 1] }] },
    { shots: [{ ...combatSnapshot().shots[0], impactAge: -1 }] },
    { shots: [null] },
  ]) {
    const value = { ...combatSnapshot(), ...overrides }
    assert.equal(isMultiplayerPlayerCombatSnapshot(value), false)
    assert.equal(sanitizeMultiplayerPlayerCombatSnapshot(value), undefined)
  }
  assert.equal(sanitizeMultiplayerPlayerCombatSnapshot(undefined), undefined)
  assert.equal(sanitizeMultiplayerPlayerCombatSnapshot(null), undefined)
})

test('shares and validates the canonical Zombie Escape room clock contract', () => {
  assert.equal(MULTIPLAYER_ZOMBIE_ESCAPE_BUILD_DURATION_MS, 60_000)
  assert.equal(MULTIPLAYER_ZOMBIE_ESCAPE_NIGHT_DURATION_MS, 180_000)

  const held = zombieEscapeState()
  const active = {
    ...held,
    ignored: 'not part of the wire contract',
    night: 3,
    phase: 'night',
    phaseEndsAt: 123_456,
    revision: 7,
  }
  assert.equal(isMultiplayerZombieEscapeStateSnapshot(held), true)
  assert.equal(isMultiplayerZombieEscapeStateSnapshot(active), true)
  assert.deepEqual(sanitizeMultiplayerZombieEscapeStateSnapshot(active), {
    night: 3,
    phase: 'night',
    phaseEndsAt: 123_456,
    revision: 7,
    sessionId: 'zombie-session',
  })
})

test('rejects malformed Zombie Escape room clocks', () => {
  for (const overrides of [
    { sessionId: '' },
    { sessionId: 'x'.repeat(81) },
    { revision: -1 },
    { revision: 1.5 },
    { phase: 'day' },
    { night: -1 },
    { night: 1.5 },
    { phase: 'night', night: 0 },
    { phaseEndsAt: -1 },
    { phaseEndsAt: 1.5 },
    { phaseEndsAt: Number.POSITIVE_INFINITY },
  ]) {
    const value = { ...zombieEscapeState(), ...overrides }
    assert.equal(isMultiplayerZombieEscapeStateSnapshot(value), false)
    assert.equal(sanitizeMultiplayerZombieEscapeStateSnapshot(value), undefined)
  }
  assert.equal(sanitizeMultiplayerZombieEscapeStateSnapshot(undefined), undefined)
  assert.equal(sanitizeMultiplayerZombieEscapeStateSnapshot(null), undefined)
})

function combatSnapshot() {
  return {
    aimAngle: 1.2,
    ammo: 59,
    meleePhase: 'idle',
    meleeProgress: 0,
    shotSequence: 1,
    shots: [{ id: 8, impactAge: null, position: [1, 2, 3], previousPosition: [0, 2, 3], weaponIndex: 0 }],
    weaponIndex: 0,
  }
}

function wallNode(id, start, end, curveOffset) {
  return {
    ...(curveOffset === undefined ? {} : { curveOffset }),
    end,
    id,
    start,
    type: 'wall',
  }
}

function leanToCompositeGraph() {
  const ids = {
    downspout: 'lean-to-downspout',
    gutter: 'lean-to-gutter',
    leanTo: 'lean-to',
    level: 'level',
    post: 'lean-to-post',
    roof: 'lean-to-roof',
    segment: 'lean-to-roof-segment',
    wall: 'wall',
  }
  const level = { children: [ids.wall], id: ids.level, parentId: null, type: 'level' }
  const wall = {
    ...wallNode(ids.wall, [0, 0], [4, 0]),
    children: [ids.leanTo],
    parentId: ids.level,
  }
  const baseline = [level, { ...wall, children: [] }]
  const leanTo = {
    children: [ids.roof, ids.post],
    id: ids.leanTo,
    parentId: ids.wall,
    type: 'lean-to-extension',
  }
  const roof = {
    children: [ids.segment],
    id: ids.roof,
    metadata: { leanToRole: 'roof', managedByLeanTo: ids.leanTo },
    parentId: ids.leanTo,
    type: 'roof',
  }
  const segment = {
    children: [ids.gutter, ids.downspout],
    id: ids.segment,
    metadata: { leanToRole: 'roof-segment', managedByLeanTo: ids.leanTo },
    parentId: ids.roof,
    type: 'roof-segment',
  }
  const gutter = {
    children: [],
    id: ids.gutter,
    metadata: { leanToRole: 'gutter', managedByLeanTo: ids.leanTo },
    parentId: ids.segment,
    type: 'gutter',
  }
  const downspout = {
    children: [],
    id: ids.downspout,
    metadata: { leanToRole: 'downspout', managedByLeanTo: ids.leanTo },
    parentId: ids.segment,
    type: 'downspout',
  }
  const post = {
    children: [],
    id: ids.post,
    metadata: {
      leanToPostIndex: 0,
      leanToPostSide: 'low',
      leanToRole: 'post',
      managedByLeanTo: ids.leanTo,
    },
    parentId: ids.leanTo,
    type: 'column',
  }
  return { baseline, graph: [level, wall, leanTo, roof, segment, gutter, downspout, post], ids }
}

function zombieEscapeState() {
  return {
    night: 0,
    phase: 'build',
    phaseEndsAt: null,
    revision: 0,
    sessionId: 'zombie-session',
  }
}

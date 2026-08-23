import { afterEach, describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeDefinition,
  BuildingNode,
  CeilingNode,
  ColumnNode,
  computeStairSegmentChainTransforms,
  ItemNode,
  LevelNode,
  nodeRegistry,
  registerNode,
  SlabNode,
  StairNode,
  StairSegmentNode,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { buildFirstPersonColliderWorldFromRegistry } from './pascal-first-person-collider-world'

function registerColliderDefinition(
  kind: AnyNode['type'],
  schema: AnyNodeDefinition['schema'],
  category: AnyNodeDefinition['category'],
  surfaceRole?: AnyNodeDefinition['surfaceRole'],
) {
  registerNode({
    capabilities: {},
    category,
    kind,
    schema,
    schemaVersion: 1,
    surfaceRole,
  } as AnyNodeDefinition)
}

function createItem(id: `item_${string}`, parentId: string | null = null) {
  return ItemNode.parse({
    asset: {
      category: 'test',
      id: `asset_${id}`,
      name: id,
      src: 'asset://test/item.glb',
      thumbnail: 'data:image/png;base64,',
    },
    id,
    parentId,
  })
}

function createColliderRoot(
  node: AnyNode,
  position: [number, number, number],
  box: [number, number, number] = [1, 2, 1],
) {
  const root = new Group()
  root.position.set(...position)
  const mesh = new Mesh(new BoxGeometry(...box), new MeshBasicMaterial())
  mesh.position.y = box[1] / 2
  root.add(mesh)
  sceneRegistry.nodes.set(node.id, root)
  sceneRegistry.byType[node.type]!.add(node.id)
  return root
}

function setSceneNodes(nodes: AnyNode[]) {
  useScene.setState({
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    rootNodeIds: nodes.map((node) => node.id),
  } as never)
}

function hasTopDownColliderAt(
  world: NonNullable<ReturnType<typeof buildFirstPersonColliderWorldFromRegistry>>,
  x: number,
  z = 0,
) {
  const raycaster = new Raycaster(new Vector3(x, 30, z), new Vector3(0, -1, 0), 0, 60)
  return raycaster.intersectObject(world.mesh, false).length > 0
}

function hasBottomUpColliderAt(
  world: NonNullable<ReturnType<typeof buildFirstPersonColliderWorldFromRegistry>>,
  x: number,
) {
  const raycaster = new Raycaster(new Vector3(x, -10, 0), new Vector3(0, 1, 0), 0, 20)
  return raycaster.intersectObject(world.mesh, false).length > 0
}

function hasHorizontalColliderAt(
  world: NonNullable<ReturnType<typeof buildFirstPersonColliderWorldFromRegistry>>,
  y: number,
  z = 0,
) {
  const raycaster = new Raycaster(new Vector3(-10, y, z), new Vector3(1, 0, 0), 0, 30)
  return raycaster.intersectObject(world.mesh, false).length > 0
}

describe('buildFirstPersonColliderWorldFromRegistry exclusions', () => {
  afterEach(() => {
    sceneRegistry.clear()
    nodeRegistry._reset()
    useScene.setState({ nodes: {}, rootNodeIds: [] } as never)
  })

  test('keeps default behavior when no exclusion set is supplied', () => {
    registerColliderDefinition('item', ItemNode, 'furnish')
    const item = createItem('item_default')
    setSceneNodes([item])
    createColliderRoot(item, [3, 0, 0], [2, 2, 2]).updateMatrixWorld(true)

    const defaultWorld = buildFirstPersonColliderWorldFromRegistry()
    const explicitEmptyWorld = buildFirstPersonColliderWorldFromRegistry(new Set())

    expect(defaultWorld?.bounds?.min.toArray()).toEqual(explicitEmptyWorld?.bounds?.min.toArray())
    expect(defaultWorld?.bounds?.max.toArray()).toEqual(explicitEmptyWorld?.bounds?.max.toArray())
    defaultWorld?.dispose()
    explicitEmptyWorld?.dispose()
  })

  test('removes an excluded item while retaining its parent and sibling colliders', () => {
    registerColliderDefinition('column', ColumnNode, 'structure')
    registerColliderDefinition('item', ItemNode, 'furnish')
    const parent = ColumnNode.parse({ id: 'column_parent' })
    const excludedItem = createItem('item_excluded', parent.id)
    const siblingItem = createItem('item_sibling', parent.id)
    setSceneNodes([parent, excludedItem, siblingItem])

    const parentRoot = createColliderRoot(parent, [0, 0, 0])
    const excludedRoot = createColliderRoot(excludedItem, [4, 0, 0])
    const siblingRoot = createColliderRoot(siblingItem, [8, 0, 0])
    parentRoot.add(excludedRoot, siblingRoot)
    parentRoot.updateMatrixWorld(true)

    const world = buildFirstPersonColliderWorldFromRegistry(new Set([excludedItem.id]))

    expect(world).not.toBeNull()
    if (!world) return
    expect(hasTopDownColliderAt(world, 0)).toBe(true)
    expect(hasTopDownColliderAt(world, 4)).toBe(false)
    expect(hasTopDownColliderAt(world, 8)).toBe(true)
    world.dispose()
  })

  test('keeps an excluded nested registered child out of its parent traversal', () => {
    registerColliderDefinition('column', ColumnNode, 'structure')
    registerColliderDefinition('ceiling', CeilingNode, 'structure', 'ceiling')
    const parent = ColumnNode.parse({ id: 'column_parent' })
    const nestedCeiling = CeilingNode.parse({
      id: 'ceiling_nested',
      parentId: parent.id,
      polygon: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    })
    setSceneNodes([parent, nestedCeiling])

    const parentRoot = createColliderRoot(parent, [0, 0, 0])
    const nestedRoot = createColliderRoot(nestedCeiling, [4, 0, 0])
    parentRoot.add(nestedRoot)
    parentRoot.updateMatrixWorld(true)

    const defaultWorld = buildFirstPersonColliderWorldFromRegistry()
    const excludedWorld = buildFirstPersonColliderWorldFromRegistry(new Set([nestedCeiling.id]))

    expect(defaultWorld).not.toBeNull()
    expect(excludedWorld).not.toBeNull()
    if (defaultWorld && excludedWorld) {
      expect(hasTopDownColliderAt(defaultWorld, 4)).toBe(true)
      expect(hasTopDownColliderAt(excludedWorld, 0)).toBe(true)
      expect(hasTopDownColliderAt(excludedWorld, 4)).toBe(false)
    }
    defaultWorld?.dispose()
    excludedWorld?.dispose()
  })

  test('builds the same standable open-table top before and after its model mounts', () => {
    registerColliderDefinition('item', ItemNode, 'furnish')
    const item = ItemNode.parse({
      asset: {
        category: 'tables',
        dimensions: [2, 1, 1],
        id: 'asset_semantic_table',
        name: 'Semantic table',
        src: 'asset://test/table.glb',
        surface: { height: 0.8 },
        tags: ['table', 'dining'],
        thumbnail: 'data:image/png;base64,',
      },
      id: 'item_semantic_table',
      scale: [1.5, 2, 0.5],
    })
    setSceneNodes([item])
    const root = new Group()
    root.position.set(3, 0.25, 0)
    sceneRegistry.nodes.set(item.id, root)
    sceneRegistry.byType.item!.add(item.id)
    root.updateMatrixWorld(true)

    const coldWorld = buildFirstPersonColliderWorldFromRegistry()
    expect(coldWorld).not.toBeNull()
    if (!coldWorld) return
    const coldPositionCount = coldWorld.mesh.geometry.getAttribute('position').count
    expect(coldWorld.bounds?.min.x).toBeCloseTo(1.5, 6)
    expect(coldWorld.bounds?.min.y).toBeCloseTo(1.77, 6)
    expect(coldWorld.bounds?.min.z).toBeCloseTo(-0.25, 6)
    expect(coldWorld.bounds?.max.x).toBeCloseTo(4.5, 6)
    expect(coldWorld.bounds?.max.y).toBeCloseTo(1.85, 6)
    expect(coldWorld.bounds?.max.z).toBeCloseTo(0.25, 6)
    expect(hasTopDownColliderAt(coldWorld, 3)).toBe(true)
    expect(hasBottomUpColliderAt(coldWorld, 3)).toBe(true)
    expect(hasHorizontalColliderAt(coldWorld, 1, 0)).toBe(false)

    const lateModel = new Mesh(new BoxGeometry(20, 20, 20), new MeshBasicMaterial())
    root.add(lateModel)
    root.updateMatrixWorld(true)
    const warmWorld = buildFirstPersonColliderWorldFromRegistry()

    expect(warmWorld).not.toBeNull()
    expect(warmWorld?.bounds?.min.toArray()).toEqual(coldWorld.bounds?.min.toArray())
    expect(warmWorld?.bounds?.max.toArray()).toEqual(coldWorld.bounds?.max.toArray())
    expect(warmWorld?.mesh.geometry.getAttribute('position').count).toBe(coldPositionCount)

    coldWorld.dispose()
    warmWorld?.dispose()
    lateModel.geometry.dispose()
    ;(lateModel.material as MeshBasicMaterial).dispose()
  })

  test('builds an upstairs open-table support from canonical graph data before any renderer root mounts', () => {
    const building = BuildingNode.parse({ position: [5, 0.4, -2] })
    const ground = LevelNode.parse({ height: 3, level: 0, parentId: building.id })
    const upper = LevelNode.parse({ baseElevation: 0, level: 1, parentId: building.id })
    const table = ItemNode.parse({
      asset: {
        category: 'tables',
        dimensions: [2.5, 0.8, 1],
        id: 'asset_cold_upper_table',
        name: 'Cold upper table',
        src: 'asset://test/upper-table.glb',
        surface: { height: 0.8 },
        tags: ['table'],
        thumbnail: 'data:image/png;base64,',
      },
      parentId: upper.id,
      position: [2, 0.05, 1],
    })
    setSceneNodes([building, ground, upper, table])

    const world = buildFirstPersonColliderWorldFromRegistry()

    expect(world).not.toBeNull()
    if (!world) return
    expect(world.bounds?.min.y).toBeCloseTo(4.17, 6)
    expect(world.bounds?.max.y).toBeCloseTo(4.25, 6)
    expect(hasTopDownColliderAt(world, 7, -1)).toBe(true)
    expect(hasHorizontalColliderAt(world, 3.5, -1)).toBe(false)
    world.dispose()
  })
})

describe('buildFirstPersonColliderWorldFromRegistry level floors', () => {
  afterEach(() => {
    sceneRegistry.clear()
    nodeRegistry._reset()
    useScene.setState({ nodes: {}, rootNodeIds: [] } as never)
  })

  test('creates a fallback only for the base level, never across an elevated open area', () => {
    const baseLevel = LevelNode.parse({ id: 'level_base', level: 0 })
    const elevatedLevel = LevelNode.parse({ id: 'level_upper_open', level: 1 })
    setSceneNodes([baseLevel, elevatedLevel])
    createColliderRoot(baseLevel, [0, 0, 0]).updateMatrixWorld(true)
    createColliderRoot(elevatedLevel, [100, 3, 0]).updateMatrixWorld(true)

    const world = buildFirstPersonColliderWorldFromRegistry()

    expect(world).not.toBeNull()
    if (!world) return
    expect(hasTopDownColliderAt(world, 0)).toBe(true)
    expect(hasTopDownColliderAt(world, 100)).toBe(false)
    world.dispose()
  })

  test('keeps an authored upper slab fully solid', () => {
    registerColliderDefinition('slab', SlabNode, 'structure', 'floor')
    const upperSlab = SlabNode.parse({
      id: 'slab_upper',
      parentId: 'level_upper',
      polygon: [
        [-2, -2],
        [2, -2],
        [2, 2],
        [-2, 2],
      ],
    })
    const upperLevel = LevelNode.parse({
      children: [upperSlab.id],
      id: 'level_upper',
      level: 1,
    })
    setSceneNodes([upperLevel, upperSlab])
    createColliderRoot(upperLevel, [100, 3, 0]).updateMatrixWorld(true)
    createColliderRoot(upperSlab, [100, 3, 0], [4, 0.1, 4]).updateMatrixWorld(true)

    const world = buildFirstPersonColliderWorldFromRegistry()

    expect(world).not.toBeNull()
    if (!world) return
    expect(hasTopDownColliderAt(world, 100)).toBe(true)
    expect(hasBottomUpColliderAt(world, 100)).toBe(true)
    world.dispose()
  })
})

describe('buildFirstPersonColliderWorldFromRegistry stair chains', () => {
  afterEach(() => {
    sceneRegistry.clear()
    nodeRegistry._reset()
    useScene.setState({ nodes: {}, rootNodeIds: [] } as never)
  })

  test.each([
    { turnSide: 'left' as const },
    { turnSide: 'right' as const },
  ])('raycasts the rendered $turnSide L- and U-chain footprint through building and stair yaw', ({
    turnSide,
  }) => {
    registerColliderDefinition('stair', StairNode, 'structure')
    const building = BuildingNode.parse({
      position: [9.5, 1.1, -5.75],
      rotation: [0, 0.52, 0],
    })
    const level = LevelNode.parse({ baseElevation: 0.7, level: 0, parentId: building.id })
    const segments = [
      StairSegmentNode.parse({ height: 0.9, length: 4.2, width: 2 }),
      StairSegmentNode.parse({
        attachmentSide: turnSide,
        height: 0.75,
        length: 3.1,
        width: 1.6,
      }),
      StairSegmentNode.parse({
        attachmentSide: turnSide,
        height: 0.6,
        length: 2.4,
        width: 1.2,
      }),
    ]
    const stair = StairNode.parse({
      children: segments.map(({ id }) => id),
      parentId: level.id,
      position: [1.35, 0.2, -0.8],
      rotation: -0.71,
    })
    setSceneNodes([building, level, stair, ...segments])

    const buildingRoot = new Group()
    buildingRoot.position.set(...building.position)
    buildingRoot.rotation.y = building.rotation[1]
    const levelRoot = new Group()
    levelRoot.position.y = level.baseElevation
    const stairRoot = new Group()
    stairRoot.position.set(...stair.position)
    stairRoot.rotation.y = stair.rotation
    buildingRoot.add(levelRoot)
    levelRoot.add(stairRoot)
    buildingRoot.updateMatrixWorld(true)

    const world = buildFirstPersonColliderWorldFromRegistry()
    expect(world).not.toBeNull()
    if (!world) return
    const transforms = computeStairSegmentChainTransforms(segments)
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]!
      const transform = transforms[index]!
      const renderedSegment = new Group()
      renderedSegment.position.set(...transform.position)
      renderedSegment.rotation.y = transform.rotation
      stairRoot.add(renderedSegment)
      buildingRoot.updateMatrixWorld(true)
      for (const localPoint of [
        new Vector3(0, 0, segment.length * 0.55),
        new Vector3(segment.width * 0.32, 0, segment.length * 0.76),
      ]) {
        const renderedPoint = renderedSegment.localToWorld(localPoint)
        expect(hasTopDownColliderAt(world, renderedPoint.x, renderedPoint.z)).toBe(true)
      }
      stairRoot.remove(renderedSegment)
    }
    world.dispose()
  })
})

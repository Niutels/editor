import { mock, spyOn } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'

const registeredFramePriorities: number[] = []
const source = new Group()
source.add(new Mesh(new BoxGeometry(1, 1, 2), new MeshBasicMaterial()))

mock.module('@landrush/runtime', () => ({
  landrushIslandNavigationSegmentIntersectsPolygon: () => false,
  openPointRing: <Point,>(points: readonly Point[]) => points,
  pointInPolygon: () => true,
  pointInPolygonOrNearEdge: () => true,
  pointsAlmostEqual2: () => false,
  renderScheduler: { requestFrame: () => undefined },
  resolveLandrushSemanticItemCollisionProfile: () => null,
  segmentsIntersect2: () => false,
}))
mock.module('@pascal-app/core', () => ({
  computeStairSegmentChainTransforms: () => [],
  DEFAULT_WALL_HEIGHT: 2.4,
  getFloorStackedPosition: () => [0, 0, 0],
  getLevelElevations: () => new Map(),
  isCurvedWall: () => false,
  isSplineFence: () => false,
  resolveStairTotalRise: () => 0,
  sampleFenceCenterline: () => [],
  sampleWallCenterline: () => [],
  useInteractive: (selector: (state: { doors: Record<string, never> }) => unknown) =>
    selector({ doors: {} }),
  useScene: (selector: (state: { nodes: Record<string, never> }) => unknown) =>
    selector({ nodes: {} }),
}))
mock.module('@pascal-app/viewer', () => ({
  useGLTFKTX2: () => ({ scene: source }),
  useGpuResourceLifetime: () => undefined,
}))
mock.module('@react-three/drei', () => ({
  useGLTF: () => ({ animations: [], scene: source }),
}))
mock.module('@react-three/fiber', () => ({
  useFrame: (_callback: unknown, priority = 0) => {
    registeredFramePriorities.push(priority)
  },
}))

const { LandrushIslandMeshyBoat } = await import('./landrush-island-ambient-life')
const { LANDRUSH_ISLAND_AMBIENT_BOATS } = await import('./landrush-island-ambient-catalog')
const boat = LANDRUSH_ISLAND_AMBIENT_BOATS[0]
if (!boat) throw new Error('Expected at least one ambient boat fixture.')

function renderBoat(active: boolean) {
  registeredFramePriorities.length = 0
  const consoleError = spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const markup = renderToStaticMarkup(
      <LandrushIslandMeshyBoat
        active={active}
        boat={boat}
        center={{ x: 0, z: 0 }}
        index={0}
        orbitRadiusX={10}
        orbitRadiusZ={12}
        waterY={0}
      />,
    )
    return { hostMounted: markup.includes('<group'), priorities: [...registeredFramePriorities] }
  } finally {
    consoleError.mockRestore()
  }
}

process.stdout.write(
  JSON.stringify({
    active: renderBoat(true),
    dormant: renderBoat(false),
  }),
)

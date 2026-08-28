import { mock, spyOn } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

const registeredFramePriorities: number[] = []

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
  useGLTFKTX2: () => {
    throw new Error('Ambient asset loading should not start during the initial server render.')
  },
  useGpuResourceLifetime: () => undefined,
}))
mock.module('@react-three/drei', () => ({
  useGLTF: () => {
    throw new Error('Ambient asset loading should not start during the initial server render.')
  },
}))
mock.module('@react-three/fiber', () => ({
  useFrame: (_callback: unknown, priority = 0) => {
    registeredFramePriorities.push(priority)
  },
}))

const { LandrushIslandAmbientLife } = await import('./landrush-island-ambient-life')

const surface = {
  grassSurfaceElevation: 0,
  grassSurfacePoints: [
    { x: -1, z: -1 },
    { x: 1, z: -1 },
    { x: 1, z: 1 },
    { x: -1, z: 1 },
  ],
}

function renderAmbientLife(admitted: boolean, npcsVisible: boolean) {
  registeredFramePriorities.length = 0
  const consoleError = spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const markup = renderToStaticMarkup(
      <LandrushIslandAmbientLife
        admitted={admitted}
        npcsVisible={npcsVisible}
        onLoadReadinessChange={() => undefined}
        palmLayout={[]}
        roads={[]}
        surface={surface as never}
        waterY={0}
        zombieIslandActive={false}
      />,
    )
    return { hostMounted: markup.includes('<group'), priorities: [...registeredFramePriorities] }
  } finally {
    consoleError.mockRestore()
  }
}

process.stdout.write(
  JSON.stringify({
    dormant: renderAmbientLife(false, true),
    fishAndPlanner: renderAmbientLife(true, true),
    fishOnly: renderAmbientLife(true, false),
  }),
)

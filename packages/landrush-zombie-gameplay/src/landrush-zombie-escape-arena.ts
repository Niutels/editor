import { ZOMBIE_ESCAPE_SEED } from './zombie-escape-config'
import { createZombieEscapeArena, type ZombieEscapeArenaData } from './zombie-escape-world'

const MINIMUM_INTEGRATED_PLAY_RADIUS_METERS = 14
const MAXIMUM_INTEGRATED_PLAY_RADIUS_METERS = 48
const INTEGRATED_SHORE_CLEARANCE_METERS = 1.5

export function createLandrushZombieEscapeIntegratedArena(
  surfacePoints: readonly Readonly<{ x: number; z: number }>[],
  spawn: Readonly<{ x: number; z: number }>,
): ZombieEscapeArenaData {
  const edgeDistance = minimumDistanceToPolygonEdges(spawn, surfacePoints)
  return createLandrushZombieEscapeIntegratedArenaFromPlayRadius(
    Math.max(
      MINIMUM_INTEGRATED_PLAY_RADIUS_METERS,
      Math.min(
        MAXIMUM_INTEGRATED_PLAY_RADIUS_METERS,
        edgeDistance - INTEGRATED_SHORE_CLEARANCE_METERS,
      ),
    ),
  )
}

export function createLandrushZombieEscapeIntegratedArenaFromPlayRadius(
  playRadius: number,
): ZombieEscapeArenaData {
  if (!(Number.isFinite(playRadius) && playRadius >= MINIMUM_INTEGRATED_PLAY_RADIUS_METERS)) {
    throw new Error('Landrush Zombie Escape integrated arena requires a finite play radius.')
  }
  const arena = createZombieEscapeArena(ZOMBIE_ESCAPE_SEED)
  return {
    ...arena,
    escapeX: 0,
    escapeZ: -Math.max(10, playRadius - 2),
    obstacleCount: 0,
    playerStartX: 0,
    playerStartZ: 0,
    playRadius,
    radius: playRadius + 3,
  }
}

function minimumDistanceToPolygonEdges(
  point: Readonly<{ x: number; z: number }>,
  polygon: readonly Readonly<{ x: number; z: number }>[],
) {
  if (polygon.length < 2) return 32
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    if (!(start && end)) continue
    const edgeX = end.x - start.x
    const edgeZ = end.z - start.z
    const lengthSquared = edgeX * edgeX + edgeZ * edgeZ
    const amount =
      lengthSquared <= 0.000_001
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - start.x) * edgeX + (point.z - start.z) * edgeZ) / lengthSquared,
            ),
          )
    minimum = Math.min(
      minimum,
      Math.hypot(point.x - (start.x + edgeX * amount), point.z - (start.z + edgeZ * amount)),
    )
  }
  return Number.isFinite(minimum) ? minimum : 32
}

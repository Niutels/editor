import { ZOMBIE_ESCAPE_ARENA } from './zombie-escape-config'
import {
  createZombieEscapeRandomState,
  nextZombieEscapeRandom,
  zombieEscapeRandomRange,
} from './zombie-escape-random'

const SHORE_POINT_COUNT = 56
const OBSTACLE_COUNT = 11
const DECORATION_COUNT = 42

export type ZombieEscapeArenaData = {
  decorationCount: number
  decorationRotation: Float32Array
  decorationScale: Float32Array
  decorationX: Float32Array
  decorationZ: Float32Array
  escapeX: number
  escapeZ: number
  obstacleCount: number
  obstacleKind: Uint8Array
  obstacleRadius: Float32Array
  obstacleScale: Float32Array
  obstacleX: Float32Array
  obstacleZ: Float32Array
  playerStartX: number
  playerStartZ: number
  playRadius: number
  radius: number
  seed: number
  shoreline: Float32Array
}

export function createZombieEscapeArena(seed: number): ZombieEscapeArenaData {
  const random = createZombieEscapeRandomState(seed ^ 0x1a2b_3c4d)
  const shoreline = new Float32Array(SHORE_POINT_COUNT * 2)
  for (let index = 0; index < SHORE_POINT_COUNT; index += 1) {
    const angle = (index / SHORE_POINT_COUNT) * Math.PI * 2
    const authoredWave = Math.sin(angle * 3 + 0.7) * 0.035 + Math.sin(angle * 7 - 1.1) * 0.018
    const radius =
      ZOMBIE_ESCAPE_ARENA.radius *
      (1 + authoredWave + zombieEscapeRandomRange(random, -0.018, 0.018))
    shoreline[index * 2] = Math.sin(angle) * radius
    shoreline[index * 2 + 1] = Math.cos(angle) * radius
  }

  const obstacleX = new Float32Array(OBSTACLE_COUNT)
  const obstacleZ = new Float32Array(OBSTACLE_COUNT)
  const obstacleRadius = new Float32Array(OBSTACLE_COUNT)
  const obstacleScale = new Float32Array(OBSTACLE_COUNT)
  const obstacleKind = new Uint8Array(OBSTACLE_COUNT)
  let placed = 0
  let attempts = 0
  while (placed < OBSTACLE_COUNT && attempts < 800) {
    attempts += 1
    const angle = nextZombieEscapeRandom(random) * Math.PI * 2
    const distance = zombieEscapeRandomRange(random, 5.5, ZOMBIE_ESCAPE_ARENA.playRadius - 3)
    const x = Math.sin(angle) * distance
    const z = Math.cos(angle) * distance
    const radius = zombieEscapeRandomRange(random, 0.85, 1.45)
    if (Math.hypot(x, z - 8) < 4.3 || Math.hypot(x, z + 21) < 4.8) continue
    let clear = true
    for (let index = 0; index < placed; index += 1) {
      if (
        Math.hypot(x - obstacleX[index]!, z - obstacleZ[index]!) <
        radius + obstacleRadius[index]! + 2
      ) {
        clear = false
        break
      }
    }
    if (!clear) continue
    obstacleX[placed] = x
    obstacleZ[placed] = z
    obstacleRadius[placed] = radius
    obstacleScale[placed] = zombieEscapeRandomRange(random, 0.82, 1.28)
    obstacleKind[placed] = placed % 3 === 0 ? 1 : 0
    placed += 1
  }

  const decorationX = new Float32Array(DECORATION_COUNT)
  const decorationZ = new Float32Array(DECORATION_COUNT)
  const decorationScale = new Float32Array(DECORATION_COUNT)
  const decorationRotation = new Float32Array(DECORATION_COUNT)
  for (let index = 0; index < DECORATION_COUNT; index += 1) {
    const angle = nextZombieEscapeRandom(random) * Math.PI * 2
    const distance = zombieEscapeRandomRange(random, 3, ZOMBIE_ESCAPE_ARENA.playRadius - 1.4)
    decorationX[index] = Math.sin(angle) * distance
    decorationZ[index] = Math.cos(angle) * distance
    decorationScale[index] = zombieEscapeRandomRange(random, 0.65, 1.35)
    decorationRotation[index] = nextZombieEscapeRandom(random) * Math.PI * 2
  }

  return {
    decorationCount: DECORATION_COUNT,
    decorationRotation,
    decorationScale,
    decorationX,
    decorationZ,
    escapeX: 0,
    escapeZ: -21.2,
    obstacleCount: placed,
    obstacleKind,
    obstacleRadius,
    obstacleScale,
    obstacleX,
    obstacleZ,
    playerStartX: 0,
    playerStartZ: 8,
    playRadius: ZOMBIE_ESCAPE_ARENA.playRadius,
    radius: ZOMBIE_ESCAPE_ARENA.radius,
    seed,
    shoreline,
  }
}

import { describe, expect, test } from 'bun:test'
import { createLandrushIslandAmbientNavigationWorld } from '@landrush/runtime/landrush-island-ambient-navigation'
import { ZOMBIE_ESCAPE_SEED } from '@landrush/zombie-gameplay/zombie-escape-config'
import { ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS } from '@landrush/zombie-gameplay/zombie-escape-zombie-roster'
import { createZombieGameAmbient } from './zombie-game-ambient'

const world = createLandrushIslandAmbientNavigationWorld({
  surfacePoints: [
    { x: -30, z: -30 },
    { x: 30, z: -30 },
    { x: 30, z: 30 },
    { x: -30, z: 30 },
  ],
  obstacles: [],
  roads: [],
})
const origin = { x: 2, y: 0.04, z: -3 }
const durations = ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS.map(() => ({ idle: 2, walk: 1, run: 0.7 }))

describe('server-owned civilians and night handoff', () => {
  test('moves the real civilian simulation and captures those exact current poses', () => {
    const ambient = createZombieGameAmbient(world, origin, ZOMBIE_ESCAPE_SEED, durations)
    const first = ambient.snapshots.map((npc) => ({ ...npc }))
    for (let frame = 0; frame < 900; frame++) expect(ambient.step(1 / 60)).toBeLessThanOrEqual(128)
    expect(
      ambient.snapshots.some(
        (npc, index) => Math.hypot(npc.x - first[index]!.x, npc.z - first[index]!.z) > 1,
      ),
    ).toBe(true)
    for (const npc of ambient.snapshots) {
      expect(ambient.handoff.x[npc.index]! + origin.x).toBeCloseTo(npc.x, 4)
      expect(ambient.handoff.z[npc.index]! + origin.z).toBeCloseTo(npc.z, 4)
      expect(ambient.handoff.y[npc.index]!).toBeCloseTo(npc.y, 4)
      expect(npc.locomotionPhase).toBeLessThan(Math.PI * 2)
      expect(ambient.handoff.valid[npc.index]).toBe(1)
    }
    ambient.dispose()
  })

  test('is deterministic and preserves legal poses across a canonical world refresh', () => {
    const first = createZombieGameAmbient(world, origin, ZOMBIE_ESCAPE_SEED, durations)
    const second = createZombieGameAmbient(world, origin, ZOMBIE_ESCAPE_SEED, durations)
    for (let frame = 0; frame < 420; frame++) {
      first.step(1 / 60)
      second.step(1 / 60)
    }
    expect(first.snapshots).toEqual(second.snapshots)
    const positions = first.snapshots.map(({ x, z }) => ({ x, z }))
    first.setWorld(world)
    expect(first.snapshots.map(({ x, z }) => ({ x, z }))).toEqual(positions)
    first.dispose()
    second.dispose()
  })
})

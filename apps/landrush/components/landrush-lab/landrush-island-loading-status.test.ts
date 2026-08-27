import { describe, expect, test } from 'bun:test'
import {
  LANDRUSH_ISLAND_LOADING_INITIAL_STATUS,
  resolveLandrushIslandLoadingStatus,
} from './landrush-island-loading-status'
import type { LandrushIslandLoadingTaskSnapshot } from './landrush-island-loading-timeline'

function task(id: string, ready: boolean): LandrushIslandLoadingTaskSnapshot {
  return { completed: ready ? 1 : 0, id, ready, total: 1 }
}

const ZOMBIE_TASK_IDS = [
  'initial-parcel',
  'natural-road-plan',
  'viewer-scene',
  'procedural-cliffs',
  'ground-texture',
  'world-frame',
  'ambient-assets',
  'zombie-assets',
  'zombie-pipeline',
  'paint',
  '@landrush/document-ready',
] as const

function zombieTasks(firstPendingId?: (typeof ZOMBIE_TASK_IDS)[number]) {
  const pendingIndex = firstPendingId ? ZOMBIE_TASK_IDS.indexOf(firstPendingId) : -1
  return ZOMBIE_TASK_IDS.map((id, index) => task(id, pendingIndex < 0 || index < pendingIndex))
}

describe('Landrush island loading status', () => {
  test.each([
    ['initial-parcel', 0, 'Surveying the island'],
    ['viewer-scene', 1, 'Raising roads and cliffs'],
    ['world-frame', 2, 'Hiding the goblins'],
    ['zombie-assets', 3, 'Staging weapons and infected'],
    ['zombie-pipeline', 4, 'Rallying the horde'],
    ['paint', 5, 'Watching the perimeter'],
  ] as const)('maps the first unfinished Zombie Escape group at %s', (id, rank, text) => {
    expect(resolveLandrushIslandLoadingStatus(zombieTasks(id))).toEqual({ rank, text })
  })

  test('announces the playable handoff only after every readiness task finishes', () => {
    expect(resolveLandrushIslandLoadingStatus(zombieTasks())).toEqual({
      rank: 6,
      text: 'Almost ready',
    })
  })

  test('keeps the shared loader copy appropriate outside Zombie Escape', () => {
    expect(
      resolveLandrushIslandLoadingStatus([
        task('initial-parcel', false),
        task('viewer-scene', false),
        task('paint', false),
      ]),
    ).toEqual({ rank: 0, text: LANDRUSH_ISLAND_LOADING_INITIAL_STATUS })
  })
})

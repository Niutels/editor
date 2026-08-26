import type { LandrushIslandLoadingTaskSnapshot } from './landrush-island-loading-timeline'

export const LANDRUSH_ISLAND_LOADING_INITIAL_STATUS = 'Surveying the island'

export type LandrushIslandLoadingStatus = Readonly<{
  rank: number
  text: string
}>

const INITIAL_WORLD_TASK_IDS = ['initial-parcel', 'natural-road-plan'] as const
const TERRAIN_TASK_IDS = ['viewer-scene', 'procedural-cliffs', 'ground-texture'] as const
const LIVING_WORLD_TASK_IDS = ['world-frame', 'ambient-assets'] as const
const ZOMBIE_ASSET_TASK_IDS = ['zombie-assets'] as const
const ZOMBIE_PIPELINE_TASK_IDS = ['zombie-pipeline'] as const
const FINAL_PRESENTATION_TASK_IDS = ['paint', '@landrush/document-ready'] as const

export function resolveLandrushIslandLoadingStatus(
  tasks: readonly LandrushIslandLoadingTaskSnapshot[],
): LandrushIslandLoadingStatus {
  const zombieEscape = tasks.some((task) => task.id === 'zombie-assets')

  if (hasPendingTask(tasks, INITIAL_WORLD_TASK_IDS)) {
    return { rank: 0, text: LANDRUSH_ISLAND_LOADING_INITIAL_STATUS }
  }
  if (hasPendingTask(tasks, TERRAIN_TASK_IDS)) {
    return { rank: 1, text: 'Raising roads and cliffs' }
  }
  if (hasPendingTask(tasks, LIVING_WORLD_TASK_IDS)) {
    return {
      rank: 2,
      text: zombieEscape ? 'Hiding the goblins' : 'Stirring the shoreline',
    }
  }
  if (hasPendingTask(tasks, ZOMBIE_ASSET_TASK_IDS)) {
    return { rank: 3, text: 'Staging weapons and infected' }
  }
  if (hasPendingTask(tasks, ZOMBIE_PIPELINE_TASK_IDS)) {
    return { rank: 4, text: 'Rallying the horde' }
  }
  if (hasPendingTask(tasks, FINAL_PRESENTATION_TASK_IDS) || tasks.some((task) => !task.ready)) {
    return { rank: 5, text: zombieEscape ? 'Watching the perimeter' : 'Settling the horizon' }
  }
  return { rank: 6, text: zombieEscape ? 'Ready to run' : 'Ready to explore' }
}

function hasPendingTask(
  tasks: readonly LandrushIslandLoadingTaskSnapshot[],
  taskIds: readonly string[],
) {
  return taskIds.some((taskId) => tasks.some((task) => task.id === taskId && !task.ready))
}

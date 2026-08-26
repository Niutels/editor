export type LandrushIslandFishBatch = {
  id: string
  instanceCount: number
  update: (timeSeconds: number, waterY: number, phase: number, phaseCount: number) => void
}

export type LandrushIslandFishRuntime = ReturnType<typeof createLandrushIslandFishRuntime>

export const LANDRUSH_ISLAND_FISH_UPDATE_PHASE_COUNT = 2

export function createLandrushIslandFishRuntime() {
  const batches: LandrushIslandFishBatch[] = []
  let instanceCount = 0
  let updatePhase = 0

  return {
    advance(timeSeconds: number, waterY: number) {
      const phase = updatePhase
      updatePhase = (updatePhase + 1) % LANDRUSH_ISLAND_FISH_UPDATE_PHASE_COUNT
      for (let index = 0; index < batches.length; index += 1) {
        batches[index]?.update(timeSeconds, waterY, phase, LANDRUSH_ISLAND_FISH_UPDATE_PHASE_COUNT)
      }
    },
    register(batch: LandrushIslandFishBatch) {
      if (batches.some((candidate) => candidate.id === batch.id)) {
        throw new Error(`Fish batch ${batch.id} is already registered.`)
      }
      batches.push(batch)
      instanceCount += batch.instanceCount
      let registered = true
      return () => {
        if (!registered) return
        registered = false
        const index = batches.indexOf(batch)
        if (index < 0) return
        batches.splice(index, 1)
        instanceCount -= batch.instanceCount
      }
    },
    snapshot() {
      return {
        batchCount: batches.length,
        instanceCount,
        updatePhaseCount: LANDRUSH_ISLAND_FISH_UPDATE_PHASE_COUNT,
      }
    },
  }
}

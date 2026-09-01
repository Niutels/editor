import type { AnimationAction } from 'three'

type LandrushRobotActionTarget = {
  action: AnimationAction | null
  timeScaleSum: number
  weight: number
  weightedTimeScale: number
}

function createLandrushRobotActionTarget(): LandrushRobotActionTarget {
  return {
    action: null,
    timeScaleSum: 0,
    weight: 0,
    weightedTimeScale: 0,
  }
}

export class LandrushRobotActionTargetAccumulator {
  private length = 0
  private readonly targets = [
    createLandrushRobotActionTarget(),
    createLandrushRobotActionTarget(),
    createLandrushRobotActionTarget(),
  ] as const

  reset() {
    for (let index = 0; index < this.length; index += 1) {
      const target = this.targets[index]
      if (target) target.action = null
    }
    this.length = 0
  }

  add(action: AnimationAction | null, weight: number, timeScale: number) {
    if (!action) return

    const nextWeight = Math.max(0, Math.min(weight, 1))
    for (let index = 0; index < this.length; index += 1) {
      const target = this.targets[index]
      if (target?.action !== action) continue
      target.weight += nextWeight
      target.timeScaleSum += nextWeight > Number.EPSILON ? timeScale * nextWeight : 0
      target.weightedTimeScale += nextWeight
      return
    }

    const target = this.targets[this.length]
    if (!target) throw new Error('Landrush robot locomotion supports at most three actions')
    target.action = action
    target.timeScaleSum = nextWeight > Number.EPSILON ? timeScale * nextWeight : 0
    target.weight = nextWeight
    target.weightedTimeScale = nextWeight
    this.length += 1
  }

  get(action: AnimationAction) {
    for (let index = 0; index < this.length; index += 1) {
      const target = this.targets[index]
      if (target?.action === action) return target
    }
    return null
  }
}

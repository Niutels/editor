import type { ProfileMoneyOperationRequest } from '@landrush/runtime'
import {
  resolveZombieEscapeWeaponPurchaseCost,
  type ZombieEscapeGameStatus,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'

export type LandrushZombieEscapeProfileMoneyOperation = (
  operation: ProfileMoneyOperationRequest,
) => number | null

export type LandrushZombieEscapeEconomyCheckpoint = Readonly<{
  kills: number
  money: number
  purchaseCost: number | null
  weaponPurchaseCount: number
}>

export function captureLandrushZombieEscapeEconomyCheckpoint(
  simulation: ZombieEscapeSimulation,
): LandrushZombieEscapeEconomyCheckpoint {
  const pickup = simulation.weaponPickups[simulation.nearbyPickupIndex]
  const purchaseCost = pickup
    ? resolveZombieEscapeWeaponPurchaseCost(simulation, pickup.weaponIndex)
    : Number.POSITIVE_INFINITY
  return {
    kills: simulation.kills,
    money: simulation.money,
    purchaseCost: Number.isFinite(purchaseCost) ? purchaseCost : null,
    weaponPurchaseCount: simulation.weaponPurchaseCount,
  }
}

export function applyLandrushZombieEscapeProfileMoneyOperations({
  checkpoint,
  onOperation,
  simulation,
}: {
  checkpoint: LandrushZombieEscapeEconomyCheckpoint
  onOperation: LandrushZombieEscapeProfileMoneyOperation | undefined
  simulation: ZombieEscapeSimulation
}) {
  if (!onOperation) return simulation.money
  const purchases = Math.max(0, simulation.weaponPurchaseCount - checkpoint.weaponPurchaseCount)
  if (purchases > 0 && checkpoint.purchaseCost !== null) {
    for (let index = 0; index < purchases; index += 1) {
      adoptProjectedMoneyBalance(
        simulation,
        onOperation({ cost: checkpoint.purchaseCost, kind: 'weapon-purchase' }),
      )
    }
  }
  const kills = Math.max(0, simulation.kills - checkpoint.kills)
  for (let index = 0; index < kills; index += 1) {
    adoptProjectedMoneyBalance(simulation, onOperation({ kind: 'zombie-kill-reward' }))
  }
  return simulation.money
}

export function hydrateLandrushZombieEscapeProfileMoney(
  simulation: ZombieEscapeSimulation,
  balance: number | undefined,
) {
  if (balance === undefined || !Number.isFinite(balance)) return false
  simulation.money = Math.max(0, balance)
  return true
}

export function resolveLandrushZombieEscapeDeathAction({
  clockMode,
  status,
}: {
  clockMode: 'offline-local' | 'online-canonical' | 'online-waiting'
  status: ZombieEscapeGameStatus
}) {
  if (status !== 'lost') return 'none'
  if (clockMode === 'offline-local') return 'enter-build'
  if (clockMode === 'online-canonical') return 'report-death'
  return 'none'
}

export function shouldAttemptLandrushZombieEscapeDeathReport({
  clockMode,
  nextAttemptAtSeconds,
  nowSeconds,
  reported,
  status,
}: {
  clockMode: 'offline-local' | 'online-canonical' | 'online-waiting'
  nextAttemptAtSeconds: number
  nowSeconds: number
  reported: boolean
  status: ZombieEscapeGameStatus
}) {
  return (
    clockMode === 'online-canonical' &&
    status === 'lost' &&
    !reported &&
    nowSeconds >= nextAttemptAtSeconds
  )
}

function adoptProjectedMoneyBalance(
  simulation: ZombieEscapeSimulation,
  projectedBalance: number | null,
) {
  if (projectedBalance === null || !Number.isFinite(projectedBalance)) return
  simulation.money = Math.max(0, projectedBalance)
}

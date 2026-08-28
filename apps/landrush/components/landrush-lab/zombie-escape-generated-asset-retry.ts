export const ZOMBIE_ESCAPE_GENERATED_ASSET_AUTO_RETRY_DELAYS_MS = [650, 1_300] as const

export type ZombieEscapeGeneratedAssetFailure = Readonly<{
  key: string
  message: string
}>

export type ZombieEscapeGeneratedAssetDomain = 'core' | 'cosmetic'

export type ZombieEscapeGeneratedAssetRetryGenerations = Readonly<{
  core: number
  cosmetic: number
}>

export const ZOMBIE_ESCAPE_INITIAL_GENERATED_ASSET_RETRY_GENERATIONS: ZombieEscapeGeneratedAssetRetryGenerations =
  Object.freeze({ core: 0, cosmetic: 0 })

type ZombieEscapeGeneratedAssetDomainState<Value> = Readonly<{
  core: Value
  cosmetic: Value
}>

export type ZombieEscapeGeneratedAssetSettlementReport = Readonly<{
  failures: readonly ZombieEscapeGeneratedAssetFailure[]
  pendingKeys: readonly string[]
}>

export type ZombieEscapeGeneratedAssetRetryState = Readonly<{
  attempts: ZombieEscapeGeneratedAssetDomainState<number>
  failures: readonly ZombieEscapeGeneratedAssetFailure[]
  generations: ZombieEscapeGeneratedAssetRetryGenerations
  retrying: ZombieEscapeGeneratedAssetDomainState<boolean>
}>

export type ZombieEscapeGeneratedAssetAutoRetryPlan = Readonly<{
  delayMs: number
  failures: readonly ZombieEscapeGeneratedAssetFailure[]
}>

export function createZombieEscapeGeneratedAssetRetryState(): ZombieEscapeGeneratedAssetRetryState {
  return {
    attempts: { core: 0, cosmetic: 0 },
    failures: [],
    generations: ZOMBIE_ESCAPE_INITIAL_GENERATED_ASSET_RETRY_GENERATIONS,
    retrying: { core: false, cosmetic: false },
  }
}

export function resolveZombieEscapeGeneratedAssetDomain(
  key: string,
): ZombieEscapeGeneratedAssetDomain {
  if (key.startsWith('weapon:')) return 'core'
  if (key.startsWith('zombie:')) return 'cosmetic'
  throw new Error(`Unknown Zombie Escape generated asset key: ${key}`)
}

export function selectZombieEscapeGeneratedAssetFailures(
  failures: readonly ZombieEscapeGeneratedAssetFailure[],
  domain: ZombieEscapeGeneratedAssetDomain,
) {
  return failures.filter(
    (failure) => resolveZombieEscapeGeneratedAssetDomain(failure.key) === domain,
  )
}

export function applyZombieEscapeGeneratedAssetSettlementReport(
  state: ZombieEscapeGeneratedAssetRetryState,
  report: ZombieEscapeGeneratedAssetSettlementReport,
): ZombieEscapeGeneratedAssetRetryState {
  const nextFailures: ZombieEscapeGeneratedAssetFailure[] = []
  let attempts = state.attempts
  let retrying = state.retrying

  for (const domain of ['core', 'cosmetic'] as const) {
    const reportedFailures = selectZombieEscapeGeneratedAssetFailures(report.failures, domain)
    const pending = report.pendingKeys.some(
      (key) => resolveZombieEscapeGeneratedAssetDomain(key) === domain,
    )
    if (reportedFailures.length > 0) {
      nextFailures.push(...reportedFailures.map((failure) => ({ ...failure })))
      if (retrying[domain]) retrying = { ...retrying, [domain]: false }
      continue
    }
    if (pending) {
      nextFailures.push(...selectZombieEscapeGeneratedAssetFailures(state.failures, domain))
      continue
    }
    if (attempts[domain] !== 0) attempts = { ...attempts, [domain]: 0 }
    if (retrying[domain]) retrying = { ...retrying, [domain]: false }
  }

  if (
    generatedAssetFailuresMatch(state.failures, nextFailures) &&
    attempts === state.attempts &&
    retrying === state.retrying
  ) {
    return state
  }
  return { ...state, attempts, failures: nextFailures, retrying }
}

export function beginZombieEscapeGeneratedAssetRetry(
  state: ZombieEscapeGeneratedAssetRetryState,
  failures: readonly ZombieEscapeGeneratedAssetFailure[],
  source: 'automatic' | 'manual',
): ZombieEscapeGeneratedAssetRetryState {
  if (failures.length === 0) return state
  const retryCore = failures.some(
    (failure) => resolveZombieEscapeGeneratedAssetDomain(failure.key) === 'core',
  )
  const retryCosmetic = failures.some(
    (failure) => resolveZombieEscapeGeneratedAssetDomain(failure.key) === 'cosmetic',
  )
  return {
    ...state,
    attempts: {
      core: retryCore ? (source === 'automatic' ? state.attempts.core + 1 : 0) : state.attempts.core,
      cosmetic: retryCosmetic
        ? source === 'automatic'
          ? state.attempts.cosmetic + 1
          : 0
        : state.attempts.cosmetic,
    },
    generations: {
      core: state.generations.core + (retryCore ? 1 : 0),
      cosmetic: state.generations.cosmetic + (retryCosmetic ? 1 : 0),
    },
    retrying: {
      core: retryCore || state.retrying.core,
      cosmetic: retryCosmetic || state.retrying.cosmetic,
    },
  }
}

export function resolveZombieEscapeGeneratedAssetAutoRetryPlan(
  state: ZombieEscapeGeneratedAssetRetryState,
  domain: ZombieEscapeGeneratedAssetDomain,
): ZombieEscapeGeneratedAssetAutoRetryPlan | null {
  if (state.retrying[domain]) return null
  const failures = selectZombieEscapeGeneratedAssetFailures(state.failures, domain)
  if (failures.length === 0) return null
  const delayMs = ZOMBIE_ESCAPE_GENERATED_ASSET_AUTO_RETRY_DELAYS_MS[state.attempts[domain]]
  return delayMs === undefined ? null : { delayMs, failures }
}

function generatedAssetFailuresMatch(
  first: readonly ZombieEscapeGeneratedAssetFailure[],
  second: readonly ZombieEscapeGeneratedAssetFailure[],
) {
  if (first.length !== second.length) return false
  return first.every(
    (failure, index) =>
      failure.key === second[index]?.key && failure.message === second[index]?.message,
  )
}

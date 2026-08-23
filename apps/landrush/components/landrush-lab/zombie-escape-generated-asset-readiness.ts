export type ZombieEscapeGeneratedAssetTerminalStatus =
  | Readonly<{ state: 'ready' }>
  | Readonly<{ message: string; state: 'failed' }>

export type ZombieEscapeGeneratedAssetSettlement = Readonly<{
  failed: readonly Readonly<{ key: string; message: string }>[]
  pending: readonly string[]
  ready: boolean
  settled: boolean
}>

export type ZombieEscapeGeneratedAssetCreationResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ message: string; ok: false }>

export function tryCreateZombieEscapeGeneratedAsset<Value>(
  create: () => Value,
): ZombieEscapeGeneratedAssetCreationResult<Value> {
  try {
    return { ok: true, value: create() }
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      ok: false,
    }
  }
}

export function resolveZombieEscapeGeneratedAssetSettlement(
  expectedKeys: readonly string[],
  statuses: ReadonlyMap<string, ZombieEscapeGeneratedAssetTerminalStatus>,
): ZombieEscapeGeneratedAssetSettlement {
  const failed: Array<{ key: string; message: string }> = []
  const pending: string[] = []
  for (const key of expectedKeys) {
    const status = statuses.get(key)
    if (!status) {
      pending.push(key)
      continue
    }
    if (status.state === 'failed') failed.push({ key, message: status.message })
  }
  return {
    failed,
    pending,
    ready: pending.length === 0 && failed.length === 0,
    settled: pending.length === 0,
  }
}

import {
  assertLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity,
  createLandrushZombieEscapeCollisionWorldsFromCompilePayload,
  type LandrushZombieEscapeCollisionWorldCompilePayload,
  type LandrushZombieEscapeCollisionWorlds,
} from '@landrush/zombie-gameplay/landrush-zombie-escape-collision-world-compiler'

export type LandrushZombieEscapeCollisionWorldWorkerRequest = Readonly<{
  payload: LandrushZombieEscapeCollisionWorldCompilePayload
  payloadIntegrity: string
  requestId: number
  signature: string
  type: 'compile'
}>

export type LandrushZombieEscapeCollisionWorldWorkerError = Readonly<{
  message: string
  name: string
  stack?: string
}>

export type LandrushZombieEscapeCollisionWorldWorkerResponse =
  | Readonly<{
      ok: true
      requestId: number
      signature: string
      worlds: LandrushZombieEscapeCollisionWorlds
    }>
  | Readonly<{
      error: LandrushZombieEscapeCollisionWorldWorkerError
      ok: false
      requestId: number
      signature: string
    }>

export type LandrushZombieEscapeCollisionWorldWorkerStatus =
  | Readonly<{ type: 'ready' }>
  | Readonly<{
      requestId: number
      signature: string
      type: 'accepted'
    }>

export function resolveLandrushZombieEscapeCollisionWorldWorkerRequest(
  request: LandrushZombieEscapeCollisionWorldWorkerRequest,
  compile: (
    payload: LandrushZombieEscapeCollisionWorldCompilePayload,
  ) => LandrushZombieEscapeCollisionWorlds,
): LandrushZombieEscapeCollisionWorldWorkerResponse {
  try {
    assertLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity(
      request.payload,
      request.signature,
      request.payloadIntegrity,
    )
    return {
      ok: true,
      requestId: request.requestId,
      signature: request.signature,
      worlds: compile(request.payload),
    }
  } catch (error) {
    return {
      error: normalizeLandrushZombieEscapeCollisionWorldWorkerError(error),
      ok: false,
      requestId: request.requestId,
      signature: request.signature,
    }
  }
}

export function createLandrushZombieEscapeCollisionWorldWorkerRequestResolver({
  createCompiler = () => createLandrushZombieEscapeCollisionWorldsFromCompilePayload,
}: {
  createCompiler?: () => (
    payload: LandrushZombieEscapeCollisionWorldCompilePayload,
  ) => LandrushZombieEscapeCollisionWorlds
} = {}) {
  let compile = createCompiler()
  return (request: LandrushZombieEscapeCollisionWorldWorkerRequest) => {
    const response = resolveLandrushZombieEscapeCollisionWorldWorkerRequest(request, compile)
    if (response.ok) compile = createCompiler()
    return response
  }
}

export function normalizeLandrushZombieEscapeCollisionWorldWorkerError(
  error: unknown,
): LandrushZombieEscapeCollisionWorldWorkerError {
  if (error instanceof Error) {
    return {
      message: error.message || 'Unknown collision-world worker error.',
      name: error.name || 'Error',
      ...(error.stack ? { stack: error.stack } : {}),
    }
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      error?: unknown
      message?: unknown
      name?: unknown
      stack?: unknown
    }
    if (candidate.error !== undefined && candidate.error !== error) {
      return normalizeLandrushZombieEscapeCollisionWorldWorkerError(candidate.error)
    }
    return {
      message:
        typeof candidate.message === 'string' && candidate.message.length > 0
          ? candidate.message
          : 'Unknown collision-world worker error.',
      name:
        typeof candidate.name === 'string' && candidate.name.length > 0 ? candidate.name : 'Error',
      ...(typeof candidate.stack === 'string' && candidate.stack.length > 0
        ? { stack: candidate.stack }
        : {}),
    }
  }
  return {
    message: typeof error === 'string' && error.length > 0 ? error : String(error),
    name: 'Error',
  }
}

export function createLandrushZombieEscapeCollisionWorldWorkerError(
  source: LandrushZombieEscapeCollisionWorldWorkerError,
) {
  const error = new Error(source.message)
  error.name = source.name
  if (source.stack) error.stack = source.stack
  return error
}

export function collectLandrushZombieEscapeCollisionWorldTransferables(value: unknown) {
  const buffers = new Set<ArrayBuffer>()
  const visited = new WeakSet<object>()

  const visit = (candidate: unknown) => {
    if (candidate instanceof ArrayBuffer) {
      if (candidate.byteLength > 0) buffers.add(candidate)
      return
    }
    if (ArrayBuffer.isView(candidate)) {
      if (candidate.buffer instanceof ArrayBuffer && candidate.buffer.byteLength > 0) {
        buffers.add(candidate.buffer)
      }
      return
    }
    if (typeof candidate !== 'object' || candidate === null || visited.has(candidate)) return
    visited.add(candidate)
    if (candidate instanceof Map) {
      for (const [key, entry] of candidate) {
        visit(key)
        visit(entry)
      }
      return
    }
    if (candidate instanceof Set) {
      for (const entry of candidate) visit(entry)
      return
    }
    for (const key of Reflect.ownKeys(candidate)) {
      visit((candidate as Record<PropertyKey, unknown>)[key])
    }
  }

  visit(value)
  return [...buffers]
}

export function isLandrushZombieEscapeCollisionWorldWorkerResponse(
  value: unknown,
): value is LandrushZombieEscapeCollisionWorldWorkerResponse {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<LandrushZombieEscapeCollisionWorldWorkerResponse>
  if (
    typeof candidate.ok !== 'boolean' ||
    typeof candidate.requestId !== 'number' ||
    typeof candidate.signature !== 'string'
  ) {
    return false
  }
  if (candidate.ok) {
    return (
      'worlds' in candidate && typeof candidate.worlds === 'object' && candidate.worlds !== null
    )
  }
  if (!('error' in candidate) || typeof candidate.error !== 'object' || candidate.error === null) {
    return false
  }
  return typeof candidate.error.message === 'string' && typeof candidate.error.name === 'string'
}

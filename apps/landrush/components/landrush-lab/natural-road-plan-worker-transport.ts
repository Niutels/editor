import {
  createNaturalRoadPlan,
  type NaturalRoadPlan,
  type NaturalRoadPlanInput,
} from './natural-road-plan'

export type { NaturalRoadPlanInput } from './natural-road-plan'

export type NaturalRoadPlanWorkerRequest = Readonly<{
  input: NaturalRoadPlanInput
  requestId: number
  signature: string
  type: 'build'
}>

export type NaturalRoadPlanWorkerError = Readonly<{
  message: string
  name: string
  stack?: string
}>

export type NaturalRoadPlanWorkerResponse =
  | Readonly<{
      ok: true
      plan: NaturalRoadPlan
      requestId: number
      signature: string
    }>
  | Readonly<{
      error: NaturalRoadPlanWorkerError
      ok: false
      requestId: number
      signature: string
    }>

export type NaturalRoadPlanWorkerStatus =
  | Readonly<{ type: 'ready' }>
  | Readonly<{
      requestId: number
      signature: string
      type: 'accepted'
    }>

export function createNaturalRoadPlanSignature(input: NaturalRoadPlanInput) {
  return `natural-road-plan:v1:${JSON.stringify({
    elevation: input.elevation,
    perimeter: input.perimeter.map((point) => [point.x, point.z]),
    quality: input.quality,
    roads: input.roads.map((road) => ({
      connectsParcelIds: road.connectsParcelIds,
      fromNodeId: road.fromNodeId,
      id: road.id,
      kind: road.kind,
      points: road.points.map((point) => [point.x, point.z]),
      r3fPoints: road.r3fPoints,
      toNodeId: road.toNodeId,
      width: road.width,
    })),
    seed: input.seed,
  })}`
}

export function resolveNaturalRoadPlanWorkerRequest(
  request: NaturalRoadPlanWorkerRequest,
  build: (input: NaturalRoadPlanInput) => NaturalRoadPlan = createNaturalRoadPlan,
): NaturalRoadPlanWorkerResponse {
  try {
    const signature = createNaturalRoadPlanSignature(request.input)
    if (signature !== request.signature) {
      throw new Error('Natural-road worker request signature does not match its input.')
    }
    return {
      ok: true,
      plan: build(request.input),
      requestId: request.requestId,
      signature,
    }
  } catch (error) {
    return {
      error: normalizeNaturalRoadPlanWorkerError(error),
      ok: false,
      requestId: request.requestId,
      signature: request.signature,
    }
  }
}

export function isNaturalRoadPlanWorkerResponse(
  value: unknown,
): value is NaturalRoadPlanWorkerResponse {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<NaturalRoadPlanWorkerResponse>
  if (
    typeof candidate.ok !== 'boolean' ||
    typeof candidate.requestId !== 'number' ||
    typeof candidate.signature !== 'string'
  ) {
    return false
  }
  if (candidate.ok) {
    return 'plan' in candidate && typeof candidate.plan === 'object' && candidate.plan !== null
  }
  if (!('error' in candidate) || typeof candidate.error !== 'object' || candidate.error === null) {
    return false
  }
  return typeof candidate.error.message === 'string' && typeof candidate.error.name === 'string'
}

export function normalizeNaturalRoadPlanWorkerError(error: unknown): NaturalRoadPlanWorkerError {
  if (error instanceof Error) {
    return {
      message: error.message || 'Unknown natural-road worker error.',
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
      return normalizeNaturalRoadPlanWorkerError(candidate.error)
    }
    return {
      message:
        typeof candidate.message === 'string' && candidate.message.length > 0
          ? candidate.message
          : 'Unknown natural-road worker error.',
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

export function createNaturalRoadPlanWorkerError(source: NaturalRoadPlanWorkerError) {
  const error = new Error(source.message)
  error.name = source.name
  if (source.stack) error.stack = source.stack
  return error
}

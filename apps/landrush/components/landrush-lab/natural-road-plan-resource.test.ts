import { describe, expect, test } from 'bun:test'
import { createElement, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LandrushRoadSegment } from '@/components/landrush/types'
import type { NaturalRoadPlan } from './natural-road-plan'
import {
  createNaturalRoadPlanAsyncResource,
  useNaturalRoadPlanResource,
} from './natural-road-plan-resource'
import {
  createNaturalRoadPlanSignature,
  type NaturalRoadPlanInput,
} from './natural-road-plan-worker-transport'

const roads: readonly LandrushRoadSegment[] = [
  {
    connectsParcelIds: ['parcel-a'],
    fromNodeId: 'a',
    id: 'road-a-b',
    kind: 'spine',
    points: [
      { x: -1, z: 0 },
      { x: 1, z: 0 },
    ],
    r3fPoints: [
      [-1, 0, 0],
      [1, 0, 0],
    ],
    toNodeId: 'b',
    width: 2.15,
  },
]

describe('natural-road plan async resource', () => {
  test('serializes a stable hook input identity only once across rerenders', () => {
    const input = createInput()

    const serializationCount = countNaturalRoadSignatureSerializations(() => {
      renderToStaticMarkup(
        createElement(NaturalRoadPlanResourceRenderSequence, { inputs: [input, input] }),
      )
    })

    expect(serializationCount).toBe(1)
  })

  test('computes the signature when a null hook input becomes available', () => {
    const input = createInput()
    let markup = ''

    const serializationCount = countNaturalRoadSignatureSerializations(() => {
      markup = renderToStaticMarkup(
        createElement(NaturalRoadPlanResourceRenderSequence, { inputs: [null, input] }),
      )
    })

    expect(serializationCount).toBe(1)
    expect(markup).toContain('data-key="natural-road-plan:v1:')
  })

  test('shares one in-flight build for equivalent Strict Mode requests', async () => {
    const pending = deferred<NaturalRoadPlan>()
    let buildCount = 0
    const resource = createNaturalRoadPlanAsyncResource({
      build: () => {
        buildCount += 1
        return pending.promise
      },
    })
    const firstInput = createInput()
    const equivalentInput = structuredClone(firstInput)
    const key = createNaturalRoadPlanSignature(firstInput)
    const statuses: string[] = []
    const unsubscribe = resource.subscribe(key, () =>
      statuses.push(resource.getSnapshot(key).status),
    )

    const first = resource.load(firstInput)
    const replay = resource.load(equivalentInput)

    expect(replay).toBe(first)
    expect(buildCount).toBe(1)
    expect(resource.getSnapshot(key).status).toBe('loading')
    pending.resolve(createPlan())
    await expect(first).resolves.toMatchObject({ quality: 'high', seed: 'cala' })
    expect(resource.getSnapshot(key).status).toBe('ready')
    expect(statuses).toEqual(['loading', 'ready'])
    unsubscribe()
  })

  test('does not alias inputs whose rendered road data differs', () => {
    const first = createInput()
    const changedWidth = createInput({
      roads: [{ ...roads[0]!, width: roads[0]!.width + 0.1 }],
    })
    const changedR3fPoint = createInput({
      roads: [
        {
          ...roads[0]!,
          r3fPoints: [
            [-1, 0.25, 0],
            [1, 0, 0],
          ],
        },
      ],
    })

    expect(createNaturalRoadPlanSignature(changedWidth)).not.toBe(
      createNaturalRoadPlanSignature(first),
    )
    expect(createNaturalRoadPlanSignature(changedR3fPoint)).not.toBe(
      createNaturalRoadPlanSignature(first),
    )
  })

  test('starts a new build when the rendered input changes', async () => {
    let buildCount = 0
    const resource = createNaturalRoadPlanAsyncResource({
      build: async () => {
        buildCount += 1
        return createPlan()
      },
    })
    const firstInput = createInput()
    const changedInput = createInput({
      roads: [{ ...roads[0]!, width: roads[0]!.width + 0.1 }],
    })

    const first = resource.load(firstInput)
    const changed = resource.load(changedInput)

    expect(changed).not.toBe(first)
    await expect(first).resolves.toBeDefined()
    await expect(changed).resolves.toBeDefined()
    expect(buildCount).toBe(2)
  })

  test('evicts failed builds so a revisit retries in the worker', async () => {
    let buildCount = 0
    const resource = createNaturalRoadPlanAsyncResource({
      build: () => {
        buildCount += 1
        return buildCount === 1
          ? Promise.reject(new Error('worker failed'))
          : Promise.resolve(createPlan())
      },
    })
    const input = createInput()
    const key = createNaturalRoadPlanSignature(input)
    const failures: (Error | null)[] = []
    const unsubscribe = resource.subscribe(key, () => {
      failures.push(resource.getSnapshot(key).error)
    })

    await expect(resource.load(input)).rejects.toThrow('worker failed')
    expect(failures.at(-1)).toMatchObject({ message: 'worker failed' })
    expect(resource.getSnapshot(key).status).toBe('idle')
    await expect(resource.load(input)).resolves.toBeDefined()
    expect(buildCount).toBe(2)
    unsubscribe()
  })

  test('evicts an aborted build so returning to the same input can restart it', async () => {
    const abortError = new Error('superseded')
    abortError.name = 'AbortError'
    let buildCount = 0
    const resource = createNaturalRoadPlanAsyncResource({
      build: () => {
        buildCount += 1
        return buildCount === 1 ? Promise.reject(abortError) : Promise.resolve(createPlan())
      },
    })
    const input = createInput()
    const key = createNaturalRoadPlanSignature(input)

    await expect(resource.load(input)).rejects.toMatchObject({ name: 'AbortError' })
    expect(resource.getSnapshot(key).status).toBe('idle')
    await expect(resource.load(input)).resolves.toBeDefined()
    expect(buildCount).toBe(2)
  })
})

function NaturalRoadPlanResourceRenderSequence({
  inputs,
}: {
  inputs: readonly (NaturalRoadPlanInput | null)[]
}) {
  const [index, setIndex] = useState(0)
  const input = inputs[index] ?? null
  const snapshot = useNaturalRoadPlanResource(input)
  if (index < inputs.length - 1) setIndex(index + 1)
  return createElement('output', { 'data-key': snapshot.key ?? '' })
}

function countNaturalRoadSignatureSerializations(run: () => void) {
  const stringify = JSON.stringify
  let count = 0
  JSON.stringify = ((value: unknown, ...args: unknown[]) => {
    if (isNaturalRoadSignaturePayload(value)) count += 1
    return Reflect.apply(stringify, JSON, [value, ...args])
  }) as typeof JSON.stringify
  try {
    run()
  } finally {
    JSON.stringify = stringify
  }
  return count
}

function isNaturalRoadSignaturePayload(value: unknown) {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Record<keyof NaturalRoadPlanInput, unknown>>
  return (
    typeof candidate.elevation === 'number' &&
    Array.isArray(candidate.perimeter) &&
    typeof candidate.quality === 'string' &&
    Array.isArray(candidate.roads) &&
    typeof candidate.seed === 'string'
  )
}

function createInput(overrides: Partial<NaturalRoadPlanInput> = {}): NaturalRoadPlanInput {
  return {
    elevation: 0,
    perimeter: [
      { x: -2, z: -2 },
      { x: 2, z: -2 },
      { x: 2, z: 2 },
      { x: -2, z: 2 },
    ],
    quality: 'high',
    roads,
    seed: 'cala',
    ...overrides,
  }
}

function createPlan(): NaturalRoadPlan {
  return {
    footprints: {
      asphalt: [],
      centerDashes: [],
      clearance: [],
      edgeLines: [],
      outerSidewalk: [],
      perimeterSidewalk: [],
      roadSidewalks: [],
      sidewalks: [],
    },
    groundElevation: 0,
    metrics: {
      buildTimeMs: 1,
      endpointCount: 0,
      estimatedTriangleCount: 0,
      estimatedVertexCount: 0,
      footprintVertexCount: 0,
      junctionCount: 0,
      nodeCount: 0,
      perimeterSidewalkSegmentCount: 0,
      routeLengthMeters: 0,
      segmentCount: 0,
      sidewalkOffsetAudit: {
        excessMeters: 0,
        expectedMeters: 0,
        maximumAbsoluteErrorMeters: 0,
        maximumMeters: 0,
        minimumMeters: 0,
        point: { x: 0, z: 0 },
      },
    },
    nodes: [],
    perimeterSidewalkPoints: [],
    perimeterSidewalkRoadIds: [],
    quality: 'high',
    roadGeometryAudit: {
      boundaryFailures: [],
      failureCount: 0,
      maximumBoundaryTurnDegrees: 0,
      maximumParallelDeviationMeters: 0,
      minimumHalfWidthMeters: 0,
      probes: [],
      requiredHalfWidthMeters: 0,
      sampleCount: 0,
      worstPoint: { x: 0, z: 0 },
    },
    roadWidths: {},
    roads: [],
    seed: 'cala',
  }
}

function deferred<T>() {
  let reject!: (error: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise
    resolve = resolvePromise
  })
  return { promise, reject, resolve }
}

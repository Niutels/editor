import { describe, expect, test } from 'bun:test'
import {
  createNaturalRoadPlanSignature,
  isNaturalRoadPlanWorkerResponse,
  type NaturalRoadPlanInput,
  type NaturalRoadPlanWorkerRequest,
} from './natural-road-plan-worker-transport'

describe('natural-road worker boundary', () => {
  test('keeps the worker planner free of client and rendering imports', async () => {
    const plannerSource = await Bun.file(new URL('./natural-road-plan.ts', import.meta.url)).text()
    const transportSource = await Bun.file(
      new URL('./natural-road-plan-worker-transport.ts', import.meta.url),
    ).text()

    expect(plannerSource).not.toContain("'use client'")
    expect(plannerSource).not.toContain("from 'react'")
    expect(plannerSource).not.toContain("from 'next/")
    expect(plannerSource).not.toContain('@react-three')
    expect(plannerSource).not.toContain('@/components')
    expect(transportSource).not.toContain('natural-road-network-layer')
  })

  test('executes the real planner inside a worker runtime', async () => {
    const worker = new Worker(new URL('./natural-road-plan.worker.ts', import.meta.url).href)
    const input = createInput()
    const request: NaturalRoadPlanWorkerRequest = {
      input,
      requestId: 1,
      signature: createNaturalRoadPlanSignature(input),
      type: 'build',
    }

    try {
      const response = await new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Natural-road integration worker did not respond.')),
          10_000,
        )
        worker.onerror = (event) => {
          clearTimeout(timeout)
          reject(event.error ?? new Error(event.message))
        }
        worker.onmessage = (event) => {
          if (event.data?.type === 'ready') {
            worker.postMessage(request)
            return
          }
          if (event.data?.type === 'accepted') return
          clearTimeout(timeout)
          resolve(event.data)
        }
      })

      expect(isNaturalRoadPlanWorkerResponse(response)).toBe(true)
      if (!isNaturalRoadPlanWorkerResponse(response)) return
      expect(response.ok).toBe(true)
      if (!response.ok) return
      expect(response.plan).toMatchObject({
        groundElevation: 0,
        quality: 'balanced',
        seed: 'cala',
      })
      expect(response.plan.footprints.perimeterSidewalk.length).toBeGreaterThan(0)
    } finally {
      worker.terminate()
    }
  }, 15_000)
})

function createInput(): NaturalRoadPlanInput {
  return {
    elevation: 0,
    perimeter: [
      { x: -4, z: -4 },
      { x: 4, z: -4 },
      { x: 4, z: 4 },
      { x: -4, z: 4 },
    ],
    quality: 'balanced',
    roads: [],
    seed: 'cala',
  }
}

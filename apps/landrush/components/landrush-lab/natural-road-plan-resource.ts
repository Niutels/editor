'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { NaturalRoadPlan } from './natural-road-plan'
import { createBrowserNaturalRoadPlanWorkerCompiler } from './natural-road-plan-worker-client'
import {
  createNaturalRoadPlanSignature,
  type NaturalRoadPlanInput,
} from './natural-road-plan-worker-transport'

export type NaturalRoadPlanResourceSnapshot = Readonly<{
  error: Error | null
  key: string | null
  plan: NaturalRoadPlan | null
  status: 'error' | 'idle' | 'loading' | 'ready'
}>

type NaturalRoadPlanResourceEntry = {
  lastAccess: number
  promise: Promise<NaturalRoadPlan>
  snapshot: NaturalRoadPlanResourceSnapshot
}

export type NaturalRoadPlanAsyncResource = {
  getSnapshot: (key: string) => NaturalRoadPlanResourceSnapshot
  load: (input: NaturalRoadPlanInput) => Promise<NaturalRoadPlan>
  subscribe: (key: string, listener: () => void) => () => void
}

const IDLE_NATURAL_ROAD_PLAN_SNAPSHOT: NaturalRoadPlanResourceSnapshot = {
  error: null,
  key: null,
  plan: null,
  status: 'idle',
}

export function createNaturalRoadPlanAsyncResource({
  build,
  maximumReadyEntries = 3,
}: {
  build: (input: NaturalRoadPlanInput) => Promise<NaturalRoadPlan>
  maximumReadyEntries?: number
}): NaturalRoadPlanAsyncResource {
  const entries = new Map<string, NaturalRoadPlanResourceEntry>()
  const listeners = new Map<string, Set<() => void>>()
  let accessSequence = 0

  const notify = (key: string) => {
    for (const listener of listeners.get(key) ?? []) listener()
  }

  const pruneReadyEntries = () => {
    const readyEntries = [...entries.entries()]
      .filter(([, entry]) => entry.snapshot.status === 'ready')
      .sort(([, left], [, right]) => left.lastAccess - right.lastAccess)
    const excess = readyEntries.length - Math.max(1, maximumReadyEntries)
    for (let index = 0; index < excess; index += 1) {
      const key = readyEntries[index]?.[0]
      if (key && (listeners.get(key)?.size ?? 0) === 0) entries.delete(key)
    }
  }

  const load = (input: NaturalRoadPlanInput) => {
    const key = createNaturalRoadPlanSignature(input)
    const existing = entries.get(key)
    if (existing) {
      existing.lastAccess = ++accessSequence
      return existing.promise
    }

    let entry!: NaturalRoadPlanResourceEntry
    const promise = build(input).then(
      (plan) => {
        entry.snapshot = { error: null, key, plan, status: 'ready' }
        entry.lastAccess = ++accessSequence
        notify(key)
        pruneReadyEntries()
        return plan
      },
      (error: unknown) => {
        const normalized = error instanceof Error ? error : new Error(String(error))
        entry.snapshot = { error: normalized, key, plan: null, status: 'error' }
        entry.lastAccess = ++accessSequence
        notify(key)
        if (entries.get(key) === entry) entries.delete(key)
        throw normalized
      },
    )
    entry = {
      lastAccess: ++accessSequence,
      promise,
      snapshot: { error: null, key, plan: null, status: 'loading' },
    }
    entries.set(key, entry)
    notify(key)
    return promise
  }

  return {
    getSnapshot: (key) =>
      entries.get(key)?.snapshot ?? { error: null, key, plan: null, status: 'idle' },
    load,
    subscribe: (key, listener) => {
      const keyListeners = listeners.get(key) ?? new Set<() => void>()
      keyListeners.add(listener)
      listeners.set(key, keyListeners)
      return () => {
        keyListeners.delete(listener)
        if (keyListeners.size === 0) listeners.delete(key)
      }
    },
  }
}

const browserNaturalRoadPlanCompiler = createBrowserNaturalRoadPlanWorkerCompiler()
const browserNaturalRoadPlanResource = createNaturalRoadPlanAsyncResource({
  build: browserNaturalRoadPlanCompiler.build,
})

export function useNaturalRoadPlanResource(
  input: NaturalRoadPlanInput | null,
): NaturalRoadPlanResourceSnapshot {
  const key = useMemo(() => (input ? createNaturalRoadPlanSignature(input) : null), [input])
  const inputRef = useRef(input)
  inputRef.current = input
  const [snapshot, setSnapshot] = useState<NaturalRoadPlanResourceSnapshot>(
    IDLE_NATURAL_ROAD_PLAN_SNAPSHOT,
  )

  useEffect(() => {
    if (!key) {
      setSnapshot(IDLE_NATURAL_ROAD_PLAN_SNAPSHOT)
      return
    }
    const updateSnapshot = () => setSnapshot(browserNaturalRoadPlanResource.getSnapshot(key))
    const unsubscribe = browserNaturalRoadPlanResource.subscribe(key, updateSnapshot)
    updateSnapshot()
    const currentInput = inputRef.current
    if (currentInput) void browserNaturalRoadPlanResource.load(currentInput).catch(() => undefined)
    return unsubscribe
  }, [key])

  if (!key) return IDLE_NATURAL_ROAD_PLAN_SNAPSHOT
  return snapshot.key === key ? snapshot : { error: null, key, plan: null, status: 'idle' }
}

'use client'

import { nodeRegistry, useScene } from '@pascal-app/core'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

type ModuleGateStatus = {
  ready: boolean
  pending: string[]
  errors: string[]
}

declare global {
  interface Window {
    __PASCAL_SCENE_MODULES_READY__?: ModuleGateStatus
  }
}

function isBenchModuleGateEnabled() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.has('benchControls') || params.has('benchStats')
}

function publishStatus(status: ModuleGateStatus) {
  if (typeof window !== 'undefined') {
    window.__PASCAL_SCENE_MODULES_READY__ = status
  }
}

export function BenchSceneModuleGate({ children }: { children: ReactNode }) {
  const enabled = isBenchModuleGateEnabled()
  const nodes = useScene((state) => state.nodes)
  const [ready, setReady] = useState(!enabled)

  const nodeKindSignature = useMemo(() => {
    return Array.from(new Set(Object.values(nodes).map((node) => node.type)))
      .sort()
      .join(',')
  }, [nodes])

  useEffect(() => {
    if (!enabled) {
      publishStatus({ ready: true, pending: [], errors: [] })
      setReady(true)
      return
    }

    let cancelled = false
    const nodeKinds = new Set(nodeKindSignature.split(',').filter(Boolean))
    if (nodeKinds.size === 0) {
      publishStatus({ ready: false, pending: ['scene:nodes'], errors: [] })
      setReady(false)
      return
    }

    const loaders: Array<{ id: string; load: () => Promise<unknown> }> = []

    for (const kind of nodeKinds) {
      const def = nodeRegistry.get(kind)
      if (def?.renderer?.kind === 'parametric') {
        loaders.push({ id: `renderer:${kind}`, load: def.renderer.module })
      }
    }

    for (const [kind, def] of nodeRegistry.entries()) {
      if (def.system?.module) {
        loaders.push({ id: `system:${kind}`, load: def.system.module })
      }
    }

    publishStatus({
      ready: loaders.length === 0,
      pending: loaders.map((loader) => loader.id),
      errors: [],
    })
    setReady(loaders.length === 0)

    Promise.allSettled(
      loaders.map(async (loader) => {
        await loader.load()
        return loader.id
      }),
    ).then((results) => {
      if (cancelled) return

      const errors = results.flatMap((result, index) => {
        if (result.status === 'fulfilled') return []
        const reason =
          result.reason instanceof Error ? result.reason.message : String(result.reason)
        return [`${loaders[index]?.id ?? `loader:${index}`}: ${reason}`]
      })
      const status = { ready: errors.length === 0, pending: [], errors }
      publishStatus(status)
      setReady(status.ready)
    })

    return () => {
      cancelled = true
    }
  }, [enabled, nodeKindSignature])

  if (!enabled || ready) return children
  return null
}

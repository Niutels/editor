'use client'

import { type RefObject, useLayoutEffect } from 'react'
import type { Object3D } from 'three'
import type {
  ZombieEscapeRenderReadinessRegistry,
  ZombieEscapeRenderRepresentativeKey,
} from './zombie-escape-render-readiness'

export function useZombieEscapeRenderRepresentative(
  registry: ZombieEscapeRenderReadinessRegistry | undefined,
  key: ZombieEscapeRenderRepresentativeKey,
  rootRef: RefObject<Object3D | null>,
) {
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!(registry && root)) return
    return registry.register(key, root)
  }, [key, registry, rootRef])
}

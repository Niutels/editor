'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'

export type RenderProfile = 'full' | 'orbit' | 'static' | 'interaction' | 'minimal'

export type RenderReason =
  | 'animation'
  | 'camera:start'
  | 'camera:move'
  | 'camera:end'
  | 'geometry:changed'
  | 'selection:changed'
  | 'hover:changed'
  | 'theme:changed'
  | 'thumbnail'
  | 'export'
  | 'debug'
  | 'warmup'

export type RenderSchedulerSnapshot = {
  version: number
  profile: RenderProfile
  reasonsThisFrame: readonly RenderReason[]
  shadowDirty: boolean
  postFxDirty: boolean
  pickingEnabled: boolean
}

type Listener = () => void

const INITIAL_SNAPSHOT: RenderSchedulerSnapshot = {
  version: 0,
  profile: 'static',
  reasonsThisFrame: [],
  shadowDirty: true,
  postFxDirty: true,
  pickingEnabled: true,
}

class LandrushRenderScheduler {
  private frameReasons = new Set<RenderReason>()
  private listeners = new Set<Listener>()
  private invalidate: (() => void) | null = null
  private snapshot = INITIAL_SNAPSHOT

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): RenderSchedulerSnapshot => this.snapshot

  setInvalidate = (invalidate: (() => void) | null): void => {
    this.invalidate = invalidate
  }

  requestFrame = (reason: RenderReason): void => {
    this.frameReasons.add(reason)
    const next: Partial<RenderSchedulerSnapshot> = {}

    if (reason === 'camera:start' || reason === 'camera:move') {
      next.profile = 'orbit'
      next.pickingEnabled = false
    } else if (reason === 'camera:end') {
      next.profile = 'static'
      next.pickingEnabled = true
      next.postFxDirty = true
    } else if (reason === 'selection:changed' || reason === 'hover:changed') {
      next.profile = this.snapshot.profile === 'orbit' ? 'orbit' : 'interaction'
      next.postFxDirty = true
    } else if (reason === 'thumbnail' || reason === 'export') {
      next.profile = 'full'
    }

    if (reason === 'geometry:changed' || reason === 'theme:changed') {
      next.shadowDirty = true
      next.postFxDirty = true
    }

    this.publish(next)
    this.invalidate?.()
  }

  drainFrameReasons = (): readonly RenderReason[] => {
    if (this.frameReasons.size === 0) return this.snapshot.reasonsThisFrame
    const reasons = Array.from(this.frameReasons)
    this.frameReasons.clear()
    this.publish({ reasonsThisFrame: reasons })
    return reasons
  }

  private publish(next: Partial<RenderSchedulerSnapshot>): void {
    const changed = Object.entries(next).some(
      ([key, value]) => this.snapshot[key as keyof RenderSchedulerSnapshot] !== value,
    )
    if (!changed) return

    this.snapshot = {
      ...this.snapshot,
      ...next,
      version: this.snapshot.version + 1,
    }
    for (const listener of this.listeners) listener()
  }
}

export const renderScheduler = new LandrushRenderScheduler()

export function LandrushRenderSchedulerBridge() {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    renderScheduler.setInvalidate(invalidate)
    return () => renderScheduler.setInvalidate(null)
  }, [invalidate])

  useFrame(() => {
    renderScheduler.drainFrameReasons()
  }, -100)

  return null
}

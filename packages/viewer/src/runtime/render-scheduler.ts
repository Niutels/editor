import type { RenderProfile } from './render-profiles'
import type { RenderReason } from './render-reasons'

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

class RenderScheduler {
  private frameReasons = new Set<RenderReason>()
  private listeners = new Set<Listener>()
  private invalidate: (() => void) | null = null
  private snapshot = INITIAL_SNAPSHOT

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
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
    }
    if (reason === 'camera:end') {
      next.profile = 'static'
      next.pickingEnabled = true
      next.postFxDirty = true
    }
    if (reason === 'geometry:changed' || reason === 'theme:changed') {
      next.shadowDirty = true
      next.postFxDirty = true
    }
    if (reason === 'selection:changed' || reason === 'hover:changed') {
      next.profile = this.snapshot.profile === 'orbit' ? 'orbit' : 'interaction'
      next.postFxDirty = true
    }
    if (reason === 'thumbnail' || reason === 'export') {
      next.profile = 'full'
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

  markShadowClean = (): void => {
    if (!this.snapshot.shadowDirty) return
    this.publish({ shadowDirty: false })
  }

  markShadowDirty = (): void => {
    if (this.snapshot.shadowDirty) return
    this.publish({ shadowDirty: true })
  }

  markPostFxClean = (): void => {
    if (!this.snapshot.postFxDirty) return
    this.publish({ postFxDirty: false })
  }

  private publish(next: Partial<RenderSchedulerSnapshot>): void {
    let changed = false
    for (const key of Object.keys(next) as (keyof RenderSchedulerSnapshot)[]) {
      if (this.snapshot[key] !== next[key]) {
        changed = true
        break
      }
    }
    if (!changed) return

    this.snapshot = {
      ...this.snapshot,
      ...next,
      version: this.snapshot.version + 1,
    }
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export const renderScheduler = new RenderScheduler()

'use client'

import { type MutableRefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  createLandrushIslandLoadingProgressController,
  type LandrushIslandLoadingProgressController,
  resolveLandrushIslandLoadingProgressStage,
} from './landrush-island-loading-progress-controller'
import {
  LANDRUSH_ISLAND_LOADING_BOOT_CONTRACT_VERSION,
  LANDRUSH_ISLAND_LOADING_RUNTIME_OWNER_ATTRIBUTE,
  LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE,
  LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
  LANDRUSH_ISLAND_LOADING_SHELL_PERCENT_REEL_ATTRIBUTE,
  LANDRUSH_ISLAND_LOADING_SHELL_RUN_ATTRIBUTE,
  type LandrushIslandLoadingBootRun,
  STREAMED_SHELL_VELOCITY_PER_SECOND,
} from './landrush-island-loading-shell-bootstrap'
import {
  LANDRUSH_ISLAND_LOADING_INITIAL_STATUS,
  type LandrushIslandLoadingStatus,
  resolveLandrushIslandLoadingStatus,
} from './landrush-island-loading-status'
import {
  createLandrushIslandLoadingTimelineRun,
  type LandrushIslandLoadingTaskSnapshot,
  type LandrushIslandLoadingTimingStorage,
  type LandrushIslandLoadingTopologyFallback,
} from './landrush-island-loading-timeline'

const DEFAULT_HANDOFF_FADE_MS = 100
export const LANDRUSH_ISLAND_LOADING_MINIMUM_PRESENTATION_FPS = 20
export const LANDRUSH_ISLAND_LOADING_MAXIMUM_APP_PRESENTATION_GAP_MS =
  1_000 / LANDRUSH_ISLAND_LOADING_MINIMUM_PRESENTATION_FPS
export const LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS =
  LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS
export const LANDRUSH_ISLAND_LOADING_COMPLETION_DEADLINE_MS = 1_000
export const LANDRUSH_ISLAND_LOADING_DOCUMENT_TASK_ID = '@landrush/document-ready'
export const LANDRUSH_ISLAND_LOADING_MOTION_CONTRACT_ATTRIBUTE =
  'data-landrush-island-loading-motion-contract'

type LandrushIslandLoadingFillElement = Pick<HTMLElement, 'animate' | 'style'>
type LandrushIslandLoadingFadeElement = Pick<
  HTMLElement,
  'animate' | 'removeAttribute' | 'setAttribute' | 'style'
>

export type LandrushIslandLoadingVisualKeyframe = Readonly<{
  accelerationPerSecondSquared?: number
  offset: number
  progress: number
  velocityPerSecond?: number
}>

export type LandrushIslandLoadingVisualSegment = Readonly<{
  durationMs: number
  from: number
  keyframes: readonly LandrushIslandLoadingVisualKeyframe[]
  startedAtMs: number
  to: number
}>

export type LandrushIslandLoadingTimelineHookOptions = Readonly<{
  fallback?: LandrushIslandLoadingTopologyFallback
  generation: string
  handoffFadeMs?: number
  minimumVisibleMs?: number
  now?: () => number
  onHandoff: (generation: string) => void
  profileKey: string
  sampleInvalidationKey: string
  storage?: LandrushIslandLoadingTimingStorage | null
  tasks: readonly LandrushIslandLoadingTaskSnapshot[]
  topologySignature: string
}>

export type LandrushIslandLoadingTimelineHookResult = Readonly<{
  fadingOut: boolean
  fillRef: MutableRefObject<HTMLDivElement | null>
  handedOff: boolean
  overlayRef: MutableRefObject<HTMLDivElement | null>
  progress: number
  statusText: string
  visible: boolean
}>

export function useLandrushIslandLoadingTimeline({
  fallback,
  generation,
  handoffFadeMs = DEFAULT_HANDOFF_FADE_MS,
  minimumVisibleMs = 0,
  now,
  onHandoff,
  profileKey,
  sampleInvalidationKey,
  storage,
  tasks,
  topologySignature,
}: LandrushIslandLoadingTimelineHookOptions): LandrushIslandLoadingTimelineHookResult {
  const [presentation, setPresentation] = useState({
    fadingOut: false,
    handedOff: false,
    progress: 0,
    statusText: LANDRUSH_ISLAND_LOADING_INITIAL_STATUS,
    visible: true,
  })
  const fillRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const driveRef = useRef<(() => void) | null>(null)
  const bootRunRef = useRef<LandrushIslandLoadingBootRun | null>(null)
  const tasksRef = useRef(tasks)
  const onHandoffRef = useRef(onHandoff)
  const nowRef = useRef(now)
  const fallbackRef = useRef(fallback)
  const sampleInvalidationKeyRef = useRef(sampleInvalidationKey)
  if (bootRunRef.current === null && typeof window !== 'undefined') {
    bootRunRef.current = resolveLandrushIslandLoadingBootRun()
  }
  tasksRef.current = tasks
  onHandoffRef.current = onHandoff
  nowRef.current = now
  fallbackRef.current = fallback
  sampleInvalidationKeyRef.current = sampleInvalidationKey
  const timelineTopologySignature =
    topologySignature +
    (bootRunRef.current ? '|clock:streamed-shell:v1' : '|clock:runtime-fallback:v1')
  const fallbackKey = fallback
    ? [fallback.expectedRunMs, fallback.maximumRunMs, fallback.minimumRunMs].join(':')
    : 'default'

  useEffect(() => {
    const readNow = () => nowRef.current?.() ?? performance.now()
    const readClock = () => {
      const value = document.timeline.currentTime
      return value !== null && Number.isFinite(Number(value)) ? Number(value) : readNow()
    }
    const readTasks = () =>
      appendLandrushIslandDocumentReadinessTask(tasksRef.current, document.readyState !== 'loading')
    const bootRun = bootRunRef.current
    const runGeneration = bootRun?.runId ?? generation
    const startTimeMs = Math.min(bootRun?.startedAtMs ?? readNow(), readNow())
    const shellPresentation = bootRun
      ? readLandrushIslandLoadingShellPresentation(bootRun.runId)
      : null
    const runtimeOverlay = overlayRef.current
    if (shellPresentation && runtimeOverlay) {
      runtimeOverlay.style.display = 'none'
      runtimeOverlay.setAttribute('aria-hidden', 'true')
    }
    const overlay = shellPresentation?.shell ?? runtimeOverlay
    const fill = shellPresentation?.fill ?? fillRef.current
    const percent = shellPresentation?.percent ?? null
    const percentReel = shellPresentation?.percentReel ?? null
    const status = shellPresentation?.status ?? null
    let lastClockMs = readClock()
    const initialProgress = fill ? readLandrushIslandLoadingRenderedProgress(fill) : 0
    const initialInvalidationKey = sampleInvalidationKeyRef.current
    const run = createLandrushIslandLoadingTimelineRun({
      fallback: fallbackKey === 'default' ? undefined : fallbackRef.current,
      generation: runGeneration,
      initialObservationTimeMs: readNow(),
      profileKey,
      startTimeMs,
      storage: storage === undefined ? resolveBrowserLoadingTimingStorage() : storage,
      tasks: readTasks(),
      topologySignature: timelineTopologySignature,
    })
    if (!bootRun) run.invalidatePersistence()
    run.raiseProgressFloor(initialProgress)
    const retained = bootRun?.motion?.fill === fill ? bootRun.motion : null
    const controller = createLandrushIslandLoadingProgressController({
      inheritedVelocityHoldMs: resolveLandrushIslandLoadingObservationDelay(readNow(), lastClockMs),
      initialProgress,
      initialVelocityPerSecond: shellPresentation ? STREAMED_SHELL_VELOCITY_PER_SECOND : 0,
    })
    if (retained?.progressSnapshot) {
      controller.restoreMotionSnapshot(retained.progressSnapshot)
      const retainedTime = retained.animation.currentTime
      if (retainedTime !== null && Number.isFinite(Number(retainedTime))) {
        controller.step(Math.max(0, Number(retainedTime) - (retained.animationElapsedMs ?? 0)))
      }
    }
    let animation: Animation | null = retained?.animation ?? null
    let percentAnimation: Animation | null = retained?.percentAnimation ?? null
    let segment: LandrushIslandLoadingVisualSegment | null = null
    let fadeAnimation: Animation | null = null
    let fadeFallbackTimer: number | null = null
    let frameId: number | null = null
    let lastDriveMs = Number.NEGATIVE_INFINITY
    let lastAnimatedTarget = Number.NaN
    let lastPercent = -1
    let lastStatus = status?.textContent?.trim() || LANDRUSH_ISLAND_LOADING_INITIAL_STATUS
    let lastStatusRank = -1
    let allReady = false
    let readyAtMs: number | null = null
    let completionRequested = false
    const completionGate = createLandrushIslandLoadingCompletionGate()
    let fadeStarted = false
    let fadeAttempt = 0
    let handedOff = false
    let disposed = false

    const reducedMotion = resolveLandrushIslandLoadingReducedMotion(
      typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : undefined,
    )
    if (overlay) {
      restoreLandrushIslandLoadingHandoffOverlay(overlay)
      overlay.setAttribute('role', 'progressbar')
      overlay.setAttribute('aria-valuemin', '0')
      overlay.setAttribute('aria-valuemax', '100')
    }
    runtimeOverlay
      ?.closest('main')
      ?.removeAttribute(LANDRUSH_ISLAND_LOADING_RUNTIME_OWNER_ATTRIBUTE)
    if (bootRun) bootRun.owner = 'runtime'

    const advanceMotion = () => {
      const clockMs = readClock()
      controller.step(Math.max(0, clockMs - lastClockMs))
      lastClockMs = Math.max(lastClockMs, clockMs)
    }
    const publishProgress = () => {
      const next = createLandrushIslandLoadingProgressPresentation(
        controller.getSnapshot().displayedProgress,
      )
      if (!animation && fill) fill.style.transform = `scaleX(${String(next.progress)})`
      if (!percentAnimation && percentReel) {
        percentReel.style.transform = createLandrushIslandLoadingPercentReelTransform(next.percent)
      }
      if (next.percent === lastPercent) return
      lastPercent = next.percent
      overlay?.setAttribute('aria-valuenow', String(next.percent))
      overlay?.setAttribute('aria-valuetext', `${lastStatus}, ${next.percentText}`)
      if (percent) {
        percent.hidden = false
        percent.setAttribute(
          'data-landrush-island-loading-shell-percent-value',
          String(next.percent),
        )
        if (!percentReel) percent.textContent = next.percentText
      }
      setPresentation((current) =>
        current.handedOff ? current : { ...current, progress: next.percent },
      )
    }
    const publishStatus = (next: LandrushIslandLoadingStatus) => {
      if (next.rank < lastStatusRank || next.text === lastStatus) return
      lastStatusRank = next.rank
      lastStatus = next.text
      if (status) status.textContent = next.text
      overlay?.setAttribute('aria-valuetext', `${next.text}, ${String(Math.max(0, lastPercent))}%`)
      setPresentation((current) =>
        current.handedOff ? current : { ...current, statusText: next.text },
      )
    }
    const installAnimation = () => {
      if (!fill) return
      const nextSegment = createLandrushIslandLoadingVisualPreview(controller, lastClockMs)
      const oldAnimation = animation
      const oldPercentAnimation = percentAnimation
      const nextAnimation = animateLandrushIslandLoadingPreview(fill, nextSegment)
      const nextPercentAnimation = percentReel
        ? animateLandrushIslandLoadingPercentPreview(percentReel, nextSegment)
        : null
      let installed = nextAnimation !== null && (!percentReel || nextPercentAnimation !== null)
      try {
        if (installed && nextAnimation) {
          nextAnimation.startTime = lastClockMs
          if (nextPercentAnimation) nextPercentAnimation.startTime = lastClockMs
        }
      } catch {
        installed = false
      }
      if (!installed) {
        nextAnimation?.cancel()
        nextPercentAnimation?.cancel()
      }
      animation = installed ? nextAnimation : null
      percentAnimation = installed ? nextPercentAnimation : null
      segment = installed ? nextSegment : null
      fill.style.animation = 'none'
      if (percentReel) percentReel.style.animation = 'none'
      // Both trajectories share p/v/a at this document-timeline instant; no paint can see a reset.
      oldAnimation?.cancel()
      oldPercentAnimation?.cancel()
      overlay?.setAttribute(
        LANDRUSH_ISLAND_LOADING_MOTION_CONTRACT_ATTRIBUTE,
        installed ? 'compositor' : 'frame',
      )
      lastAnimatedTarget = installed ? controller.getSnapshot().targetProgress : Number.NaN
      publishProgress()
    }
    const cancelFade = () => {
      fadeAttempt += 1
      if (fadeFallbackTimer !== null) window.clearTimeout(fadeFallbackTimer)
      fadeFallbackTimer = null
      fadeAnimation?.cancel()
      fadeAnimation = null
      fadeStarted = false
      if (overlay) restoreLandrushIslandLoadingHandoffOverlay(overlay, handedOff)
    }
    const resetCompletion = () => {
      completionRequested = false
      controller.cancelCompletion()
      readyAtMs = null
      completionGate.reset()
      overlay?.removeAttribute('data-landrush-island-loading-ready-at-ms')
      overlay?.removeAttribute('data-landrush-island-loading-100-presented')
      cancelFade()
      setPresentation((current) =>
        current.handedOff ? current : { ...current, fadingOut: false, visible: true },
      )
    }
    const finishHandoff = (expectedAttempt: number) => {
      if (disposed || handedOff || expectedAttempt !== fadeAttempt) return
      if (
        !run.update(runGeneration, readTasks(), readNow()).allReady ||
        !completionGate.hasPresentedCompletion() ||
        !controller.readyToDismiss()
      ) {
        resetCompletion()
        return
      }
      handedOff = true
      if (fadeFallbackTimer !== null) window.clearTimeout(fadeFallbackTimer)
      fadeFallbackTimer = null
      fadeAnimation?.cancel()
      fadeAnimation = null
      if (fill) fill.style.transform = 'scaleX(1)'
      if (percentReel)
        percentReel.style.transform = createLandrushIslandLoadingPercentReelTransform(100)
      animation?.cancel()
      percentAnimation?.cancel()
      animation = null
      percentAnimation = null
      if (overlay) {
        overlay.style.opacity = '0'
        overlay.style.removeProperty('will-change')
        overlay.setAttribute('aria-hidden', 'true')
        overlay.setAttribute('hidden', '')
      }
      run.commitSuccess()
      if (bootRun) {
        bootRun.owner = 'complete'
        bootRun.motion = undefined
      }
      setPresentation({
        fadingOut: false,
        handedOff: true,
        progress: 100,
        statusText: lastStatus,
        visible: false,
      })
      onHandoffRef.current(runGeneration)
    }
    const beginHandoffFade = () => {
      if (fadeStarted || handedOff || disposed) return
      fadeStarted = true
      const expectedAttempt = ++fadeAttempt
      setPresentation((current) => ({ ...current, fadingOut: true, progress: 100, visible: true }))
      const remainingMs = Math.max(
        0,
        LANDRUSH_ISLAND_LOADING_COMPLETION_DEADLINE_MS - (readNow() - (readyAtMs ?? readNow())),
      )
      const fadeDurationMs = reducedMotion ? 0 : Math.min(Math.max(0, handoffFadeMs), remainingMs)
      if (!overlay) {
        finishHandoff(expectedAttempt)
        return
      }
      fadeAnimation = animateLandrushIslandLoadingHandoffFade(overlay, fadeDurationMs, () =>
        finishHandoff(expectedAttempt),
      )
      if (fadeAnimation) {
        fadeFallbackTimer = window.setTimeout(
          () => finishHandoff(expectedAttempt),
          fadeDurationMs + 50,
        )
      }
    }
    const drive = () => {
      if (disposed || handedOff) return
      advanceMotion()
      const nowMs = readNow()
      const startDelayMs = resolveLandrushIslandLoadingObservationDelay(nowMs, lastClockMs)
      lastDriveMs = nowMs
      if (sampleInvalidationKeyRef.current !== initialInvalidationKey) run.invalidatePersistence()
      const taskSnapshot = readTasks()
      const update = run.update(runGeneration, taskSnapshot, nowMs)
      if (update.stale) return
      allReady = update.allReady
      publishStatus(resolveLandrushIslandLoadingStatus(taskSnapshot))
      overlay?.setAttribute(
        'data-landrush-island-loading-evidence',
        String(update.evidenceProgress),
      )
      overlay?.setAttribute('data-landrush-island-loading-forecast', String(update.progress))
      if (!allReady && completionRequested) resetCompletion()
      if (allReady) {
        readyAtMs ??= nowMs
        if (!completionRequested) {
          completionRequested = true
          controller.complete(startDelayMs)
          overlay?.setAttribute('data-landrush-island-loading-ready-at-ms', String(readyAtMs))
        }
      } else {
        const stage = resolveLandrushIslandLoadingProgressStage({
          displayedProgress: controller.getSnapshot().displayedProgress,
          estimatedDurationMs: run.getForecast().durationMs - (nowMs - startTimeMs),
          evidenceProgress: update.evidenceProgress,
        })
        controller.setConfirmedProgress(stage.confirmedProgress, { ...stage, startDelayMs })
      }
      if (!fadeStarted && controller.getSnapshot().targetProgress !== lastAnimatedTarget)
        installAnimation()
    }
    driveRef.current = drive
    drive()
    publishProgress()

    const onPresentationFrame = (frameTimeMs: number) => {
      frameId = null
      if (disposed || handedOff) return
      advanceMotion()
      if (readNow() - lastDriveMs >= LANDRUSH_ISLAND_LOADING_MAXIMUM_APP_PRESENTATION_GAP_MS)
        drive()
      if (!animation && !fadeStarted) installAnimation()
      publishProgress()
      const completed = allReady && controller.readyToDismiss()
      const completionPresented = completionGate.observeFrame({
        frameTimeMs,
        ready: completed,
        renderedProgress: completed && fill ? readLandrushIslandLoadingRenderedProgress(fill) : 0,
        visible: document.visibilityState === 'visible',
      })
      // The first rAF publishes 100%; only a later rAF may remove what the browser could now present.
      if (completionPresented) {
        overlay?.setAttribute('data-landrush-island-loading-100-presented', 'true')
        if (readNow() - startTimeMs >= Math.max(0, minimumVisibleMs)) beginHandoffFade()
      }
      if (!handedOff) frameId = window.requestAnimationFrame(onPresentationFrame)
    }
    frameId = window.requestAnimationFrame(onPresentationFrame)

    return () => {
      advanceMotion()
      disposed = true
      driveRef.current = null
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      cancelFade()
      if (!handedOff && bootRun && animation && fill && segment) {
        bootRun.motion = {
          animation,
          animationElapsedMs: Number(animation.currentTime) || 0,
          durationMs: segment.durationMs,
          fill,
          fromProgress: segment.from,
          ...(percentAnimation && percentReel ? { percentAnimation, percentReel } : {}),
          progressSnapshot: controller.getSnapshot(),
          toProgress: segment.to,
          velocityPerSecond: controller.getSnapshot().velocityPerSecond,
        }
        bootRun.owner = 'shell'
      } else if (!handedOff) {
        if (fill)
          fill.style.transform = `scaleX(${String(controller.getSnapshot().displayedProgress)})`
        animation?.cancel()
        percentAnimation?.cancel()
      }
      run.abort()
    }
  }, [
    fallbackKey,
    generation,
    handoffFadeMs,
    minimumVisibleMs,
    profileKey,
    storage,
    timelineTopologySignature,
  ])

  useLayoutEffect(() => {
    driveRef.current?.()
  }, [])

  return { ...presentation, fillRef, overlayRef }
}

export function resolveLandrushIslandLoadingObservationDelay(
  observationTimeMs: number,
  frameTimeMs: number,
) {
  // DocumentTimeline is frame-sampled; new evidence must not rewrite the already-presented past.
  return Number.isFinite(observationTimeMs) && Number.isFinite(frameTimeMs)
    ? Math.max(0, observationTimeMs - frameTimeMs)
    : 0
}

export function createLandrushIslandLoadingCompletionGate() {
  let firstCompleteFrameAtMs: number | null = null
  let presented = false
  const reset = () => {
    firstCompleteFrameAtMs = null
    presented = false
  }
  return {
    hasPresentedCompletion: () => presented,
    observeFrame({
      frameTimeMs,
      ready,
      renderedProgress,
      visible,
    }: Readonly<{
      frameTimeMs: number
      ready: boolean
      renderedProgress: number
      visible: boolean
    }>) {
      if (!ready || !visible || !(renderedProgress >= 1 - 1e-7) || !Number.isFinite(frameTimeMs)) {
        reset()
      } else if (firstCompleteFrameAtMs === null) {
        firstCompleteFrameAtMs = frameTimeMs
      } else if (frameTimeMs > firstCompleteFrameAtMs) {
        presented = true
      }
      return presented
    },
    reset,
  }
}

export function restoreLandrushIslandLoadingHandoffOverlay(
  element: Pick<HTMLElement, 'removeAttribute' | 'setAttribute' | 'style'>,
  handedOff = false,
) {
  if (handedOff) return
  element.style.opacity = '1'
  element.style.removeProperty('visibility')
  element.style.removeProperty('will-change')
  element.removeAttribute('hidden')
  element.setAttribute('aria-hidden', 'false')
}

export function createLandrushIslandLoadingProgressPresentation(value: number) {
  const progress = clamp01(value)
  const percent = progress >= 1 ? 100 : Math.min(99, Math.floor(progress * 100 + 1e-8))
  return { percent, percentText: `${String(percent)}%`, progress }
}

export function appendLandrushIslandDocumentReadinessTask(
  tasks: readonly LandrushIslandLoadingTaskSnapshot[],
  ready: boolean,
): LandrushIslandLoadingTaskSnapshot[] {
  if (tasks.some((task) => task.id === LANDRUSH_ISLAND_LOADING_DOCUMENT_TASK_ID)) {
    throw new Error('Landrush document-readiness task ID is reserved.')
  }
  return [
    ...tasks,
    { completed: ready ? 1 : 0, id: LANDRUSH_ISLAND_LOADING_DOCUMENT_TASK_ID, ready, total: 1 },
  ]
}

export function animateLandrushIslandLoadingHandoffFade(
  element: LandrushIslandLoadingFadeElement,
  durationMs: number,
  onFinish: () => void,
) {
  const boundedDurationMs = Math.max(0, durationMs)
  element.style.opacity = '1'
  if (!(boundedDurationMs > 0 && typeof element.animate === 'function')) {
    onFinish()
    return null
  }
  try {
    element.style.willChange = 'opacity'
    const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: boundedDurationMs,
      easing: 'ease-out',
      fill: 'forwards',
    })
    animation.addEventListener('finish', onFinish, { once: true })
    return animation
  } catch {
    element.style.removeProperty('will-change')
    onFinish()
    return null
  }
}

export function createLandrushIslandLoadingVisualPreview(
  controller: LandrushIslandLoadingProgressController,
  startedAtMs: number,
  durationMs = LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS,
): LandrushIslandLoadingVisualSegment {
  const preview = controller.createMotionPreview(durationMs)
  return {
    durationMs: preview.durationMs,
    from: preview.samples[0]?.progress ?? 0,
    keyframes: preview.samples,
    startedAtMs,
    to: preview.samples.at(-1)?.progress ?? 0,
  }
}

export function createLandrushIslandLoadingVisualKeyframes(
  segment: LandrushIslandLoadingVisualSegment,
): Keyframe[] {
  return segment.keyframes.map((keyframe, index) => {
    const next = segment.keyframes[index + 1]
    const distance = next ? next.progress - keyframe.progress : 0
    const seconds = next ? ((next.offset - keyframe.offset) * segment.durationMs) / 1_000 : 0
    const velocity = keyframe.velocityPerSecond
    const nextVelocity = next?.velocityPerSecond
    const easing =
      distance > 1e-14 && seconds > 0 && velocity !== undefined && nextVelocity !== undefined
        ? 'cubic-bezier(0.3333333333333333, ' +
          String((velocity * seconds) / (3 * distance)) +
          ', 0.6666666666666666, ' +
          String(1 - (nextVelocity * seconds) / (3 * distance)) +
          ')'
        : 'linear'
    return { easing, offset: keyframe.offset, transform: `scaleX(${String(keyframe.progress)})` }
  })
}

export function animateLandrushIslandLoadingPreview(
  element: LandrushIslandLoadingFillElement,
  segment: LandrushIslandLoadingVisualSegment,
) {
  element.style.transformOrigin = 'left center'
  element.style.willChange = 'transform'
  element.style.transform = `scaleX(${String(segment.from)})`
  if (!(segment.durationMs > 0 && typeof element.animate === 'function')) return null
  try {
    return element.animate(createLandrushIslandLoadingVisualKeyframes(segment), {
      duration: segment.durationMs,
      easing: 'linear',
      fill: 'forwards',
    })
  } catch {
    return null
  }
}

export function animateLandrushIslandLoadingPercentPreview(
  element: LandrushIslandLoadingFillElement,
  segment: LandrushIslandLoadingVisualSegment,
) {
  element.style.willChange = 'transform'
  element.style.transform = createLandrushIslandLoadingPercentReelTransform(
    createLandrushIslandLoadingProgressPresentation(segment.from).percent,
  )
  if (!(segment.durationMs > 0 && typeof element.animate === 'function')) return null
  try {
    return element.animate(createLandrushIslandLoadingPercentKeyframes(segment), {
      duration: segment.durationMs,
      easing: 'linear',
      fill: 'forwards',
    })
  } catch {
    return null
  }
}

export function createLandrushIslandLoadingPercentKeyframes(
  segment: LandrushIslandLoadingVisualSegment,
): Keyframe[] {
  const firstPercent = createLandrushIslandLoadingProgressPresentation(segment.from).percent
  const lastPercent = createLandrushIslandLoadingProgressPresentation(segment.to).percent
  const frames: Keyframe[] = [
    {
      easing: 'steps(1, end)',
      offset: 0,
      transform: createLandrushIslandLoadingPercentReelTransform(firstPercent),
    },
  ]
  for (let percent = firstPercent + 1; percent <= lastPercent; percent += 1) {
    let low = 0
    let high = 1
    for (let iteration = 0; iteration < 42; iteration += 1) {
      const middle = (low + high) / 2
      const value = resolveLandrushIslandLoadingVisualSegmentProgress(
        segment,
        segment.startedAtMs + middle * segment.durationMs,
      )
      if (value < percent / 100) low = middle
      else high = middle
    }
    frames.push({
      easing: 'steps(1, end)',
      offset: high,
      transform: createLandrushIslandLoadingPercentReelTransform(percent),
    })
  }
  if (Number(frames.at(-1)?.offset) < 1) {
    frames.push({
      easing: 'steps(1, end)',
      offset: 1,
      transform: createLandrushIslandLoadingPercentReelTransform(lastPercent),
    })
  }
  return frames
}

export function resolveLandrushIslandLoadingVisualSegmentProgress(
  segment: LandrushIslandLoadingVisualSegment,
  nowMs: number,
) {
  if (segment.durationMs <= 0) return segment.to
  const elapsedFraction = clamp01((nowMs - segment.startedAtMs) / segment.durationMs)
  let previous = segment.keyframes[0] ?? { offset: 0, progress: segment.from }
  for (const next of segment.keyframes.slice(1)) {
    if (elapsedFraction <= next.offset) {
      const duration = next.offset - previous.offset
      if (duration <= 0) return next.progress
      const amount = clamp01((elapsedFraction - previous.offset) / duration)
      const seconds = (duration * segment.durationMs) / 1_000
      const v0 = previous.velocityPerSecond
      const v1 = next.velocityPerSecond
      if (v0 === undefined || v1 === undefined)
        return previous.progress + (next.progress - previous.progress) * amount
      const c3 = 2 * previous.progress - 2 * next.progress + seconds * (v0 + v1)
      const c2 = -3 * previous.progress + 3 * next.progress - seconds * (2 * v0 + v1)
      return ((c3 * amount + c2) * amount + seconds * v0) * amount + previous.progress
    }
    previous = next
  }
  return segment.to
}

export function resolveLandrushIslandLoadingReducedMotion(
  matchMedia: ((query: string) => Pick<MediaQueryList, 'matches'>) | undefined,
) {
  try {
    return matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  } catch {
    return false
  }
}

export function readLandrushIslandLoadingShellPresentation(runId: string) {
  if (typeof document === 'undefined') return null
  const shells = document.querySelectorAll<HTMLElement>(
    `[${LANDRUSH_ISLAND_LOADING_SHELL_RUN_ATTRIBUTE}]`,
  )
  for (const shell of Array.from(shells).reverse()) {
    if (shell.getAttribute(LANDRUSH_ISLAND_LOADING_SHELL_RUN_ATTRIBUTE) !== runId) continue
    const fill = shell.querySelector<HTMLElement>(
      `[${LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE}]`,
    )
    if (!fill) continue
    return {
      fill,
      percent: shell.querySelector<HTMLElement>('[data-landrush-island-loading-shell-percent]'),
      percentReel: shell.querySelector<HTMLElement>(
        `[${LANDRUSH_ISLAND_LOADING_SHELL_PERCENT_REEL_ATTRIBUTE}]`,
      ),
      shell,
      status: shell.querySelector<HTMLElement>('[data-landrush-island-loading-shell-status]'),
    }
  }
  return null
}

export function readLandrushIslandLoadingRenderedProgress(element: HTMLElement) {
  return resolveLandrushIslandLoadingTransformProgress(getComputedStyle(element).transform)
}

export function resolveLandrushIslandLoadingTransformProgress(transform: string) {
  if (!transform || transform === 'none') return 0
  const matrix3d = /^matrix3d\((.+)\)$/.exec(transform)
  const matrix = /^matrix\((.+)\)$/.exec(transform)
  const scale = /^scaleX\((.+)\)$/.exec(transform)
  return clamp01(
    Number(
      matrix3d?.[1]?.split(',')[0]?.trim() ?? matrix?.[1]?.split(',')[0]?.trim() ?? scale?.[1] ?? 0,
    ),
  )
}

function resolveLandrushIslandLoadingBootRun(): LandrushIslandLoadingBootRun | null {
  if (typeof window === 'undefined') return null
  const bootRun = (
    window as Window & {
      __LANDRUSH_ISLAND_LOADING_BOOT_RUN__?: LandrushIslandLoadingBootRun
    }
  ).__LANDRUSH_ISLAND_LOADING_BOOT_RUN__
  if (
    bootRun?.version !== LANDRUSH_ISLAND_LOADING_BOOT_CONTRACT_VERSION ||
    bootRun.owner === 'complete' ||
    bootRun.routeKey !== window.location.pathname + window.location.search ||
    !(Number.isFinite(bootRun.startedAtMs) && bootRun.startedAtMs >= 0)
  )
    return null
  return bootRun
}

function resolveBrowserLoadingTimingStorage(): LandrushIslandLoadingTimingStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

function createLandrushIslandLoadingPercentReelTransform(percent: number) {
  return `translate3d(0, -${String(percent)}rem, 0)`
}

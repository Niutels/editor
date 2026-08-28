'use client'

import { type MutableRefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  createLandrushIslandLoadingProgressController,
  LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
  type LandrushIslandLoadingProgressController,
  resolveLandrushIslandLoadingProgressStage,
} from './landrush-island-loading-progress-controller'
import {
  createStreamedShellMotionSegment,
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
  createLandrushIslandLoadingTaskTopologyKey,
  createLandrushIslandLoadingTimelineRun,
  type LandrushIslandLoadingTaskSnapshot,
  type LandrushIslandLoadingTimelineRun,
  type LandrushIslandLoadingTimingStorage,
  type LandrushIslandLoadingTopologyFallback,
} from './landrush-island-loading-timeline'

const DEFAULT_ACCESSIBILITY_UPDATE_MS = 250
const DEFAULT_HANDOFF_FADE_MS = 360
const COMPOSITOR_TIMELINE_DURATION_MS = LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS
export const LANDRUSH_ISLAND_LOADING_MINIMUM_PRESENTATION_FPS = 20
export const LANDRUSH_ISLAND_LOADING_MAXIMUM_APP_PRESENTATION_GAP_MS =
  1_000 / LANDRUSH_ISLAND_LOADING_MINIMUM_PRESENTATION_FPS
const COMPOSITOR_SAMPLE_INTERVAL_MS = 1_000 / 30
const COMPOSITOR_MAXIMUM_SEGMENT_COUNT = Math.ceil(
  COMPOSITOR_TIMELINE_DURATION_MS / LANDRUSH_ISLAND_LOADING_MAXIMUM_APP_PRESENTATION_GAP_MS,
)
const MAXIMUM_PRESENTED_FRAME_DELTA_MS = 1_000 / 30
const PRESENTATION_WATCHDOG_STALL_MS = LANDRUSH_ISLAND_LOADING_MAXIMUM_APP_PRESENTATION_GAP_MS
export const LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS = COMPOSITOR_TIMELINE_DURATION_MS
const PREVIEW_RECONCILIATION_THRESHOLD = 0.001

export const LANDRUSH_ISLAND_LOADING_DOCUMENT_TASK_ID = '@landrush/document-ready'
export const LANDRUSH_ISLAND_LOADING_MOTION_CONTRACT_ATTRIBUTE =
  'data-landrush-island-loading-motion-contract'

type LandrushIslandLoadingFillElement = Pick<HTMLElement, 'animate' | 'style'>
type LandrushIslandLoadingFadeElement = Pick<
  HTMLElement,
  'animate' | 'removeAttribute' | 'setAttribute' | 'style'
>
type LandrushIslandLoadingPercentReelElement = Pick<HTMLElement, 'animate' | 'style'>

export type LandrushIslandLoadingHandoffAction =
  | 'wait'
  | 'begin-fade'
  | 'continue-fade'
  | 'cancel-fade'

export type LandrushIslandLoadingVisualKeyframe = Readonly<{
  offset: number
  progress: number
}>

export type LandrushIslandLoadingVisualSegment = Readonly<{
  durationMs: number
  from: number
  keyframes: readonly LandrushIslandLoadingVisualKeyframe[]
  startedAtMs: number
  to: number
}>

export type LandrushIslandLoadingTimelineHookOptions = Readonly<{
  accessibilityUpdateMs?: number
  completionAnimationMs?: number
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
  accessibilityUpdateMs = DEFAULT_ACCESSIBILITY_UPDATE_MS,
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
  const runRef = useRef<LandrushIslandLoadingTimelineRun | null>(null)
  const animationRef = useRef<Animation | null>(null)
  const percentAnimationRef = useRef<Animation | null>(null)
  const fadeAnimationRef = useRef<Animation | null>(null)
  const visualSegmentRef = useRef<LandrushIslandLoadingVisualSegment | null>(null)
  const driveRef = useRef<(() => void) | null>(null)
  const bootRunRef = useRef<LandrushIslandLoadingBootRun | null>(null)
  const tasksRef = useRef(tasks)
  const onHandoffRef = useRef(onHandoff)
  const nowRef = useRef(now)
  const fallbackRef = useRef(fallback)
  const sampleInvalidationKeyRef = useRef(sampleInvalidationKey)
  const observedSampleInvalidationKeyRef = useRef(sampleInvalidationKey)
  if (bootRunRef.current === null && typeof window !== 'undefined') {
    bootRunRef.current = resolveLandrushIslandLoadingBootRun()
  }
  tasksRef.current = tasks
  onHandoffRef.current = onHandoff
  nowRef.current = now
  fallbackRef.current = fallback
  sampleInvalidationKeyRef.current = sampleInvalidationKey
  const timingOriginSignature = bootRunRef.current
    ? 'clock:streamed-shell:v1'
    : 'clock:runtime-fallback:v1'
  const timelineTopologySignature = `${topologySignature}|${timingOriginSignature}`
  const topologyKey = createLandrushIslandLoadingTaskTopologyKey(
    appendLandrushIslandDocumentReadinessTask(tasks, false),
    timelineTopologySignature,
  )
  const fallbackKey = fallback
    ? `${String(fallback.expectedRunMs)}:${String(fallback.maximumRunMs)}:${String(
        fallback.minimumRunMs,
      )}`
    : 'default'

  useEffect(() => {
    const reducedMotion = resolveLandrushIslandLoadingReducedMotion(
      typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : undefined,
    )
    const readNow = () => nowRef.current?.() ?? performance.now()
    const readTasks = () =>
      appendLandrushIslandDocumentReadinessTask(tasksRef.current, document.readyState !== 'loading')
    const initialTasks = readTasks()
    if (
      createLandrushIslandLoadingTaskTopologyKey(initialTasks, timelineTopologySignature) !==
      topologyKey
    ) {
      throw new Error('Landrush loading task topology changed before timeline initialization.')
    }
    const initialObservationTimeMs = readNow()
    const bootRun = bootRunRef.current
    const runGeneration = bootRun?.runId ?? generation
    const startTimeMs = Math.min(
      bootRun?.startedAtMs ?? initialObservationTimeMs,
      initialObservationTimeMs,
    )
    const shellPresentation = bootRun
      ? readLandrushIslandLoadingShellPresentation(bootRun.runId)
      : null
    const runtimeOverlay = overlayRef.current
    const runtimeFill = fillRef.current
    if (shellPresentation && runtimeOverlay) {
      runtimeOverlay.style.display = 'none'
      runtimeOverlay.setAttribute('aria-hidden', 'true')
    }
    const presentationOverlay = shellPresentation?.shell ?? runtimeOverlay
    const presentationFill = shellPresentation?.fill ?? runtimeFill
    const presentationPercent = shellPresentation?.percent ?? null
    const presentationPercentReel = shellPresentation?.percentReel ?? null
    const presentationStatus = shellPresentation?.status ?? null
    const initialVisualFloor = presentationFill
      ? readLandrushIslandLoadingRenderedProgress(presentationFill)
      : 0
    const initialSampleInvalidationKey = sampleInvalidationKeyRef.current
    const run = createLandrushIslandLoadingTimelineRun({
      fallback: fallbackKey === 'default' ? undefined : fallbackRef.current,
      generation: runGeneration,
      initialObservationTimeMs,
      profileKey,
      startTimeMs,
      storage: storage === undefined ? resolveBrowserLoadingTimingStorage() : storage,
      tasks: initialTasks,
      topologySignature: timelineTopologySignature,
    })
    if (!bootRun) run.invalidatePersistence()
    run.raiseProgressFloor(initialVisualFloor)
    runRef.current = run
    const inheritedMotion =
      bootRun?.motion?.fill === presentationFill &&
      bootRun.motion.animation.playState !== 'idle' &&
      bootRun.motion.animation.playState !== 'finished' &&
      (!presentationPercentReel ||
        (bootRun.motion.percentReel === presentationPercentReel &&
          bootRun.motion.percentAnimation?.playState !== 'idle' &&
          bootRun.motion.percentAnimation?.playState !== 'finished'))
        ? bootRun.motion
        : null
    const inheritedProgressSnapshot = inheritedMotion?.progressSnapshot
    const inheritedVisualSegment = inheritedMotion
      ? createLinearLandrushIslandLoadingVisualSegment(
          inheritedMotion.fromProgress,
          inheritedMotion.toProgress,
          inheritedMotion.durationMs,
          0,
        )
      : null
    const inheritedPendingStage =
      inheritedMotion && !inheritedProgressSnapshot
        ? {
            ceiling: LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
            confirmedProgress: initialVisualFloor,
            estimatedDurationMs: Math.max(
              10_000,
              ((LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS - initialVisualFloor) /
                Math.max(STREAMED_SHELL_VELOCITY_PER_SECOND, inheritedMotion.velocityPerSecond)) *
                1_000,
            ),
          }
        : null
    const progressController = createLandrushIslandLoadingProgressController({
      initialProgress: initialVisualFloor,
      initialVelocityPerSecond: STREAMED_SHELL_VELOCITY_PER_SECOND,
    })
    if (inheritedProgressSnapshot) {
      progressController.restoreMotionSnapshot(inheritedProgressSnapshot)
    }
    progressController.synchronizeRenderedProgress(
      initialVisualFloor,
      STREAMED_SHELL_VELOCITY_PER_SECOND,
    )
    if (inheritedPendingStage) {
      progressController.setConfirmedProgress(
        inheritedPendingStage.confirmedProgress,
        inheritedPendingStage,
      )
    }
    animationRef.current = inheritedMotion?.animation ?? null
    percentAnimationRef.current = inheritedMotion?.percentAnimation ?? null
    visualSegmentRef.current = inheritedVisualSegment
    let animationElapsedMs =
      Number.isFinite(inheritedMotion?.animationElapsedMs)
        ? Math.max(0, inheritedMotion?.animationElapsedMs ?? 0)
        : inheritedMotion?.animation.currentTime === null
          ? null
          : Math.max(0, Number(inheritedMotion?.animation.currentTime) || 0)
    let completionRequested = false
    let fadeStarted = false
    let fadeAttempt = 0
    let fadeFallbackTimer: number | null = null
    let frameId: number | null = null
    let lastFrameAtMs = initialObservationTimeMs
    let lastRenderedProgress = initialVisualFloor
    let lastPresentedProgress = initialVisualFloor
    let lastPresentedPercent = -1
    let lastPresentedStatusRank = -1
    let lastPresentedStatusText =
      presentationStatus?.textContent?.trim() || LANDRUSH_ISLAND_LOADING_INITIAL_STATUS
    let handedOff = false
    let motionAdopted = inheritedMotion !== null

    if (presentationOverlay) {
      presentationOverlay.style.opacity = '1'
      presentationOverlay.style.removeProperty('visibility')
      presentationOverlay.removeAttribute('hidden')
      presentationOverlay.setAttribute('role', 'progressbar')
      presentationOverlay.setAttribute('aria-valuemin', '0')
      presentationOverlay.setAttribute('aria-valuemax', '100')
      presentationOverlay.setAttribute(
        LANDRUSH_ISLAND_LOADING_MOTION_CONTRACT_ATTRIBUTE,
        inheritedMotion ? 'compositor' : shellPresentation ? 'css' : 'pending',
      )
    }
    if (presentationFill) {
      presentationFill.style.transformOrigin = 'left center'
      presentationFill.style.willChange = 'transform'
    }
    runtimeOverlay
      ?.closest('main')
      ?.removeAttribute(LANDRUSH_ISLAND_LOADING_RUNTIME_OWNER_ATTRIBUTE)

    const publishStatus = (status: LandrushIslandLoadingStatus) => {
      if (status.rank < lastPresentedStatusRank) return
      lastPresentedStatusRank = status.rank
      lastPresentedStatusText = status.text
      if (presentationStatus && presentationStatus.textContent !== status.text) {
        presentationStatus.textContent = status.text
      }
      if (presentationOverlay) {
        const percent = Math.max(0, lastPresentedPercent)
        presentationOverlay.setAttribute('aria-valuetext', `${status.text}, ${String(percent)}%`)
      }
      setPresentation((current) =>
        current.handedOff || current.statusText === status.text
          ? current
          : { ...current, statusText: status.text },
      )
    }

    const publishProgress = (progress: number) => {
      const nextProgress = Math.max(lastPresentedProgress, clamp01(progress))
      lastPresentedProgress = nextProgress
      const next = createLandrushIslandLoadingProgressPresentation(nextProgress)
      if (!animationRef.current && presentationFill) {
        presentationFill.style.transform = `scaleX(${String(next.progress)})`
        lastRenderedProgress = next.progress
      }
      if (!percentAnimationRef.current && presentationPercentReel) {
        presentationPercentReel.style.transform = createLandrushIslandLoadingPercentReelTransform(
          next.percent,
        )
      }
      if (presentationOverlay) {
        presentationOverlay.setAttribute('aria-valuenow', String(next.percent))
        presentationOverlay.setAttribute(
          'aria-valuetext',
          `${lastPresentedStatusText}, ${String(next.percent)}%`,
        )
      }
      if (presentationPercent) {
        presentationPercent.hidden = false
        presentationPercent.setAttribute(
          'data-landrush-island-loading-shell-percent-value',
          String(next.percent),
        )
        if (!presentationPercentReel && presentationPercent.textContent !== next.percentText) {
          presentationPercent.textContent = next.percentText
        }
      }
      if (next.percent !== lastPresentedPercent) {
        lastPresentedPercent = next.percent
        setPresentation((current) =>
          current.handedOff ? current : { ...current, progress: next.percent, visible: true },
        )
      }
      return nextProgress
    }

    const cancelAnimation = () => {
      const animation = animationRef.current
      const percentAnimation = percentAnimationRef.current
      try {
        animation?.cancel()
        percentAnimation?.cancel()
      } catch {
        // The frame-driven fallback continues from the reconciled transform.
      }
      if (bootRun?.motion?.animation === animation) bootRun.motion = undefined
      animationRef.current = null
      percentAnimationRef.current = null
      animationElapsedMs = 0
    }

    const synchronizeControllerFromAnimation = (synchronizedCurrentTimeMs?: number) => {
      const animation = animationRef.current
      const segment = visualSegmentRef.current
      if (!(animation && segment)) return false
      const rawCurrentTime = synchronizedCurrentTimeMs ?? animation.currentTime
      const currentTimeMs = rawCurrentTime === null ? Number.NaN : Number(rawCurrentTime)
      if (!Number.isFinite(currentTimeMs)) return true
      const boundedTimeMs = Math.min(segment.durationMs, Math.max(0, currentTimeMs))
      const renderedProgress = resolveLandrushIslandLoadingVisualSegmentProgress(
        segment,
        segment.startedAtMs + boundedTimeMs,
      )
      progressController.synchronizeRenderedProgress(
        renderedProgress,
        STREAMED_SHELL_VELOCITY_PER_SECOND,
      )
      animationElapsedMs = boundedTimeMs
      return true
    }

    const reconcileRenderedProgress = (synchronizedCurrentTimeMs?: number) => {
      synchronizeControllerFromAnimation(synchronizedCurrentTimeMs)
      const modeledProgress = progressController.getSnapshot().displayedProgress
      if (!presentationFill) {
        return publishProgress(modeledProgress)
      }
      const renderedProgress = readLandrushIslandLoadingRenderedProgress(presentationFill)
      const reconciledProgress = Math.max(lastRenderedProgress, renderedProgress)
      lastRenderedProgress = reconciledProgress
      progressController.synchronizeRenderedProgress(
        reconciledProgress,
        STREAMED_SHELL_VELOCITY_PER_SECOND,
      )
      lastPresentedProgress = reconciledProgress
      lastPresentedPercent = -1
      return publishProgress(reconciledProgress)
    }

    const freezeRenderedPresentation = () => {
      const renderedProgress = reconcileRenderedProgress()
      if (presentationFill) {
        presentationFill.style.transform = `scaleX(${String(renderedProgress)})`
      }
      if (presentationPercentReel) {
        presentationPercentReel.style.transform = createLandrushIslandLoadingPercentReelTransform(
          createLandrushIslandLoadingProgressPresentation(renderedProgress).percent,
        )
      }
      cancelAnimation()
      publishProgress(renderedProgress)
      return renderedProgress
    }

    const startCompositorAnimation = (
      renderedStartProgress = progressController.getSnapshot().displayedProgress,
    ) => {
      if (!presentationFill) return false
      progressController.synchronizeRenderedProgress(
        renderedStartProgress,
        STREAMED_SHELL_VELOCITY_PER_SECOND,
      )
      let segment: LandrushIslandLoadingVisualSegment
      try {
        segment = createLandrushIslandLoadingAppliedVisualSegment(
          createLandrushIslandLoadingVisualPreview(
            progressController,
            readNow(),
            LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS,
            renderedStartProgress,
          ),
          reducedMotion,
        )
      } catch {
        presentationOverlay?.setAttribute(
          LANDRUSH_ISLAND_LOADING_MOTION_CONTRACT_ATTRIBUTE,
          shellPresentation && presentationFill.style.animation !== 'none' ? 'css' : 'failed',
        )
        return false
      }
      visualSegmentRef.current = segment
      const animation = animateLandrushIslandLoadingPreview(presentationFill, segment)
      const percentAnimation = presentationPercentReel
        ? animateLandrushIslandLoadingPercentPreview(presentationPercentReel, segment)
        : null
      if (!animation || (presentationPercentReel && !percentAnimation)) {
        animation?.cancel()
        percentAnimation?.cancel()
        presentationOverlay?.setAttribute(
          LANDRUSH_ISLAND_LOADING_MOTION_CONTRACT_ATTRIBUTE,
          shellPresentation && presentationFill.style.animation !== 'none' ? 'css' : 'failed',
        )
        return false
      }
      const timelineTime = document.timeline.currentTime
      try {
        if (timelineTime === null) throw new Error('The document timeline is not active.')
        animation.startTime = timelineTime
        if (percentAnimation) percentAnimation.startTime = timelineTime
      } catch {
        animation.cancel()
        percentAnimation?.cancel()
        presentationOverlay?.setAttribute(
          LANDRUSH_ISLAND_LOADING_MOTION_CONTRACT_ATTRIBUTE,
          shellPresentation && presentationFill.style.animation !== 'none' ? 'css' : 'failed',
        )
        return false
      }
      animationRef.current = animation
      percentAnimationRef.current = percentAnimation
      presentationFill.style.animation = 'none'
      if (presentationPercentReel) presentationPercentReel.style.animation = 'none'
      presentationOverlay?.setAttribute(
        LANDRUSH_ISLAND_LOADING_MOTION_CONTRACT_ATTRIBUTE,
        'compositor',
      )
      animationElapsedMs = 0
      if (bootRun) {
        bootRun.motion = {
          animation,
          animationElapsedMs,
          durationMs: segment.durationMs,
          fill: presentationFill,
          fromProgress: segment.from,
          ...(percentAnimation && presentationPercentReel
            ? { percentAnimation, percentReel: presentationPercentReel }
            : {}),
          progressSnapshot: progressController.getSnapshot(),
          toProgress: segment.to,
          velocityPerSecond: STREAMED_SHELL_VELOCITY_PER_SECOND,
        }
      }
      return true
    }

    const cancelFade = () => {
      fadeAttempt += 1
      if (fadeFallbackTimer !== null) {
        window.clearTimeout(fadeFallbackTimer)
        fadeFallbackTimer = null
      }
      fadeAnimationRef.current?.cancel()
      fadeAnimationRef.current = null
      if (presentationOverlay) {
        restoreLandrushIslandLoadingHandoffOverlay(presentationOverlay, handedOff)
      }
      fadeStarted = false
    }

    const restoreActivePresentation = () => {
      setPresentation({
        fadingOut: false,
        handedOff: false,
        progress: createLandrushIslandLoadingProgressPresentation(
          progressController.getSnapshot().displayedProgress,
        ).percent,
        statusText: lastPresentedStatusText,
        visible: true,
      })
    }

    const finishHandoff = (expectedFadeAttempt: number) => {
      if (runRef.current !== run || handedOff || expectedFadeAttempt !== fadeAttempt) return
      const taskSnapshot = readTasks()
      const readiness = run.update(runGeneration, taskSnapshot, readNow())
      if (readiness.stale || !readiness.allReady) {
        completionRequested = false
        cancelFade()
        publishStatus(resolveLandrushIslandLoadingStatus(taskSnapshot))
        restoreActivePresentation()
        return
      }
      handedOff = true
      if (fadeFallbackTimer !== null) {
        window.clearTimeout(fadeFallbackTimer)
        fadeFallbackTimer = null
      }
      fadeAnimationRef.current?.cancel()
      fadeAnimationRef.current = null
      fadeStarted = false
      if (presentationOverlay) {
        presentationOverlay.style.opacity = '0'
        presentationOverlay.style.removeProperty('will-change')
        presentationOverlay.setAttribute('aria-hidden', 'true')
        presentationOverlay.setAttribute('hidden', '')
      }
      freezeRenderedPresentation()
      progressController.snapToComplete()
      if (presentationFill) presentationFill.style.transform = 'scaleX(1)'
      if (presentationPercentReel) {
        presentationPercentReel.style.transform =
          createLandrushIslandLoadingPercentReelTransform(100)
      }
      publishProgress(1)
      run.commitSuccess()
      if (bootRun) bootRun.owner = 'complete'
      setPresentation({
        fadingOut: false,
        handedOff: true,
        progress: 100,
        statusText: lastPresentedStatusText,
        visible: false,
      })
      onHandoffRef.current(runGeneration)
    }

    const beginHandoffFade = () => {
      if (fadeStarted || handedOff || runRef.current !== run) return
      fadeStarted = true
      const expectedFadeAttempt = fadeAttempt + 1
      fadeAttempt = expectedFadeAttempt
      setPresentation({
        fadingOut: true,
        handedOff: false,
        progress: createLandrushIslandLoadingProgressPresentation(
          progressController.getSnapshot().displayedProgress,
        ).percent,
        statusText: lastPresentedStatusText,
        visible: true,
      })
      const fadeDurationMs = reducedMotion ? 0 : Math.max(0, handoffFadeMs)
      if (!presentationOverlay) {
        finishHandoff(expectedFadeAttempt)
        return
      }
      fadeAnimationRef.current = animateLandrushIslandLoadingHandoffFade(
        presentationOverlay,
        fadeDurationMs,
        () => finishHandoff(expectedFadeAttempt),
      )
      if (fadeAnimationRef.current) {
        fadeFallbackTimer = window.setTimeout(
          () => finishHandoff(expectedFadeAttempt),
          fadeDurationMs + 250,
        )
      }
    }

    const drive = () => {
      if (runRef.current !== run || handedOff || !motionAdopted) return
      const nowMs = readNow()
      if (sampleInvalidationKeyRef.current !== initialSampleInvalidationKey) {
        run.invalidatePersistence()
      }
      const taskSnapshot = readTasks()
      const update = run.update(runGeneration, taskSnapshot, nowMs)
      if (update.stale) return
      publishStatus(resolveLandrushIslandLoadingStatus(taskSnapshot))
      const displayedProgress = progressController.getSnapshot().displayedProgress
      const handoffAction = resolveLandrushIslandLoadingHandoffAction({
        allReady: update.allReady,
        completionRequested,
        fadeStarted,
        minimumVisibleElapsed: nowMs - startTimeMs >= Math.max(0, minimumVisibleMs),
      })
      if (handoffAction === 'cancel-fade') {
        completionRequested = false
        cancelFade()
        restoreActivePresentation()
      } else if (handoffAction === 'continue-fade') {
        return
      } else if (handoffAction === 'begin-fade') {
        completionRequested = true
        beginHandoffFade()
        return
      }
      if (completionRequested) return
      const stage = resolveLandrushIslandLoadingProgressStage({
        displayedProgress,
        estimatedDurationMs: run.getForecast().durationMs - Math.max(0, nowMs - startTimeMs),
        evidenceProgress: update.evidenceProgress,
        forecastProgress: update.progress,
      })
      progressController.setConfirmedProgress(stage.confirmedProgress, stage)
    }
    driveRef.current = drive
    if (motionAdopted) {
      if (bootRun) bootRun.owner = 'runtime'
      publishProgress(initialVisualFloor)
      drive()
    }

    const adoptRuntimeMotion = () => {
      if (motionAdopted) return
      const renderedProgress = presentationFill
        ? readLandrushIslandLoadingRenderedProgress(presentationFill)
        : initialVisualFloor
      run.raiseProgressFloor(renderedProgress)
      progressController.synchronizeRenderedProgress(
        renderedProgress,
        STREAMED_SHELL_VELOCITY_PER_SECOND,
      )
      lastRenderedProgress = Math.max(lastRenderedProgress, renderedProgress)
      lastPresentedProgress = Math.max(lastPresentedProgress, renderedProgress)
      if (presentationFill) {
        presentationFill.style.transform = `scaleX(${String(lastPresentedProgress)})`
      }
      if (presentationPercentReel) {
        presentationPercentReel.style.transform = createLandrushIslandLoadingPercentReelTransform(
          createLandrushIslandLoadingProgressPresentation(lastPresentedProgress).percent,
        )
      }
      motionAdopted = true
      if (bootRun) bootRun.owner = 'runtime'
      publishProgress(lastPresentedProgress)
      drive()
      if (!animationRef.current) startCompositorAnimation(renderedProgress)
    }

    const onPresentationFrame = (timestamp: number) => {
      frameId = null
      if (handedOff || runRef.current !== run) return
      if (!motionAdopted) {
        adoptRuntimeMotion()
        lastFrameAtMs = timestamp
        if (!handedOff) frameId = window.requestAnimationFrame(onPresentationFrame)
        return
      }
      let progress: number
      if (animationRef.current) {
        synchronizeControllerFromAnimation()
        progress = progressController.getSnapshot().displayedProgress
        if (
          animationRef.current?.playState === 'finished' ||
          animationRef.current?.playState === 'idle'
        ) {
          progress = freezeRenderedPresentation()
          startCompositorAnimation(progress)
        }
      } else {
        const cssOwnerActive =
          shellPresentation !== null && presentationFill?.style.animation !== 'none'
        if (cssOwnerActive && presentationFill) {
          const renderedProgress = readLandrushIslandLoadingRenderedProgress(presentationFill)
          progressController.synchronizeRenderedProgress(
            renderedProgress,
            STREAMED_SHELL_VELOCITY_PER_SECOND,
          )
        } else {
          progressController.step(
            resolveLandrushIslandLoadingPresentedFrameDelta(timestamp, lastFrameAtMs),
          )
        }
        progress = progressController.getSnapshot().displayedProgress
        publishProgress(progress)
        startCompositorAnimation(progress)
      }
      lastFrameAtMs = timestamp
      publishProgress(progress)
      if (!handedOff) frameId = window.requestAnimationFrame(onPresentationFrame)
    }
    frameId = window.requestAnimationFrame(onPresentationFrame)
    const accessibilityInterval = window.setInterval(drive, Math.max(100, accessibilityUpdateMs))

    return () => {
      driveRef.current = null
      window.clearInterval(accessibilityInterval)
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      const animation = animationRef.current
      if (motionAdopted && bootRun?.owner === 'runtime' && animation && presentationFill) {
        synchronizeControllerFromAnimation()
        const percentAnimation = percentAnimationRef.current
        const segment = visualSegmentRef.current
        if (segment) {
          bootRun.motion = {
            animation,
            animationElapsedMs: animationElapsedMs ?? undefined,
            durationMs: segment.durationMs,
            fill: presentationFill,
            fromProgress: segment.from,
            ...(percentAnimation && presentationPercentReel
              ? { percentAnimation, percentReel: presentationPercentReel }
              : {}),
            progressSnapshot: progressController.getSnapshot(),
            toProgress: segment.to,
            velocityPerSecond: STREAMED_SHELL_VELOCITY_PER_SECOND,
          }
        }
        animationRef.current = null
        percentAnimationRef.current = null
      } else if (motionAdopted && !handedOff) {
        freezeRenderedPresentation()
      }
      cancelFade()
      run.abort()
      if (bootRun?.owner === 'runtime') bootRun.owner = 'shell'
      if (runRef.current === run) runRef.current = null
    }
  }, [
    accessibilityUpdateMs,
    fallbackKey,
    generation,
    handoffFadeMs,
    minimumVisibleMs,
    profileKey,
    storage,
    topologyKey,
    timelineTopologySignature,
  ])

  useLayoutEffect(() => {
    tasksRef.current = tasks
    driveRef.current?.()
  }, [tasks])

  useLayoutEffect(() => {
    if (observedSampleInvalidationKeyRef.current === sampleInvalidationKey) return
    observedSampleInvalidationKeyRef.current = sampleInvalidationKey
    runRef.current?.invalidatePersistence()
    driveRef.current?.()
  }, [sampleInvalidationKey])

  useLayoutEffect(() => {
    const element = fillRef.current
    if (!element) return
    element.style.transformOrigin = 'left center'
    element.style.willChange = 'transform'
    driveRef.current?.()
    return () => {
      element.style.removeProperty('will-change')
    }
  }, [])

  return { ...presentation, fillRef, overlayRef }
}

export function resolveLandrushIslandLoadingHandoffAction({
  allReady,
  completionRequested,
  fadeStarted,
  minimumVisibleElapsed,
}: {
  allReady: boolean
  completionRequested: boolean
  fadeStarted: boolean
  minimumVisibleElapsed: boolean
}): LandrushIslandLoadingHandoffAction {
  if (fadeStarted) return allReady ? 'continue-fade' : 'cancel-fade'
  if (completionRequested || !allReady || !minimumVisibleElapsed) return 'wait'
  return 'begin-fade'
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
    throw new Error(
      `Landrush loading task ID ${LANDRUSH_ISLAND_LOADING_DOCUMENT_TASK_ID} is reserved.`,
    )
  }
  return [
    ...tasks,
    {
      completed: ready ? 1 : 0,
      id: LANDRUSH_ISLAND_LOADING_DOCUMENT_TASK_ID,
      ready,
      total: 1,
    },
  ]
}

export function animateLandrushIslandLoadingHandoffFade(
  element: LandrushIslandLoadingFadeElement,
  durationMs: number,
  onFinish: () => void,
) {
  const boundedDurationMs = Math.max(0, durationMs)
  element.style.opacity = '1'
  element.style.willChange = 'opacity'
  if (!(boundedDurationMs > 0 && typeof element.animate === 'function')) {
    element.style.opacity = '0'
    element.style.removeProperty('will-change')
    onFinish()
    return null
  }
  const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: boundedDurationMs,
    easing: 'ease-out',
    fill: 'forwards',
  })
  animation.addEventListener(
    'finish',
    () => {
      element.style.opacity = '0'
      element.style.removeProperty('will-change')
      onFinish()
    },
    { once: true },
  )
  return animation
}

export function createLandrushIslandLoadingVisualPreview(
  controller: LandrushIslandLoadingProgressController,
  startedAtMs: number,
  durationMs = COMPOSITOR_TIMELINE_DURATION_MS,
  renderedStartProgress = controller.getSnapshot().displayedProgress,
): LandrushIslandLoadingVisualSegment {
  const segment = createStreamedShellMotionSegment(
    renderedStartProgress,
    Math.min(
      LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS,
      Number.isFinite(durationMs) ? durationMs : COMPOSITOR_TIMELINE_DURATION_MS,
    ),
  )
  if (!segment) {
    throw new RangeError('Landrush loading compositor runway is exhausted.')
  }
  return createLinearLandrushIslandLoadingVisualSegment(
    segment.fromProgress,
    segment.toProgress,
    segment.durationMs,
    startedAtMs,
  )
}

export function createLandrushIslandLoadingCompletionPreview(
  controller: LandrushIslandLoadingProgressController,
  startedAtMs: number,
  durationMs: number,
): LandrushIslandLoadingVisualSegment {
  controller.complete()
  const boundedDurationMs = Math.max(1, Number.isFinite(durationMs) ? durationMs : 1)
  const preview = controller.createMotionPreview(
    boundedDurationMs,
    resolveLandrushIslandLoadingCompositorSampleInterval(boundedDurationMs),
  )
  const from = preview.samples[0]?.progress ?? controller.getSnapshot().displayedProgress
  const to = preview.samples.at(-1)?.progress ?? from
  return {
    durationMs: preview.durationMs,
    from,
    keyframes: preview.samples,
    startedAtMs,
    to,
  }
}

export function resolveLandrushIslandLoadingCompositorSampleInterval(durationMs: number) {
  const boundedDurationMs = Math.max(1, Number.isFinite(durationMs) ? durationMs : 1)
  return Math.max(
    COMPOSITOR_SAMPLE_INTERVAL_MS,
    boundedDurationMs / COMPOSITOR_MAXIMUM_SEGMENT_COUNT,
  )
}

export function createLandrushIslandLoadingAppliedVisualSegment(
  segment: LandrushIslandLoadingVisualSegment,
  _reducedMotion: boolean,
): LandrushIslandLoadingVisualSegment {
  return segment
}

export function animateLandrushIslandLoadingPreview(
  element: LandrushIslandLoadingFillElement,
  segment: LandrushIslandLoadingVisualSegment,
) {
  const currentTransform = `scaleX(${String(segment.from)})`
  element.style.transformOrigin = 'left center'
  element.style.willChange = 'transform'
  element.style.transform = currentTransform
  if (!(segment.durationMs > 0 && typeof element.animate === 'function')) return null
  try {
    return element.animate(
      segment.keyframes.map((keyframe) => ({
        offset: keyframe.offset,
        transform: `scaleX(${String(keyframe.progress)})`,
      })),
      {
        duration: segment.durationMs,
        easing: 'linear',
        fill: 'forwards',
      },
    )
  } catch {
    return null
  }
}

export function animateLandrushIslandLoadingPercentPreview(
  element: LandrushIslandLoadingPercentReelElement,
  segment: LandrushIslandLoadingVisualSegment,
) {
  const fromPercent = createLandrushIslandLoadingProgressPresentation(segment.from).percent
  element.style.willChange = 'transform'
  element.style.transform = createLandrushIslandLoadingPercentReelTransform(fromPercent)
  if (!(segment.durationMs > 0 && typeof element.animate === 'function')) return null
  try {
    return element.animate(
      createLandrushIslandLoadingPercentRetargetKeyframes(segment, 0).map((keyframe) => ({
        easing: 'steps(1, end)',
        offset: keyframe.offset,
        transform: createLandrushIslandLoadingPercentReelTransform(keyframe.percent),
      })),
      {
        duration: segment.durationMs,
        easing: 'linear',
        fill: 'forwards',
      },
    )
  } catch {
    return null
  }
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

export function retargetLandrushIslandLoadingAnimationsWhileRunning(
  animation: Pick<Animation, 'currentTime' | 'playState'>,
  percentAnimation: Pick<Animation, 'currentTime' | 'playState'> | null,
  retarget: (currentTimeMs: number) => boolean,
) {
  try {
    if (
      animation.playState === 'idle' ||
      animation.playState === 'finished' ||
      percentAnimation?.playState === 'idle' ||
      percentAnimation?.playState === 'finished'
    ) {
      return false
    }
    const currentTimeMs = Number(animation.currentTime)
    if (!Number.isFinite(currentTimeMs)) return false
    if (percentAnimation) percentAnimation.currentTime = currentTimeMs
    return retarget(currentTimeMs)
  } catch {
    return false
  }
}

export function resolveLandrushIslandLoadingPresentedFrameDelta(
  timestampMs: number,
  previousTimestampMs: number,
) {
  return Math.min(
    MAXIMUM_PRESENTED_FRAME_DELTA_MS,
    Math.max(
      0,
      Number.isFinite(timestampMs - previousTimestampMs) ? timestampMs - previousTimestampMs : 0,
    ),
  )
}

export function shouldAdvanceLandrushIslandLoadingFrameFallback(
  timestampMs: number,
  previousTimestampMs: number,
) {
  const elapsedMs = timestampMs - previousTimestampMs
  return Number.isFinite(elapsedMs) && elapsedMs >= PRESENTATION_WATCHDOG_STALL_MS
}

export function resolveLandrushIslandLoadingCompositorElapsedDelta(
  currentTimeMs: number,
  previousTimeMs: number,
) {
  return Math.min(
    LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS,
    Math.max(
      0,
      Number.isFinite(currentTimeMs - previousTimeMs) ? currentTimeMs - previousTimeMs : 0,
    ),
  )
}

export function retargetLandrushIslandLoadingPreview(
  animation: Pick<Animation, 'currentTime' | 'effect' | 'playState'>,
  element: LandrushIslandLoadingFillElement,
  segment: LandrushIslandLoadingVisualSegment,
  synchronizedCurrentTimeMs?: number,
) {
  element.style.transformOrigin = 'left center'
  const rawCurrentTime = synchronizedCurrentTimeMs ?? animation.currentTime
  const currentTimeMs = rawCurrentTime === null ? Number.NaN : Number(rawCurrentTime)
  const effect = animation.effect as
    | (AnimationEffect & {
        setKeyframes?: (keyframes: Keyframe[] | PropertyIndexedKeyframes) => void
      })
    | null
  if (
    animation.playState === 'idle' ||
    animation.playState === 'finished' ||
    !Number.isFinite(currentTimeMs) ||
    typeof effect?.setKeyframes !== 'function'
  ) {
    return false
  }

  try {
    effect.setKeyframes(
      createLandrushIslandLoadingRetargetKeyframes(segment, currentTimeMs).map((keyframe) => ({
        offset: keyframe.offset,
        transform: `scaleX(${String(keyframe.progress)})`,
      })),
    )
    return true
  } catch {
    return false
  }
}

export function retargetLandrushIslandLoadingPercentPreview(
  animation: Pick<Animation, 'currentTime' | 'effect' | 'playState'>,
  element: LandrushIslandLoadingPercentReelElement,
  segment: LandrushIslandLoadingVisualSegment,
  synchronizedCurrentTimeMs?: number,
) {
  const rawCurrentTime = synchronizedCurrentTimeMs ?? animation.currentTime
  const currentTimeMs = rawCurrentTime === null ? Number.NaN : Number(rawCurrentTime)
  const effect = animation.effect as
    | (AnimationEffect & {
        setKeyframes?: (keyframes: Keyframe[] | PropertyIndexedKeyframes) => void
      })
    | null
  if (
    animation.playState === 'idle' ||
    animation.playState === 'finished' ||
    !Number.isFinite(currentTimeMs) ||
    typeof effect?.setKeyframes !== 'function'
  ) {
    return false
  }

  try {
    effect.setKeyframes(
      createLandrushIslandLoadingPercentRetargetKeyframes(segment, currentTimeMs).map(
        (keyframe) => ({
          easing: 'steps(1, end)',
          offset: keyframe.offset,
          transform: createLandrushIslandLoadingPercentReelTransform(keyframe.percent),
        }),
      ),
    )
    return true
  } catch {
    return false
  }
}

export function createLandrushIslandLoadingRetargetKeyframes(
  segment: LandrushIslandLoadingVisualSegment,
  currentTimeMs: number,
): LandrushIslandLoadingVisualKeyframe[] {
  const timelineDurationMs = Math.max(
    1,
    Number.isFinite(segment.durationMs) ? segment.durationMs : 1,
  )
  const boundedCurrentTimeMs = Math.min(
    timelineDurationMs,
    Math.max(0, Number.isFinite(currentTimeMs) ? currentTimeMs : 0),
  )
  const currentOffset = boundedCurrentTimeMs / timelineDurationMs
  const availableDurationMs = Math.max(0, timelineDurationMs - boundedCurrentTimeMs)
  const segmentDurationMs = Math.max(
    0,
    Number.isFinite(segment.durationMs) ? segment.durationMs : 0,
  )
  const availableSourceOffset =
    segmentDurationMs > 0 ? Math.min(1, availableDurationMs / segmentDurationMs) : 0
  const keyframes: LandrushIslandLoadingVisualKeyframe[] = [{ offset: 0, progress: segment.from }]
  if (currentOffset > 0) keyframes.push({ offset: currentOffset, progress: segment.from })

  const appendKeyframe = (offset: number, progress: number) => {
    const previous = keyframes.at(-1)!
    const boundedOffset = Math.min(1, Math.max(previous.offset, clamp01(offset)))
    if (Math.abs(previous.offset - boundedOffset) <= Number.EPSILON) return
    const elapsedSeconds =
      ((boundedOffset - previous.offset) * timelineDurationMs) / 1_000
    const maximumProgress =
      previous.progress + LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND * elapsedSeconds
    keyframes.push({
      offset: boundedOffset,
      progress: Math.max(previous.progress, Math.min(clamp01(progress), maximumProgress)),
    })
  }

  for (const keyframe of segment.keyframes.slice(1)) {
    const sourceOffset = clamp01(keyframe.offset)
    if (sourceOffset > availableSourceOffset) break
    appendKeyframe(
      currentOffset + (segmentDurationMs * sourceOffset) / timelineDurationMs,
      keyframe.progress,
    )
  }

  if (availableSourceOffset < 1) {
    appendKeyframe(
      1,
      resolveLandrushIslandLoadingVisualSegmentProgress(
        segment,
        segment.startedAtMs + segmentDurationMs * availableSourceOffset,
      ),
    )
  } else {
    appendKeyframe(currentOffset + segmentDurationMs / timelineDurationMs, segment.to)
    appendKeyframe(1, keyframes.at(-1)?.progress ?? segment.from)
  }
  return keyframes
}

export function createLandrushIslandLoadingPercentRetargetKeyframes(
  segment: LandrushIslandLoadingVisualSegment,
  currentTimeMs: number,
) {
  const progressKeyframes = createLandrushIslandLoadingRetargetKeyframes(segment, currentTimeMs)
  const first = progressKeyframes[0] ?? { offset: 0, progress: segment.from }
  const keyframes: Array<{ offset: number; percent: number }> = [
    {
      offset: first.offset,
      percent: createLandrushIslandLoadingProgressPresentation(first.progress).percent,
    },
  ]

  for (let index = 1; index < progressKeyframes.length; index += 1) {
    const previous = progressKeyframes[index - 1]!
    const next = progressKeyframes[index]!
    const previousPercent = createLandrushIslandLoadingProgressPresentation(
      previous.progress,
    ).percent
    const nextPercent = createLandrushIslandLoadingProgressPresentation(next.progress).percent
    const progressDelta = next.progress - previous.progress
    if (!(progressDelta > 0 && next.offset > previous.offset)) continue

    for (let percent = previousPercent + 1; percent <= nextPercent; percent += 1) {
      const threshold = percent >= 100 ? 1 : percent / 100
      const amount = clamp01((threshold - previous.progress) / progressDelta)
      const offset = previous.offset + (next.offset - previous.offset) * amount
      const last = keyframes.at(-1)
      if (last && Math.abs(last.offset - offset) <= Number.EPSILON) {
        keyframes[keyframes.length - 1] = { offset, percent }
      } else {
        keyframes.push({ offset, percent })
      }
    }
  }

  const finalProgress = progressKeyframes.at(-1)?.progress ?? segment.to
  const finalPercent = createLandrushIslandLoadingProgressPresentation(finalProgress).percent
  if ((keyframes.at(-1)?.offset ?? 0) < 1) keyframes.push({ offset: 1, percent: finalPercent })
  return keyframes
}

export function animateLandrushIslandLoadingFill(
  element: LandrushIslandLoadingFillElement,
  from: number,
  to: number,
  durationMs: number,
) {
  return animateLandrushIslandLoadingPreview(
    element,
    createLinearLandrushIslandLoadingVisualSegment(from, to, durationMs, 0),
  )
}

export function resolveLandrushIslandLoadingVisualSegmentProgress(
  segment: LandrushIslandLoadingVisualSegment,
  nowMs: number,
) {
  if (segment.durationMs <= 0) return segment.to
  const elapsedFraction = clamp01((nowMs - segment.startedAtMs) / segment.durationMs)
  let previous = segment.keyframes[0] ?? { offset: 0, progress: segment.from }
  for (const keyframe of segment.keyframes.slice(1)) {
    if (elapsedFraction <= keyframe.offset) {
      if (keyframe.offset <= previous.offset) return keyframe.progress
      const amount = clamp01(
        (elapsedFraction - previous.offset) / (keyframe.offset - previous.offset),
      )
      return previous.progress + (keyframe.progress - previous.progress) * amount
    }
    previous = keyframe
  }
  return segment.to
}

export function shouldReconcileLandrushIslandLoadingPreview(
  segment: LandrushIslandLoadingVisualSegment | null,
  nowMs: number,
  modeledProgress: number,
) {
  if (!segment) return true
  if (nowMs - segment.startedAtMs >= segment.durationMs) return true
  const visualProgress = resolveLandrushIslandLoadingVisualSegmentProgress(segment, nowMs)
  return modeledProgress > visualProgress + PREVIEW_RECONCILIATION_THRESHOLD
}

function createLinearLandrushIslandLoadingVisualSegment(
  from: number,
  to: number,
  durationMs: number,
  startedAtMs: number,
): LandrushIslandLoadingVisualSegment {
  const boundedFrom = clamp01(from)
  const boundedTo = Math.max(boundedFrom, clamp01(to))
  return {
    durationMs,
    from: boundedFrom,
    keyframes: [
      { offset: 0, progress: boundedFrom },
      { offset: 1, progress: boundedTo },
    ],
    startedAtMs,
    to: boundedTo,
  }
}

export function resolveDisplayedLoadingProgress(
  segment: LandrushIslandLoadingVisualSegment | null,
  nowMs: number,
  fallback: number,
) {
  return segment ? resolveLandrushIslandLoadingVisualSegmentProgress(segment, nowMs) : fallback
}

function resolveBrowserLoadingTimingStorage(): LandrushIslandLoadingTimingStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readLandrushIslandLoadingShellProgress(runId: string) {
  return readLandrushIslandLoadingShellPresentation(runId)?.progress ?? 0
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
      progress: readLandrushIslandLoadingRenderedProgress(fill),
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
  if (matrix3d) {
    return clamp01(Number(matrix3d[1]?.split(',')[0]?.trim()))
  }
  const matrix = /^matrix\((.+)\)$/.exec(transform)
  if (matrix) {
    return clamp01(Number(matrix[1]?.split(',')[0]?.trim()))
  }
  const scale = /^scaleX\((.+)\)$/.exec(transform)
  return scale ? clamp01(Number(scale[1])) : 0
}

function resolveLandrushIslandLoadingBootRun(): LandrushIslandLoadingBootRun | null {
  if (typeof window === 'undefined') return null
  const scopedWindow = window as Window & {
    __LANDRUSH_ISLAND_LOADING_BOOT_RUN__?: LandrushIslandLoadingBootRun
  }
  const bootRun = scopedWindow.__LANDRUSH_ISLAND_LOADING_BOOT_RUN__
  if (
    bootRun?.version !== LANDRUSH_ISLAND_LOADING_BOOT_CONTRACT_VERSION ||
    bootRun.owner === 'complete' ||
    bootRun.routeKey !== `${window.location.pathname}${window.location.search}` ||
    !(Number.isFinite(bootRun.startedAtMs) && bootRun.startedAtMs >= 0)
  ) {
    return null
  }
  return bootRun
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

function createLandrushIslandLoadingPercentReelTransform(percent: number) {
  return `translate3d(0, -${String(percent)}rem, 0)`
}

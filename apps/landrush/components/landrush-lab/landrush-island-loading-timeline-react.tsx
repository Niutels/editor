'use client'

import { type MutableRefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  createLandrushIslandLoadingProgressController,
  LANDRUSH_ISLAND_LOADING_DISMISSAL_PROGRESS,
  LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_RENDERED_RATE_PER_SECOND,
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
const COMPLETION_READINESS_STABILITY_MS = 250
const COMPOSITOR_SAMPLE_INTERVAL_MS = 1_000 / 30
const COMPOSITOR_MAXIMUM_SEGMENT_COUNT = 900
const COMPOSITOR_RETARGET_INTERVAL_MS = 80
const MAXIMUM_PRESENTED_FRAME_DELTA_MS = 1_000 / 30
const PRESENTATION_WATCHDOG_INTERVAL_MS = 1_000 / 30
const PRESENTATION_WATCHDOG_STALL_MS = 100
export const LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS = MAXIMUM_PRESENTED_FRAME_DELTA_MS * 2
const STREAMED_SHELL_VELOCITY_PER_SECOND = 0.006
const PREVIEW_RECONCILIATION_THRESHOLD = 0.001
const COMPOSITOR_TIMELINE_DURATION_MS = LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS

export const LANDRUSH_ISLAND_LOADING_DOCUMENT_TASK_ID = '@landrush/document-ready'

type LandrushIslandLoadingFillElement = Pick<HTMLElement, 'animate' | 'style'>
type LandrushIslandLoadingFadeElement = Pick<HTMLElement, 'animate' | 'style'>
type LandrushIslandLoadingPercentReelElement = Pick<HTMLElement, 'animate' | 'style'>

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
      initialVelocityPerSecond:
        inheritedMotion?.velocityPerSecond ??
        (shellPresentation ? STREAMED_SHELL_VELOCITY_PER_SECOND : undefined),
    })
    if (inheritedProgressSnapshot) {
      progressController.restoreMotionSnapshot(inheritedProgressSnapshot)
    }
    if (inheritedPendingStage) {
      progressController.setConfirmedProgress(
        inheritedPendingStage.confirmedProgress,
        inheritedPendingStage,
      )
    }
    animationRef.current = inheritedMotion?.animation ?? null
    percentAnimationRef.current = inheritedMotion?.percentAnimation ?? null
    let inheritedMotionActive = inheritedMotion !== null && !inheritedProgressSnapshot
    let animationElapsedMs =
      inheritedProgressSnapshot && Number.isFinite(inheritedMotion?.animationElapsedMs)
        ? Math.max(0, inheritedMotion?.animationElapsedMs ?? 0)
        : inheritedMotion?.animation.currentTime === null
          ? null
          : Math.max(0, Number(inheritedMotion?.animation.currentTime) || 0)
    let allReadySinceMs: number | null = null
    let completionRequested = false
    let fadeStarted = false
    let fadeFallbackTimer: number | null = null
    let frameId: number | null = null
    let compositorRefreshFrameId: number | null = null
    let pendingCompositorMutation: ((renderedProgress: number) => void) | null = null
    let lastFrameAtMs = initialObservationTimeMs
    let lastRenderedProgress = initialVisualFloor
    let lastPresentedProgress = initialVisualFloor
    let lastPresentedPercent = -1
    let lastPresentedStatusRank = -1
    let lastPresentedStatusText =
      presentationStatus?.textContent?.trim() || LANDRUSH_ISLAND_LOADING_INITIAL_STATUS
    let handedOff = false
    let motionAdopted = inheritedMotion !== null
    let pendingStageRetargetTimer: number | null = null
    let pendingStageRetarget: Readonly<{
      ceiling: number
      confirmedProgress: number
      estimatedDurationMs: number
    }> | null = null
    let lastStageRetargetAtMs = initialObservationTimeMs
    let appliedPendingStage: Readonly<{
      ceiling: number
      confirmedProgress: number
      estimatedDurationMs: number
    }> | null = inheritedPendingStage

    if (presentationOverlay) {
      presentationOverlay.style.opacity = '1'
      presentationOverlay.style.removeProperty('visibility')
      presentationOverlay.removeAttribute('hidden')
      presentationOverlay.setAttribute('role', 'progressbar')
      presentationOverlay.setAttribute('aria-valuemin', '0')
      presentationOverlay.setAttribute('aria-valuemax', '100')
    }
    if (presentationFill) {
      presentationFill.style.transformOrigin = 'left center'
      presentationFill.style.willChange = reducedMotion ? 'auto' : 'transform'
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
      inheritedMotionActive = false
      animationElapsedMs = 0
    }

    const advanceControllerFromAnimation = (synchronizedCurrentTimeMs?: number) => {
      const animation = animationRef.current
      if (!animation) return false
      const rawCurrentTime = synchronizedCurrentTimeMs ?? animation.currentTime
      const currentTimeMs = rawCurrentTime === null ? Number.NaN : Number(rawCurrentTime)
      if (!Number.isFinite(currentTimeMs)) return true
      const boundedTimeMs = Math.min(COMPOSITOR_TIMELINE_DURATION_MS, Math.max(0, currentTimeMs))
      if (inheritedMotionActive) {
        animationElapsedMs = boundedTimeMs
        return true
      }
      if (animationElapsedMs === null) {
        animationElapsedMs = boundedTimeMs
        return true
      }
      const elapsedMs = resolveLandrushIslandLoadingCompositorElapsedDelta(
        boundedTimeMs,
        animationElapsedMs,
      )
      if (elapsedMs > 0) progressController.step(elapsedMs)
      animationElapsedMs = boundedTimeMs
      return true
    }

    const reconcileRenderedProgress = (synchronizedCurrentTimeMs?: number) => {
      advanceControllerFromAnimation(synchronizedCurrentTimeMs)
      const modeledProgress = progressController.getSnapshot().displayedProgress
      if (!presentationFill) {
        return publishProgress(modeledProgress)
      }
      const renderedProgress = readLandrushIslandLoadingRenderedProgress(presentationFill)
      const reconciledProgress = Math.max(lastRenderedProgress, renderedProgress)
      lastRenderedProgress = reconciledProgress
      progressController.adoptRenderedProgress(reconciledProgress)
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

    const startCompositorAnimation = () => {
      if (!presentationFill || reducedMotion) return false
      const segment = createLandrushIslandLoadingVisualPreview(
        progressController,
        readNow(),
        LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS,
      )
      visualSegmentRef.current = segment
      const animation = animateLandrushIslandLoadingPreview(presentationFill, segment)
      const percentAnimation = presentationPercentReel
        ? animateLandrushIslandLoadingPercentPreview(presentationPercentReel, segment)
        : null
      if (!animation || (presentationPercentReel && !percentAnimation)) {
        animation?.cancel()
        percentAnimation?.cancel()
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
        return false
      }
      animationRef.current = animation
      percentAnimationRef.current = percentAnimation
      inheritedMotionActive = false
      animationElapsedMs = 0
      if (bootRun) {
        bootRun.motion = {
          animation,
          animationElapsedMs,
          fill: presentationFill,
          ...(percentAnimation && presentationPercentReel
            ? { percentAnimation, percentReel: presentationPercentReel }
            : {}),
          progressSnapshot: progressController.getSnapshot(),
          velocityPerSecond: progressController.getSnapshot().velocityPerSecond,
        }
      }
      return true
    }

    const refreshCompositorAnimation = (mutateController?: (renderedProgress: number) => void) => {
      if (!presentationFill || reducedMotion || handedOff || fadeStarted) return
      const animation = animationRef.current
      const percentAnimation = percentAnimationRef.current
      let mutationApplied = false
      if (animation && animation.playState !== 'idle' && animation.playState !== 'finished') {
        const retargeted = retargetLandrushIslandLoadingAnimationsWhileRunning(
          animation,
          percentAnimation,
          (heldCurrentTimeMs) => {
            if (
              runRef.current !== run ||
              handedOff ||
              fadeStarted ||
              animationRef.current !== animation ||
              percentAnimationRef.current !== percentAnimation
            ) {
              return false
            }
            const boundedCurrentTimeMs = Math.min(
              COMPOSITOR_TIMELINE_DURATION_MS,
              Math.max(0, heldCurrentTimeMs),
            )
            const currentProgress = reconcileRenderedProgress(boundedCurrentTimeMs)
            mutateController?.(currentProgress)
            mutationApplied = true
            const remainingDurationMs = Math.max(
              0,
              COMPOSITOR_TIMELINE_DURATION_MS - boundedCurrentTimeMs,
            )
            if (remainingDurationMs < 1_000) return false
            const segment = createLandrushIslandLoadingVisualPreview(
              progressController,
              readNow(),
              Math.min(LANDRUSH_ISLAND_LOADING_COMPOSITOR_LEASE_MS, remainingDurationMs),
            )
            visualSegmentRef.current = segment
            const fillRetargeted = retargetLandrushIslandLoadingPreview(
              animation,
              presentationFill,
              segment,
              boundedCurrentTimeMs,
            )
            const percentRetargeted =
              !presentationPercentReel ||
              (percentAnimation
                ? retargetLandrushIslandLoadingPercentPreview(
                    percentAnimation,
                    presentationPercentReel,
                    segment,
                    boundedCurrentTimeMs,
                  )
                : false)
            return fillRetargeted && percentRetargeted
          },
        )
        if (retargeted) {
          inheritedMotionActive = false
          if (bootRun?.motion?.animation === animation) {
            bootRun.motion.animationElapsedMs = animationElapsedMs ?? undefined
            bootRun.motion.progressSnapshot = progressController.getSnapshot()
            bootRun.motion.velocityPerSecond = progressController.getSnapshot().velocityPerSecond
          }
          return
        }
        if (
          runRef.current !== run ||
          handedOff ||
          fadeStarted ||
          animationRef.current !== animation
        ) {
          return
        }
      }
      const renderedProgress = freezeRenderedPresentation()
      if (!mutationApplied) mutateController?.(renderedProgress)
      startCompositorAnimation()
    }

    const scheduleCompositorRefresh = (mutateController?: (renderedProgress: number) => void) => {
      if (mutateController) pendingCompositorMutation = mutateController
      if (compositorRefreshFrameId !== null) return
      compositorRefreshFrameId = window.requestAnimationFrame(() => {
        compositorRefreshFrameId = null
        const mutation = pendingCompositorMutation
        pendingCompositorMutation = null
        if (runRef.current === run && !handedOff && !fadeStarted) {
          refreshCompositorAnimation(mutation ?? undefined)
          if (pendingCompositorMutation && runRef.current === run && !handedOff && !fadeStarted) {
            scheduleCompositorRefresh()
          }
        }
      })
    }

    const clearPendingStageRetarget = () => {
      if (pendingStageRetargetTimer !== null) {
        window.clearTimeout(pendingStageRetargetTimer)
        pendingStageRetargetTimer = null
      }
      pendingStageRetarget = null
    }

    const flushPendingStageRetarget = () => {
      pendingStageRetargetTimer = null
      const stage = pendingStageRetarget
      pendingStageRetarget = null
      if (!stage || completionRequested || handedOff || fadeStarted) return
      scheduleCompositorRefresh(() => {
        progressController.setConfirmedProgress(stage.confirmedProgress, stage)
      })
      lastStageRetargetAtMs = readNow()
    }

    const scheduleStageRetarget = (
      stage: Readonly<{
        ceiling: number
        confirmedProgress: number
        estimatedDurationMs: number
      }>,
    ) => {
      pendingStageRetarget = stage
      if (pendingStageRetargetTimer !== null) return
      const waitMs = Math.max(
        0,
        COMPOSITOR_RETARGET_INTERVAL_MS - (readNow() - lastStageRetargetAtMs),
      )
      if (waitMs <= 0) {
        flushPendingStageRetarget()
        return
      }
      pendingStageRetargetTimer = window.setTimeout(flushPendingStageRetarget, waitMs)
    }

    const cancelFade = () => {
      if (fadeFallbackTimer !== null) {
        window.clearTimeout(fadeFallbackTimer)
        fadeFallbackTimer = null
      }
      fadeAnimationRef.current?.cancel()
      fadeAnimationRef.current = null
      if (presentationOverlay) {
        presentationOverlay.style.opacity = '1'
        presentationOverlay.style.removeProperty('will-change')
      }
      fadeStarted = false
    }

    const finishHandoff = () => {
      if (runRef.current !== run || handedOff) return
      handedOff = true
      freezeRenderedPresentation()
      cancelFade()
      progressController.snapToComplete()
      if (presentationFill) presentationFill.style.transform = 'scaleX(1)'
      if (presentationPercentReel) {
        presentationPercentReel.style.transform =
          createLandrushIslandLoadingPercentReelTransform(100)
      }
      publishProgress(1)
      run.commitSuccess()
      if (bootRun) bootRun.owner = 'complete'
      if (presentationOverlay) {
        presentationOverlay.style.opacity = '0'
        presentationOverlay.setAttribute('hidden', '')
      }
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
        finishHandoff()
        return
      }
      fadeAnimationRef.current = animateLandrushIslandLoadingHandoffFade(
        presentationOverlay,
        fadeDurationMs,
        finishHandoff,
      )
      if (fadeAnimationRef.current) {
        fadeFallbackTimer = window.setTimeout(finishHandoff, fadeDurationMs + 250)
      }
    }

    const drive = () => {
      if (runRef.current !== run || handedOff || !motionAdopted || fadeStarted) return
      const nowMs = readNow()
      if (sampleInvalidationKeyRef.current !== initialSampleInvalidationKey) {
        run.invalidatePersistence()
      }
      const taskSnapshot = readTasks()
      const update = run.update(runGeneration, taskSnapshot, nowMs)
      if (update.stale) return
      publishStatus(resolveLandrushIslandLoadingStatus(taskSnapshot))
      const displayedProgress = progressController.getSnapshot().displayedProgress
      if (update.allReady && nowMs - startTimeMs >= Math.max(0, minimumVisibleMs)) {
        allReadySinceMs ??= nowMs
        if (!completionRequested && nowMs - allReadySinceMs >= COMPLETION_READINESS_STABILITY_MS) {
          completionRequested = true
          clearPendingStageRetarget()
          if (reducedMotion) {
            progressController.complete()
            progressController.snapToComplete()
            publishProgress(1)
            beginHandoffFade()
          } else {
            scheduleCompositorRefresh(() => {
              progressController.complete()
            })
          }
          return
        }
      } else {
        allReadySinceMs = null
      }
      if (completionRequested) return
      const stage = resolveLandrushIslandLoadingProgressStage({
        displayedProgress,
        estimatedDurationMs: run.getForecast().durationMs - Math.max(0, nowMs - startTimeMs),
        evidenceProgress: update.evidenceProgress,
        forecastProgress: update.progress,
      })
      const stageNeedsRetarget =
        !appliedPendingStage || stage.ceiling > appliedPendingStage.ceiling + 0.02
      if (stageNeedsRetarget) {
        appliedPendingStage = stage
      }
      if (reducedMotion) {
        if (stageNeedsRetarget) {
          progressController.setConfirmedProgress(stage.confirmedProgress, stage)
        }
        const staticProgress = Math.max(displayedProgress, stage.confirmedProgress)
        progressController.reconcileDisplayedProgress(staticProgress)
        publishProgress(staticProgress)
      } else if (stageNeedsRetarget) {
        scheduleStageRetarget(stage)
      }
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
      progressController.adoptRenderedProgress(renderedProgress)
      lastRenderedProgress = Math.max(lastRenderedProgress, renderedProgress)
      lastPresentedProgress = Math.max(lastPresentedProgress, renderedProgress)
      if (presentationFill) {
        presentationFill.style.animation = 'none'
        presentationFill.style.transform = `scaleX(${String(lastPresentedProgress)})`
      }
      if (presentationPercentReel) {
        presentationPercentReel.style.animation = 'none'
        presentationPercentReel.style.transform = createLandrushIslandLoadingPercentReelTransform(
          createLandrushIslandLoadingProgressPresentation(lastPresentedProgress).percent,
        )
      }
      motionAdopted = true
      if (bootRun) bootRun.owner = 'runtime'
      publishProgress(lastPresentedProgress)
      drive()
      if (!reducedMotion && !animationRef.current) startCompositorAnimation()
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
        progress = reconcileRenderedProgress()
        if (
          !fadeStarted &&
          (animationRef.current?.playState === 'finished' ||
            animationRef.current?.playState === 'idle')
        ) {
          freezeRenderedPresentation()
          startCompositorAnimation()
        } else if (!fadeStarted) {
          refreshCompositorAnimation()
        }
      } else if (reducedMotion || fadeStarted) {
        progress = progressController.getSnapshot().displayedProgress
      } else {
        progressController.step(
          resolveLandrushIslandLoadingPresentedFrameDelta(timestamp, lastFrameAtMs),
        )
        progress = progressController.getSnapshot().displayedProgress
        publishProgress(progress)
        startCompositorAnimation()
      }
      lastFrameAtMs = timestamp
      publishProgress(progress)
      if (completionRequested && progressController.readyToDismiss()) beginHandoffFade()
      if (!handedOff) frameId = window.requestAnimationFrame(onPresentationFrame)
    }
    frameId = window.requestAnimationFrame(onPresentationFrame)
    const presentationWatchdogInterval = window.setInterval(() => {
      const timestamp = readNow()
      if (
        runRef.current !== run ||
        handedOff ||
        !motionAdopted ||
        reducedMotion ||
        fadeStarted ||
        !shouldAdvanceLandrushIslandLoadingFrameFallback(timestamp, lastFrameAtMs)
      ) {
        return
      }
      if (animationRef.current) freezeRenderedPresentation()
      progressController.step(
        resolveLandrushIslandLoadingPresentedFrameDelta(timestamp, lastFrameAtMs),
      )
      const progress = progressController.getSnapshot().displayedProgress
      publishProgress(progress)
      lastFrameAtMs = timestamp
      if (completionRequested && progressController.readyToDismiss()) {
        beginHandoffFade()
      } else {
        startCompositorAnimation()
      }
    }, PRESENTATION_WATCHDOG_INTERVAL_MS)
    const accessibilityInterval = window.setInterval(drive, Math.max(100, accessibilityUpdateMs))

    return () => {
      driveRef.current = null
      window.clearInterval(accessibilityInterval)
      window.clearInterval(presentationWatchdogInterval)
      clearPendingStageRetarget()
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      if (compositorRefreshFrameId !== null) {
        window.cancelAnimationFrame(compositorRefreshFrameId)
      }
      pendingCompositorMutation = null
      const animation = animationRef.current
      if (motionAdopted && bootRun?.owner === 'runtime' && animation && presentationFill) {
        advanceControllerFromAnimation()
        const percentAnimation = percentAnimationRef.current
        bootRun.motion = {
          animation,
          animationElapsedMs: animationElapsedMs ?? undefined,
          fill: presentationFill,
          ...(percentAnimation && presentationPercentReel
            ? { percentAnimation, percentReel: presentationPercentReel }
            : {}),
          progressSnapshot: progressController.getSnapshot(),
          velocityPerSecond: progressController.getSnapshot().velocityPerSecond,
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
): LandrushIslandLoadingVisualSegment {
  const preview = controller.createMotionPreview(
    durationMs,
    resolveLandrushIslandLoadingCompositorSampleInterval(durationMs),
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
  reducedMotion: boolean,
  reducedMotionProgress = segment.from,
): LandrushIslandLoadingVisualSegment {
  if (!reducedMotion) return segment
  const appliedProgress = Math.min(
    LANDRUSH_ISLAND_LOADING_DISMISSAL_PROGRESS,
    clamp01(reducedMotionProgress),
  )
  return createLinearLandrushIslandLoadingVisualSegment(
    appliedProgress,
    appliedProgress,
    1,
    segment.startedAtMs,
  )
}

export function animateLandrushIslandLoadingPreview(
  element: LandrushIslandLoadingFillElement,
  segment: LandrushIslandLoadingVisualSegment,
  reducedMotion = false,
) {
  const targetTransform = `scaleX(${String(segment.to)})`
  const currentTransform = `scaleX(${String(segment.from)})`
  element.style.transformOrigin = 'left center'
  element.style.willChange = reducedMotion ? 'auto' : 'transform'
  if (reducedMotion) {
    element.style.transform = targetTransform
    return null
  }
  element.style.transform = currentTransform
  if (!(segment.durationMs > 0 && typeof element.animate === 'function')) return null
  try {
    return element.animate(
      createLandrushIslandLoadingRetargetKeyframes(segment, 0).map((keyframe) => ({
        offset: keyframe.offset,
        transform: `scaleX(${String(keyframe.progress)})`,
      })),
      {
        duration: COMPOSITOR_TIMELINE_DURATION_MS,
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
  reducedMotion = false,
) {
  const fromPercent = createLandrushIslandLoadingProgressPresentation(segment.from).percent
  const toPercent = createLandrushIslandLoadingProgressPresentation(segment.to).percent
  element.style.willChange = reducedMotion ? 'auto' : 'transform'
  element.style.transform = createLandrushIslandLoadingPercentReelTransform(fromPercent)
  if (reducedMotion) {
    element.style.transform = createLandrushIslandLoadingPercentReelTransform(toPercent)
    return null
  }
  if (!(segment.durationMs > 0 && typeof element.animate === 'function')) return null
  try {
    return element.animate(
      createLandrushIslandLoadingPercentRetargetKeyframes(segment, 0).map((keyframe) => ({
        easing: 'steps(1, end)',
        offset: keyframe.offset,
        transform: createLandrushIslandLoadingPercentReelTransform(keyframe.percent),
      })),
      {
        duration: COMPOSITOR_TIMELINE_DURATION_MS,
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
  const boundedCurrentTimeMs = Math.min(
    COMPOSITOR_TIMELINE_DURATION_MS,
    Math.max(0, Number.isFinite(currentTimeMs) ? currentTimeMs : 0),
  )
  const currentOffset = boundedCurrentTimeMs / COMPOSITOR_TIMELINE_DURATION_MS
  const availableDurationMs = Math.max(0, COMPOSITOR_TIMELINE_DURATION_MS - boundedCurrentTimeMs)
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
      ((boundedOffset - previous.offset) * COMPOSITOR_TIMELINE_DURATION_MS) / 1_000
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
      currentOffset + (segmentDurationMs * sourceOffset) / COMPOSITOR_TIMELINE_DURATION_MS,
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
    appendKeyframe(currentOffset + segmentDurationMs / COMPOSITOR_TIMELINE_DURATION_MS, segment.to)
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

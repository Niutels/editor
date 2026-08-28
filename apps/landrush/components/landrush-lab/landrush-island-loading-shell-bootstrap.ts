import {
  LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
  type LandrushIslandLoadingProgressMotionSnapshot,
} from './landrush-island-loading-progress-controller'

export const LANDRUSH_ISLAND_LOADING_BOOT_CONTRACT_VERSION = 2
export const LANDRUSH_ISLAND_LOADING_BOOT_RUN_GLOBAL = '__LANDRUSH_ISLAND_LOADING_BOOT_RUN__'
export const LANDRUSH_ISLAND_LOADING_BOOT_SEQUENCE_GLOBAL =
  '__LANDRUSH_ISLAND_LOADING_BOOT_SEQUENCE__'
export const LANDRUSH_ISLAND_LOADING_RUNTIME_OWNER_ATTRIBUTE =
  'data-landrush-island-loading-runtime-owned'
export const LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE =
  'data-landrush-island-loading-shell-fill'
export const LANDRUSH_ISLAND_LOADING_SHELL_PERCENT_REEL_ATTRIBUTE =
  'data-landrush-island-loading-shell-percent-reel'
export const LANDRUSH_ISLAND_LOADING_SHELL_RUN_ATTRIBUTE = 'data-landrush-island-loading-run-id'
export const LANDRUSH_ISLAND_LOADING_SHELL_DELAY_PROPERTY = '--landrush-island-loading-shell-delay'
export const LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS = 120_000
export const STREAMED_SHELL_VELOCITY_PER_SECOND = 0.006

export type LandrushIslandLoadingShellMotion = {
  animation: Animation
  animationElapsedMs?: number
  durationMs: number
  fill: HTMLElement
  fromProgress: number
  percentAnimation?: Animation
  percentReel?: HTMLElement
  progressSnapshot?: LandrushIslandLoadingProgressMotionSnapshot
  toProgress: number
  velocityPerSecond: number
}

export type LandrushIslandLoadingBootRun = {
  motion?: LandrushIslandLoadingShellMotion
  navigationKey: string
  owner: 'complete' | 'runtime' | 'shell'
  routeKey: string
  runId: string
  startedAtMs: number
  version: typeof LANDRUSH_ISLAND_LOADING_BOOT_CONTRACT_VERSION
}

type LandrushIslandLoadingBootstrapWindow = Record<string, unknown> & {
  location: { pathname: string; search: string }
  navigation?: { currentEntry?: { key?: unknown } | null } | null
  performance: { now: () => number; timeOrigin: number }
}

type LandrushIslandLoadingBootstrapShell = Pick<HTMLElement, 'getAttribute' | 'setAttribute'> & {
  style: Pick<CSSStyleDeclaration, 'setProperty'>
}

type LandrushIslandLoadingShellMotionEnvironment = Readonly<{
  getComputedStyle: (element: Element) => Pick<CSSStyleDeclaration, 'transform'>
  timeline: Pick<AnimationTimeline, 'currentTime'>
}>

export function bootstrapLandrushIslandLoadingShellClient(
  shell: LandrushIslandLoadingBootstrapShell,
  target: LandrushIslandLoadingBootstrapWindow = window as unknown as LandrushIslandLoadingBootstrapWindow,
) {
  const routeKey = `${target.location.pathname}${target.location.search}`
  const entry = target.navigation?.currentEntry
  const navigationKey =
    entry && typeof entry.key === 'string' ? `entry:${entry.key}` : `route:${routeKey}`
  const nowMs = target.performance.now()
  const existingRun = target[LANDRUSH_ISLAND_LOADING_BOOT_RUN_GLOBAL] as
    | LandrushIslandLoadingBootRun
    | undefined
  const promotesRouteNavigationKey =
    existingRun?.routeKey === routeKey &&
    existingRun.navigationKey === `route:${routeKey}` &&
    navigationKey.startsWith('entry:')
  const reuse =
    existingRun?.version === LANDRUSH_ISLAND_LOADING_BOOT_CONTRACT_VERSION &&
    (existingRun.navigationKey === navigationKey || promotesRouteNavigationKey) &&
    existingRun.routeKey === routeKey &&
    existingRun.owner !== 'complete'
  let run: LandrushIslandLoadingBootRun
  if (reuse && existingRun) {
    run = existingRun
    if (promotesRouteNavigationKey) run.navigationKey = navigationKey
  } else {
    const sequence = (Number(target[LANDRUSH_ISLAND_LOADING_BOOT_SEQUENCE_GLOBAL]) || 0) + 1
    target[LANDRUSH_ISLAND_LOADING_BOOT_SEQUENCE_GLOBAL] = sequence
    run = {
      navigationKey,
      owner: 'shell',
      routeKey,
      runId: `landrush-${String(
        Math.round(Number(target.performance.timeOrigin) || Date.now()),
      )}-${String(sequence)}`,
      startedAtMs: nowMs,
      version: LANDRUSH_ISLAND_LOADING_BOOT_CONTRACT_VERSION,
    }
  }
  target[LANDRUSH_ISLAND_LOADING_BOOT_RUN_GLOBAL] = run
  if (shell.getAttribute(LANDRUSH_ISLAND_LOADING_SHELL_RUN_ATTRIBUTE) !== run.runId) {
    shell.setAttribute(LANDRUSH_ISLAND_LOADING_SHELL_RUN_ATTRIBUTE, run.runId)
    shell.style.setProperty(
      LANDRUSH_ISLAND_LOADING_SHELL_DELAY_PROPERTY,
      `${String(-Math.max(0, nowMs - run.startedAtMs))}ms`,
    )
  }
  return run
}

export function startLandrushIslandLoadingShellMotion(
  fill: HTMLElement,
  run: LandrushIslandLoadingBootRun,
  environment: LandrushIslandLoadingShellMotionEnvironment = {
    getComputedStyle: window.getComputedStyle.bind(window),
    timeline: document.timeline,
  },
  percentReel?: HTMLElement | null,
) {
  if (run.motion?.fill === fill && (!percentReel || run.motion.percentReel === percentReel)) {
    return run.motion
  }
  if (typeof fill.animate !== 'function') return null
  if (percentReel && typeof percentReel.animate !== 'function') return null

  let renderedProgress: number | null = null
  try {
    renderedProgress = resolveLandrushIslandLoadingShellTransformProgress(
      environment.getComputedStyle(fill).transform,
    )
  } catch {
    return null
  }
  if (renderedProgress === null) return null
  const segment = createStreamedShellMotionSegment(
    renderedProgress,
    LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
  )
  if (!segment) return null
  const currentTransform = `scaleX(${String(renderedProgress)})`
  let animation: Animation | null = null
  let percentAnimation: Animation | null = null
  try {
    animation = fill.animate(
      [{ transform: currentTransform }, { transform: `scaleX(${String(segment.toProgress)})` }],
      {
        duration: segment.durationMs,
        easing: 'linear',
        fill: 'forwards',
      },
    )
    if (percentReel) {
      percentAnimation = percentReel.animate(
        createLandrushIslandLoadingShellPercentKeyframes(
          renderedProgress,
          segment.toProgress,
        ),
        {
          duration: segment.durationMs,
          easing: 'linear',
          fill: 'forwards',
        },
      )
    }
    const timelineTime = environment.timeline.currentTime
    if (timelineTime === null) throw new Error('The document timeline is not active.')
    animation.startTime = timelineTime
    if (percentAnimation) percentAnimation.startTime = timelineTime
    fill.style.transform = currentTransform
    fill.style.animation = 'none'
    if (percentReel) {
      percentReel.style.transform = createLandrushIslandLoadingShellPercentTransform(
        resolveLandrushIslandLoadingShellPercent(renderedProgress),
      )
      percentReel.style.animation = 'none'
    }
  } catch {
    try {
      animation?.cancel()
      percentAnimation?.cancel()
    } catch {
      // The original CSS animation remains the visual owner.
    }
    return null
  }
  if (!animation) return null

  const motion: LandrushIslandLoadingShellMotion = {
    animation,
    durationMs: segment.durationMs,
    fill,
    fromProgress: renderedProgress,
    ...(percentAnimation && percentReel ? { percentAnimation, percentReel } : {}),
    toProgress: segment.toProgress,
    velocityPerSecond: STREAMED_SHELL_VELOCITY_PER_SECOND,
  }
  run.motion = motion
  return motion
}

export function createStreamedShellMotionSegment(fromProgress: number, maximumDurationMs: number) {
  const from = Math.min(LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS, clamp01(fromProgress))
  const requestedDurationMs = Math.max(
    0,
    Number.isFinite(maximumDurationMs) ? maximumDurationMs : 0,
  )
  const remainingDurationMs =
    ((LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS - from) /
      STREAMED_SHELL_VELOCITY_PER_SECOND) *
    1_000
  const durationMs = Math.min(requestedDurationMs, remainingDurationMs)
  if (!(durationMs > 0)) return null
  return {
    durationMs,
    fromProgress: from,
    toProgress: Math.min(
      LANDRUSH_ISLAND_LOADING_MAX_SPECULATIVE_PROGRESS,
      from + STREAMED_SHELL_VELOCITY_PER_SECOND * (durationMs / 1_000),
    ),
  }
}

export function createLandrushIslandLoadingShellPercentKeyframes(from: number, to: number) {
  const boundedFrom = clamp01(from)
  const boundedTo = Math.max(boundedFrom, clamp01(to))
  const fromPercent = resolveLandrushIslandLoadingShellPercent(boundedFrom)
  const toPercent = resolveLandrushIslandLoadingShellPercent(boundedTo)
  const keyframes: Keyframe[] = [
    {
      easing: 'steps(1, end)',
      offset: 0,
      transform: createLandrushIslandLoadingShellPercentTransform(fromPercent),
    },
  ]
  const progressDelta = boundedTo - boundedFrom

  if (progressDelta > 0) {
    for (let percent = fromPercent + 1; percent <= toPercent; percent += 1) {
      const threshold = percent >= 100 ? 1 : percent / 100
      const offset = Math.min(1, Math.max(0, (threshold - boundedFrom) / progressDelta))
      keyframes.push({
        easing: 'steps(1, end)',
        offset,
        transform: createLandrushIslandLoadingShellPercentTransform(percent),
      })
    }
  }

  if ((keyframes.at(-1)?.offset ?? 0) < 1) {
    keyframes.push({
      easing: 'steps(1, end)',
      offset: 1,
      transform: createLandrushIslandLoadingShellPercentTransform(toPercent),
    })
  }
  return keyframes
}

function resolveLandrushIslandLoadingShellTransformProgress(transform: string) {
  if (!transform || transform === 'none') return null
  const matrix3d = /^matrix3d\((.+)\)$/.exec(transform)
  const matrix = /^matrix\((.+)\)$/.exec(transform)
  const scale = /^scaleX\((.+)\)$/.exec(transform)
  const value = Number(
    matrix3d?.[1]?.split(',')[0]?.trim() ??
      matrix?.[1]?.split(',')[0]?.trim() ??
      scale?.[1] ??
      Number.NaN,
  )
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null
}

function resolveLandrushIslandLoadingShellPercent(progress: number) {
  return progress >= 1 ? 100 : Math.min(99, Math.floor(clamp01(progress) * 100 + 1e-8))
}

function createLandrushIslandLoadingShellPercentTransform(percent: number) {
  return `translate3d(0, -${String(percent)}rem, 0)`
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

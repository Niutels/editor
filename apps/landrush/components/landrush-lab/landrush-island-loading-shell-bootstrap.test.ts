import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  bootstrapLandrushIslandLoadingShellClient,
  createLandrushIslandLoadingShellPercentKeyframes,
  createStreamedShellMotionSegment,
  LANDRUSH_ISLAND_LOADING_BOOT_CONTRACT_VERSION,
  LANDRUSH_ISLAND_LOADING_BOOT_SEQUENCE_GLOBAL,
  LANDRUSH_ISLAND_LOADING_SHELL_DELAY_PROPERTY,
  LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS,
  LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
  LANDRUSH_ISLAND_LOADING_SHELL_RUN_ATTRIBUTE,
  type LandrushIslandLoadingBootRun,
  STREAMED_SHELL_VELOCITY_PER_SECOND,
  startLandrushIslandLoadingShellMotion,
} from './landrush-island-loading-shell-bootstrap'

type BootstrapWindow = Record<string, unknown> & {
  location?: { pathname: string; search: string }
  navigation: { currentEntry: { key: string } | null }
  performance?: { now: () => number; timeOrigin: number }
}

function executeBootstrap({
  navigationKey,
  nowMs,
  routeKey = '/landrush-lab/pascal-multiplayer-island?game=zombie-escape',
  target,
}: {
  navigationKey?: string
  nowMs: number
  routeKey?: string
  target: BootstrapWindow
}) {
  target.navigation.currentEntry = navigationKey ? { key: navigationKey } : null
  target.location = {
    pathname: routeKey.split('?')[0] ?? routeKey,
    search: routeKey.includes('?') ? `?${routeKey.split('?').slice(1).join('?')}` : '',
  }
  target.performance = { now: () => nowMs, timeOrigin: 1_725_000_000_000 }
  const shellTarget = createShellTarget()
  const bootRun = bootstrapLandrushIslandLoadingShellClient(
    shellTarget.shell,
    target as Parameters<typeof bootstrapLandrushIslandLoadingShellClient>[1],
  )
  return {
    attributes: shellTarget.attributes,
    bootRun,
    styles: shellTarget.styles,
  }
}

describe('Landrush island loading shell bootstrap', () => {
  test('starts one client run and lets an idempotent bridge adopt it', () => {
    const target: BootstrapWindow = { navigation: { currentEntry: { key: 'entry-a' } } }
    const firstBridge = executeBootstrap({
      navigationKey: 'entry-a',
      nowMs: 8,
      target,
    })
    const duplicateBridge = executeBootstrap({ navigationKey: 'entry-a', nowMs: 580, target })

    expect(duplicateBridge.bootRun).toBe(firstBridge.bootRun)
    expect(duplicateBridge.bootRun.startedAtMs).toBe(8)
    expect(firstBridge.attributes.get(LANDRUSH_ISLAND_LOADING_SHELL_RUN_ATTRIBUTE)).toBe(
      firstBridge.bootRun.runId,
    )
    expect(duplicateBridge.styles.get(LANDRUSH_ISLAND_LOADING_SHELL_DELAY_PROPERTY)).toBe('-572ms')
  })

  test('keeps the first client clock when the navigation entry key becomes available', () => {
    const target: BootstrapWindow = { navigation: { currentEntry: null } }
    const routeKeyedBridge = executeBootstrap({ nowMs: 8, target })
    const entryKeyedBridge = executeBootstrap({ navigationKey: 'entry-a', nowMs: 580, target })

    expect(entryKeyedBridge.bootRun).toBe(routeKeyedBridge.bootRun)
    expect(entryKeyedBridge.bootRun.navigationKey).toBe('entry:entry-a')
    expect(entryKeyedBridge.bootRun.startedAtMs).toBe(8)
    expect(entryKeyedBridge.styles.get(LANDRUSH_ISLAND_LOADING_SHELL_DELAY_PROPERTY)).toBe('-572ms')
    expect(target[LANDRUSH_ISLAND_LOADING_BOOT_SEQUENCE_GLOBAL]).toBe(1)
  })

  test('reuses one timestamp and run ID across duplicate bridges in a navigation', () => {
    const target: BootstrapWindow = { navigation: { currentEntry: { key: 'entry-a' } } }
    const first = executeBootstrap({ navigationKey: 'entry-a', nowMs: 12, target })
    const duplicate = executeBootstrap({ navigationKey: 'entry-a', nowMs: 830, target })

    expect(duplicate.bootRun).toEqual(first.bootRun)
    expect(first.bootRun.startedAtMs).toBe(12)
    expect(duplicate.attributes.get(LANDRUSH_ISLAND_LOADING_SHELL_RUN_ATTRIBUTE)).toBe(
      first.bootRun.runId,
    )
    expect(target[LANDRUSH_ISLAND_LOADING_BOOT_SEQUENCE_GLOBAL]).toBe(1)
  })

  test('starts a fresh run for a new navigation or a completed entry', () => {
    const target: BootstrapWindow = { navigation: { currentEntry: { key: 'entry-a' } } }
    const first = executeBootstrap({ navigationKey: 'entry-a', nowMs: 20, target }).bootRun
    const second = executeBootstrap({ navigationKey: 'entry-b', nowMs: 40, target }).bootRun
    second.owner = 'complete'
    const restarted = executeBootstrap({ navigationKey: 'entry-b', nowMs: 60, target }).bootRun

    expect(second.runId).not.toBe(first.runId)
    expect(restarted.runId).not.toBe(second.runId)
    expect(restarted.startedAtMs).toBe(60)
    expect(target[LANDRUSH_ISLAND_LOADING_BOOT_SEQUENCE_GLOBAL]).toBe(3)
  })

  test('does not reuse a client run when a soft navigation keeps the same entry key', () => {
    const target: BootstrapWindow = { navigation: { currentEntry: { key: 'entry-a' } } }
    const day = executeBootstrap({
      navigationKey: 'entry-a',
      nowMs: 20,
      routeKey: '/landrush-lab/pascal-multiplayer-island',
      target,
    }).bootRun
    const zombie = executeBootstrap({
      navigationKey: 'entry-a',
      nowMs: 40,
      routeKey: '/landrush-lab/pascal-multiplayer-island?game=zombie-escape',
      target,
    }).bootRun

    expect(zombie.runId).not.toBe(day.runId)
    expect(zombie.routeKey).toBe('/landrush-lab/pascal-multiplayer-island?game=zombie-escape')
    expect(target[LANDRUSH_ISLAND_LOADING_BOOT_SEQUENCE_GLOBAL]).toBe(2)
  })

  test('client bridge stamps an inert soft-navigation shell and remains idempotent', () => {
    let nowMs = 100
    const target = {
      location: {
        pathname: '/landrush-lab/pascal-multiplayer-island',
        search: '',
      },
      navigation: { currentEntry: { key: 'entry-a' } },
      performance: { now: () => nowMs, timeOrigin: 1_725_000_000_000 },
    } as BootstrapWindow & {
      location: { pathname: string; search: string }
      performance: { now: () => number; timeOrigin: number }
    }
    const firstShell = createShellTarget()
    const day = bootstrapLandrushIslandLoadingShellClient(firstShell.shell, target)
    target.location.search = '?game=zombie-escape'
    nowMs = 400
    const softNavigationShell = createShellTarget()
    const zombie = bootstrapLandrushIslandLoadingShellClient(softNavigationShell.shell, target)
    nowMs = 650
    const duplicateBridge = createShellTarget()
    const adopted = bootstrapLandrushIslandLoadingShellClient(duplicateBridge.shell, target)

    expect(zombie.runId).not.toBe(day.runId)
    expect(adopted).toBe(zombie)
    expect(softNavigationShell.attributes.get(LANDRUSH_ISLAND_LOADING_SHELL_RUN_ATTRIBUTE)).toBe(
      zombie.runId,
    )
    expect(duplicateBridge.styles.get(LANDRUSH_ISLAND_LOADING_SHELL_DELAY_PROPERTY)).toBe('-250ms')
    expect(target[LANDRUSH_ISLAND_LOADING_BOOT_SEQUENCE_GLOBAL]).toBe(2)
  })

  test('does not reapply elapsed delay to an already-stamped live shell', () => {
    let nowMs = 100
    const target = {
      location: {
        pathname: '/landrush-lab/pascal-multiplayer-island',
        search: '?game=zombie-escape',
      },
      navigation: { currentEntry: { key: 'entry-a' } },
      performance: { now: () => nowMs, timeOrigin: 1_725_000_000_000 },
    } as BootstrapWindow & {
      location: { pathname: string; search: string }
      performance: { now: () => number; timeOrigin: number }
    }
    const liveShell = createShellTarget()

    const parserRun = bootstrapLandrushIslandLoadingShellClient(liveShell.shell, target)
    expect(liveShell.styles.get(LANDRUSH_ISLAND_LOADING_SHELL_DELAY_PROPERTY)).toBe('0ms')

    nowMs = 10_100
    const adoptedRun = bootstrapLandrushIslandLoadingShellClient(liveShell.shell, target)

    expect(adoptedRun).toBe(parserRun)
    expect(liveShell.styles.get(LANDRUSH_ISLAND_LOADING_SHELL_DELAY_PROPERTY)).toBe('0ms')
  })

  test('starts one shell-owned compositor trajectory from the rendered CSS scale', () => {
    const run = createBootRun()
    const style = { animation: 'shell-progress 120s linear', transform: '' }
    let animateCalls = 0
    let frames: Keyframe[] | PropertyIndexedKeyframes | null = null
    let options: KeyframeAnimationOptions | number | undefined
    const animation = {
      cancel: () => undefined,
      startTime: null as CSSNumberish | null,
    } as Animation
    const fill = {
      animate: (
        nextFrames: Keyframe[] | PropertyIndexedKeyframes,
        nextOptions?: KeyframeAnimationOptions | number,
      ) => {
        expect(style.animation).toBe('shell-progress 120s linear')
        animateCalls += 1
        frames = nextFrames
        options = nextOptions
        return animation
      },
      style,
    } as unknown as HTMLElement
    const environment = {
      getComputedStyle: () => ({ transform: 'matrix(0.24, 0, 0, 1, 0, 0)' }),
      timeline: { currentTime: 640 },
    }

    const first = startLandrushIslandLoadingShellMotion(fill, run, environment)
    const replay = startLandrushIslandLoadingShellMotion(fill, run, environment)

    expect(replay).toBe(first)
    expect(animateCalls).toBe(1)
    expect(frames).toEqual([{ transform: 'scaleX(0.24)' }, { transform: 'scaleX(0.96)' }])
    expect(options).toEqual({
      duration: LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
      easing: 'linear',
      fill: 'forwards',
    })
    expect(animation.startTime).toBe(640)
    expect(style.animation).toBe('none')
    expect(style.transform).toBe('scaleX(0.24)')
    expect(run.motion).toEqual({
      animation,
      durationMs: LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
      fill,
      fromProgress: 0.24,
      toProgress: 0.96,
      velocityPerSecond: STREAMED_SHELL_VELOCITY_PER_SECOND,
    })
  })

  test('cannot exhaust its initial compositor runway before crossing 50 percent', () => {
    expect(
      STREAMED_SHELL_VELOCITY_PER_SECOND *
        (LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS / 1_000),
    ).toBeGreaterThan(0.5)
  })

  test('starts with a small forecast head start without increasing the bootstrap slope', () => {
    expect(LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS).toBe(0.08)
    expect(LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS).toBeLessThan(0.1)
    const segment = createStreamedShellMotionSegment(
      LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS,
      LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
    )!
    expect(segment.fromProgress).toBe(0.08)
    expect(segment.toProgress).toBeCloseTo(0.8, 12)
    expect((segment.toProgress - segment.fromProgress) / (segment.durationMs / 1000)).toBeCloseTo(
      STREAMED_SHELL_VELOCITY_PER_SECOND,
      12,
    )
  })

  test('keeps the exact shell slope while shortening the final positive runway', () => {
    const full = createStreamedShellMotionSegment(
      0,
      LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
    )
    const renewed = createStreamedShellMotionSegment(
      0.72,
      LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
    )

    expect(full).toEqual({ durationMs: 120_000, fromProgress: 0, toProgress: 0.72 })
    expect(renewed?.durationMs).toBeCloseTo(44_000, 9)
    expect(renewed?.toProgress).toBeCloseTo(0.984, 12)
    expect(
      ((renewed?.toProgress ?? 0) - (renewed?.fromProgress ?? 0)) /
        ((renewed?.durationMs ?? 1) / 1_000),
    ).toBeCloseTo(STREAMED_SHELL_VELOCITY_PER_SECOND, 12)
    expect(createStreamedShellMotionSegment(0.984, 120_000)).toBeNull()
  })

  test('gives a replacement shell in the same run its own compositor trajectory', () => {
    const run = createBootRun()
    let animateCalls = 0
    const createFill = () =>
      ({
        animate: () => {
          animateCalls += 1
          return { cancel: () => undefined, startTime: 100 } as Animation
        },
        style: { animation: 'shell-progress 120s linear', transform: '' },
      }) as unknown as HTMLElement
    const environment = {
      getComputedStyle: () => ({ transform: 'matrix(0.12, 0, 0, 1, 0, 0)' }),
      timeline: { currentTime: 100 },
    }
    const firstFill = createFill()
    const secondFill = createFill()

    const first = startLandrushIslandLoadingShellMotion(firstFill, run, environment)
    const second = startLandrushIslandLoadingShellMotion(secondFill, run, environment)

    expect(animateCalls).toBe(2)
    expect(second).not.toBe(first)
    expect(run.motion?.fill).toBe(secondFill)
  })

  test('quantizes the shell percentage on the same linear progress thresholds', () => {
    const keyframes = createLandrushIslandLoadingShellPercentKeyframes(0.241, 0.278)

    expect(keyframes[0]).toEqual({
      easing: 'steps(1, end)',
      offset: 0,
      transform: 'translate3d(0, -24rem, 0)',
    })
    expect(keyframes.at(-1)).toEqual({
      easing: 'steps(1, end)',
      offset: 1,
      transform: 'translate3d(0, -27rem, 0)',
    })
    expect(keyframes.map((keyframe) => keyframe.transform)).toEqual([
      'translate3d(0, -24rem, 0)',
      'translate3d(0, -25rem, 0)',
      'translate3d(0, -26rem, 0)',
      'translate3d(0, -27rem, 0)',
      'translate3d(0, -27rem, 0)',
    ])
  })

  test('adopts the CSS animation under reduced motion and retains it on WAAPI failure', () => {
    const reducedRun = createBootRun()
    const reducedStyle = { animation: 'shell-progress 120s linear', transform: '' }
    let reducedAnimateCalls = 0
    const reducedAnimation = { startTime: null as CSSNumberish | null } as Animation
    const reducedFill = {
      animate: () => {
        reducedAnimateCalls += 1
        return reducedAnimation
      },
      style: reducedStyle,
    } as unknown as HTMLElement
    const reduced = startLandrushIslandLoadingShellMotion(reducedFill, reducedRun, {
      getComputedStyle: () => ({ transform: 'matrix(0.12, 0, 0, 1, 0, 0)' }),
      timeline: { currentTime: 100 },
    })

    expect(reduced).toBe(reducedRun.motion)
    expect(reducedAnimateCalls).toBe(1)
    expect(reducedAnimation.startTime).toBe(100)
    expect(reducedStyle.animation).toBe('none')
    expect(reduced?.velocityPerSecond).toBe(STREAMED_SHELL_VELOCITY_PER_SECOND)

    const failedRun = createBootRun()
    const failedStyle = { animation: 'shell-progress 120s linear', transform: '' }
    const failedFill = {
      animate: () => {
        throw new Error('WAAPI unavailable')
      },
      style: failedStyle,
    } as unknown as HTMLElement
    const failed = startLandrushIslandLoadingShellMotion(failedFill, failedRun, {
      getComputedStyle: () => ({ transform: 'matrix(0.12, 0, 0, 1, 0, 0)' }),
      timeline: { currentTime: 100 },
    })

    expect(failed).toBeNull()
    expect(failedStyle.animation).toBe('shell-progress 120s linear')
    expect(failedStyle.transform).toBe('')
    expect(failedRun.motion).toBeUndefined()
  })

  test('cancels an unanchorable WAAPI motion without disabling the CSS animation', () => {
    const run = createBootRun()
    const style = { animation: 'shell-progress 120s linear', transform: '' }
    let cancelled = false
    const animation = {
      cancel: () => {
        cancelled = true
      },
      get startTime() {
        return null
      },
      set startTime(_value: CSSNumberish | null) {
        throw new Error('timeline rejected start time')
      },
    } as Animation
    const fill = {
      animate: () => animation,
      style,
    } as unknown as HTMLElement

    const motion = startLandrushIslandLoadingShellMotion(fill, run, {
      getComputedStyle: () => ({ transform: 'matrix(0.12, 0, 0, 1, 0, 0)' }),
      timeline: { currentTime: 100 },
    })

    expect(motion).toBeNull()
    expect(cancelled).toBe(true)
    expect(style.animation).toBe('shell-progress 120s linear')
    expect(style.transform).toBe('')
    expect(run.motion).toBeUndefined()
  })

  test('mounts the callback-ref bridge in every shell', () => {
    const shellSource = readFileSync(
      new URL('./landrush-island-loading-shell.tsx', import.meta.url),
      'utf8',
    )
    const bridgeSource = readFileSync(
      new URL('./landrush-island-loading-shell-client-bridge.tsx', import.meta.url),
      'utf8',
    )

    expect(shellSource).toContain('<LandrushIslandLoadingShellClientBridge />')
    expect(shellSource).toContain('LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS * 100')
    expect(shellSource).toContain('aria-valuenow={initialPercent}')
    expect(shellSource).toContain(
      'data-landrush-island-loading-shell-percent-value={String(initialPercent)}',
    )
    expect(bridgeSource).toContain(
      'startLandrushIslandLoadingShellMotion(fill, run, undefined, percentReel)',
    )
  })
})

function createBootRun(): LandrushIslandLoadingBootRun {
  return {
    navigationKey: 'entry:entry-a',
    owner: 'shell',
    routeKey: '/landrush-lab/pascal-multiplayer-island?game=zombie-escape',
    runId: 'landrush-test-1',
    startedAtMs: 0,
    version: LANDRUSH_ISLAND_LOADING_BOOT_CONTRACT_VERSION,
  }
}

function createShellTarget() {
  const attributes = new Map<string, string>()
  const styles = new Map<string, string>()
  return {
    attributes,
    shell: {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      style: { setProperty: (name: string, value: string) => styles.set(name, value) },
    } as unknown as HTMLElement,
    styles,
  }
}

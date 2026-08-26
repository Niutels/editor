import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  bootstrapLandrushIslandLoadingShellClient,
  createLandrushIslandLoadingShellPercentKeyframes,
  LANDRUSH_ISLAND_LOADING_BOOT_CONTRACT_VERSION,
  LANDRUSH_ISLAND_LOADING_BOOT_RUN_GLOBAL,
  LANDRUSH_ISLAND_LOADING_BOOT_SEQUENCE_GLOBAL,
  LANDRUSH_ISLAND_LOADING_SHELL_BOOTSTRAP_SOURCE,
  LANDRUSH_ISLAND_LOADING_SHELL_DELAY_PROPERTY,
  LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
  LANDRUSH_ISLAND_LOADING_SHELL_RUN_ATTRIBUTE,
  LANDRUSH_ISLAND_LOADING_SHELL_VELOCITY_PER_SECOND,
  type LandrushIslandLoadingBootRun,
  startLandrushIslandLoadingShellMotion,
} from './landrush-island-loading-shell-bootstrap'

type BootstrapWindow = Record<string, unknown> & {
  navigation: { currentEntry: { key: string } | null }
}

function executeBootstrap({
  insideShell = true,
  navigationKey,
  nowMs,
  routeKey = '/landrush-lab/pascal-multiplayer-island?game=zombie-escape',
  target,
}: {
  insideShell?: boolean
  navigationKey?: string
  nowMs: number
  routeKey?: string
  target: BootstrapWindow
}) {
  target.navigation.currentEntry = navigationKey ? { key: navigationKey } : null
  const attributes = new Map<string, string>()
  const styles = new Map<string, string>()
  const run = new Function(
    'window',
    'performance',
    'location',
    'document',
    LANDRUSH_ISLAND_LOADING_SHELL_BOOTSTRAP_SOURCE,
  )
  run(
    target,
    { now: () => nowMs, timeOrigin: 1_725_000_000_000 },
    {
      pathname: routeKey.split('?')[0],
      search: routeKey.includes('?') ? `?${routeKey.split('?').slice(1).join('?')}` : '',
    },
    {
      currentScript: {
        closest: () =>
          insideShell
            ? {
                setAttribute: (name: string, value: string) => attributes.set(name, value),
                style: {
                  setProperty: (name: string, value: string) => styles.set(name, value),
                },
              }
            : null,
      },
    },
  )
  return {
    attributes,
    bootRun: target[LANDRUSH_ISLAND_LOADING_BOOT_RUN_GLOBAL] as LandrushIslandLoadingBootRun,
    styles,
  }
}

describe('Landrush island loading shell bootstrap', () => {
  test('starts outside Suspense and lets a later fallback adopt the same run', () => {
    const target: BootstrapWindow = { navigation: { currentEntry: { key: 'entry-a' } } }
    const pageBoot = executeBootstrap({
      insideShell: false,
      navigationKey: 'entry-a',
      nowMs: 8,
      target,
    })
    const fallbackBoot = executeBootstrap({ navigationKey: 'entry-a', nowMs: 580, target })

    expect(pageBoot.attributes.size).toBe(0)
    expect(fallbackBoot.bootRun).toEqual(pageBoot.bootRun)
    expect(fallbackBoot.bootRun.startedAtMs).toBe(8)
    expect(fallbackBoot.attributes.get(LANDRUSH_ISLAND_LOADING_SHELL_RUN_ATTRIBUTE)).toBe(
      pageBoot.bootRun.runId,
    )
    expect(fallbackBoot.styles.get(LANDRUSH_ISLAND_LOADING_SHELL_DELAY_PROPERTY)).toBe('-572ms')
  })

  test('keeps the first shell clock when the navigation entry key becomes available', () => {
    const target: BootstrapWindow = { navigation: { currentEntry: null } }
    const streamedFallback = executeBootstrap({ nowMs: 8, target })
    const pageShell = executeBootstrap({ navigationKey: 'entry-a', nowMs: 580, target })

    expect(pageShell.bootRun).toBe(streamedFallback.bootRun)
    expect(pageShell.bootRun.navigationKey).toBe('entry:entry-a')
    expect(pageShell.bootRun.startedAtMs).toBe(8)
    expect(pageShell.styles.get(LANDRUSH_ISLAND_LOADING_SHELL_DELAY_PROPERTY)).toBe('-572ms')
    expect(target[LANDRUSH_ISLAND_LOADING_BOOT_SEQUENCE_GLOBAL]).toBe(1)
  })

  test('reuses one timestamp and run ID across duplicate fallbacks in a navigation', () => {
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

  test('does not reuse an inline run when a soft navigation keeps the same entry key', () => {
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

  test('does not reapply elapsed delay to a parser-stamped live shell', () => {
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
    const style = { animation: 'shell-progress 136.667s linear', transform: '' }
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
        expect(style.animation).toBe('shell-progress 136.667s linear')
        animateCalls += 1
        frames = nextFrames
        options = nextOptions
        return animation
      },
      style,
    } as unknown as HTMLElement
    const environment = {
      getComputedStyle: () => ({ transform: 'matrix(0.24, 0, 0, 1, 0, 0)' }),
      matchMedia: () => ({ matches: false }),
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
      fill,
      velocityPerSecond: LANDRUSH_ISLAND_LOADING_SHELL_VELOCITY_PER_SECOND,
    })
  })

  test('cannot exhaust its initial compositor runway before crossing 50 percent', () => {
    expect(
      LANDRUSH_ISLAND_LOADING_SHELL_VELOCITY_PER_SECOND *
        (LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS / 1_000),
    ).toBeGreaterThan(0.5)
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
        style: { animation: 'shell-progress 136.667s linear', transform: '' },
      }) as unknown as HTMLElement
    const environment = {
      getComputedStyle: () => ({ transform: 'matrix(0.12, 0, 0, 1, 0, 0)' }),
      matchMedia: () => ({ matches: false }),
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

  test('leaves the CSS animation running for reduced motion or WAAPI failure', () => {
    const reducedRun = createBootRun()
    const reducedStyle = { animation: 'shell-progress 136.667s linear', transform: '' }
    let reducedAnimateCalls = 0
    const reducedFill = {
      animate: () => {
        reducedAnimateCalls += 1
        return { startTime: null } as Animation
      },
      style: reducedStyle,
    } as unknown as HTMLElement
    const reduced = startLandrushIslandLoadingShellMotion(reducedFill, reducedRun, {
      getComputedStyle: () => ({ transform: 'matrix(0.12, 0, 0, 1, 0, 0)' }),
      matchMedia: () => ({ matches: true }),
      timeline: { currentTime: 100 },
    })

    expect(reduced).toBeNull()
    expect(reducedAnimateCalls).toBe(0)
    expect(reducedStyle.animation).toBe('shell-progress 136.667s linear')
    expect(reducedRun.motion).toBeUndefined()

    const failedRun = createBootRun()
    const failedStyle = { animation: 'shell-progress 136.667s linear', transform: '' }
    const failedFill = {
      animate: () => {
        throw new Error('WAAPI unavailable')
      },
      style: failedStyle,
    } as unknown as HTMLElement
    const failed = startLandrushIslandLoadingShellMotion(failedFill, failedRun, {
      getComputedStyle: () => ({ transform: 'matrix(0.12, 0, 0, 1, 0, 0)' }),
      matchMedia: () => ({ matches: false }),
      timeline: { currentTime: 100 },
    })

    expect(failed).toBeNull()
    expect(failedStyle.animation).toBe('shell-progress 136.667s linear')
    expect(failedStyle.transform).toBe('')
    expect(failedRun.motion).toBeUndefined()
  })

  test('cancels an unanchorable WAAPI motion without disabling the CSS animation', () => {
    const run = createBootRun()
    const style = { animation: 'shell-progress 136.667s linear', transform: '' }
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
      matchMedia: () => ({ matches: false }),
      timeline: { currentTime: 100 },
    })

    expect(motion).toBeNull()
    expect(cancelled).toBe(true)
    expect(style.animation).toBe('shell-progress 136.667s linear')
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

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createLandrushIslandPaintReadinessGate } from './landrush-island-loading-readiness'

function createFrameScheduler() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()

  return {
    flushFrame() {
      const pending = [...callbacks.entries()]
      callbacks.clear()
      for (const [, callback] of pending) callback(0)
    },
    pendingCount() {
      return callbacks.size
    },
    scheduler: {
      cancelFrame(frameId: number) {
        callbacks.delete(frameId)
      },
      requestFrame(callback: FrameRequestCallback) {
        const frameId = nextId
        nextId += 1
        callbacks.set(frameId, callback)
        return frameId
      },
    },
  }
}

describe('Landrush island paint readiness', () => {
  test('waits for two browser presentation frames after every prerequisite is ready', () => {
    const frames = createFrameScheduler()
    const changes: boolean[] = []
    const gate = createLandrushIslandPaintReadinessGate({
      onReadyChange: (ready) => changes.push(ready),
      scheduler: frames.scheduler,
    })

    gate.setPrerequisitesReady(true)
    expect(frames.pendingCount()).toBe(1)
    frames.flushFrame()
    expect(changes).toEqual([])
    expect(frames.pendingCount()).toBe(1)
    frames.flushFrame()

    expect(changes).toEqual([true])
    expect(frames.pendingCount()).toBe(0)
  })

  test('cancels the paint handoff when readiness is withdrawn', () => {
    const frames = createFrameScheduler()
    const changes: boolean[] = []
    const gate = createLandrushIslandPaintReadinessGate({
      onReadyChange: (ready) => changes.push(ready),
      scheduler: frames.scheduler,
    })

    gate.setPrerequisitesReady(true)
    frames.flushFrame()
    gate.setPrerequisitesReady(false)
    frames.flushFrame()

    expect(changes).toEqual([])
    expect(frames.pendingCount()).toBe(0)
  })

  test('resets immediately after a previously presented scene becomes unready', () => {
    const frames = createFrameScheduler()
    const changes: boolean[] = []
    const gate = createLandrushIslandPaintReadinessGate({
      onReadyChange: (ready) => changes.push(ready),
      scheduler: frames.scheduler,
    })

    gate.setPrerequisitesReady(true)
    frames.flushFrame()
    frames.flushFrame()
    gate.setPrerequisitesReady(false)

    expect(changes).toEqual([true, false])
  })

  test('wires the loader to a Landrush world frame and the presentation gate', () => {
    const clientPath = fileURLToPath(new URL('./landrush-island-client.tsx', import.meta.url))
    const clientSource = readFileSync(clientPath, 'utf8')

    expect(clientSource).toContain('<LandrushIslandWorldFrameReporter')
    expect(clientSource).toContain('useLandrushIslandPaintReadiness(loadingAssetsReady)')
    expect(clientSource).toContain('assetsReady={loadingPaintReady}')
  })

  test('keeps the route shell dark only until the canonical runtime world paints a frame', () => {
    const pagePath = fileURLToPath(
      new URL('../../app/landrush-lab/pascal-multiplayer-island/page.tsx', import.meta.url),
    )
    const globalsPath = fileURLToPath(new URL('../../app/globals.css', import.meta.url))
    const routeLoadingPath = fileURLToPath(
      new URL('../../app/landrush-lab/pascal-multiplayer-island/loading.tsx', import.meta.url),
    )
    const shellPath = fileURLToPath(new URL('./landrush-island-loading-shell.tsx', import.meta.url))
    const globalsSource = readFileSync(globalsPath, 'utf8')
    const shellSource = readFileSync(shellPath, 'utf8')

    expect(readFileSync(pagePath, 'utf8')).toContain('fallback={<LandrushIslandLoadingShell />}')
    expect(readFileSync(routeLoadingPath, 'utf8')).toContain('<LandrushIslandLoadingShell />')
    expect(shellSource).toContain('bg-[#0f1720]')
    expect(shellSource).toContain('data-landrush-island-loading-shell')
    expect(globalsSource).toContain('body:has([data-landrush-island-world-frame-ready])')
    expect(globalsSource).toContain('[data-landrush-island-loading-shell] {\n  display: none;')
  })

  test('reveals the blurred mounted island through a transparent runtime overlay', () => {
    const clientPath = fileURLToPath(new URL('./landrush-island-client.tsx', import.meta.url))
    const clientSource = readFileSync(clientPath, 'utf8')
    const backdropStart = clientSource.indexOf('aria-hidden={loadingActive}')
    const backdropEnd = clientSource.indexOf('<LandrushIslandStartupReactProfiler', backdropStart)
    const overlayStart = clientSource.indexOf('function LandrushIslandLoadingOverlay')
    const overlayEnd = clientSource.indexOf('function LandrushIslandTunePanel', overlayStart)

    expect(backdropStart).toBeGreaterThanOrEqual(0)
    expect(backdropEnd).toBeGreaterThan(backdropStart)
    expect(overlayStart).toBeGreaterThanOrEqual(0)
    expect(overlayEnd).toBeGreaterThan(overlayStart)

    const loadingBackdropSource = clientSource.slice(backdropStart, backdropEnd)
    const runtimeOverlaySource = clientSource.slice(overlayStart, overlayEnd)

    expect(loadingBackdropSource).toContain('scale-[1.01] blur-[7px]')
    expect(clientSource).toContain('<LandrushIslandWorldFrameReporter')
    expect(
      readFileSync(new URL('./landrush-island-loading-readiness.tsx', import.meta.url), 'utf8'),
    ).toContain("setAttribute('data-landrush-island-world-frame-ready', '')")
    expect(runtimeOverlaySource).toContain('bg-transparent')
    expect(runtimeOverlaySource).not.toContain('bg-[#0f1720]')
  })
})

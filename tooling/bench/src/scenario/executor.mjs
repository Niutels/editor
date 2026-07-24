// Step executor: turns a materialized scenario plan into real trusted input,
// with per-step self-checks. A failed check is a FINDING (recorded, run
// continues) unless the step is `critical` — calibration steps are critical so
// harness bugs abort loudly instead of producing garbage runs.
//
// World-coordinate steps are resolved to CSS pixels through the bridge
// projection immediately before dispatch (after camera quiescence), and the
// resolved pixels are recorded in the trace so replay never re-projects.

import { sleep } from '../bridge-client.mjs'

export class StepExecutor {
  constructor({ input, bridge, trace, events, log }) {
    this.input = input
    this.bridge = bridge
    this.trace = trace
    this.events = events
    this.log = log
    this.eventCursor = 0
    this.lastDigest = null
    this.origin = { x: 0, z: 0 } // world-space anchor for rel coordinates
    this.groundY = 0
    this.failures = []
  }

  async syncEventCursor() {
    const result = await this.bridge.eventsAt(Number.MAX_SAFE_INTEGER)
    this.eventCursor = result.cursor
  }

  /** Wait until the camera is not dragging/transitioning (clicks would be
   * swallowed by the cameraDragging gate otherwise). */
  async quiesce({ timeoutMs = 6000 } = {}) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      const { beacon } = await this.bridge.beacon()
      if (beacon && !beacon.cameraDragging) return true
      await sleep(120)
    }
    return false
  }

  worldFromRel(rel) {
    return [this.origin.x + rel[0], this.groundY, this.origin.z + rel[1]]
  }

  async projectRel(rel) {
    return this.bridge.project(this.worldFromRel(rel))
  }

  recordCheck(step, name, pass, detail) {
    if (!pass) {
      this.failures.push({ step: step.kind, intent: step.intent, name, detail })
      this.events.write({
        t: performance.now(),
        type: 'selfcheck:fail',
        data: { step: step.kind, intent: step.intent, name, detail },
      })
      this.log(`  CHECK FAIL [${step.kind}] ${name}: ${detail}`)
    }
    this.trace.write({
      kind: 'check',
      t: performance.now(),
      step: step.kind,
      intent: step.intent,
      name,
      pass,
      detail,
    })
    if (!pass && step.critical) {
      throw new Error(`critical step failed: [${step.kind}] ${name} — ${detail}`)
    }
  }

  async expectBusEvent(step, pattern, sinceCursor, { timeoutMs = 900 } = {}) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      const { cursor, events } = await this.bridge.eventsAt(sinceCursor)
      const hit = events.find((e) => pattern.test(e.type))
      if (hit) {
        this.eventCursor = cursor
        return hit
      }
      await sleep(120)
    }
    return null
  }

  async execute(steps) {
    for (const step of steps) {
      await this.executeStep(step)
      await this.input.pause(step.gapMs)
    }
    return { failures: this.failures }
  }

  async executeStep(step) {
    this.trace.write({ kind: 'step', t: performance.now(), ...redactStep(step) })
    switch (step.kind) {
      case 'mark':
        await this.bridge.mark(step.label)
        return

      case 'pause':
        await sleep(step.ms)
        return

      case 'settle': {
        const result = await this.bridge.waitForSettle({
          stableFrames: step.stableFrames ?? 10,
          timeoutMs: step.timeoutMs ?? 15_000,
        })
        this.recordCheck(step, 'settled', result !== null && !result.timedOut, JSON.stringify(result))
        return
      }

      case 'burst':
        this.input.burst = Boolean(step.on)
        return

      case 'hotkey': {
        const before = step.expectMode || step.expectTool ? (await this.bridge.beacon()).beacon : null
        await this.input.key(step.key, { modifiers: step.modifiers ?? [], intent: step.intent })
        if (step.expectMode || step.expectTool || step.expectFpv !== undefined) {
          await sleep(step.settleMs ?? 800)
          const { beacon } = await this.bridge.beacon()
          if (step.expectMode) {
            this.recordCheck(
              step,
              'mode',
              beacon?.mode === step.expectMode,
              `mode=${beacon?.mode} (was ${before?.mode}, want ${step.expectMode})`,
            )
          }
          if (step.expectTool) {
            this.recordCheck(
              step,
              'tool',
              beacon?.tool === step.expectTool,
              `tool=${beacon?.tool} (want ${step.expectTool})`,
            )
          }
          if (step.expectFpv !== undefined) {
            this.recordCheck(step, 'fpv', beacon?.fpv === step.expectFpv, `fpv=${beacon?.fpv}`)
          }
        }
        return
      }

      case 'toolbarClick': {
        const rect = await this.input.cdp
          ? await this.pageButtonRect(step.selector)
          : null
        this.recordCheck(step, 'selector-found', rect !== null, step.selector)
        if (!rect) return
        await this.input.click(rect.x + rect.w / 2, rect.y + rect.h / 2, { intent: step.intent })
        if (step.expectTool) {
          await sleep(400)
          const { beacon } = await this.bridge.beacon()
          this.recordCheck(step, 'tool', beacon?.tool === step.expectTool, `tool=${beacon?.tool}`)
        }
        return
      }

      case 'setOriginFromCamera': {
        const pose = await this.bridge.cameraPose()
        if (pose?.target) {
          this.origin = { x: snap(pose.target[0], 0.5), z: snap(pose.target[2], 0.5) }
          this.groundY = snap(pose.target[1], 0.5)
        } else {
          // fall back to whatever world point sits at canvas center — probe a
          // few candidate Y planes via projection round-trip is overkill; use 0
          this.origin = { x: 0, z: 0 }
        }
        this.trace.write({ kind: 'origin', t: performance.now(), origin: this.origin, groundY: this.groundY })
        return
      }

      case 'canvasClickRel': {
        const quiesced = await this.quiesce()
        this.recordCheck(step, 'quiesced', quiesced, 'cameraDragging stayed true for 6s')
        const projected = await this.projectRel(step.rel)
        this.recordCheck(
          step,
          'projectable',
          Boolean(projected?.visible),
          `rel=[${step.rel}] → ${JSON.stringify(projected)}`,
        )
        if (!projected?.visible) return
        const cursorBefore = (await this.bridge.eventsAt(Number.MAX_SAFE_INTEGER)).cursor
        const digestBefore = step.expectDigestChange ? await this.bridge.digest() : null
        await this.input.click(projected.x, projected.y, {
          detail: step.detail ?? 1,
          intent: step.intent,
        })
        this.trace.write({
          kind: 'resolved-click',
          t: performance.now(),
          rel: step.rel,
          world: this.worldFromRel(step.rel),
          px: [Math.round(projected.x), Math.round(projected.y)],
          intent: step.intent,
        })
        if (step.expectBus) {
          const hit = await this.expectBusEvent(step, new RegExp(step.expectBus), cursorBefore)
          this.recordCheck(step, 'bus-event', hit !== null, `${step.expectBus} ${hit ? 'seen' : 'NOT seen'}`)
        }
        if (step.expectDigestChange) {
          await sleep(step.settleMs ?? 500)
          const digestAfter = await this.bridge.digest()
          this.recordCheck(
            step,
            'digest-changed',
            digestAfter?.hash !== digestBefore?.hash,
            `${digestBefore?.hash} → ${digestAfter?.hash} (nodes ${digestBefore?.nodeCount} → ${digestAfter?.nodeCount})`,
          )
          this.lastDigest = digestAfter
        }
        return
      }

      case 'cameraOrbitDrag': {
        const center = await this.canvasCenter()
        await this.input.dragPath(
          center.x + (step.fromDx ?? 0),
          center.y + (step.fromDy ?? 0),
          center.x + (step.fromDx ?? 0) + step.dxPx,
          center.y + (step.fromDy ?? 0) + step.dyPx,
          { button: 'right', durationMs: step.durationMs ?? 600, intent: step.intent },
        )
        return
      }

      case 'cameraPanDrag': {
        const center = await this.canvasCenter()
        await this.input.dragPath(
          center.x,
          center.y,
          center.x + step.dxPx,
          center.y + step.dyPx,
          { button: 'middle', durationMs: step.durationMs ?? 600, intent: step.intent },
        )
        return
      }

      case 'zoom': {
        const center = await this.canvasCenter()
        await this.input.wheel(center.x, center.y, step.deltaY, { intent: step.intent })
        return
      }

      case 'assertNodeDelta': {
        const { beacon } = await this.bridge.beacon()
        const count = beacon?.nodeCount ?? -1
        const ok = count >= step.min && (step.max === undefined || count <= step.max)
        this.recordCheck(step, 'node-count', ok, `nodeCount=${count}, want [${step.min}, ${step.max ?? '∞'}]`)
        return
      }

      case 'probeUi': {
        const buttons = await this.dumpUiButtons()
        this.trace.write({ kind: 'ui-probe', t: performance.now(), buttons })
        return
      }

      default:
        throw new Error(`unknown step kind: ${step.kind}`)
    }
  }

  async canvasCenter() {
    const info = await this.bridge.info()
    const w = info?.viewport?.w ?? 1200
    const h = info?.viewport?.h ?? 800
    return { x: w / 2, y: h / 2 }
  }

  async pageButtonRect(selector) {
    return this.bridge.page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      return { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
    }, selector)
  }

  async dumpUiButtons() {
    return this.bridge.page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll('button, [role="button"]')) {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        const attrs = {}
        for (const attr of el.attributes) {
          if (attr.name.startsWith('data-')) attrs[attr.name] = attr.value
        }
        out.push({
          text: (el.textContent ?? '').trim().slice(0, 40),
          attrs,
          rect: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
        })
      }
      return out.slice(0, 120)
    })
  }
}

function snap(v, step) {
  return Math.round(v / step) * step
}

function redactStep(step) {
  const { kind, intent, rel, key, selector, label } = step
  return { step: kind, intent, rel, key, selector, label }
}

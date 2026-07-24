// Trusted input primitives over CDP Input.dispatchMouseEvent/dispatchKeyEvent.
// Every primitive is recorded to trace.jsonl with wall-clock timing so a replay
// can re-dispatch the identical sequence.
//
// Timing model: humanGap() samples a lognormal ~80-400ms pause; burst mode
// compresses to 0-25ms to provoke races. Consecutive clicks keep >=3px apart
// (executor's jitter rule) so the click-gesture-deduper (1000ms/2px) never eats
// an intentional placement.

const MODIFIER_BITS = { alt: 1, ctrl: 2, meta: 4, shift: 8 }

const KEY_DEFS = {
  escape: { key: 'Escape', code: 'Escape', vk: 27 },
  delete: { key: 'Delete', code: 'Delete', vk: 46 },
  enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  shift: { key: 'Shift', code: 'ShiftLeft', vk: 16 },
}

function keyDef(name) {
  const lower = String(name).toLowerCase()
  if (KEY_DEFS[lower]) return KEY_DEFS[lower]
  if (/^[a-z0-9]$/.test(lower)) {
    return {
      key: lower,
      code: /[0-9]/.test(lower) ? `Digit${lower}` : `Key${lower.toUpperCase()}`,
      vk: lower.toUpperCase().charCodeAt(0),
      text: lower,
    }
  }
  throw new Error(`unmapped key: ${name}`)
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

export class InputDriver {
  constructor({ cdp, trace, rng }) {
    this.cdp = cdp
    this.trace = trace
    this.rng = rng
    this.seq = 0
    this.burst = false
    this.lastClick = null
    this.pos = { x: 400, y: 300 }
  }

  record(kind, payload) {
    this.trace?.write({ seq: this.seq++, kind, t: performance.now(), ...payload })
  }

  humanGapMs() {
    if (this.burst) return Math.floor(this.rng() * 25)
    // lognormal-ish: median ~170ms, tail to ~600ms
    const n = (this.rng() + this.rng() + this.rng() - 1.5) / 1.5
    return Math.max(60, Math.min(600, Math.round(170 * Math.exp(n * 0.7))))
  }

  async pause(ms) {
    await new Promise((r) => setTimeout(r, ms ?? this.humanGapMs()))
  }

  async rawMouse(type, x, y, opts = {}) {
    await this.cdp.send('Input.dispatchMouseEvent', {
      type,
      x: Math.round(x),
      y: Math.round(y),
      button: opts.button ?? 'none',
      buttons: opts.buttons ?? 0,
      clickCount: opts.clickCount ?? 0,
      deltaX: opts.deltaX ?? 0,
      deltaY: opts.deltaY ?? 0,
      modifiers: opts.modifiers ?? 0,
      pointerType: 'mouse',
    })
  }

  async movePath(toX, toY, { durationMs = 120, steps } = {}) {
    const from = { ...this.pos }
    const dist = Math.hypot(toX - from.x, toY - from.y)
    const n = steps ?? Math.max(2, Math.min(24, Math.round(dist / 30)))
    for (let i = 1; i <= n; i++) {
      const t = easeInOut(i / n)
      await this.rawMouse('mouseMoved', from.x + (toX - from.x) * t, from.y + (toY - from.y) * t)
      if (durationMs > 0) await new Promise((r) => setTimeout(r, durationMs / n))
    }
    this.pos = { x: toX, y: toY }
    this.record('move', { x: Math.round(toX), y: Math.round(toY), durationMs })
  }

  /** Jitter target so consecutive clicks are never within the deduper's 2px. */
  applyClickJitter(x, y) {
    if (this.lastClick && Math.hypot(x - this.lastClick.x, y - this.lastClick.y) < 3) {
      x += 3 + this.rng() * 2
      y += 3 + this.rng() * 2
    }
    return { x, y }
  }

  async click(rawX, rawY, { button = 'left', detail = 1, intent } = {}) {
    const { x, y } = this.applyClickJitter(rawX, rawY)
    const buttonsBit = button === 'left' ? 1 : button === 'right' ? 2 : 4
    await this.movePath(x, y, { durationMs: 60 })
    for (let c = 1; c <= detail; c++) {
      await this.rawMouse('mousePressed', x, y, { button, buttons: buttonsBit, clickCount: c })
      await new Promise((r) => setTimeout(r, 25 + this.rng() * 40))
      await this.rawMouse('mouseReleased', x, y, { button, buttons: 0, clickCount: c })
      if (c < detail) await new Promise((r) => setTimeout(r, 60 + this.rng() * 60))
    }
    this.lastClick = { x, y }
    this.record('click', { x: Math.round(x), y: Math.round(y), button, detail, intent })
    return { x, y }
  }

  async dragPath(x0, y0, x1, y1, { button = 'right', durationMs = 500, intent } = {}) {
    const buttonsBit = button === 'left' ? 1 : button === 'right' ? 2 : 4
    await this.movePath(x0, y0, { durationMs: 60 })
    await this.rawMouse('mousePressed', x0, y0, { button, buttons: buttonsBit, clickCount: 1 })
    const steps = Math.max(6, Math.round(durationMs / 16))
    for (let i = 1; i <= steps; i++) {
      const t = easeInOut(i / steps)
      await this.rawMouse('mouseMoved', x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, {
        button,
        buttons: buttonsBit,
      })
      await new Promise((r) => setTimeout(r, durationMs / steps))
    }
    await this.rawMouse('mouseReleased', x1, y1, { button, buttons: 0, clickCount: 1 })
    this.pos = { x: x1, y: y1 }
    this.record('drag', {
      from: [Math.round(x0), Math.round(y0)],
      to: [Math.round(x1), Math.round(y1)],
      button,
      durationMs,
      intent,
    })
  }

  async wheel(x, y, deltaY, { intent } = {}) {
    await this.movePath(x, y, { durationMs: 40 })
    await this.rawMouse('mouseWheel', x, y, { deltaY })
    this.record('wheel', { x: Math.round(x), y: Math.round(y), deltaY, intent })
  }

  async key(name, { modifiers = [], intent } = {}) {
    const def = keyDef(name)
    const bits = modifiers.reduce((acc, m) => acc | (MODIFIER_BITS[m] ?? 0), 0)
    await this.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.vk,
      nativeVirtualKeyCode: def.vk,
      modifiers: bits,
      text: bits & MODIFIER_BITS.ctrl ? undefined : def.text,
    })
    await new Promise((r) => setTimeout(r, 30 + this.rng() * 40))
    await this.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.vk,
      nativeVirtualKeyCode: def.vk,
      modifiers: bits,
    })
    this.record('key', { key: name, modifiers, intent })
  }
}

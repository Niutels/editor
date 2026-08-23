// Trusted input primitives over CDP Input.dispatchMouseEvent/dispatchKeyEvent.
// Every primitive is recorded to trace.jsonl with wall-clock timing so a replay
// can re-dispatch the identical sequence.
//
// Timing model: humanGap() samples a lognormal ~80-400ms pause; burst mode
// compresses to 0-25ms to provoke races. Consecutive clicks keep >=3px apart
// (executor's jitter rule) so the click-gesture-deduper (1000ms/2px) never eats
// an intentional placement.

const MODIFIER_BITS = { alt: 1, ctrl: 2, meta: 4, shift: 8 }
const MOUSE_BUTTON_BITS = { left: 1, right: 2, middle: 4, back: 8, forward: 16 }

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

function mouseButtonBit(button) {
  const bit = MOUSE_BUTTON_BITS[button]
  if (!bit) throw new Error(`unmapped mouse button: ${button}`)
  return bit
}

export class InputDriver {
  constructor({ cdp, trace, rng }) {
    this.cdp = cdp
    this.trace = trace
    this.rng = rng
    this.seq = 0
    this.burst = false
    this.lastClick = null
    this.pos = { x: 400, y: 300 }
    this.pressedKeys = new Map()
    this.pressedMouseButtons = new Set()
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

  mouseButtonsMask() {
    let mask = 0
    for (const button of this.pressedMouseButtons) mask |= mouseButtonBit(button)
    return mask
  }

  getHeldInput() {
    return {
      keys: [...this.pressedKeys.keys()],
      mouseButtons: [...this.pressedMouseButtons],
    }
  }

  async movePath(toX, toY, { durationMs = 120, steps } = {}) {
    const from = { ...this.pos }
    const dist = Math.hypot(toX - from.x, toY - from.y)
    const n = steps ?? Math.max(2, Math.min(24, Math.round(dist / 30)))
    for (let i = 1; i <= n; i++) {
      const t = easeInOut(i / n)
      const x = from.x + (toX - from.x) * t
      const y = from.y + (toY - from.y) * t
      await this.rawMouse('mouseMoved', x, y, { buttons: this.mouseButtonsMask() })
      this.pos = { x, y }
      if (durationMs > 0) await new Promise((r) => setTimeout(r, durationMs / n))
    }
    this.pos = { x: toX, y: toY }
    this.record('move', { x: Math.round(toX), y: Math.round(toY), durationMs })
  }

  async mouseDown(
    rawX,
    rawY,
    { button = 'left', clickCount = 1, intent, moveDurationMs = 60, record = true } = {},
  ) {
    const bit = mouseButtonBit(button)
    if (this.pressedMouseButtons.has(button)) {
      throw new Error(`mouse button already held: ${button}`)
    }
    await this.movePath(rawX, rawY, { durationMs: moveDurationMs })
    await this.rawMouse('mousePressed', rawX, rawY, {
      button,
      buttons: this.mouseButtonsMask() | bit,
      clickCount,
    })
    this.pressedMouseButtons.add(button)
    if (record) {
      this.record('mouseDown', {
        x: Math.round(rawX),
        y: Math.round(rawY),
        button,
        intent,
      })
    }
  }

  async mouseUp({ button = 'left', clickCount = 1, intent, record = true } = {}) {
    mouseButtonBit(button)
    if (!this.pressedMouseButtons.has(button)) return false
    const remainingButtons = new Set(this.pressedMouseButtons)
    remainingButtons.delete(button)
    let buttons = 0
    for (const remainingButton of remainingButtons) buttons |= mouseButtonBit(remainingButton)
    await this.rawMouse('mouseReleased', this.pos.x, this.pos.y, {
      button,
      buttons,
      clickCount,
    })
    this.pressedMouseButtons.delete(button)
    if (record) {
      this.record('mouseUp', {
        x: Math.round(this.pos.x),
        y: Math.round(this.pos.y),
        button,
        intent,
      })
    }
    return true
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
    await this.movePath(x, y, { durationMs: 60 })
    for (let c = 1; c <= detail; c++) {
      await this.mouseDown(x, y, { button, clickCount: c, moveDurationMs: 0, record: false })
      let operationError = null
      try {
        await new Promise((r) => setTimeout(r, 25 + this.rng() * 40))
      } catch (error) {
        operationError = error
      }
      try {
        await this.mouseUp({ button, clickCount: c, record: false })
      } catch (error) {
        operationError ??= error
      }
      if (operationError) throw operationError
      if (c < detail) await new Promise((r) => setTimeout(r, 60 + this.rng() * 60))
    }
    this.lastClick = { x, y }
    this.record('click', { x: Math.round(x), y: Math.round(y), button, detail, intent })
    return { x, y }
  }

  async dragPath(x0, y0, x1, y1, { button = 'right', durationMs = 500, intent } = {}) {
    await this.movePath(x0, y0, { durationMs: 60 })
    await this.mouseDown(x0, y0, { button, moveDurationMs: 0, record: false })
    let operationError = null
    try {
      const steps = Math.max(6, Math.round(durationMs / 16))
      for (let i = 1; i <= steps; i++) {
        const t = easeInOut(i / steps)
        const x = x0 + (x1 - x0) * t
        const y = y0 + (y1 - y0) * t
        await this.rawMouse('mouseMoved', x, y, {
          button,
          buttons: this.mouseButtonsMask(),
        })
        this.pos = { x, y }
        await new Promise((r) => setTimeout(r, durationMs / steps))
      }
    } catch (error) {
      operationError = error
    }
    try {
      await this.mouseUp({ button, record: false })
    } catch (error) {
      operationError ??= error
    }
    if (operationError) throw operationError
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
    await this.rawMouse('mouseWheel', x, y, { buttons: this.mouseButtonsMask(), deltaY })
    this.record('wheel', { x: Math.round(x), y: Math.round(y), deltaY, intent })
  }

  async key(name, { modifiers = [], intent } = {}) {
    const normalized = String(name).toLowerCase()
    if (this.pressedKeys.has(normalized)) throw new Error(`key already held: ${name}`)
    await this.keyDown(name, { modifiers, intent })
    await new Promise((r) => setTimeout(r, 30 + this.rng() * 40))
    await this.keyUp(name, { modifiers, intent })
    this.record('key', { key: name, modifiers, intent })
  }

  async keyDown(name, { modifiers = [], intent } = {}) {
    const normalized = String(name).toLowerCase()
    if (this.pressedKeys.has(normalized)) return false
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
    this.pressedKeys.set(normalized, { name, modifiers: [...modifiers] })
    this.record('keyDown', { key: name, modifiers, intent })
    return true
  }

  async keyUp(name, { modifiers = [], intent } = {}) {
    const normalized = String(name).toLowerCase()
    const def = keyDef(name)
    const bits = modifiers.reduce((acc, m) => acc | (MODIFIER_BITS[m] ?? 0), 0)
    await this.cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: def.key,
      code: def.code,
      windowsVirtualKeyCode: def.vk,
      nativeVirtualKeyCode: def.vk,
      modifiers: bits,
    })
    this.pressedKeys.delete(normalized)
    this.record('keyUp', { key: name, modifiers, intent })
    return true
  }

  async releaseAll({ intent = 'release all held input' } = {}) {
    const errors = []
    const releasedMouseButtons = []
    const releasedKeys = []

    for (const button of [...this.pressedMouseButtons]) {
      try {
        await this.mouseUp({ button, intent })
        releasedMouseButtons.push(button)
      } catch (error) {
        errors.push({ input: `mouse:${button}`, message: error?.message ?? String(error) })
      }
    }

    const keys = [...this.pressedKeys.entries()].sort(([first], [second]) => {
      if (first === 'shift') return 1
      if (second === 'shift') return -1
      return first.localeCompare(second)
    })
    for (const [normalized, held] of keys) {
      try {
        await this.keyUp(held.name, { modifiers: held.modifiers, intent })
        releasedKeys.push(normalized)
      } catch (error) {
        errors.push({ input: `key:${normalized}`, message: error?.message ?? String(error) })
      }
    }

    this.record('releaseAll', { errors, releasedKeys, releasedMouseButtons, intent })
    return { errors, releasedKeys, releasedMouseButtons }
  }
}

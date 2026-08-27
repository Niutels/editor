'use client'

import {
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  beginLandrushZombieEscapeTouchStick,
  endLandrushZombieEscapeTouchStick,
  type LandrushZombieEscapeTouchInputKind,
  type LandrushZombieEscapeTouchInputState,
  type LandrushZombieEscapeTouchStick,
  requestLandrushZombieEscapeTouchJump,
  resetLandrushZombieEscapeTouchInput,
  updateLandrushZombieEscapeTouchStick,
} from './landrush-zombie-escape-touch-input'

type LandrushZombieEscapeTouchJoysticksProps = {
  inputRef: MutableRefObject<LandrushZombieEscapeTouchInputState>
  onInput: (input: LandrushZombieEscapeTouchInputKind) => void
  ownerDocument: Document
  visible: boolean
}

const TOUCH_CONTROL_CLUSTER_BOTTOM =
  'bottom-[max(2.375rem,calc(env(safe-area-inset-bottom)+1.25rem))]'

export function LandrushZombieEscapeTouchJoysticks({
  inputRef,
  onInput,
  ownerDocument,
  visible,
}: LandrushZombieEscapeTouchJoysticksProps) {
  const touchCapable = useTouchCapability(ownerDocument)

  useEffect(() => {
    if (visible && touchCapable) return
    resetLandrushZombieEscapeTouchInput(inputRef.current)
  }, [inputRef, touchCapable, visible])

  useEffect(
    () => () => {
      resetLandrushZombieEscapeTouchInput(inputRef.current)
    },
    [inputRef],
  )

  if (!(visible && touchCapable)) return null

  const requestJump = () => {
    activateLandrushZombieEscapeTouchJump(inputRef.current, onInput)
  }

  return (
    <div
      aria-label="Zombie Escape touch controls"
      className="pointer-events-none absolute inset-0 z-30"
      data-enabled="true"
      data-testid="landrush-zombie-escape-touch-controls"
      data-touch-capable="true"
      role="group"
    >
      <div
        className={`pointer-events-none absolute left-[max(1rem,env(safe-area-inset-left))] ${TOUCH_CONTROL_CLUSTER_BOTTOM}`}
        data-touch-control-cluster="move"
      >
        <LandrushZombieEscapeTouchJoystick
          inputRef={inputRef}
          label="Movement joystick"
          onInput={onInput}
          ownerDocument={ownerDocument}
          stick="move"
        />
      </div>
      <div
        aria-label="Aim, fire, and jump controls"
        className={`pointer-events-none absolute right-[max(1rem,env(safe-area-inset-right))] flex flex-col items-center gap-7 ${TOUCH_CONTROL_CLUSTER_BOTTOM}`}
        data-touch-control-cluster="combat"
        role="group"
      >
        <button
          aria-label="Jump"
          className="pointer-events-auto grid size-[clamp(3rem,11vw,3.5rem)] touch-none place-items-center rounded-full border border-sky-100/35 bg-slate-950/62 font-black text-[9px] text-white/80 uppercase tracking-[0.14em] shadow-[0_8px_24px_rgba(2,6,23,0.28)] backdrop-blur-sm active:border-sky-100/70 active:bg-sky-950/70"
          data-landrush-ui-interactive="true"
          data-touch-action="jump"
          onClick={(event) => {
            event.stopPropagation()
            if (!shouldRequestLandrushZombieEscapeTouchJumpFromClick(event.detail)) return
            requestJump()
          }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (event.button > 0) return
            event.preventDefault()
            event.stopPropagation()
            requestJump()
          }}
          type="button"
        >
          Jump
        </button>
        <LandrushZombieEscapeTouchJoystick
          inputRef={inputRef}
          label="Aim and fire joystick"
          onInput={onInput}
          ownerDocument={ownerDocument}
          stick="aim"
        />
      </div>
    </div>
  )
}

export function shouldRequestLandrushZombieEscapeTouchJumpFromClick(eventDetail: number) {
  return eventDetail === 0
}

export function activateLandrushZombieEscapeTouchJump(
  input: LandrushZombieEscapeTouchInputState,
  onInput: (input: LandrushZombieEscapeTouchInputKind) => void,
) {
  onInput('jump')
  requestLandrushZombieEscapeTouchJump(input)
}

function LandrushZombieEscapeTouchJoystick({
  inputRef,
  label,
  onInput,
  ownerDocument,
  stick,
}: {
  inputRef: MutableRefObject<LandrushZombieEscapeTouchInputState>
  label: string
  onInput: (stick: LandrushZombieEscapeTouchStick) => void
  ownerDocument: Document
  stick: LandrushZombieEscapeTouchStick
}) {
  const padRef = useRef<HTMLDivElement | null>(null)
  const knobRef = useRef<HTMLDivElement | null>(null)
  const resetVisual = useCallback(() => {
    const knob = knobRef.current
    if (knob) knob.style.transform = 'translate3d(0, 0, 0)'
    const pad = padRef.current
    if (pad) pad.dataset.firing = 'false'
  }, [])
  const release = useCallback(
    (pointerId: number) => {
      if (!endLandrushZombieEscapeTouchStick(inputRef.current, stick, pointerId)) return
      resetVisual()
    },
    [inputRef, resetVisual, stick],
  )

  useEffect(() => {
    const targetWindow = ownerDocument.defaultView
    const clear = () => {
      const pointerId = inputRef.current[stick].pointerId
      if (pointerId === null) {
        resetVisual()
        return
      }
      release(pointerId)
      const pad = padRef.current
      try {
        if (pad?.hasPointerCapture(pointerId)) pad.releasePointerCapture(pointerId)
      } catch {}
    }
    const handleVisibilityChange = () => {
      if (ownerDocument.visibilityState === 'hidden') clear()
    }
    const handleWindowPointerEnd = (event: PointerEvent) => {
      if (inputRef.current[stick].pointerId !== event.pointerId) return
      clear()
    }
    targetWindow?.addEventListener('blur', clear)
    targetWindow?.addEventListener('pointercancel', handleWindowPointerEnd)
    targetWindow?.addEventListener('pointerup', handleWindowPointerEnd)
    ownerDocument.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      targetWindow?.removeEventListener('blur', clear)
      targetWindow?.removeEventListener('pointercancel', handleWindowPointerEnd)
      targetWindow?.removeEventListener('pointerup', handleWindowPointerEnd)
      ownerDocument.removeEventListener('visibilitychange', handleVisibilityChange)
      clear()
    }
  }, [inputRef, ownerDocument, release, resetVisual, stick])

  const update = useCallback(
    (pad: HTMLDivElement, pointerId: number, clientX: number, clientY: number) => {
      const bounds = pad.getBoundingClientRect()
      const radius = Math.min(bounds.width, bounds.height) * 0.5
      if (radius <= 0) return
      const offsetX = clientX - (bounds.left + bounds.width * 0.5)
      const offsetY = clientY - (bounds.top + bounds.height * 0.5)
      if (
        !updateLandrushZombieEscapeTouchStick(
          inputRef.current,
          stick,
          pointerId,
          offsetX,
          offsetY,
          radius,
        )
      ) {
        return
      }

      const distance = Math.hypot(offsetX, offsetY)
      const displacement = Math.min(1, distance / radius)
      const directionX = distance > 0 ? offsetX / distance : 0
      const directionY = distance > 0 ? offsetY / distance : 0
      const knobRadius = (knobRef.current?.getBoundingClientRect().width ?? 0) * 0.5
      const travel = Math.max(0, radius - knobRadius - 5)
      if (knobRef.current) {
        knobRef.current.style.transform = `translate3d(${String(
          directionX * displacement * travel,
        )}px, ${String(directionY * displacement * travel)}px, 0)`
      }
      pad.dataset.firing = String(stick === 'aim' && inputRef.current.firing)
    },
    [inputRef, stick],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button > 0) return
      const pad = event.currentTarget
      if (!beginLandrushZombieEscapeTouchStick(inputRef.current, stick, event.pointerId)) return
      event.preventDefault()
      event.stopPropagation()
      try {
        pad.setPointerCapture(event.pointerId)
      } catch {}
      onInput(stick)
      update(pad, event.pointerId, event.clientX, event.clientY)
    },
    [inputRef, onInput, stick, update],
  )
  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (inputRef.current[stick].pointerId !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      const coalescedEvents = event.nativeEvent.getCoalescedEvents?.()
      const latestEvent = coalescedEvents?.[coalescedEvents.length - 1] ?? event.nativeEvent
      update(event.currentTarget, event.pointerId, latestEvent.clientX, latestEvent.clientY)
    },
    [inputRef, stick, update],
  )
  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (inputRef.current[stick].pointerId !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      release(event.pointerId)
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      } catch {}
    },
    [inputRef, release, stick],
  )

  return (
    <div
      aria-label={label}
      className="pointer-events-auto relative grid size-[clamp(6rem,22vw,8rem)] touch-none place-items-center rounded-full border border-white/20 bg-slate-950/48 opacity-100 shadow-[0_10px_30px_rgba(2,6,23,0.28)] backdrop-blur-sm transition-[border-color,background-color,box-shadow,opacity] data-[firing=true]:border-rose-200/75 data-[firing=true]:bg-rose-950/48 data-[firing=true]:shadow-[0_0_28px_rgba(251,113,133,0.32)]"
      data-firing="false"
      data-enabled="true"
      data-landrush-ui-interactive="true"
      data-stick={stick}
      onContextMenu={(event) => event.preventDefault()}
      onLostPointerCapture={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      ref={padRef}
      role="group"
    >
      {stick === 'aim' ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[14%] rounded-full border border-rose-100/20"
        />
      ) : null}
      <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 font-black text-[9px] text-white/60 uppercase tracking-[0.16em]">
        {stick === 'aim' ? 'Aim · Fire' : 'Move'}
      </span>
      <div
        aria-hidden="true"
        className="pointer-events-none relative size-[clamp(2.6rem,9vw,3.4rem)] rounded-full border border-white/30 bg-white/18 shadow-[0_5px_18px_rgba(2,6,23,0.25)] will-change-transform"
        data-touch-stick-knob={stick}
        ref={knobRef}
        style={{ transform: 'translate3d(0, 0, 0)' }}
      >
        <div className="absolute inset-[30%] rounded-full bg-white/34" />
      </div>
    </div>
  )
}

function useTouchCapability(ownerDocument: Document) {
  const [touchCapable, setTouchCapable] = useState(() => resolveTouchCapability(ownerDocument))

  useEffect(() => {
    const targetWindow = ownerDocument.defaultView
    if (!targetWindow) return
    const coarsePointer = targetWindow.matchMedia('(any-pointer: coarse)')
    const update = () => {
      setTouchCapable(resolveTouchCapability(ownerDocument))
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') setTouchCapable(true)
    }
    update()
    coarsePointer.addEventListener?.('change', update)
    ownerDocument.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      coarsePointer.removeEventListener?.('change', update)
      ownerDocument.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [ownerDocument])

  return touchCapable
}

export function resolveTouchCapability(ownerDocument: Document) {
  const targetWindow = ownerDocument.defaultView
  return Boolean(
    targetWindow &&
      (targetWindow.matchMedia('(any-pointer: coarse)').matches ||
        targetWindow.navigator.maxTouchPoints > 0 ||
        'ontouchstart' in targetWindow),
  )
}

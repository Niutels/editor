'use client'

import { useEffect, useRef } from 'react'

export function LandrushKeyboardFocusAnchor() {
  const anchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof HTMLCanvasElement)) return

      if (!target.hasAttribute('tabindex')) target.tabIndex = -1
      target.focus({ preventScroll: true })
    }
    const frame = window.requestAnimationFrame(() => {
      const activeElement = document.activeElement
      if (
        activeElement &&
        activeElement !== document.body &&
        activeElement !== document.documentElement
      ) {
        return
      }
      anchorRef.current?.focus({ preventScroll: true })
    })

    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [])

  return (
    <div
      className="pointer-events-none fixed top-0 left-0 size-px opacity-0"
      data-landrush-keyboard-focus-anchor
      ref={anchorRef}
      tabIndex={-1}
    />
  )
}

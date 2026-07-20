'use client'

import { useEffect, useRef } from 'react'

export function LandrushKeyboardFocusAnchor() {
  const anchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
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

    return () => window.cancelAnimationFrame(frame)
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

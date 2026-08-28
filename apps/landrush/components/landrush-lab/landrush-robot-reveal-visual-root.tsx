'use client'

import { type ThreeElements, useThree } from '@react-three/fiber'
import { forwardRef, type Ref, useCallback, useRef } from 'react'
import type { Group } from 'three'
import { registerLandrushRobotRevealVisualRoot } from './landrush-robot-reveal-visual-registry'

export const LandrushRobotRevealVisualRoot = forwardRef<Group, Omit<ThreeElements['group'], 'ref'>>(
  function LandrushRobotRevealVisualRoot({ userData, ...props }, forwardedRef) {
    const scene = useThree((state) => state.scene)
    const unregisterRef = useRef<(() => void) | null>(null)
    const handleRoot = useCallback(
      (root: Group | null) => {
        unregisterRef.current?.()
        unregisterRef.current = root ? registerLandrushRobotRevealVisualRoot(scene, root) : null
        assignRef(forwardedRef, root)
      },
      [forwardedRef, scene],
    )

    return (
      <group {...props} ref={handleRoot} userData={{ ...userData, landrushRobotOccluder: true }} />
    )
  },
)

function assignRef<T>(ref: Ref<T>, value: T | null) {
  if (typeof ref === 'function') {
    ref(value)
    return
  }
  if (ref) ref.current = value
}

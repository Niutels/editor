'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLandrushCameraTransition } from '../camera/use-landrush-camera-transition'
import type {
  LandrushCharacterState,
  LandrushMode,
  LandrushModeControllerOptions,
  LandrushModeSnapshot,
  LandrushVector3,
  LandrushVector3Like,
} from '../types'
import {
  DEFAULT_BUILD_ACTIVATION_DISTANCE,
  DEFAULT_LANDRUSH_SPAWN,
  resolveBuildEligibility,
  toLandrushVector3,
} from './geometry'
import { resolveCameraRelativeMovementVector } from './movement'

const DEFAULT_WALK_SPEED = 5
const WALK_ACCELERATION = 18
const WALK_DECELERATION = 24
const TURN_RESPONSE = 12
const ZERO_VECTOR: LandrushVector3 = { x: 0, y: 0, z: 0 }

export function useLandrushModeController({
  ownerProperty,
  initialMode = 'intro',
  spawnPosition,
  walkSpeed = DEFAULT_WALK_SPEED,
  buildActivationDistance = DEFAULT_BUILD_ACTIVATION_DISTANCE,
  camera,
  disabled = false,
  constrainCharacterPosition,
  onModeChange,
  onCharacterMove,
  onBuildToggleDenied,
}: LandrushModeControllerOptions): LandrushModeSnapshot {
  const [mode, setModeState] = useState<LandrushMode>(initialMode)
  const [character, setCharacter] = useState<LandrushCharacterState>(() => ({
    position: toLandrushVector3(spawnPosition, DEFAULT_LANDRUSH_SPAWN),
    velocity: ZERO_VECTOR,
    heading: 0,
    isMoving: false,
  }))
  const pressedKeysRef = useRef(new Set<string>())
  const characterRef = useRef(character)
  const modeRef = useRef(mode)
  const previousModeRef = useRef(mode)
  const moveCallbackRef = useRef(onCharacterMove)
  const deniedCallbackRef = useRef(onBuildToggleDenied)

  useEffect(() => {
    characterRef.current = character
  }, [character])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    const previousMode = previousModeRef.current
    if (previousMode === mode) return
    onModeChange?.(mode, previousMode)
    previousModeRef.current = mode
  }, [mode, onModeChange])

  useEffect(() => {
    moveCallbackRef.current = onCharacterMove
  }, [onCharacterMove])

  useEffect(() => {
    deniedCallbackRef.current = onBuildToggleDenied
  }, [onBuildToggleDenied])

  useEffect(() => {
    moveCallbackRef.current?.(character)
  }, [character])

  const applyMode = useCallback((nextMode: LandrushMode) => {
    setModeState((previousMode) => (previousMode === nextMode ? previousMode : nextMode))
  }, [])

  const getBuildEligibility = useCallback(
    (position: LandrushVector3) =>
      resolveBuildEligibility(position, ownerProperty, buildActivationDistance),
    [buildActivationDistance, ownerProperty],
  )

  const buildEligibility = useMemo(
    () => getBuildEligibility(character.position),
    [character.position, getBuildEligibility],
  )
  const cameraTransition = useLandrushCameraTransition({
    mode,
    character,
    ownerProperty,
    camera,
  })
  const cameraPoseRef = useRef(cameraTransition.pose)

  useEffect(() => {
    cameraPoseRef.current = cameraTransition.pose
  }, [cameraTransition.pose])

  const enterWalkMode = useCallback(() => {
    applyMode('walk')
  }, [applyMode])

  const join = enterWalkMode

  const enterBuildMode = useCallback(() => {
    const eligibility = getBuildEligibility(characterRef.current.position)
    if (!eligibility.allowed) {
      deniedCallbackRef.current?.(eligibility)
      return false
    }

    applyMode('build')
    return true
  }, [applyMode, getBuildEligibility])

  const exitBuildMode = useCallback(() => {
    applyMode('walk')
  }, [applyMode])

  const toggleBuildMode = useCallback(() => {
    if (modeRef.current === 'build') {
      applyMode('walk')
      return true
    }

    return enterBuildMode()
  }, [applyMode, enterBuildMode])

  const setCharacterPosition = useCallback((position: LandrushVector3Like) => {
    const nextPosition = toLandrushVector3(position, characterRef.current.position)
    setCharacter((current) => ({
      ...current,
      position: nextPosition,
      velocity: ZERO_VECTOR,
      isMoving: false,
    }))
  }, [])

  useEffect(() => {
    if (mode !== 'build' || buildEligibility.allowed) return
    applyMode('walk')
  }, [applyMode, buildEligibility.allowed, mode])

  useEffect(() => {
    if (disabled || mode === 'intro') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return

      if (event.code === 'KeyB') {
        event.preventDefault()
        if (!event.repeat) toggleBuildMode()
        return
      }

      if (modeRef.current !== 'walk' || !isTrackedWalkKey(event.code)) return

      event.preventDefault()
      pressedKeysRef.current.add(event.code)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isTrackedWalkKey(event.code)) return
      pressedKeysRef.current.delete(event.code)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      pressedKeysRef.current.clear()
    }
  }, [disabled, mode, toggleBuildMode])

  useEffect(() => {
    if (disabled || mode !== 'walk') return

    let animationFrame = 0
    let previousTime = performance.now()

    const tick = (now: number) => {
      const deltaSeconds = Math.max(0.001, Math.min((now - previousTime) / 1000, 0.05))
      previousTime = now
      const movement = resolveCameraRelativeMovementVector(
        pressedKeysRef.current,
        cameraPoseRef.current,
      )

      setCharacter((current) => {
        const targetSpeed = walkSpeed * (isRunPressed(pressedKeysRef.current) ? 1.55 : 1)
        const desiredVelocity = movement
          ? {
              x: movement.x * targetSpeed,
              y: 0,
              z: movement.z * targetSpeed,
            }
          : ZERO_VECTOR
        const acceleration = movement ? WALK_ACCELERATION : WALK_DECELERATION
        const nextVelocity = {
          x: approach(current.velocity.x, desiredVelocity.x, acceleration * deltaSeconds),
          y: 0,
          z: approach(current.velocity.z, desiredVelocity.z, acceleration * deltaSeconds),
        }
        const nextPosition = {
          x: current.position.x + nextVelocity.x * deltaSeconds,
          y: current.position.y,
          z: current.position.z + nextVelocity.z * deltaSeconds,
        }
        const constrainedPosition =
          constrainCharacterPosition?.(nextPosition, {
            current,
            mode,
            ownerProperty,
          }) ?? nextPosition
        const velocity = {
          x: (constrainedPosition.x - current.position.x) / deltaSeconds,
          y: 0,
          z: (constrainedPosition.z - current.position.z) / deltaSeconds,
        }
        const speed = Math.hypot(velocity.x, velocity.z)
        if (speed < 0.025 && !current.isMoving) return current
        const heading =
          speed > 0.05
            ? lerpAngle(
                current.heading,
                Math.atan2(velocity.x, velocity.z),
                clamp01(deltaSeconds * TURN_RESPONSE),
              )
            : current.heading

        return {
          position: constrainedPosition,
          velocity,
          heading,
          isMoving: speed > 0.05,
        }
      })

      animationFrame = requestAnimationFrame(tick)
    }

    animationFrame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animationFrame)
    }
  }, [constrainCharacterPosition, disabled, mode, ownerProperty, walkSpeed])

  return {
    mode,
    ownerProperty,
    character,
    buildEligibility,
    cameraPose: cameraTransition.pose,
    cameraTransitionProgress: cameraTransition.progress,
    buildMenuOpacity: mode === 'build' ? 1 : 0,
    islandFadeOpacity: mode === 'build' ? 1 : 0,
    surroundingIslandOpacity: mode === 'build' ? 0.08 : 1,
    isIntro: mode === 'intro',
    isWalking: mode === 'walk',
    isBuildMode: mode === 'build',
    canBuild: buildEligibility.allowed,
    join,
    enterWalkMode,
    enterBuildMode,
    exitBuildMode,
    toggleBuildMode,
    setCharacterPosition,
  }
}

function isTrackedWalkKey(code: string) {
  return isMovementKey(code) || code === 'ShiftLeft' || code === 'ShiftRight'
}

function isMovementKey(code: string) {
  return (
    code === 'KeyW' ||
    code === 'ArrowUp' ||
    code === 'KeyA' ||
    code === 'ArrowLeft' ||
    code === 'KeyS' ||
    code === 'ArrowDown' ||
    code === 'KeyD' ||
    code === 'ArrowRight'
  )
}

function isRunPressed(keys: Set<string>) {
  return keys.has('ShiftLeft') || keys.has('ShiftRight')
}

function approach(current: number, target: number, maxDelta: number) {
  if (current < target) return Math.min(current + maxDelta, target)
  if (current > target) return Math.max(current - maxDelta, target)
  return target
}

function lerpAngle(current: number, target: number, amount: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * amount
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

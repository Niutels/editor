'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lerpNumber, lerpVector3, toLandrushVector3 } from '../interaction/geometry'
import type {
  LandrushCameraConfig,
  LandrushCameraPose,
  LandrushCameraStateInput,
  LandrushCharacterState,
  LandrushMode,
  LandrushPropertyGeometry,
  LandrushResolvedCameraPose,
} from '../types'

const DEFAULT_CAMERA_TRANSITION_MS = 520

type UseLandrushCameraTransitionOptions = {
  mode: LandrushMode
  character: LandrushCharacterState
  ownerProperty: LandrushPropertyGeometry
  camera?: LandrushCameraConfig
}

export function useLandrushCameraTransition({
  mode,
  character,
  ownerProperty,
  camera,
}: UseLandrushCameraTransitionOptions) {
  const adapter = camera?.adapter
  const durationMs = camera?.transitionMs ?? DEFAULT_CAMERA_TRANSITION_MS
  const input = useMemo(
    () => ({ mode, character, ownerProperty }),
    [character, mode, ownerProperty],
  )
  const resolvedTargetPose = useMemo(() => resolveCameraPose(camera, input), [camera, input])
  const targetPoseKey = cameraPoseKey(resolvedTargetPose)
  const targetPose = useStableCameraPose(resolvedTargetPose, targetPoseKey)
  const [pose, setPoseState] = useState<LandrushResolvedCameraPose>(targetPose)
  const [progress, setProgress] = useState(1)
  const poseRef = useRef(pose)
  const targetPoseRef = useRef(targetPose)
  const setPose = useCallback((nextPose: LandrushResolvedCameraPose) => {
    poseRef.current = nextPose
    setPoseState(nextPose)
  }, [])

  targetPoseRef.current = targetPose

  useEffect(() => {
    poseRef.current = pose
  }, [pose])

  useEffect(() => {
    const reducedMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const transitionDuration = reducedMotion ? 0 : durationMs

    const transitionTarget = targetPoseRef.current

    if (adapter?.transitionTo) {
      setPose(transitionTarget)
      setProgress(1)
      adapter.transitionTo(transitionTarget, { durationMs: transitionDuration, mode })
      return
    }

    const adapterPose = adapter?.getPose?.()
    const fromPose = adapterPose ? normalizeCameraPose(adapterPose) : poseRef.current

    if (transitionDuration <= 0) {
      setPose(transitionTarget)
      setProgress(1)
      adapter?.setPose?.(transitionTarget)
      return
    }

    let animationFrame = 0
    const startedAt = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startedAt
      const rawProgress = Math.min(elapsed / transitionDuration, 1)
      const eased = easeInOutCubic(rawProgress)
      const nextPose = interpolateCameraPose(fromPose, transitionTarget, eased)

      setPose(nextPose)
      setProgress(rawProgress)
      adapter?.setPose?.(nextPose)

      if (rawProgress < 1) {
        animationFrame = requestAnimationFrame(tick)
      }
    }

    animationFrame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animationFrame)
    }
  }, [adapter, durationMs, mode, setPose, targetPoseKey])

  return {
    pose,
    progress,
    targetPose,
  }
}

function useStableCameraPose(pose: LandrushResolvedCameraPose, key: string) {
  const stablePoseRef = useRef<{ key: string; pose: LandrushResolvedCameraPose } | null>(null)
  if (stablePoseRef.current?.key !== key) stablePoseRef.current = { key, pose }
  return stablePoseRef.current.pose
}

export function resolveCameraPose(
  camera: LandrushCameraConfig | undefined,
  input: LandrushCameraStateInput,
): LandrushResolvedCameraPose {
  const configuredPose = resolveConfiguredPose(camera, input)
  return normalizeCameraPose(configuredPose ?? getDefaultCameraPose(input))
}

export function normalizeCameraPose(
  pose: LandrushCameraPose | LandrushResolvedCameraPose,
): LandrushResolvedCameraPose {
  return {
    position: toLandrushVector3(pose.position),
    target: toLandrushVector3(pose.target),
    zoom: pose.zoom,
    fov: pose.fov,
  }
}

function resolveConfiguredPose(
  camera: LandrushCameraConfig | undefined,
  input: LandrushCameraStateInput,
) {
  const pose = camera?.[input.mode]
  if (!pose) return null
  return typeof pose === 'function' ? pose(input) : pose
}

function getDefaultCameraPose(input: LandrushCameraStateInput): LandrushCameraPose {
  const { character, mode } = input
  const { x, z } = character.position

  if (mode === 'intro') {
    return {
      position: { x: 18, y: 16, z: 18 },
      target: { x: 0, y: 0, z: 0 },
      fov: 42,
    }
  }

  if (mode === 'build') {
    return {
      position: { x, y: 20, z: z + 0.1 },
      target: { x, y: 0, z },
      fov: 34,
    }
  }

  return {
    position: { x, y: 4.5, z: z + 7 },
    target: { x, y: 1.2, z },
    fov: 58,
  }
}

function interpolateCameraPose(
  from: LandrushResolvedCameraPose,
  to: LandrushResolvedCameraPose,
  progress: number,
): LandrushResolvedCameraPose {
  return {
    position: lerpVector3(from.position, to.position, progress),
    target: lerpVector3(from.target, to.target, progress),
    zoom:
      typeof from.zoom === 'number' || typeof to.zoom === 'number'
        ? lerpNumber(from.zoom ?? to.zoom ?? 1, to.zoom ?? from.zoom ?? 1, progress)
        : undefined,
    fov:
      typeof from.fov === 'number' || typeof to.fov === 'number'
        ? lerpNumber(from.fov ?? to.fov ?? 50, to.fov ?? from.fov ?? 50, progress)
        : undefined,
  }
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2
}

function cameraPoseKey(pose: LandrushResolvedCameraPose) {
  return [
    pose.position.x,
    pose.position.y,
    pose.position.z,
    pose.target.x,
    pose.target.y,
    pose.target.z,
    pose.zoom ?? '',
    pose.fov ?? '',
  ]
    .map((value) => (typeof value === 'number' ? value.toFixed(4) : value))
    .join('|')
}

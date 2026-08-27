'use client'

import { type RootState, useFrame, useThree } from '@react-three/fiber'
import { type MutableRefObject, useLayoutEffect, useMemo, useRef } from 'react'
import { type Camera, MathUtils, Matrix4, OrthographicCamera, Quaternion, Vector3 } from 'three'
import type { LandrushIslandCameraPose } from './landrush-island-camera-pose'
import { ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE } from './zombie-escape-config'

const CAMERA = ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE

export const LANDRUSH_ZOMBIE_ESCAPE_CAMERA_FRAME_PRIORITY = 0.5
export const LANDRUSH_ZOMBIE_ESCAPE_CAMERA_TRANSITION_SECONDS = 1.4

export type LandrushZombieEscapeCameraLayout = {
  bottom: number
  far: number
  halfHeight: number
  left: number
  near: number
  offset: readonly [number, number, number]
  projectionCenterY: number
  right: number
  targetOffset: readonly [number, number, number]
  top: number
  zoom: number
}

export type LandrushZombieEscapeCameraMotion = {
  cameraTargetY?: number
  position: Vector3
}

export type LandrushZombieEscapeCameraTransitionSample = {
  amount: number
  far: number
  halfHeight: number
  progress: number
  projectionCenterY: number
}

const LANDRUSH_ZOMBIE_ESCAPE_CAMERAS = new WeakMap<
  MutableRefObject<LandrushZombieEscapeCameraMotion | null>,
  OrthographicCamera
>()

export function resolveLandrushZombieEscapeCamera(
  motionRef: MutableRefObject<LandrushZombieEscapeCameraMotion | null>,
) {
  const existing = LANDRUSH_ZOMBIE_ESCAPE_CAMERAS.get(motionRef)
  if (existing) return existing
  const camera = new OrthographicCamera()
  camera.name = 'LandrushZombieEscapeCamera'
  camera.userData.landrushCameraMode = 'zombie-escape'
  camera.userData.landrushCameraOwner = 'LandrushZombieEscapeCamera'
  LANDRUSH_ZOMBIE_ESCAPE_CAMERAS.set(motionRef, camera)
  return camera
}

export function resolveLandrushZombieEscapeCameraLayout(
  viewportWidth: number,
  viewportHeight: number,
): LandrushZombieEscapeCameraLayout {
  const width = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0
  const height = Number.isFinite(viewportHeight) ? Math.max(1, viewportHeight) : 1
  const aspect = Math.max(0.1, width / height)
  const horizontalDistance = Math.cos(CAMERA.elevationRadians) * CAMERA.distanceMeters
  const horizontalHalfSpan = CAMERA.halfHeightMeters * Math.min(aspect, CAMERA.maximumAspectRatio)
  const halfHeight = horizontalHalfSpan / aspect
  const projectionCenterY = 0

  return {
    bottom: -halfHeight,
    far: CAMERA.farMeters,
    halfHeight,
    left: -horizontalHalfSpan,
    near: CAMERA.nearMeters,
    offset: [
      Math.sin(CAMERA.azimuthRadians) * horizontalDistance,
      Math.sin(CAMERA.elevationRadians) * CAMERA.distanceMeters,
      Math.cos(CAMERA.azimuthRadians) * horizontalDistance,
    ],
    projectionCenterY,
    right: horizontalHalfSpan,
    targetOffset: [0, CAMERA.targetHeightMeters, 0],
    top: halfHeight,
    zoom: CAMERA.zoom,
  }
}

export function resolveLandrushZombieEscapeCameraProjectionHalfHeight(
  camera: Camera,
  focusDistance: number,
) {
  const distance = MathUtils.clamp(
    Number.isFinite(focusDistance) ? focusDistance : CAMERA.halfHeightMeters,
    0.1,
    200,
  )
  const perspective = camera as Camera & {
    fov?: number
    getEffectiveFOV?: () => number
    isPerspectiveCamera?: boolean
    zoom?: number
  }
  if (perspective.isPerspectiveCamera) {
    const effectiveFov = perspective.getEffectiveFOV?.() ?? perspective.fov ?? 50
    return MathUtils.clamp(Math.tan(MathUtils.degToRad(effectiveFov) / 2) * distance, 0.1, 200)
  }

  const orthographic = camera as Camera & {
    bottom?: number
    isOrthographicCamera?: boolean
    top?: number
    zoom?: number
  }
  if (orthographic.isOrthographicCamera) {
    const height = Math.abs((orthographic.top ?? 1) - (orthographic.bottom ?? -1))
    return MathUtils.clamp(height / (2 * Math.max(orthographic.zoom ?? 1, 0.001)), 0.1, 200)
  }

  return CAMERA.halfHeightMeters
}

export function sampleLandrushZombieEscapeCameraTransition(
  progress: number,
  sourceHalfHeight: number,
  sourceFar: number = CAMERA.farMeters,
  sourceProjectionCenterY = 0,
  targetProjectionCenterY = 0,
  targetHalfHeight: number = CAMERA.halfHeightMeters,
): LandrushZombieEscapeCameraTransitionSample {
  const t = MathUtils.clamp(progress, 0, 1)
  const amount = t * t * (3 - 2 * t)
  return {
    amount,
    far: MathUtils.lerp(sourceFar, CAMERA.farMeters, amount),
    halfHeight: MathUtils.lerp(sourceHalfHeight, targetHalfHeight, amount),
    progress: t,
    projectionCenterY: MathUtils.lerp(sourceProjectionCenterY, targetProjectionCenterY, amount),
  }
}

export function handoffLandrushZombieEscapeCameraPose(source: Camera, target: Camera) {
  target.position.copy(source.position)
  target.quaternion.copy(source.quaternion)
  target.up.copy(source.up)
  target.updateMatrixWorld(true)
}

export function prepareLandrushZombieEscapeCameraForRenderReadiness({
  camera,
  layout,
  motion,
  offset,
  target,
}: {
  camera: OrthographicCamera
  layout: LandrushZombieEscapeCameraLayout
  motion: LandrushZombieEscapeCameraMotion | null
  offset: Vector3
  target: Vector3
}) {
  if (motion) {
    target.copy(motion.position)
    target.y = (motion.cameraTargetY ?? motion.position.y) + CAMERA.targetHeightMeters
  } else {
    target.set(0, CAMERA.targetHeightMeters, 0)
  }
  offset.fromArray(layout.offset)
  camera.near = layout.near
  camera.far = layout.far
  camera.zoom = layout.zoom
  camera.position.copy(target).add(offset)
  camera.up.set(0, 1, 0)
  camera.lookAt(target)
  applyLandrushZombieEscapeCameraProjection(
    camera,
    layout.halfHeight,
    layout.right / layout.halfHeight,
    layout.projectionCenterY,
  )
  camera.updateMatrixWorld(true)
  camera.userData.landrushCameraTarget = target
}

function applyLandrushZombieEscapeCameraProjection(
  camera: OrthographicCamera,
  halfHeight: number,
  aspect: number,
  projectionCenterY: number,
) {
  const safeAspect = Number.isFinite(aspect) ? Math.max(0.1, aspect) : 1
  camera.left = -halfHeight * safeAspect
  camera.right = halfHeight * safeAspect
  camera.top = projectionCenterY + halfHeight
  camera.bottom = projectionCenterY - halfHeight
  camera.updateProjectionMatrix()
}

function resolveLandrushZombieEscapeCameraProjectionCenterY(camera: Camera) {
  const orthographic = camera as Camera & {
    bottom?: number
    isOrthographicCamera?: boolean
    top?: number
  }
  if (!orthographic.isOrthographicCamera) return 0

  return ((orthographic.top ?? 1) + (orthographic.bottom ?? -1)) / 2
}

type LandrushZombieEscapeCameraTransition = {
  elapsedSeconds: number
  sourceFar: number
  sourceHalfHeight: number
  sourcePosition: Vector3
  sourceProjectionCenterY: number
  sourceQuaternion: Quaternion
  sourceTarget: Vector3
}

export function LandrushZombieEscapeCamera({
  active,
  motionRef,
  onSettled,
  sourcePose = null,
}: {
  active: boolean
  motionRef: MutableRefObject<LandrushZombieEscapeCameraMotion | null>
  onSettled?: () => void
  sourcePose?: LandrushIslandCameraPose | null
}) {
  const get = useThree((state) => state.get)
  const set = useThree((state) => state.set)
  const size = useThree((state) => state.size)
  const camera = useMemo(() => resolveLandrushZombieEscapeCamera(motionRef), [motionRef])
  const previousCameraRef = useRef<RootState['camera'] | null>(null)
  const transitionRef = useRef<LandrushZombieEscapeCameraTransition | null>(null)
  const currentHalfHeightRef = useRef<number>(CAMERA.halfHeightMeters)
  const currentProjectionCenterYRef = useRef(0)
  const onSettledRef = useRef(onSettled)
  const sourcePoseRef = useRef(sourcePose)
  const followedTarget = useMemo(() => new Vector3(), [])
  const desiredTarget = useMemo(() => new Vector3(), [])
  const publishedTarget = useMemo(() => new Vector3(), [])
  const transitionTarget = useMemo(() => new Vector3(), [])
  const transitionPosition = useMemo(() => new Vector3(), [])
  const cameraOffset = useMemo(() => new Vector3(), [])
  const cameraUp = useMemo(() => new Vector3(0, 1, 0), [])
  const lookAtMatrix = useMemo(() => new Matrix4(), [])
  const desiredQuaternion = useMemo(() => new Quaternion(), [])
  const layout = useMemo(
    () => resolveLandrushZombieEscapeCameraLayout(size.width, size.height),
    [size.height, size.width],
  )
  const layoutRef = useRef(layout)

  onSettledRef.current = onSettled
  sourcePoseRef.current = sourcePose
  layoutRef.current = layout

  useLayoutEffect(() => {
    camera.near = layout.near
    if (!transitionRef.current) {
      camera.far = layout.far
      currentHalfHeightRef.current = layout.halfHeight
      currentProjectionCenterYRef.current = layout.projectionCenterY
    }
    camera.zoom = layout.zoom
    cameraOffset.fromArray(layout.offset)
    applyLandrushZombieEscapeCameraProjection(
      camera,
      currentHalfHeightRef.current,
      layout.right / layout.halfHeight,
      currentProjectionCenterYRef.current,
    )
  }, [camera, cameraOffset, layout])

  useLayoutEffect(() => {
    if (!active) return

    const previousCamera = get().camera
    const entryPose = sourcePoseRef.current
    const sourcePosition = previousCamera.position
    const sourceQuaternion = previousCamera.quaternion
    const entryPoseTracksCamera = Boolean(
      entryPose &&
        entryPose.position.distanceToSquared(sourcePosition) <= 0.0625 &&
        1 - Math.abs(entryPose.quaternion.dot(sourceQuaternion)) <= 0.001,
    )
    const sourceTarget =
      entryPoseTracksCamera && entryPose
        ? entryPose.target
        : previousCamera.position
            .clone()
            .add(
              previousCamera
                .getWorldDirection(new Vector3())
                .multiplyScalar(Math.max(0.1, entryPose?.distance ?? CAMERA.distanceMeters)),
            )
    const focusDistance = Math.max(0.1, sourcePosition.distanceTo(sourceTarget))
    const previousFar = (previousCamera as Camera & { far?: number }).far
    const sourceFar = Math.max(
      layoutRef.current.far,
      Number.isFinite(previousFar) ? (previousFar ?? 0) : 0,
      focusDistance + CAMERA.distanceMeters,
    )
    const sourceHalfHeight = resolveLandrushZombieEscapeCameraProjectionHalfHeight(
      previousCamera,
      focusDistance,
    )
    const sourceProjectionCenterY =
      resolveLandrushZombieEscapeCameraProjectionCenterY(previousCamera)

    transitionRef.current = {
      elapsedSeconds: 0,
      sourceFar,
      sourceHalfHeight,
      sourcePosition: sourcePosition.clone(),
      sourceProjectionCenterY,
      sourceQuaternion: sourceQuaternion.clone(),
      sourceTarget: sourceTarget.clone(),
    }
    currentHalfHeightRef.current = sourceHalfHeight
    currentProjectionCenterYRef.current = sourceProjectionCenterY
    followedTarget.copy(sourceTarget)
    publishedTarget.copy(sourceTarget)
    camera.position.copy(sourcePosition)
    camera.up.set(0, 1, 0)
    camera.quaternion.copy(sourceQuaternion)
    camera.far = sourceFar
    applyLandrushZombieEscapeCameraProjection(
      camera,
      sourceHalfHeight,
      layoutRef.current.right / layoutRef.current.halfHeight,
      sourceProjectionCenterY,
    )
    camera.updateMatrixWorld(true)
    camera.userData.landrushCameraTarget = publishedTarget

    previousCameraRef.current = previousCamera === camera ? null : previousCamera
    set({ camera })

    return () => {
      transitionRef.current = null
      const restoreCamera = previousCameraRef.current
      previousCameraRef.current = null
      if (restoreCamera && get().camera === camera) {
        handoffLandrushZombieEscapeCameraPose(camera, restoreCamera)
        set({ camera: restoreCamera })
      }
    }
  }, [active, camera, followedTarget, get, publishedTarget, set])

  useFrame((state, delta) => {
    if (!active) return
    if (state.camera !== camera) set({ camera })
    const motion = motionRef.current
    if (motion) {
      desiredTarget.copy(motion.position)
      desiredTarget.y = (motion.cameraTargetY ?? motion.position.y) + CAMERA.targetHeightMeters
    } else desiredTarget.set(0, CAMERA.targetHeightMeters, 0)

    const transition = transitionRef.current
    if (transition) {
      transition.elapsedSeconds = Math.min(
        LANDRUSH_ZOMBIE_ESCAPE_CAMERA_TRANSITION_SECONDS,
        transition.elapsedSeconds + Math.min(0.05, Math.max(0, delta)),
      )
      const sample = sampleLandrushZombieEscapeCameraTransition(
        transition.elapsedSeconds / LANDRUSH_ZOMBIE_ESCAPE_CAMERA_TRANSITION_SECONDS,
        transition.sourceHalfHeight,
        transition.sourceFar,
        transition.sourceProjectionCenterY,
        layoutRef.current.projectionCenterY,
        layoutRef.current.halfHeight,
      )
      transitionPosition.copy(desiredTarget).add(cameraOffset)
      camera.position.lerpVectors(transition.sourcePosition, transitionPosition, sample.amount)
      transitionTarget.lerpVectors(transition.sourceTarget, desiredTarget, sample.amount)
      lookAtMatrix.lookAt(transitionPosition, desiredTarget, cameraUp)
      desiredQuaternion.setFromRotationMatrix(lookAtMatrix)
      camera.quaternion.slerpQuaternions(
        transition.sourceQuaternion,
        desiredQuaternion,
        sample.amount,
      )
      currentHalfHeightRef.current = sample.halfHeight
      currentProjectionCenterYRef.current = sample.projectionCenterY
      camera.far = sample.far
      applyLandrushZombieEscapeCameraProjection(
        camera,
        sample.halfHeight,
        layoutRef.current.right / layoutRef.current.halfHeight,
        sample.projectionCenterY,
      )
      publishedTarget.copy(transitionTarget)
      camera.updateMatrixWorld()
      state.invalidate()

      if (sample.progress >= 1) {
        transitionRef.current = null
        followedTarget.copy(desiredTarget)
        onSettledRef.current?.()
      }
      return
    }

    followedTarget.lerp(
      desiredTarget,
      1 - Math.exp(-CAMERA.followResponse * Math.min(0.05, Math.max(0, delta))),
    )
    camera.position.copy(followedTarget).add(cameraOffset)
    camera.lookAt(followedTarget)
    publishedTarget.copy(followedTarget)
    camera.updateMatrixWorld()
  }, LANDRUSH_ZOMBIE_ESCAPE_CAMERA_FRAME_PRIORITY)

  return null
}

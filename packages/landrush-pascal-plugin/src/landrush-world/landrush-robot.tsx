'use client'

import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  Box3,
  type BufferGeometry,
  Euler,
  type Group,
  LoopRepeat,
  MathUtils,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { cameraPosition, float, normalWorld, positionWorld, color as tslColor } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  applyLandrushRobotCrouchPose,
  createLandrushRobotCrouchRig,
  resetLandrushRobotCrouchPose,
} from './landrush-robot-crouch'
import {
  type LandrushRobotJumpPose,
  type LandrushRobotJumpPoseRef,
  resolveLandrushRobotJumpPose,
} from './landrush-robot-jump'
import type { LandrushWorldNode } from './schema'

export {
  applyLandrushRobotCrouchPose,
  createLandrushRobotCrouchRig,
  type LandrushRobotCrouchRig,
  resetLandrushRobotCrouchPose,
} from './landrush-robot-crouch'
export {
  type LandrushRobotJumpContact,
  type LandrushRobotJumpPhase,
  type LandrushRobotJumpPose,
  type LandrushRobotJumpPoseRef,
  resolveLandrushRobotJumpContact,
  resolveLandrushRobotJumpPose,
} from './landrush-robot-jump'

const LANDRUSH_ROBOT_ASSET_PATH = '/navigation/proto_pascal_robot.glb'
const LANDRUSH_ROBOT_GLB_VISUAL_SCALE = 1 / 110.16949152542374
const LANDRUSH_ROBOT_TARGET_HEIGHT = 1.82
const LANDRUSH_ROBOT_IDLE_TIME_SCALE = 0.5
const LANDRUSH_ROBOT_WALK_TIME_SCALE = 0.88
const LANDRUSH_ROBOT_RUN_TIME_SCALE_RANGE = [0.75, 1.45] as const
const LANDRUSH_ROBOT_RUN_BLEND_START_SPEED = 2.6
const LANDRUSH_ROBOT_RUN_BLEND_FULL_SPEED = 4.8
const LANDRUSH_ROBOT_ANIMATION_PACE_RANGE = [0.2, 1.6] as const
const LANDRUSH_ROBOT_CLIP_BLEND_RESPONSE = 8
const LANDRUSH_ROBOT_CLIP_TIME_SCALE_RESPONSE = 10
const LANDRUSH_ROBOT_FALL_RESPONSE = 7
export const LANDRUSH_ROBOT_CROUCH_RESPONSE = 12
const LANDRUSH_ROBOT_FALL_SPIN_SPEED = 1.35
const LANDRUSH_ROBOT_FALL_JOINT_MOTION_AMPLITUDE = 28.8
// Drei's mixer writes at 0 and post-processing renders at 1, so procedural bones own the gap.
const LANDRUSH_ROBOT_SKELETAL_POSE_FRAME_PRIORITY = 0.5
const LANDRUSH_ROBOT_UP_AXIS = new Vector3(0, 1, 0)
const LANDRUSH_ROBOT_IDENTITY_QUATERNION = new Quaternion()
export const LANDRUSH_ROBOT_HOVER_OFFSET = 1.524
export const LANDRUSH_ROBOT_HOVER_BOB_AMPLITUDE = 0.14
export const LANDRUSH_ROBOT_HOVER_BOB_SPEED = 1.15
export const LANDRUSH_ROBOT_HOVER_RESPONSE = 6
const LANDRUSH_ROBOT_HOVER_FILL_COLOR = 0xf7fbff
const LANDRUSH_ROBOT_HOVER_OUTLINE_INK_COLOR = 0x050505
const LANDRUSH_ROBOT_IDLE_CLIP_NAMES = [
  'Idle_9',
  'Idle_11',
  'Idle_7',
  'Idle_12',
  'Idle_Talking_Loop',
  'Idle_Loop',
] as const
const LANDRUSH_ROBOT_WALK_CLIP_NAMES = [
  'Walking',
  'Walk_Loop',
  'Walk_Formal_Loop',
  'Jog_Fwd_Loop',
] as const
const LANDRUSH_ROBOT_RUN_CLIP_NAMES = ['Running', 'Sprint_Loop', 'Jog_Fwd_Loop'] as const
const EXCLUDED_LANDRUSH_ROBOT_CLIP_NAMES = new Set([
  'Funky_Walk',
  'Stylish_Walk',
  'Stylish_Walk_inplace',
  'run_fast_3',
  'run_fast_3_inplace',
])

type RobotAnimationBlendState = {
  idleWeight: number
  runTimeScale: number
  runWeight: number
  walkTimeScale: number
  walkWeight: number
}

export type LandrushRobotPresentationMode = 'default' | 'fall' | 'hover'

export type LandrushRobotAnimationState = {
  clipCount: number
  idleClipTime: number
  idleClipDuration: number
  idleClip: string | null
  idleTimeScale: number
  idleWeight: number
  mixerTimeScale: number
  runClip: string | null
  runClipDuration: number
  runClipTime: number
  runTimeScale: number
  runWeight: number
  walkClip: string | null
  walkClipDuration: number
  walkClipTime: number
  walkTimeScale: number
  walkWeight: number
}

export type LandrushRobotHoverPoseSample = {
  bones: Record<string, { localPitchDeg: number; worldPitchDeg: number }>
  groupPitchDeg: number
  hoverAmount: number
}

type LandrushRobotProfileMeasure = <T>(id: string, callback: () => T) => T
type LandrushRobotHoverMaterialState = Object3D['userData'] & {
  landrushHoverMaterial?: MeshBasicNodeMaterial
  landrushHoverMaterialScale?: number
  landrushOriginalMaterial?: unknown
}
type LandrushRobotProps = {
  animationPace?: number
  crouching?: boolean
  crouchingRef?: { current: boolean }
  fallControlRotation?: Quaternion
  fallIntensity?: number
  fallMotionScale?: number
  framePriority?: number
  hoverOutlineWidthScale?: number
  jumpPoseRef?: LandrushRobotJumpPoseRef
  node: LandrushWorldNode
  onAnimationState?: (state: LandrushRobotAnimationState) => void
  onHoverPoseSample?: (sample: LandrushRobotHoverPoseSample) => void
  presentationMode?: LandrushRobotPresentationMode
  profileMeasure?: LandrushRobotProfileMeasure
  visualRootRef?: { current: Group | null }
}

export function LandrushRobot({
  animationPace = 1,
  crouching = false,
  crouchingRef,
  fallControlRotation,
  fallIntensity = 1,
  fallMotionScale = 1,
  framePriority = 0,
  hoverOutlineWidthScale = 1,
  jumpPoseRef,
  node,
  onAnimationState,
  onHoverPoseSample,
  presentationMode = 'default',
  profileMeasure,
  visualRootRef,
}: LandrushRobotProps) {
  const measure = profileMeasure ?? measureUnprofiled
  const animationPaceValue = MathUtils.clamp(
    animationPace,
    LANDRUSH_ROBOT_ANIMATION_PACE_RANGE[0],
    LANDRUSH_ROBOT_ANIMATION_PACE_RANGE[1],
  )
  const hoverOutlineWidthScaleValue = MathUtils.clamp(hoverOutlineWidthScale, 0.5, 3)
  const fallIntensityValue = MathUtils.clamp(fallIntensity, 0, 1)
  const fallMotionScaleValue = MathUtils.clamp(fallMotionScale, 0.05, 1)
  const idleTimeScale = LANDRUSH_ROBOT_IDLE_TIME_SCALE
  const groupRef = useRef<Group>(null!)
  const { animations, scene } = useGLTF(LANDRUSH_ROBOT_ASSET_PATH)
  const locomotionClips = useMemo(
    () =>
      measure('setup.robot-glb.select-locomotion-clips', () =>
        selectRobotLocomotionClips(animations),
      ),
    [animations, measure],
  )
  const clonedScene = useMemo(
    () => measure('setup.robot-glb.clone-skeleton', () => cloneSkeleton(scene) as Group),
    [measure, scene],
  )
  const hoverRestPose = useMemo(
    () =>
      measure('setup.robot-glb.capture-hover-rest-pose', () =>
        captureLandrushRobotRestPose(clonedScene, locomotionClips),
      ),
    [clonedScene, locomotionClips, measure],
  )
  const crouchRig = useMemo(() => createLandrushRobotCrouchRig(clonedScene), [clonedScene])
  const robotTransform = useMemo(() => {
    return measure('setup.robot-glb.compute-transform', () => {
      const bounds = measure('setup.robot-glb.compute-transform.bounds-from-object', () =>
        computeRobotSceneBounds(
          clonedScene,
          measure,
          'setup.robot-glb.compute-transform.bounds-from-object',
        ),
      )
      const size = measure('setup.robot-glb.compute-transform.read-size', () =>
        bounds.getSize(new Vector3()),
      )
      const center = measure('setup.robot-glb.compute-transform.read-center', () =>
        bounds.getCenter(new Vector3()),
      )
      const geometryCenter = measure(
        'setup.robot-glb.compute-transform.read-skinned-geometry-center',
        () => new Box3().setFromObject(clonedScene, true).getCenter(new Vector3()),
      )
      const scale = measure('setup.robot-glb.compute-transform.resolve-scale', () =>
        Number.isFinite(size.y) && size.y > 0 ? LANDRUSH_ROBOT_TARGET_HEIGHT / size.y : 1,
      )
      const visualScale = scale * LANDRUSH_ROBOT_GLB_VISUAL_SCALE
      const fallPivot = [
        (geometryCenter.x - center.x) * visualScale,
        (geometryCenter.y - bounds.min.y) * visualScale,
        (geometryCenter.z - center.z) * visualScale,
      ] as const
      return measure('setup.robot-glb.compute-transform.build-offset', () => ({
        fallPivot,
        fallPivotInverse: [-fallPivot[0], -fallPivot[1], -fallPivot[2]] as const,
        offset: [-center.x, -bounds.min.y, -center.z] as const,
        scale: visualScale,
      }))
    })
  }, [clonedScene, measure])
  // Lazy actions need a root during render; a pending JSX ref leaves remote actors unanimated.
  const { actions, mixer } = useAnimations(locomotionClips, clonedScene)
  const allAnimationActions = useMemo(
    () =>
      measure('setup.robot-glb.collect-actions', () =>
        Object.values(actions).filter((action): action is AnimationAction => Boolean(action)),
      ),
    [actions, measure],
  )
  const fallbackAction = allAnimationActions[0] ?? null
  const idleAction =
    getFirstAvailableRobotAction(actions, LANDRUSH_ROBOT_IDLE_CLIP_NAMES) ?? fallbackAction
  const walkAction =
    getFirstAvailableRobotAction(actions, LANDRUSH_ROBOT_WALK_CLIP_NAMES) ?? idleAction
  const runAction =
    getFirstAvailableRobotAction(actions, LANDRUSH_ROBOT_RUN_CLIP_NAMES) ?? walkAction ?? idleAction
  const locomotionActions = useMemo(
    () => getUniqueRobotActions([idleAction, walkAction, runAction]),
    [idleAction, runAction, walkAction],
  )
  const blendStateRef = useRef<RobotAnimationBlendState>({
    idleWeight: 1,
    runTimeScale: 1,
    runWeight: 0,
    walkTimeScale: 1,
    walkWeight: 0,
  })
  const hoverAmountRef = useRef(0)
  const crouchAmountRef = useRef(0)
  const fallAmountRef = useRef(0)
  const fallSpinRef = useRef(0)
  const fallJointMotionTimeRef = useRef(0)
  const headingQuaternionRef = useRef(new Quaternion())
  const fallControlQuaternionRef = useRef(new Quaternion())
  const fallProceduralEulerRef = useRef(new Euler())
  const fallProceduralQuaternionRef = useRef(new Quaternion())
  const fallPivotRef = useRef<Group>(null!)
  const reportAnimationFrameRef = useRef(0)
  const reportHoverPoseFrameRef = useRef(0)

  useEffect(() => {
    if (!visualRootRef) return
    visualRootRef.current = groupRef.current
    return () => {
      if (visualRootRef.current === groupRef.current) visualRootRef.current = null
    }
  }, [visualRootRef])

  useEffect(() => {
    mixer.timeScale = animationPaceValue
    return () => {
      mixer.timeScale = 1
    }
  }, [animationPaceValue, mixer])

  useEffect(() => {
    measure('setup.robot-glb.configure-actions', () => {
      for (const [clipName, action] of Object.entries(actions)) {
        if (!action) continue
        if (EXCLUDED_LANDRUSH_ROBOT_CLIP_NAMES.has(clipName)) {
          action.stop()
          continue
        }
        if (!locomotionActions.includes(action)) {
          action.stop()
          action.enabled = false
          continue
        }
        action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
        action.clampWhenFinished = false
        action.enabled = true
        action.paused = false
        action.reset()
        action.setEffectiveTimeScale(action === idleAction ? LANDRUSH_ROBOT_IDLE_TIME_SCALE : 1)
        action.setEffectiveWeight(action === idleAction ? 1 : 0)
        action.play()
      }
    })

    blendStateRef.current = {
      idleWeight: idleAction ? 1 : 0,
      runTimeScale: 1,
      runWeight: 0,
      walkTimeScale: 1,
      walkWeight: 0,
    }
  }, [actions, idleAction, locomotionActions, measure])

  useEffect(() => {
    onAnimationState?.(
      createRobotAnimationState(
        allAnimationActions.length,
        idleAction,
        walkAction,
        runAction,
        blendStateRef.current,
        idleTimeScale,
        animationPaceValue,
      ),
    )
  }, [
    allAnimationActions.length,
    animationPaceValue,
    idleAction,
    onAnimationState,
    runAction,
    walkAction,
  ])

  useFrame(() => {
    resetLandrushRobotCrouchPose(crouchRig)
  }, -0.5)

  useFrame(() => {
    measure('frame.robot-glb.apply-hover-pose', () => {
      applyLandrushRobotHoverPose(clonedScene, hoverAmountRef.current, hoverRestPose)
      applyLandrushRobotFallPose(
        clonedScene,
        fallAmountRef.current,
        hoverRestPose,
        fallJointMotionTimeRef.current,
        fallIntensityValue,
      )
      const jumpProgress = jumpPoseRef?.current
      if (jumpProgress !== null && jumpProgress !== undefined) {
        applyLandrushRobotJumpPose(clonedScene, resolveLandrushRobotJumpPose(jumpProgress))
      }
      applyLandrushRobotCrouchPose(
        crouchRig,
        jumpProgress === null || jumpProgress === undefined
          ? presentationMode === 'default'
            ? crouchAmountRef.current
            : 0
          : 0,
      )
    })
  }, LANDRUSH_ROBOT_SKELETAL_POSE_FRAME_PRIORITY)

  useFrame(({ clock }, delta) => {
    measure('frame.robot-glb.total', () => {
      const frameDelta = Math.min(delta, 0.05)
      const speed = node.playerSpeed ?? 0
      const blendState = blendStateRef.current
      crouchAmountRef.current = MathUtils.damp(
        crouchAmountRef.current,
        (crouchingRef?.current ?? crouching) &&
          presentationMode === 'default' &&
          (jumpPoseRef?.current === null || jumpPoseRef?.current === undefined)
          ? 1
          : 0,
        LANDRUSH_ROBOT_CROUCH_RESPONSE,
        frameDelta,
      )
      const hoverAmount = measure('frame.robot-glb.damp-hover-presentation', () => {
        hoverAmountRef.current = MathUtils.damp(
          hoverAmountRef.current,
          presentationMode === 'hover' ? 1 : 0,
          LANDRUSH_ROBOT_HOVER_RESPONSE,
          frameDelta,
        )
        return hoverAmountRef.current
      })
      const fallAmount = measure('frame.robot-glb.damp-fall-presentation', () => {
        fallAmountRef.current = MathUtils.damp(
          fallAmountRef.current,
          presentationMode === 'fall' ? 1 : 0,
          LANDRUSH_ROBOT_FALL_RESPONSE,
          frameDelta,
        )
        if (fallAmountRef.current > 0.0001) {
          fallSpinRef.current +=
            frameDelta *
            fallMotionScaleValue *
            LANDRUSH_ROBOT_FALL_SPIN_SPEED *
            (0.35 + fallAmountRef.current)
          fallJointMotionTimeRef.current += frameDelta
        } else {
          fallSpinRef.current = 0
          fallJointMotionTimeRef.current = 0
        }
        return fallAmountRef.current
      })
      const blendTargets = measure('frame.robot-glb.compute-blend-targets', () => {
        const moveBlendTarget = node.playerMoving ? MathUtils.clamp(speed / 2.4, 0, 1) : 0
        const runBlendTarget = moveBlendTarget * resolveRobotRunBlendTarget(speed)
        const locomotionAmount = 1 - Math.max(hoverAmount, fallAmount)
        const walkBlendTarget = Math.max(0, moveBlendTarget - runBlendTarget) * locomotionAmount
        const suppressedRunBlendTarget = runBlendTarget * locomotionAmount
        return {
          idleBlendTarget: Math.max(0, 1 - walkBlendTarget - suppressedRunBlendTarget),
          runBlendTarget: suppressedRunBlendTarget,
          walkBlendTarget,
        }
      })

      measure('frame.robot-glb.damp-blend-state', () => {
        blendState.idleWeight = MathUtils.damp(
          blendState.idleWeight,
          blendTargets.idleBlendTarget,
          LANDRUSH_ROBOT_CLIP_BLEND_RESPONSE,
          frameDelta,
        )
        blendState.walkWeight = MathUtils.damp(
          blendState.walkWeight,
          blendTargets.walkBlendTarget,
          LANDRUSH_ROBOT_CLIP_BLEND_RESPONSE,
          frameDelta,
        )
        blendState.runWeight = MathUtils.damp(
          blendState.runWeight,
          blendTargets.runBlendTarget,
          LANDRUSH_ROBOT_CLIP_BLEND_RESPONSE,
          frameDelta,
        )
        blendState.walkTimeScale = MathUtils.damp(
          blendState.walkTimeScale,
          resolveRobotWalkTimeScale(speed),
          LANDRUSH_ROBOT_CLIP_TIME_SCALE_RESPONSE,
          frameDelta,
        )
        blendState.runTimeScale = MathUtils.damp(
          blendState.runTimeScale,
          resolveRobotRunTimeScale(speed),
          LANDRUSH_ROBOT_CLIP_TIME_SCALE_RESPONSE,
          frameDelta,
        )
      })

      const actionTargets = measure('frame.robot-glb.build-action-targets', () => {
        const targets = new Map<
          AnimationAction,
          { timeScaleSum: number; weight: number; weightedTimeScale: number }
        >()
        accumulateRobotActionTarget(targets, idleAction, blendState.idleWeight, idleTimeScale)
        accumulateRobotActionTarget(
          targets,
          walkAction,
          blendState.walkWeight,
          blendState.walkTimeScale,
        )
        accumulateRobotActionTarget(
          targets,
          runAction,
          blendState.runWeight,
          blendState.runTimeScale,
        )
        return targets
      })

      measure('frame.robot-glb.apply-action-targets', () => {
        for (const action of locomotionActions) {
          const target = actionTargets.get(action)
          if (!target || target.weight <= 0.001) {
            setRobotActionInactive(action)
            continue
          }
          setRobotActionActive(
            action,
            MathUtils.clamp(target.weight, 0, 1),
            target.weightedTimeScale > Number.EPSILON
              ? target.timeScaleSum / target.weightedTimeScale
              : 1,
          )
        }
      })

      measure('frame.robot-glb.apply-transform', () => {
        const hoverOffset = resolveLandrushRobotHoverOffset(hoverAmount, clock.elapsedTime)
        const jumpProgress = jumpPoseRef?.current
        const jumpBodyCompressionOffset =
          jumpProgress === null || jumpProgress === undefined
            ? 0
            : resolveLandrushRobotJumpPose(jumpProgress).bodyCompressionOffset
        const fallRotation = resolveLandrushRobotFallRotation(
          fallAmount,
          fallSpinRef.current,
          fallIntensityValue,
        )
        groupRef.current?.position.set(
          node.playerPosition[0],
          node.playerPosition[1] + hoverOffset - jumpBodyCompressionOffset,
          node.playerPosition[2],
        )
        if (fallPivotRef.current) {
          headingQuaternionRef.current.setFromAxisAngle(
            LANDRUSH_ROBOT_UP_AXIS,
            node.playerHeading ?? 0,
          )
          fallControlQuaternionRef.current.copy(
            presentationMode === 'fall' && fallControlRotation
              ? fallControlRotation
              : LANDRUSH_ROBOT_IDENTITY_QUATERNION,
          )
          fallProceduralEulerRef.current.set(fallRotation.x, fallRotation.y, fallRotation.z, 'XYZ')
          fallProceduralQuaternionRef.current.setFromEuler(fallProceduralEulerRef.current)
          fallPivotRef.current.quaternion
            .copy(fallControlQuaternionRef.current)
            .multiply(headingQuaternionRef.current)
            .multiply(fallProceduralQuaternionRef.current)
        }
      })

      if (onHoverPoseSample) {
        reportHoverPoseFrameRef.current += 1
        if (reportHoverPoseFrameRef.current % 8 === 0) {
          measure('frame.robot-glb.report-hover-pose', () => {
            groupRef.current.updateMatrixWorld(true)
            clonedScene.updateMatrixWorld(true)
            onHoverPoseSample(
              createLandrushRobotHoverPoseSample(groupRef.current, clonedScene, hoverAmount),
            )
          })
        }
      }

      reportAnimationFrameRef.current += 1
      if (onAnimationState && reportAnimationFrameRef.current % 8 === 0) {
        measure('frame.robot-glb.report-animation-state', () => {
          onAnimationState(
            createRobotAnimationState(
              allAnimationActions.length,
              idleAction,
              walkAction,
              runAction,
              blendState,
              idleTimeScale,
              animationPaceValue,
            ),
          )
        })
      }
    })
  }, framePriority)

  useEffect(() => {
    measure('setup.robot-glb.configure-meshes', () => {
      clonedScene.traverse((child) => {
        const mesh = child as {
          castShadow?: boolean
          frustumCulled?: boolean
          geometry?: BufferGeometry
          isMesh?: boolean
          material?: unknown
          receiveShadow?: boolean
          visible?: boolean
        }
        if (!mesh.isMesh) return
        if (mesh.geometry && !mesh.geometry.getAttribute('normal')) {
          mesh.geometry.computeVertexNormals()
        }
        mesh.castShadow = true
        mesh.frustumCulled = false
        mesh.receiveShadow = true
        mesh.visible = true
      })
    })
  }, [clonedScene, measure])

  useEffect(() => () => resetLandrushRobotCrouchPose(crouchRig), [crouchRig])

  useEffect(() => {
    measure('setup.robot-glb.configure-hover-fill', () => {
      applyLandrushRobotHoverFill(
        clonedScene,
        presentationMode === 'hover',
        hoverOutlineWidthScaleValue,
      )
    })
  }, [clonedScene, hoverOutlineWidthScaleValue, measure, presentationMode])

  return (
    <group
      position={[node.playerPosition[0], node.playerPosition[1], node.playerPosition[2]]}
      ref={groupRef}
    >
      <group
        position={robotTransform.fallPivot}
        ref={fallPivotRef}
        rotation={[0, node.playerHeading ?? 0, 0]}
      >
        <group position={robotTransform.fallPivotInverse}>
          <group scale={robotTransform.scale}>
            <primitive object={clonedScene} position={robotTransform.offset} />
          </group>
        </group>
      </group>
    </group>
  )
}

export function resolveLandrushRobotHoverOffset(hoverAmount: number, elapsedTime: number) {
  if (hoverAmount <= 0.0001) return 0
  return (
    hoverAmount *
    (LANDRUSH_ROBOT_HOVER_OFFSET +
      Math.sin(elapsedTime * LANDRUSH_ROBOT_HOVER_BOB_SPEED) * LANDRUSH_ROBOT_HOVER_BOB_AMPLITUDE)
  )
}

function resolveLandrushRobotFallRotation(fallAmount: number, spin: number, fallIntensity: number) {
  if (fallAmount <= 0.0001) return { x: 0, y: 0, z: 0 }
  const amount = MathUtils.smoothstep(fallAmount, 0, 1)
  const looseAmount = MathUtils.smoothstep(fallIntensity, 0, 1)
  return {
    x:
      (-0.95 +
        Math.sin(spin * 1.4) * (0.14 + looseAmount * 0.36) +
        Math.sin(spin * 3.9 + 0.4) * 0.18 * looseAmount) *
      amount,
    y: Math.sin(spin * 0.7) * (0.24 + looseAmount * 0.48) * amount,
    z:
      (1.02 +
        Math.sin(spin) * (0.2 + looseAmount * 0.46) +
        Math.sin(spin * 3.1 + 1.1) * 0.24 * looseAmount) *
      amount,
  }
}

function applyLandrushRobotHoverFill(root: Group, active: boolean, outlineWidthScale: number) {
  root.traverse((child) => {
    const mesh = child as {
      isMesh?: boolean
      material?: unknown
      userData: LandrushRobotHoverMaterialState
    }
    if (!mesh.isMesh) return

    if (active) {
      mesh.userData.landrushOriginalMaterial ??= mesh.material
      if (
        !mesh.userData.landrushHoverMaterial ||
        mesh.userData.landrushHoverMaterialScale !== outlineWidthScale
      ) {
        mesh.userData.landrushHoverMaterial?.dispose()
        mesh.userData.landrushHoverMaterial = createLandrushRobotHoverMaterial(outlineWidthScale)
        mesh.userData.landrushHoverMaterialScale = outlineWidthScale
      }
      mesh.material = mesh.userData.landrushHoverMaterial
      return
    }

    if ('landrushOriginalMaterial' in mesh.userData) {
      mesh.material = mesh.userData.landrushOriginalMaterial
      delete mesh.userData.landrushOriginalMaterial
    }
  })
}

function createLandrushRobotHoverMaterial(outlineWidthScale: number) {
  const viewDirection = cameraPosition.sub(positionWorld).normalize()
  const rimEdgeScale = Math.max(0.5, outlineWidthScale)
  const rim = float(1)
    .sub(normalWorld.dot(viewDirection).abs())
    .smoothstep(0.06 / rimEdgeScale, 0.42 / rimEdgeScale)
    .mul(0.98)
  const fill = tslColor(LANDRUSH_ROBOT_HOVER_FILL_COLOR)
  const ink = tslColor(LANDRUSH_ROBOT_HOVER_OUTLINE_INK_COLOR)

  const material = new MeshBasicNodeMaterial({
    colorNode: fill.mul(float(1).sub(rim)).add(ink.mul(rim)),
    toneMapped: false,
  })
  material.depthWrite = true
  return material
}

type LandrushRobotRestPose = Map<string, Euler>

function applyLandrushRobotJumpPose(root: Group, pose: LandrushRobotJumpPose) {
  root.traverse((child) => {
    if ((child as Object3D & { isBone?: boolean }).isBone !== true) return
    const name = child.name.toLowerCase()

    if (name === 'leftupleg' || name === 'rightupleg') {
      child.rotateX(pose.upperLegPitch)
      return
    }
    if (name === 'leftleg' || name === 'rightleg') {
      child.rotateX(pose.kneePitch)
      return
    }
    if (name === 'leftfoot' || name === 'rightfoot') {
      child.rotateX(pose.footPitch)
      return
    }
    if (name === 'lefttoebase' || name === 'righttoebase') {
      child.rotateX(pose.footPitch * -0.2)
      return
    }
    if (name === 'spine02') {
      child.rotateX(pose.spinePitch * 0.55)
      return
    }
    if (name === 'spine01') {
      child.rotateX(pose.spinePitch * 0.3)
      return
    }
    if (name === 'spine') {
      child.rotateX(pose.spinePitch * 0.15)
      return
    }
    if (name === 'leftarm' || name === 'rightarm') {
      child.rotateX(pose.armPitch)
      return
    }
    if (name === 'leftforearm' || name === 'rightforearm') {
      child.rotateX(Math.max(0, pose.kneePitch) * -0.22)
    }
  })
}

function captureLandrushRobotRestPose(
  root: Group,
  locomotionClips: readonly AnimationClip[],
): LandrushRobotRestPose {
  const originalPose = captureLandrushRobotBonePose(root)
  const idleClip = selectLandrushRobotHoverIdleClip(locomotionClips)
  if (!idleClip) return originalPose

  const mixer = new AnimationMixer(root)
  const action = mixer.clipAction(idleClip)
  action.enabled = true
  action.setEffectiveWeight(1)
  action.play()
  mixer.setTime(resolveLandrushRobotHoverIdleSampleTime(idleClip))
  root.updateMatrixWorld(true)
  const sampledPose = captureLandrushRobotBonePose(root)

  action.stop()
  mixer.stopAllAction()
  mixer.uncacheRoot(root)
  applyLandrushRobotBonePose(root, originalPose)
  root.updateMatrixWorld(true)
  return sampledPose
}

function captureLandrushRobotBonePose(root: Group): LandrushRobotRestPose {
  const restPose: LandrushRobotRestPose = new Map()
  root.traverse((child) => {
    if ((child as Object3D & { isBone?: boolean }).isBone !== true) return
    restPose.set(child.name, child.rotation.clone())
  })
  return restPose
}

function applyLandrushRobotBonePose(root: Group, pose: LandrushRobotRestPose) {
  root.traverse((child) => {
    if ((child as Object3D & { isBone?: boolean }).isBone !== true) return
    const rotation = pose.get(child.name)
    if (!rotation) return
    child.rotation.copy(rotation)
  })
}

function selectLandrushRobotHoverIdleClip(locomotionClips: readonly AnimationClip[]) {
  for (const name of LANDRUSH_ROBOT_IDLE_CLIP_NAMES) {
    const clip = locomotionClips.find((candidate) => candidate.name === name)
    if (clip) return clip
  }
  return locomotionClips.find((candidate) => candidate.name.toLowerCase().includes('idle')) ?? null
}

function resolveLandrushRobotHoverIdleSampleTime(clip: AnimationClip) {
  if (!Number.isFinite(clip.duration) || clip.duration <= 0) return 0
  return Math.min(0.35, clip.duration * 0.18)
}

function applyLandrushRobotHoverPose(
  root: Group,
  hoverAmount: number,
  restPose: LandrushRobotRestPose,
) {
  if (hoverAmount <= 0.0001) return

  root.traverse((child) => {
    if ((child as Object3D & { isBone?: boolean }).isBone !== true) return

    const restRotation = restPose.get(child.name)
    if (!restRotation) return

    const poseTarget = resolveLandrushRobotHoverBonePose(child.name.toLowerCase(), restRotation)
    if (!poseTarget) return

    child.rotation.set(
      MathUtils.lerp(child.rotation.x, poseTarget.x, hoverAmount),
      MathUtils.lerp(child.rotation.y, poseTarget.y, hoverAmount),
      MathUtils.lerp(child.rotation.z, poseTarget.z, hoverAmount),
    )
  })
}

function resolveLandrushRobotHoverBonePose(name: string, restRotation: Euler) {
  if (name.includes('toe')) {
    return { x: restRotation.x + 0.28, y: restRotation.y, z: restRotation.z }
  }
  if (name.includes('foot')) {
    return { x: restRotation.x + 0.38, y: restRotation.y, z: restRotation.z }
  }
  return restRotation
}

function applyLandrushRobotFallPose(
  root: Group,
  fallAmount: number,
  restPose: LandrushRobotRestPose,
  jointMotionTime: number,
  fallIntensity: number,
) {
  if (fallAmount <= 0.0001) return

  root.traverse((child) => {
    if ((child as Object3D & { isBone?: boolean }).isBone !== true) return

    const restRotation = restPose.get(child.name)
    if (!restRotation) return

    const poseTarget = resolveLandrushRobotFallBonePose(
      child.name.toLowerCase(),
      restRotation,
      jointMotionTime,
      fallIntensity,
    )
    if (!poseTarget) return

    child.rotation.set(
      MathUtils.lerp(child.rotation.x, poseTarget.x, fallAmount),
      MathUtils.lerp(child.rotation.y, poseTarget.y, fallAmount),
      MathUtils.lerp(child.rotation.z, poseTarget.z, fallAmount),
    )
  })
}

function resolveLandrushRobotFallBonePose(
  name: string,
  restRotation: Euler,
  jointMotionTime: number,
  fallIntensity: number,
) {
  const side = name.includes('left') ? 1 : name.includes('right') ? -1 : 0
  const looseAmount = MathUtils.smoothstep(fallIntensity, 0, 1)
  const motionAmount =
    MathUtils.lerp(0.35, 1, looseAmount) * LANDRUSH_ROBOT_FALL_JOINT_MOTION_AMPLITUDE
  const xMotion = resolveLandrushRobotFallJointAxisMotion(name, 'x', jointMotionTime, motionAmount)
  const yMotion = resolveLandrushRobotFallJointAxisMotion(name, 'y', jointMotionTime, motionAmount)
  const zMotion = resolveLandrushRobotFallJointAxisMotion(name, 'z', jointMotionTime, motionAmount)
  if (name.includes('hips')) {
    return {
      x: restRotation.x + 0.22 + xMotion * 0.025,
      y: restRotation.y + yMotion * 0.02,
      z: restRotation.z + 0.16 + zMotion * 0.03,
    }
  }
  if (name.includes('spine')) {
    return {
      x: restRotation.x + 0.34 + xMotion * 0.04,
      y: restRotation.y + yMotion * 0.035,
      z: restRotation.z - 0.18 + zMotion * 0.045,
    }
  }
  if (name.includes('neck') || name.includes('head')) {
    return {
      x: restRotation.x - 0.26 + xMotion * 0.045,
      y: restRotation.y + yMotion * 0.04,
      z: restRotation.z + 0.12 + zMotion * 0.04,
    }
  }
  if (name.includes('shoulder')) {
    return {
      x: restRotation.x + 0.18 + xMotion * 0.055,
      y: restRotation.y + side * 0.1 + yMotion * 0.06,
      z: restRotation.z + (side || 1) * 0.25 + zMotion * 0.07,
    }
  }
  if (name.includes('arm') || name.includes('hand')) {
    return {
      x: restRotation.x + 0.58 + xMotion * 0.075,
      y: restRotation.y + side * 0.18 + yMotion * 0.055,
      z: restRotation.z + (side || 1) * 0.95 + zMotion * 0.09,
    }
  }
  if (name.includes('leg') || name.includes('thigh') || name.includes('calf')) {
    return {
      x: restRotation.x - 0.42 + xMotion * 0.07,
      y: restRotation.y + yMotion * 0.045,
      z: restRotation.z + (side || 1) * 0.42 + zMotion * 0.065,
    }
  }
  if (name.includes('foot') || name.includes('toe')) {
    return {
      x: restRotation.x + 0.5 + xMotion * 0.08,
      y: restRotation.y + yMotion * 0.05,
      z: restRotation.z + (side || 1) * 0.26 + zMotion * 0.055,
    }
  }
  return null
}

function resolveLandrushRobotFallJointAxisMotion(
  name: string,
  axis: 'x' | 'y' | 'z',
  jointMotionTime: number,
  motionAmount: number,
) {
  const phase = landrushRobotBonePhase(`${name}:${axis}:phase`)
  const secondaryPhase = landrushRobotBonePhase(`${name}:${axis}:secondary-phase`)
  const speedSeed = landrushRobotBonePhase(`${name}:${axis}:speed`) % 1
  const ratioSeed = landrushRobotBonePhase(`${name}:${axis}:ratio`) % 1
  const speed = MathUtils.lerp(0.48, 1, speedSeed)
  const secondarySpeedRatio = MathUtils.lerp(1.31, 1.87, ratioSeed)
  return (
    ((Math.sin(jointMotionTime * speed + phase) +
      Math.sin(jointMotionTime * speed * secondarySpeedRatio + secondaryPhase) * 0.38) /
      1.38) *
    motionAmount
  )
}

function landrushRobotBonePhase(name: string) {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 997
  }
  return hash * 0.013
}

function createLandrushRobotHoverPoseSample(
  group: Group,
  root: Group,
  hoverAmount: number,
): LandrushRobotHoverPoseSample {
  const bones: LandrushRobotHoverPoseSample['bones'] = {}
  const worldEuler = new Euler()
  root.traverse((child) => {
    if ((child as Object3D & { isBone?: boolean }).isBone !== true) return
    if (!isLandrushRobotHoverProbeBone(child.name.toLowerCase())) return
    child.getWorldQuaternion(_landrushRobotHoverProbeQuaternion)
    worldEuler.setFromQuaternion(_landrushRobotHoverProbeQuaternion, 'XYZ')
    bones[child.name] = {
      localPitchDeg: roundRobotProbeDegrees(child.rotation.x),
      worldPitchDeg: roundRobotProbeDegrees(worldEuler.x),
    }
  })
  return {
    bones,
    groupPitchDeg: roundRobotProbeDegrees(group.rotation.x),
    hoverAmount: roundRobotProbeValue(hoverAmount),
  }
}

const _landrushRobotHoverProbeQuaternion = new Quaternion()

function isLandrushRobotHoverProbeBone(name: string) {
  return (
    name === 'hips' ||
    name.includes('spine') ||
    name.includes('neck') ||
    name === 'head' ||
    name.includes('foot') ||
    name.includes('toe')
  )
}

function roundRobotProbeDegrees(value: number) {
  return roundRobotProbeValue(MathUtils.radToDeg(value))
}

function roundRobotProbeValue(value: number) {
  return Math.round(value * 1000) / 1000
}

function getFirstAvailableRobotAction(
  actions: Record<string, AnimationAction | null>,
  preferredNames: readonly string[],
) {
  for (const clipName of preferredNames) {
    if (EXCLUDED_LANDRUSH_ROBOT_CLIP_NAMES.has(clipName)) continue
    const action = actions[clipName]
    if (action) return action
  }
  return null
}

function selectRobotLocomotionClips(animations: readonly AnimationClip[]) {
  const selectedClips = new Map<string, AnimationClip>()
  const fallbackClip =
    animations.find((clip) => !EXCLUDED_LANDRUSH_ROBOT_CLIP_NAMES.has(clip.name)) ??
    animations[0] ??
    null
  const idleClip =
    getFirstAvailableRobotClip(animations, LANDRUSH_ROBOT_IDLE_CLIP_NAMES) ?? fallbackClip
  const walkClip =
    getFirstAvailableRobotClip(animations, LANDRUSH_ROBOT_WALK_CLIP_NAMES) ?? idleClip
  const runClip =
    getFirstAvailableRobotClip(animations, LANDRUSH_ROBOT_RUN_CLIP_NAMES) ?? walkClip ?? idleClip

  for (const clip of [idleClip, walkClip, runClip]) {
    if (clip) selectedClips.set(clip.name, clip)
  }

  return [...selectedClips.values()]
}

function getFirstAvailableRobotClip(
  animations: readonly AnimationClip[],
  preferredNames: readonly string[],
) {
  for (const clipName of preferredNames) {
    if (EXCLUDED_LANDRUSH_ROBOT_CLIP_NAMES.has(clipName)) continue
    const clip = animations.find((animation) => animation.name === clipName)
    if (clip) return clip
  }
  return null
}

function getUniqueRobotActions(actions: readonly (AnimationAction | null)[]) {
  return actions.reduce<AnimationAction[]>((uniqueActions, action) => {
    if (action && !uniqueActions.includes(action)) {
      uniqueActions.push(action)
    }
    return uniqueActions
  }, [])
}

function accumulateRobotActionTarget(
  targets: Map<
    AnimationAction,
    { timeScaleSum: number; weight: number; weightedTimeScale: number }
  >,
  action: AnimationAction | null,
  weight: number,
  timeScale: number,
) {
  if (!action) return

  const nextWeight = MathUtils.clamp(weight, 0, 1)
  const currentTarget = targets.get(action)
  if (!currentTarget) {
    targets.set(action, {
      timeScaleSum: nextWeight > Number.EPSILON ? timeScale * nextWeight : 0,
      weight: nextWeight,
      weightedTimeScale: nextWeight,
    })
    return
  }

  currentTarget.weight += nextWeight
  currentTarget.timeScaleSum += nextWeight > Number.EPSILON ? timeScale * nextWeight : 0
  currentTarget.weightedTimeScale += nextWeight
}

function setRobotActionInactive(action: AnimationAction) {
  action.enabled = true
  action.paused = false
  if (!action.isRunning()) {
    action.play()
  }
  action.setEffectiveWeight(0)
}

function setRobotActionActive(action: AnimationAction, weight: number, timeScale: number) {
  action.enabled = true
  action.paused = false
  if (!action.isRunning()) {
    action.play()
  }
  action.setEffectiveWeight(weight)
  action.setEffectiveTimeScale(timeScale)
}

function createRobotAnimationState(
  clipCount: number,
  idleAction: AnimationAction | null,
  walkAction: AnimationAction | null,
  runAction: AnimationAction | null,
  blendState: RobotAnimationBlendState,
  idleTimeScale: number,
  mixerTimeScale: number,
): LandrushRobotAnimationState {
  return {
    clipCount,
    idleClip: idleAction?.getClip().name ?? null,
    idleClipDuration: roundRobotAnimationValue(idleAction?.getClip().duration ?? 0),
    idleClipTime: roundRobotAnimationValue(idleAction?.time ?? 0),
    idleTimeScale: roundRobotAnimationValue(idleTimeScale * mixerTimeScale),
    idleWeight: roundRobotAnimationValue(blendState.idleWeight),
    mixerTimeScale: roundRobotAnimationValue(mixerTimeScale),
    runClip: runAction?.getClip().name ?? null,
    runClipDuration: roundRobotAnimationValue(runAction?.getClip().duration ?? 0),
    runClipTime: roundRobotAnimationValue(runAction?.time ?? 0),
    runTimeScale: roundRobotAnimationValue(blendState.runTimeScale * mixerTimeScale),
    runWeight: roundRobotAnimationValue(blendState.runWeight),
    walkClip: walkAction?.getClip().name ?? null,
    walkClipDuration: roundRobotAnimationValue(walkAction?.getClip().duration ?? 0),
    walkClipTime: roundRobotAnimationValue(walkAction?.time ?? 0),
    walkTimeScale: roundRobotAnimationValue(blendState.walkTimeScale * mixerTimeScale),
    walkWeight: roundRobotAnimationValue(blendState.walkWeight),
  }
}

function roundRobotAnimationValue(value: number) {
  return Math.round(value * 1000) / 1000
}

function resolveRobotWalkTimeScale(_speed: number) {
  return LANDRUSH_ROBOT_WALK_TIME_SCALE
}

function resolveRobotRunBlendTarget(speed: number) {
  const progress = MathUtils.clamp(
    (speed - LANDRUSH_ROBOT_RUN_BLEND_START_SPEED) /
      (LANDRUSH_ROBOT_RUN_BLEND_FULL_SPEED - LANDRUSH_ROBOT_RUN_BLEND_START_SPEED),
    0,
    1,
  )
  return progress * progress * (3 - 2 * progress)
}

function resolveRobotRunTimeScale(speed: number) {
  return MathUtils.clamp(
    speed / 7.7,
    LANDRUSH_ROBOT_RUN_TIME_SCALE_RANGE[0],
    LANDRUSH_ROBOT_RUN_TIME_SCALE_RANGE[1],
  )
}

function computeRobotSceneBounds(
  root: Group,
  measure: LandrushRobotProfileMeasure,
  profileScope: string,
) {
  const bounds = new Box3()
  const meshBounds = new Box3()

  measure(`${profileScope}.update-world-matrices`, () => {
    root.updateWorldMatrix(true, true)
  })

  const meshObjects = measure(`${profileScope}.collect-meshes`, () => {
    const objects: Object3D[] = []
    root.traverse((child) => {
      if (getRobotObjectGeometry(child)) objects.push(child)
    })
    return objects
  })

  for (const object of meshObjects) {
    measure(`${profileScope}.expand-mesh-bounds`, () => {
      const geometry = getRobotObjectGeometry(object)
      if (!geometry) return
      if (!geometry.boundingBox) {
        measure(`${profileScope}.compute-geometry-bounding-box`, () => {
          geometry.computeBoundingBox()
        })
      }
      if (!geometry.boundingBox) return
      meshBounds.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld)
      bounds.union(meshBounds)
    })
  }

  if (!bounds.isEmpty()) return bounds

  return measure(`${profileScope}.fallback-set-from-object`, () => new Box3().setFromObject(root))
}

function getRobotObjectGeometry(object: Object3D) {
  return (object as Object3D & { geometry?: BufferGeometry }).geometry
}

function measureUnprofiled<T>(_id: string, callback: () => T) {
  return callback()
}

useGLTF.preload(LANDRUSH_ROBOT_ASSET_PATH)

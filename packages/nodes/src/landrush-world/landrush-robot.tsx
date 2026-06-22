'use client'

import type { LandrushWorldNode } from '@pascal-app/core'
import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { type AnimationAction, Box3, type Group, LoopRepeat, MathUtils, Vector3 } from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

const LANDRUSH_ROBOT_ASSET_PATH = '/navigation/proto_pascal_robot.glb'
const LANDRUSH_ROBOT_GLB_VISUAL_SCALE = 1 / 110.16949152542374
const LANDRUSH_ROBOT_TARGET_HEIGHT = 1.82
const LANDRUSH_ROBOT_IDLE_TIME_SCALE = 0.5
const LANDRUSH_ROBOT_CLIP_BLEND_RESPONSE = 8
const LANDRUSH_ROBOT_CLIP_TIME_SCALE_RESPONSE = 10
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

export function LandrushRobot({ node }: { node: LandrushWorldNode }) {
  const groupRef = useRef<Group>(null!)
  const { animations, scene } = useGLTF(LANDRUSH_ROBOT_ASSET_PATH)
  const clonedScene = useMemo(() => cloneSkeleton(scene) as Group, [scene])
  const robotTransform = useMemo(() => {
    const bounds = new Box3().setFromObject(clonedScene)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const scale = Number.isFinite(size.y) && size.y > 0 ? LANDRUSH_ROBOT_TARGET_HEIGHT / size.y : 1
    return {
      offset: [-center.x, -bounds.min.y, -center.z] as const,
      scale,
    }
  }, [clonedScene])
  const { actions } = useAnimations(animations, groupRef)
  const speed = node.playerSpeed ?? 0
  const allAnimationActions = useMemo(
    () => Object.values(actions).filter((action): action is AnimationAction => Boolean(action)),
    [actions],
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

  useEffect(() => {
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

    blendStateRef.current = {
      idleWeight: idleAction ? 1 : 0,
      runTimeScale: 1,
      runWeight: 0,
      walkTimeScale: 1,
      walkWeight: 0,
    }
  }, [actions, idleAction, locomotionActions])

  useFrame((_, delta) => {
    const frameDelta = Math.min(delta, 0.05)
    const blendState = blendStateRef.current
    const moveBlendTarget = node.playerMoving ? MathUtils.clamp(speed / 2.4, 0, 1) : 0
    const runBlendTarget = moveBlendTarget * MathUtils.clamp((speed - 5.5) / 2.1, 0, 1)
    const walkBlendTarget = Math.max(0, moveBlendTarget - runBlendTarget)
    const idleBlendTarget = Math.max(0, 1 - moveBlendTarget)

    blendState.idleWeight = MathUtils.damp(
      blendState.idleWeight,
      idleBlendTarget,
      LANDRUSH_ROBOT_CLIP_BLEND_RESPONSE,
      frameDelta,
    )
    blendState.walkWeight = MathUtils.damp(
      blendState.walkWeight,
      walkBlendTarget,
      LANDRUSH_ROBOT_CLIP_BLEND_RESPONSE,
      frameDelta,
    )
    blendState.runWeight = MathUtils.damp(
      blendState.runWeight,
      runBlendTarget,
      LANDRUSH_ROBOT_CLIP_BLEND_RESPONSE,
      frameDelta,
    )
    blendState.walkTimeScale = MathUtils.damp(
      blendState.walkTimeScale,
      MathUtils.clamp(speed / 4.4, 0.55, 1.35),
      LANDRUSH_ROBOT_CLIP_TIME_SCALE_RESPONSE,
      frameDelta,
    )
    blendState.runTimeScale = MathUtils.damp(
      blendState.runTimeScale,
      MathUtils.clamp(speed / 7.7, 0.75, 1.45),
      LANDRUSH_ROBOT_CLIP_TIME_SCALE_RESPONSE,
      frameDelta,
    )

    if (
      walkAction &&
      runAction &&
      walkAction !== runAction &&
      (blendState.walkWeight > 0.001 || blendState.runWeight > 0.001)
    ) {
      const sourceAction = blendState.runWeight > blendState.walkWeight ? runAction : walkAction
      syncRobotActionPhase(sourceAction, sourceAction === runAction ? walkAction : runAction)
    }

    const actionTargets = new Map<
      AnimationAction,
      { timeScaleSum: number; weight: number; weightedTimeScale: number }
    >()
    accumulateRobotActionTarget(
      actionTargets,
      idleAction,
      blendState.idleWeight,
      LANDRUSH_ROBOT_IDLE_TIME_SCALE,
    )
    accumulateRobotActionTarget(
      actionTargets,
      walkAction,
      blendState.walkWeight,
      blendState.walkTimeScale,
    )
    accumulateRobotActionTarget(
      actionTargets,
      runAction,
      blendState.runWeight,
      blendState.runTimeScale,
    )

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

  useEffect(() => {
    clonedScene.traverse((child) => {
      const mesh = child as {
        castShadow?: boolean
        frustumCulled?: boolean
        isMesh?: boolean
        material?: unknown
        receiveShadow?: boolean
        visible?: boolean
      }
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.frustumCulled = false
      mesh.receiveShadow = true
      mesh.visible = true
    })
  }, [clonedScene])

  return (
    <group
      position={[node.playerPosition[0], node.playerPosition[1], node.playerPosition[2]]}
      ref={groupRef}
      rotation={[0, node.playerHeading ?? 0, 0]}
    >
      <group scale={robotTransform.scale * LANDRUSH_ROBOT_GLB_VISUAL_SCALE}>
        <primitive object={clonedScene} position={robotTransform.offset} />
      </group>
    </group>
  )
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
  action.setEffectiveWeight(0)
  action.enabled = false
  action.paused = true
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

function syncRobotActionPhase(sourceAction: AnimationAction, targetAction: AnimationAction) {
  const sourceDuration = sourceAction.getClip().duration
  const targetDuration = targetAction.getClip().duration
  if (!(sourceDuration > 0 && targetDuration > 0)) return

  const phase = (sourceAction.time % sourceDuration) / sourceDuration
  targetAction.time = phase * targetDuration
}

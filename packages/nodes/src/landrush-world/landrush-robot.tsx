'use client'

import type { LandrushWorldNode } from '@pascal-app/core'
import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  type AnimationAction,
  type AnimationClip,
  Box3,
  type BufferGeometry,
  type Group,
  LoopRepeat,
  MathUtils,
  type Object3D,
  Vector3,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

const LANDRUSH_ROBOT_ASSET_PATH = '/navigation/proto_pascal_robot.glb'
const LANDRUSH_ROBOT_GLB_VISUAL_SCALE = 1 / 110.16949152542374
const LANDRUSH_ROBOT_TARGET_HEIGHT = 1.82
const LANDRUSH_ROBOT_IDLE_TIME_SCALE = 0.5
const LANDRUSH_ROBOT_WALK_TIME_SCALE = 0.88
const LANDRUSH_ROBOT_RUN_TIME_SCALE_RANGE = [0.75, 1.45] as const
const LANDRUSH_ROBOT_ANIMATION_PACE_RANGE = [0.2, 1.6] as const
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

export type LandrushRobotAnimationState = {
  clipCount: number
  idleClipTime: number
  idleClip: string | null
  idleTimeScale: number
  idleWeight: number
  mixerTimeScale: number
  runClip: string | null
  runClipTime: number
  runTimeScale: number
  runWeight: number
  walkClip: string | null
  walkClipTime: number
  walkTimeScale: number
  walkWeight: number
}

type LandrushRobotProfileMeasure = <T>(id: string, callback: () => T) => T

export function LandrushRobot({
  animationPace = 1,
  node,
  onAnimationState,
  profileMeasure,
}: {
  animationPace?: number
  node: LandrushWorldNode
  onAnimationState?: (state: LandrushRobotAnimationState) => void
  profileMeasure?: LandrushRobotProfileMeasure
}) {
  const measure = profileMeasure ?? measureUnprofiled
  const animationPaceValue = MathUtils.clamp(
    animationPace,
    LANDRUSH_ROBOT_ANIMATION_PACE_RANGE[0],
    LANDRUSH_ROBOT_ANIMATION_PACE_RANGE[1],
  )
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
      const scale = measure('setup.robot-glb.compute-transform.resolve-scale', () =>
        Number.isFinite(size.y) && size.y > 0 ? LANDRUSH_ROBOT_TARGET_HEIGHT / size.y : 1,
      )
      return measure('setup.robot-glb.compute-transform.build-offset', () => ({
        offset: [-center.x, -bounds.min.y, -center.z] as const,
        scale,
      }))
    })
  }, [clonedScene, measure])
  const { actions, mixer } = useAnimations(locomotionClips, groupRef)
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
  const reportAnimationFrameRef = useRef(0)

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

  useFrame((_, delta) => {
    measure('frame.robot-glb.total', () => {
      const frameDelta = Math.min(delta, 0.05)
      const speed = node.playerSpeed ?? 0
      const blendState = blendStateRef.current
      const blendTargets = measure('frame.robot-glb.compute-blend-targets', () => {
        const moveBlendTarget = node.playerMoving ? MathUtils.clamp(speed / 2.4, 0, 1) : 0
        const runBlendTarget = moveBlendTarget * MathUtils.clamp((speed - 5.5) / 2.1, 0, 1)
        return {
          idleBlendTarget: Math.max(0, 1 - moveBlendTarget),
          runBlendTarget,
          walkBlendTarget: Math.max(0, moveBlendTarget - runBlendTarget),
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

      measure('frame.robot-glb.sync-action-phase', () => {
        if (
          walkAction &&
          runAction &&
          walkAction !== runAction &&
          (blendState.walkWeight > 0.001 || blendState.runWeight > 0.001)
        ) {
          const sourceAction = blendState.runWeight > blendState.walkWeight ? runAction : walkAction
          syncRobotActionPhase(sourceAction, sourceAction === runAction ? walkAction : runAction)
        }
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
        groupRef.current?.position.set(
          node.playerPosition[0],
          node.playerPosition[1],
          node.playerPosition[2],
        )
        groupRef.current?.rotation.set(0, node.playerHeading ?? 0, 0)
      })

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
  })

  useEffect(() => {
    measure('setup.robot-glb.configure-meshes', () => {
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
    })
  }, [clonedScene, measure])

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
    idleClipTime: roundRobotAnimationValue(idleAction?.time ?? 0),
    idleTimeScale: roundRobotAnimationValue(idleTimeScale * mixerTimeScale),
    idleWeight: roundRobotAnimationValue(blendState.idleWeight),
    mixerTimeScale: roundRobotAnimationValue(mixerTimeScale),
    runClip: runAction?.getClip().name ?? null,
    runClipTime: roundRobotAnimationValue(runAction?.time ?? 0),
    runTimeScale: roundRobotAnimationValue(blendState.runTimeScale * mixerTimeScale),
    runWeight: roundRobotAnimationValue(blendState.runWeight),
    walkClip: walkAction?.getClip().name ?? null,
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

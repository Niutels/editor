'use client'

import { OrthographicCamera, useAnimations, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import {
  type AnimationAction,
  Box3,
  type Group,
  LoopRepeat,
  MathUtils,
  MeshStandardMaterial,
  Vector3,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  ROBOT_ASSET_PATH,
  ROBOT_EXCLUDED_CLIP_NAMES,
  ROBOT_GLB_VISUAL_SCALE,
  ROBOT_IDLE_CLIP_NAMES,
  ROBOT_IDLE_TIME_SCALE,
  ROBOT_RUN_CLIP_NAMES,
  ROBOT_TARGET_HEIGHT,
  ROBOT_WALK_CLIP_NAMES,
  type RobotRuntimeMetrics,
} from './robot-metrics'
import type { RobotMotionMode, RobotViewPreset } from './robot-view-presets'

type RobotSceneProps = {
  joined: boolean
  onRuntimeMetrics: (metrics: RobotRuntimeMetrics) => void
  preset: RobotViewPreset
}

type BlendState = {
  idleWeight: number
  runWeight: number
  walkWeight: number
}

export function RobotScene({ joined, onRuntimeMetrics, preset }: RobotSceneProps) {
  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      shadows={false}
    >
      <color args={['#7db8c1']} attach="background" />
      <OrthographicCamera
        far={200}
        makeDefault
        near={0.1}
        position={preset.camera.position}
        zoom={preset.camera.zoom}
      />
      <CameraTarget target={preset.camera.target} />
      <ambientLight intensity={1.45} />
      <directionalLight intensity={1.75} position={[4, 8, 5]} />
      <mesh position={[0, -0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.2, 48]} />
        <meshStandardMaterial color="#5f954f" roughness={0.9} />
      </mesh>
      {joined ? (
        <Suspense fallback={<RobotStandIn />}>
          <RobotActor mode={preset.motion} onRuntimeMetrics={onRuntimeMetrics} />
        </Suspense>
      ) : (
        <RobotJoinPad onRuntimeMetrics={onRuntimeMetrics} />
      )}
    </Canvas>
  )
}

function CameraTarget({ target }: { target: [number, number, number] }) {
  const { camera } = useThree()
  useEffect(() => {
    camera.lookAt(new Vector3(...target))
    camera.updateProjectionMatrix()
  }, [camera, target])
  return null
}

function RobotJoinPad({
  onRuntimeMetrics,
}: {
  onRuntimeMetrics: (metrics: RobotRuntimeMetrics) => void
}) {
  useEffect(() => {
    onRuntimeMetrics({
      actionClipNames: [],
      assetLoaded: false,
      idleClip: null,
      idleWeight: 0,
      joined: false,
      runClip: null,
      runWeight: 0,
      tPoseRisk: 0,
      walkClip: null,
      walkWeight: 0,
    })
  }, [onRuntimeMetrics])
  return (
    <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.82, 1.28, 36]} />
      <meshBasicMaterial color="#f4c430" />
    </mesh>
  )
}

function RobotStandIn() {
  return (
    <mesh position={[0, 0.92, 0]}>
      <boxGeometry args={[0.6, 1.84, 0.36]} />
      <meshStandardMaterial color="#dce8ea" roughness={0.78} />
    </mesh>
  )
}

function RobotActor({
  mode,
  onRuntimeMetrics,
}: {
  mode: RobotMotionMode
  onRuntimeMetrics: (metrics: RobotRuntimeMetrics) => void
}) {
  const groupRef = useRef<Group>(null!)
  const { animations, scene } = useGLTF(ROBOT_ASSET_PATH)
  const clonedScene = useMemo(() => cloneSkeleton(scene) as Group, [scene])
  const { actions } = useAnimations(animations, groupRef)
  const speed = mode === 'run' ? 7.4 : mode === 'walk' ? 4.2 : 0
  const idleAction = getFirstAvailableAction(actions, ROBOT_IDLE_CLIP_NAMES)
  const walkAction = getFirstAvailableAction(actions, ROBOT_WALK_CLIP_NAMES)
  const runAction = getFirstAvailableAction(actions, ROBOT_RUN_CLIP_NAMES) ?? walkAction
  const locomotionActions = useMemo(
    () => uniqueActions([idleAction, walkAction, runAction]),
    [idleAction, runAction, walkAction],
  )
  const blendRef = useRef<BlendState>({ idleWeight: 1, runWeight: 0, walkWeight: 0 })
  const reportFrameRef = useRef(0)
  const robotTransform = useMemo(() => {
    const bounds = new Box3().setFromObject(clonedScene)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const scale = Number.isFinite(size.y) && size.y > 0 ? ROBOT_TARGET_HEIGHT / size.y : 1
    return { offset: [-center.x, -bounds.min.y, -center.z] as const, scale }
  }, [clonedScene])

  useEffect(() => {
    for (const [clipName, action] of Object.entries(actions)) {
      if (!action) continue
      if (ROBOT_EXCLUDED_CLIP_NAMES.has(clipName) || !locomotionActions.includes(action)) {
        action.stop()
        action.enabled = false
        continue
      }
      action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
      action.reset()
      action.enabled = true
      action.paused = false
      action.setEffectiveWeight(action === idleAction ? 1 : 0)
      action.setEffectiveTimeScale(action === idleAction ? ROBOT_IDLE_TIME_SCALE : 1)
      action.play()
    }
  }, [actions, idleAction, locomotionActions])

  useEffect(() => {
    clonedScene.traverse((child) => {
      const mesh = child as { isMesh?: boolean; material?: unknown; frustumCulled?: boolean }
      if (!mesh.isMesh) return
      mesh.frustumCulled = false
      if (mesh.material instanceof MeshStandardMaterial) mesh.material.roughness = 0.82
    })
  }, [clonedScene])

  useFrame((_, delta) => {
    const frameDelta = Math.min(delta, 0.05)
    const moving = mode !== 'idle'
    const runTarget = mode === 'run' ? 1 : 0
    const walkTarget = mode === 'walk' ? 1 : 0
    const idleTarget = moving ? 0 : 1
    const blend = blendRef.current
    blend.idleWeight = MathUtils.damp(blend.idleWeight, idleTarget, 9, frameDelta)
    blend.walkWeight = MathUtils.damp(blend.walkWeight, walkTarget, 9, frameDelta)
    blend.runWeight = MathUtils.damp(blend.runWeight, runTarget, 9, frameDelta)
    setActionWeight(idleAction, blend.idleWeight, ROBOT_IDLE_TIME_SCALE)
    setActionWeight(walkAction, blend.walkWeight, MathUtils.clamp(speed / 4.2, 0.75, 1.35))
    setActionWeight(runAction, blend.runWeight, MathUtils.clamp(speed / 7.4, 0.85, 1.45))
    if (groupRef.current) groupRef.current.rotation.y = mode === 'idle' ? 0.08 : -0.42
    reportFrameRef.current += 1
    if (reportFrameRef.current % 8 === 0) {
      onRuntimeMetrics({
        actionClipNames: animations.map((clip) => clip.name),
        assetLoaded: true,
        idleClip: idleAction?.getClip().name ?? null,
        idleWeight: round(blend.idleWeight),
        joined: true,
        runClip: runAction?.getClip().name ?? null,
        runWeight: round(blend.runWeight),
        tPoseRisk: idleAction && walkAction && runAction ? 0 : 1,
        walkClip: walkAction?.getClip().name ?? null,
        walkWeight: round(blend.walkWeight),
      })
    }
  })

  return (
    <group ref={groupRef}>
      <group scale={robotTransform.scale * ROBOT_GLB_VISUAL_SCALE}>
        <primitive object={clonedScene} position={robotTransform.offset} />
      </group>
    </group>
  )
}

function getFirstAvailableAction(
  actions: Record<string, AnimationAction | null>,
  preferredNames: readonly string[],
) {
  for (const clipName of preferredNames) {
    if (ROBOT_EXCLUDED_CLIP_NAMES.has(clipName)) continue
    const action = actions[clipName]
    if (action) return action
  }
  return null
}

function uniqueActions(actions: readonly (AnimationAction | null)[]) {
  return actions.filter(
    (action, index): action is AnimationAction =>
      Boolean(action) && actions.indexOf(action) === index,
  )
}

function setActionWeight(action: AnimationAction | null, weight: number, timeScale: number) {
  if (!action) return
  action.enabled = weight > 0.001
  action.paused = weight <= 0.001
  action.setEffectiveWeight(MathUtils.clamp(weight, 0, 1))
  action.setEffectiveTimeScale(timeScale)
  if (weight > 0.001 && !action.isRunning()) action.play()
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

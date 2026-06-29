'use client'

import type { LandrushWorldNode } from '@pascal-app/core'
import { useAnimations, useGLTF } from '@react-three/drei'
import { createPortal, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  type AnimationAction,
  type AnimationClip,
  Box3,
  type BufferGeometry,
  Color,
  Euler,
  type Group,
  LoopRepeat,
  MathUtils,
  type Material,
  Mesh,
  type Object3D,
  Quaternion,
  SkinnedMesh,
  Vector3,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { BackSide, MeshBasicNodeMaterial } from 'three/webgpu'

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
export const LANDRUSH_ROBOT_HOVER_OFFSET = 1.524
export const LANDRUSH_ROBOT_HOVER_BOB_AMPLITUDE = 0.14
export const LANDRUSH_ROBOT_HOVER_BOB_SPEED = 1.15
export const LANDRUSH_ROBOT_HOVER_RESPONSE = 6
const LANDRUSH_ROBOT_HOVER_FILL_COLOR = new Color('#f7fbff')
const LANDRUSH_ROBOT_HOVER_OUTLINE_GLOW_COLOR = '#79d7ff'
const LANDRUSH_ROBOT_HOVER_OUTLINE_INK_COLOR = '#14283a'
const LANDRUSH_ROBOT_HOVER_OUTLINE_GLOW_SCALE = 1.055
const LANDRUSH_ROBOT_HOVER_OUTLINE_INK_SCALE = 1.032
const LANDRUSH_ROBOT_HOVER_OUTLINE_RENDER_ORDER = 44
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

export type LandrushRobotPresentationMode = 'default' | 'hover'

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
type LandrushRobotOutlineMesh = Object3D & {
  bindMatrix?: SkinnedMesh['bindMatrix']
  bindMatrixInverse?: SkinnedMesh['bindMatrixInverse']
  bindMode?: SkinnedMesh['bindMode']
  geometry: BufferGeometry
  isMesh: true
  isSkinnedMesh?: boolean
  morphTargetDictionary?: Mesh['morphTargetDictionary']
  morphTargetInfluences?: Mesh['morphTargetInfluences']
  skeleton?: SkinnedMesh['skeleton']
}
type LandrushRobotProps = {
  animationPace?: number
  framePriority?: number
  node: LandrushWorldNode
  onAnimationState?: (state: LandrushRobotAnimationState) => void
  onHoverPoseSample?: (sample: LandrushRobotHoverPoseSample) => void
  presentationMode?: LandrushRobotPresentationMode
  profileMeasure?: LandrushRobotProfileMeasure
  visualRootRef?: { current: Group | null }
}

export function LandrushRobot({
  animationPace = 1,
  framePriority = 0,
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
  const hoverOutlineTargets = useMemo(
    () =>
      measure('setup.robot-glb.collect-hover-outline-targets', () =>
        collectLandrushRobotOutlineTargets(clonedScene),
      ),
    [clonedScene, measure],
  )
  const hoverRestPose = useMemo(
    () =>
      measure('setup.robot-glb.capture-hover-rest-pose', () =>
        captureLandrushRobotRestPose(clonedScene),
      ),
    [clonedScene, measure],
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
  const hoverAmountRef = useRef(0)
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

  useFrame(({ clock }, delta) => {
    measure('frame.robot-glb.total', () => {
      const frameDelta = Math.min(delta, 0.05)
      const speed = node.playerSpeed ?? 0
      const blendState = blendStateRef.current
      const hoverAmount = measure('frame.robot-glb.damp-hover-presentation', () => {
        hoverAmountRef.current = MathUtils.damp(
          hoverAmountRef.current,
          presentationMode === 'hover' ? 1 : 0,
          LANDRUSH_ROBOT_HOVER_RESPONSE,
          frameDelta,
        )
        return hoverAmountRef.current
      })
      const blendTargets = measure('frame.robot-glb.compute-blend-targets', () => {
        const moveBlendTarget = node.playerMoving ? MathUtils.clamp(speed / 2.4, 0, 1) : 0
        const runBlendTarget = moveBlendTarget * resolveRobotRunBlendTarget(speed)
        const locomotionAmount = 1 - hoverAmount
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
        groupRef.current?.position.set(
          node.playerPosition[0],
          node.playerPosition[1] + hoverOffset,
          node.playerPosition[2],
        )
        groupRef.current?.rotation.set(0, node.playerHeading ?? 0, 0)
      })

      measure('frame.robot-glb.apply-hover-pose', () => {
        applyLandrushRobotHoverPose(clonedScene, hoverAmount, hoverRestPose)
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

  useEffect(() => {
    measure('setup.robot-glb.configure-hover-fill', () => {
      applyLandrushRobotHoverFill(clonedScene, presentationMode === 'hover')
    })
  }, [clonedScene, measure, presentationMode])

  return (
    <group
      position={[node.playerPosition[0], node.playerPosition[1], node.playerPosition[2]]}
      ref={groupRef}
      rotation={[0, node.playerHeading ?? 0, 0]}
    >
      <group scale={robotTransform.scale * LANDRUSH_ROBOT_GLB_VISUAL_SCALE}>
        <primitive object={clonedScene} position={robotTransform.offset} />
        {presentationMode === 'hover' ? (
          <LandrushRobotHoverMeshOutlines targets={hoverOutlineTargets} />
        ) : null}
      </group>
    </group>
  )
}

function LandrushRobotHoverMeshOutlines({
  targets,
}: {
  targets: readonly LandrushRobotOutlineMesh[]
}) {
  return (
    <>
      {targets.map((target) => (
        <LandrushRobotHoverMeshOutlinePortal key={target.uuid} target={target} />
      ))}
    </>
  )
}

function LandrushRobotHoverMeshOutlinePortal({ target }: { target: LandrushRobotOutlineMesh }) {
  const parent = target.parent
  if (!parent) return null

  return createPortal(
    <>
      <LandrushRobotHoverMeshOutlineShell
        color={LANDRUSH_ROBOT_HOVER_OUTLINE_GLOW_COLOR}
        opacity={0.4}
        renderOrder={LANDRUSH_ROBOT_HOVER_OUTLINE_RENDER_ORDER}
        scale={LANDRUSH_ROBOT_HOVER_OUTLINE_GLOW_SCALE}
        target={target}
      />
      <LandrushRobotHoverMeshOutlineShell
        color={LANDRUSH_ROBOT_HOVER_OUTLINE_INK_COLOR}
        opacity={0.92}
        renderOrder={LANDRUSH_ROBOT_HOVER_OUTLINE_RENDER_ORDER + 1}
        scale={LANDRUSH_ROBOT_HOVER_OUTLINE_INK_SCALE}
        target={target}
      />
    </>,
    parent,
  )
}

function LandrushRobotHoverMeshOutlineShell({
  color,
  opacity,
  renderOrder,
  scale,
  target,
}: {
  color: string
  opacity: number
  renderOrder: number
  scale: number
  target: LandrushRobotOutlineMesh
}) {
  const material = useMemo(
    () =>
      new MeshBasicNodeMaterial({
        color,
        depthTest: true,
        depthWrite: false,
        opacity,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        side: BackSide,
        toneMapped: false,
        transparent: true,
      }),
    [color, opacity],
  )
  const outline = useMemo(() => {
    const nextOutline = createLandrushRobotHoverOutlineShell(target, material)
    nextOutline.castShadow = false
    nextOutline.frustumCulled = false
    nextOutline.receiveShadow = false
    nextOutline.userData.landrushRobotHoverOutline = true
    syncLandrushRobotHoverOutlineShell(nextOutline, target, scale, renderOrder)
    return nextOutline
  }, [material, renderOrder, scale, target])

  useEffect(
    () => () => {
      outline.removeFromParent()
      material.dispose()
    },
    [material, outline],
  )

  useFrame(() => {
    syncLandrushRobotHoverOutlineShell(outline, target, scale, renderOrder)
  })

  return <primitive object={outline} />
}

function createLandrushRobotHoverOutlineShell(
  target: LandrushRobotOutlineMesh,
  material: MeshBasicNodeMaterial,
) {
  if (target.isSkinnedMesh === true && target.skeleton) {
    const outline = new SkinnedMesh(target.geometry, material)
    outline.bind(target.skeleton, target.bindMatrix)
    if (target.bindMode) outline.bindMode = target.bindMode
    if (target.bindMatrixInverse) outline.bindMatrixInverse.copy(target.bindMatrixInverse)
    return outline
  }
  return new Mesh(target.geometry, material)
}

function syncLandrushRobotHoverOutlineShell(
  outline: Mesh | SkinnedMesh,
  target: LandrushRobotOutlineMesh,
  scale: number,
  renderOrder: number,
) {
  outline.layers.mask = target.layers.mask
  outline.position.copy(target.position)
  outline.quaternion.copy(target.quaternion)
  outline.renderOrder = renderOrder
  outline.scale.copy(target.scale).multiplyScalar(scale)
  outline.visible = target.visible !== false && target.parent !== null
  syncLandrushRobotHoverOutlineMorphTargets(outline, target)
}

function syncLandrushRobotHoverOutlineMorphTargets(
  outline: Mesh | SkinnedMesh,
  target: LandrushRobotOutlineMesh,
) {
  outline.morphTargetDictionary = target.morphTargetDictionary
  outline.morphTargetInfluences = target.morphTargetInfluences
}

export function resolveLandrushRobotHoverOffset(hoverAmount: number, elapsedTime: number) {
  if (hoverAmount <= 0.0001) return 0
  return (
    hoverAmount *
    (LANDRUSH_ROBOT_HOVER_OFFSET +
      Math.sin(elapsedTime * LANDRUSH_ROBOT_HOVER_BOB_SPEED) * LANDRUSH_ROBOT_HOVER_BOB_AMPLITUDE)
  )
}

function applyLandrushRobotHoverFill(root: Group, active: boolean) {
  root.traverse((child) => {
    const mesh = child as { isMesh?: boolean; material?: unknown }
    if (!mesh.isMesh) return
    if (isLandrushRobotHoverOutlineObject(child)) return

    for (const material of getRobotMaterials(mesh.material)) {
      const colorMaterial = material as Material & {
        color?: Color
        userData: Material['userData'] & { landrushOriginalColor?: Color }
      }
      if (!colorMaterial.color) continue

      colorMaterial.userData.landrushOriginalColor ??= colorMaterial.color.clone()
      colorMaterial.color.copy(
        active ? LANDRUSH_ROBOT_HOVER_FILL_COLOR : colorMaterial.userData.landrushOriginalColor,
      )
      colorMaterial.needsUpdate = true
    }
  })
}

function collectLandrushRobotOutlineTargets(root: Group) {
  const targets: LandrushRobotOutlineMesh[] = []
  root.traverse((child) => {
    if (isLandrushRobotOutlineMesh(child) && child.visible !== false) {
      targets.push(child)
    }
  })
  return targets
}

function isLandrushRobotOutlineMesh(object: Object3D): object is LandrushRobotOutlineMesh {
  const mesh = object as Object3D & { geometry?: BufferGeometry; isMesh?: boolean }
  return mesh.isMesh === true && Boolean(mesh.geometry?.getAttribute('position'))
}

function isLandrushRobotHoverOutlineObject(object: Object3D) {
  let current: Object3D | null = object
  while (current) {
    if (current.userData?.landrushRobotHoverOutline === true) return true
    current = current.parent
  }
  return false
}

type LandrushRobotRestPose = Map<string, Euler>

function captureLandrushRobotRestPose(root: Group): LandrushRobotRestPose {
  const restPose: LandrushRobotRestPose = new Map()
  root.traverse((child) => {
    if ((child as Object3D & { isBone?: boolean }).isBone !== true) return
    restPose.set(child.name, child.rotation.clone())
  })
  return restPose
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
    return { x: restRotation.x - 0.36, y: restRotation.y, z: restRotation.z }
  }
  if (name.includes('foot')) {
    return { x: restRotation.x - 0.46, y: restRotation.y, z: restRotation.z }
  }
  if (
    name === 'hips' ||
    name.includes('spine') ||
    name.includes('neck') ||
    name.includes('head') ||
    name.includes('arm') ||
    name.includes('hand')
  ) {
    return restRotation
  }
  return null
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

function getRobotMaterials(material: unknown): Material[] {
  if (Array.isArray(material)) return material.filter(isRobotMaterial)
  return isRobotMaterial(material) ? [material] : []
}

function isRobotMaterial(material: unknown): material is Material {
  return Boolean(material && typeof material === 'object' && 'needsUpdate' in material)
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

'use client'

import { useFrame } from '@react-three/fiber'
import { memo, type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  CylinderGeometry,
  DataTexture,
  DynamicDrawUsage,
  FrontSide,
  type Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  NormalBlending,
  type Object3D,
  OctahedronGeometry,
  Quaternion,
  RGBAFormat,
  type SpotLight,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_ALPHA_TEXTURE_RESOLUTION,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_MERGE_DISTANCE,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_RADIAL_SEGMENT_COUNT,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_SURFACE_TRIANGLE_COUNT,
  LANDRUSH_ROBOT_SHOULDER_TORCH_CONE_ANGLE,
  LANDRUSH_ROBOT_SHOULDER_TORCH_DISTANCE,
  LANDRUSH_ROBOT_SHOULDER_TORCH_PENUMBRA,
  LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN,
  LANDRUSH_ROBOT_SHOULDER_TORCH_TEXTURE_RESOLUTION,
  type LandrushRobotShoulderTorchContribution,
  type LandrushRobotShoulderTorchDesign,
  type LandrushRobotShoulderTorchLightingState,
  resolveLandrushRobotShoulderTorchContribution,
  resolveLandrushRobotShoulderTorchGeometryBudget,
  updateLandrushRobotShoulderTorchGroundTarget,
  updateLandrushRobotShoulderTorchLightingState,
  updateLandrushRobotShoulderTorchMergeTarget,
} from './landrush-robot-shoulder-torch'
import type { LandrushRobotWeaponCombatState } from './landrush-robot-weapon-rig'
import {
  ZOMBIE_ESCAPE_SHOULDER_TORCH_RENDER_REPRESENTATIVE_KEY,
  type ZombieEscapeRenderReadinessRegistry,
} from './zombie-escape-render-readiness'
import { useZombieEscapeRenderRepresentative } from './zombie-escape-render-readiness-react'

const LOCAL_FORWARD = new Vector3(0, 0, 1)
const WORLD_UP = new Vector3(0, 1, 0)
const TORCH_REACH_METERS = 5.4
const TORCH_FIXTURE_SCALE = 0.18
const TORCH_LENS_OFFSET_METERS = 0.0337
const TORCH_BEAM_TARGET_RADIUS =
  Math.tan(LANDRUSH_ROBOT_SHOULDER_TORCH_CONE_ANGLE) * TORCH_REACH_METERS
const TORCH_BEAM_MERGE_RADIUS = 0.11
const TORCH_BEAM_SOURCE_RADIUS_METERS = 0.018
const TORCH_BEAM_TEXTURE_MERGE_V = 0.18
const TORCH_BEAM_SOURCE_CENTER_OFFSET = 0.25
const TORCH_BEAM_SOURCE_SDF_RADIUS = 0.37
const TORCH_BEAM_MERGED_SDF_RADIUS = 0.45
const TORCH_BEAM_RADIAL_CORE = 0.12
const TORCH_BEAM_UV_ZERO_BORDER = 0.051
const TORCH_BEAM_UV_GUARD_END = 0.1

type LandrushRobotShoulderBones = {
  leftShoulder: Object3D
  rightShoulder: Object3D
}

export type LandrushRobotShoulderTorchPoseState = {
  leftShoulder: Vector3
  ready: boolean
  rightShoulder: Vector3
  robotOrigin: Vector3
  visualRoot: Object3D | null
}

export function createLandrushRobotShoulderTorchPoseState(): LandrushRobotShoulderTorchPoseState {
  return {
    leftShoulder: new Vector3(),
    ready: false,
    rightShoulder: new Vector3(),
    robotOrigin: new Vector3(),
    visualRoot: null,
  }
}

export function updateLandrushRobotShoulderTorchPoseState(
  state: LandrushRobotShoulderTorchPoseState,
  visualRoot: Object3D,
  leftShoulderWorld: Matrix4,
  rightShoulderWorld: Matrix4,
  robotWorld: Matrix4,
) {
  state.leftShoulder.setFromMatrixPosition(leftShoulderWorld)
  state.rightShoulder.setFromMatrixPosition(rightShoulderWorld)
  state.robotOrigin.setFromMatrixPosition(robotWorld)
  state.visualRoot = visualRoot
  state.ready = true
  return state
}

type LandrushRobotShoulderTorchScratch = {
  beamDirection: Vector3
  beamGeometryChanged: boolean
  beamOrigin: Vector3
  beamRadial: Vector3
  cameraPosition: Vector3
  center: Vector3
  desiredQuaternion: Quaternion
  leftLensOrigin: Vector3
  leftMount: Vector3
  leftOutward: Vector3
  leftShoulder: Vector3
  localScale: Vector3
  mergeTarget: Vector3
  parentQuaternion: Quaternion
  parentScale: Vector3
  rightMount: Vector3
  rightLensOrigin: Vector3
  rightOutward: Vector3
  rightShoulder: Vector3
  robotOrigin: Vector3
  segmentCenter: Vector3
  target: Vector3
  vertex: Vector3
  viewDirection: Vector3
  worldScale: Vector3
  worldToBeam: Matrix4
}

export const LandrushRobotShoulderTorchRig = memo(function LandrushRobotShoulderTorchRig({
  active = true,
  beamOpacityScale = 1,
  combatStateRef,
  design = LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN,
  emitSpotLights = true,
  framePriority = 2.505,
  lightingStateRef,
  poseStateRef,
  renderReadinessRegistry,
  showBeams = true,
  showFixtures = true,
  visualRootRef,
}: {
  active?: boolean
  beamOpacityScale?: number
  combatStateRef: RefObject<LandrushRobotWeaponCombatState | null>
  design?: LandrushRobotShoulderTorchDesign
  emitSpotLights?: boolean
  framePriority?: number
  lightingStateRef?: RefObject<LandrushRobotShoulderTorchLightingState>
  poseStateRef?: RefObject<LandrushRobotShoulderTorchPoseState | null>
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  showBeams?: boolean
  showFixtures?: boolean
  visualRootRef: RefObject<Group | null>
}) {
  const rootRef = useRef<Group>(null)
  useZombieEscapeRenderRepresentative(
    renderReadinessRegistry,
    ZOMBIE_ESCAPE_SHOULDER_TORCH_RENDER_REPRESENTATIVE_KEY,
    rootRef,
  )
  const leftFixtureRef = useRef<Group>(null)
  const rightFixtureRef = useRef<Group>(null)
  const leftFixtureShellRef = useRef<Mesh>(null)
  const leftFixtureLensRef = useRef<Mesh>(null)
  const rightFixtureShellRef = useRef<Mesh>(null)
  const rightFixtureLensRef = useRef<Mesh>(null)
  const outerBeamRef = useRef<Mesh>(null)
  const lightRef = useRef<SpotLight>(null)
  const targetRef = useRef<Object3D>(null)
  const bonesRef = useRef<LandrushRobotShoulderBones | null>(null)
  const bonesRootRef = useRef<Object3D | null>(null)
  const fixtureTexture = useLandrushRobotShoulderTorchPixelTexture()
  const beamAlphaTexture = useLandrushRobotShoulderTorchBeamAlphaTexture()
  const beamGeometry = useMemo(() => createLandrushRobotShoulderTorchBeamGeometry(), [])
  const resolvedBeamOpacityScale = useMemo(
    () => (Number.isFinite(beamOpacityScale) ? Math.max(0, beamOpacityScale) : 1),
    [beamOpacityScale],
  )
  const contribution = useMemo(
    () =>
      resolveLandrushRobotShoulderTorchContribution({
        active,
        emitSpotLights,
        showBeams,
        showFixtures,
      }),
    [active, emitSpotLights, showBeams, showFixtures],
  )
  const scratch = useMemo<LandrushRobotShoulderTorchScratch>(
    () => ({
      beamDirection: new Vector3(),
      beamGeometryChanged: false,
      beamOrigin: new Vector3(),
      beamRadial: new Vector3(),
      cameraPosition: new Vector3(),
      center: new Vector3(),
      desiredQuaternion: new Quaternion(),
      leftLensOrigin: new Vector3(),
      leftMount: new Vector3(),
      leftOutward: new Vector3(),
      leftShoulder: new Vector3(),
      localScale: new Vector3(),
      mergeTarget: new Vector3(),
      parentQuaternion: new Quaternion(),
      parentScale: new Vector3(),
      rightMount: new Vector3(),
      rightLensOrigin: new Vector3(),
      rightOutward: new Vector3(),
      rightShoulder: new Vector3(),
      robotOrigin: new Vector3(),
      segmentCenter: new Vector3(),
      target: new Vector3(),
      vertex: new Vector3(),
      viewDirection: new Vector3(),
      worldScale: new Vector3(),
      worldToBeam: new Matrix4(),
    }),
    [],
  )

  useEffect(
    () => () => {
      beamGeometry.dispose()
      if (lightingStateRef?.current) lightingStateRef.current.active = false
    },
    [beamGeometry, lightingStateRef],
  )

  useLayoutEffect(() => {
    if (lightRef.current && targetRef.current) {
      lightRef.current.target = targetRef.current
    }
  }, [])

  useFrame(({ camera }) => {
    const root = rootRef.current
    const visualRoot = visualRootRef.current
    const combatState = combatStateRef.current
    const poseState = poseStateRef?.current
    if (!root) return
    if (bonesRootRef.current !== visualRoot) {
      bonesRootRef.current = visualRoot
      bonesRef.current = null
    }
    const bones = visualRoot
      ? (bonesRef.current ?? findLandrushRobotShoulderBones(visualRoot))
      : null
    bonesRef.current = bones
    const preparedPoseReady = poseState?.ready === true && poseState.visualRoot === visualRoot
    if (!(active && visualRoot && combatState) || (!preparedPoseReady && !bones)) {
      if (lightingStateRef?.current) lightingStateRef.current.active = false
      applyLandrushRobotShoulderTorchContribution(
        false,
        contribution,
        resolvedBeamOpacityScale,
        root,
        leftFixtureShellRef.current,
        leftFixtureLensRef.current,
        rightFixtureShellRef.current,
        rightFixtureLensRef.current,
        outerBeamRef.current,
        lightRef.current,
      )
      return
    }

    root.updateWorldMatrix(true, false)
    if (preparedPoseReady && poseState) {
      scratch.leftShoulder.copy(poseState.leftShoulder)
      scratch.rightShoulder.copy(poseState.rightShoulder)
      scratch.robotOrigin.copy(poseState.robotOrigin)
    } else if (bones) {
      visualRoot.updateWorldMatrix(true, true)
      scratch.leftShoulder.setFromMatrixPosition(bones.leftShoulder.matrixWorld)
      scratch.rightShoulder.setFromMatrixPosition(bones.rightShoulder.matrixWorld)
      scratch.robotOrigin.setFromMatrixPosition(visualRoot.matrixWorld)
    }
    scratch.center.copy(scratch.leftShoulder).add(scratch.rightShoulder).multiplyScalar(0.5)
    scratch.leftOutward.copy(scratch.leftShoulder).sub(scratch.center)
    scratch.rightOutward.copy(scratch.rightShoulder).sub(scratch.center)
    if (scratch.leftOutward.lengthSq() <= 0.000_001) scratch.leftOutward.set(-1, 0, 0)
    else scratch.leftOutward.normalize()
    if (scratch.rightOutward.lengthSq() <= 0.000_001) scratch.rightOutward.set(1, 0, 0)
    else scratch.rightOutward.normalize()
    scratch.beamDirection.set(Math.sin(combatState.aimAngle), 0, Math.cos(combatState.aimAngle))
    scratch.leftMount
      .copy(scratch.leftShoulder)
      .addScaledVector(scratch.leftOutward, 0.06)
      .addScaledVector(WORLD_UP, 0.055)
      .addScaledVector(scratch.beamDirection, 0.02)
    scratch.rightMount
      .copy(scratch.rightShoulder)
      .addScaledVector(scratch.rightOutward, 0.06)
      .addScaledVector(WORLD_UP, 0.055)
      .addScaledVector(scratch.beamDirection, 0.02)
    updateLandrushRobotShoulderTorchGroundTarget(
      scratch.target,
      combatState.aimAngle,
      scratch.robotOrigin.y,
      TORCH_REACH_METERS,
      scratch.robotOrigin.x,
      scratch.robotOrigin.z,
    )
    scratch.beamOrigin.copy(scratch.leftMount).add(scratch.rightMount).multiplyScalar(0.5)
    scratch.beamDirection.copy(scratch.target).sub(scratch.beamOrigin)
    const mountToTarget = scratch.beamDirection.length()
    if (mountToTarget <= 0.001) {
      if (lightingStateRef?.current) lightingStateRef.current.active = false
      applyLandrushRobotShoulderTorchContribution(
        false,
        contribution,
        resolvedBeamOpacityScale,
        root,
        leftFixtureShellRef.current,
        leftFixtureLensRef.current,
        rightFixtureShellRef.current,
        rightFixtureLensRef.current,
        outerBeamRef.current,
        lightRef.current,
      )
      return
    }
    scratch.beamDirection.multiplyScalar(1 / mountToTarget)
    updateLandrushRobotShoulderTorchMergeTarget(
      scratch.mergeTarget,
      scratch.beamOrigin,
      scratch.target,
      LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_MERGE_DISTANCE,
    )

    applyLandrushRobotShoulderTorchContribution(
      true,
      contribution,
      resolvedBeamOpacityScale,
      root,
      leftFixtureShellRef.current,
      leftFixtureLensRef.current,
      rightFixtureShellRef.current,
      rightFixtureLensRef.current,
      outerBeamRef.current,
      lightRef.current,
    )

    updateLandrushRobotShoulderTorchFixture(
      scratch.mergeTarget,
      leftFixtureRef.current,
      scratch.leftLensOrigin,
      scratch.leftMount,
      scratch,
    )
    updateLandrushRobotShoulderTorchFixture(
      scratch.mergeTarget,
      rightFixtureRef.current,
      scratch.rightLensOrigin,
      scratch.rightMount,
      scratch,
    )
    camera.getWorldPosition(scratch.cameraPosition)
    updateLandrushRobotShoulderTorchBeam(
      scratch.leftLensOrigin,
      scratch.rightLensOrigin,
      scratch.mergeTarget,
      scratch.target,
      scratch.cameraPosition,
      lightRef.current,
      outerBeamRef.current,
      scratch,
      targetRef.current,
    )
    if (lightingStateRef?.current) {
      updateLandrushRobotShoulderTorchLightingState(
        lightingStateRef.current,
        contribution.lightIntensity > 0,
        scratch.beamOrigin,
        scratch.target,
      )
    }
  }, framePriority)

  const budget = resolveLandrushRobotShoulderTorchGeometryBudget(design)
  return (
    <group
      ref={rootRef}
      userData={{
        design,
        geometryBudget: budget,
        role: 'landrush-robot-shoulder-torches',
      }}
      visible
    >
      <group ref={leftFixtureRef} visible={showFixtures}>
        <LandrushRobotShoulderTorchFixture
          design={design}
          lensRef={leftFixtureLensRef}
          shellRef={leftFixtureShellRef}
          texture={fixtureTexture}
        />
      </group>
      <group ref={rightFixtureRef} visible={showFixtures}>
        <LandrushRobotShoulderTorchFixture
          design={design}
          lensRef={rightFixtureLensRef}
          shellRef={rightFixtureShellRef}
          texture={fixtureTexture}
        />
      </group>
      <mesh frustumCulled={false} geometry={beamGeometry} ref={outerBeamRef} visible={showBeams}>
        <meshBasicMaterial
          alphaMap={beamAlphaTexture}
          blending={NormalBlending}
          color="#ffd58a"
          depthWrite={false}
          opacity={0}
          side={FrontSide}
          toneMapped
          transparent
        />
      </mesh>
      <spotLight
        angle={LANDRUSH_ROBOT_SHOULDER_TORCH_CONE_ANGLE}
        castShadow={false}
        color="#ffd58a"
        decay={1.65}
        distance={LANDRUSH_ROBOT_SHOULDER_TORCH_DISTANCE}
        intensity={0}
        penumbra={LANDRUSH_ROBOT_SHOULDER_TORCH_PENUMBRA}
        ref={lightRef}
        visible={emitSpotLights}
      />
      <object3D ref={targetRef} />
    </group>
  )
})

function applyLandrushRobotShoulderTorchContribution(
  ready: boolean,
  contribution: LandrushRobotShoulderTorchContribution,
  beamOpacityScale: number,
  root: Group,
  leftFixtureShell: Mesh | null,
  leftFixtureLens: Mesh | null,
  rightFixtureShell: Mesh | null,
  rightFixtureLens: Mesh | null,
  outerBeam: Mesh | null,
  light: SpotLight | null,
) {
  root.visible = true
  const fixtureOpacity = ready ? contribution.fixtureOpacity : 0
  const lensEmissiveIntensity = ready ? contribution.lensEmissiveIntensity : 0
  setLandrushRobotShoulderTorchShellOpacity(leftFixtureShell, fixtureOpacity)
  setLandrushRobotShoulderTorchShellOpacity(rightFixtureShell, fixtureOpacity)
  setLandrushRobotShoulderTorchLensContribution(
    leftFixtureLens,
    fixtureOpacity,
    lensEmissiveIntensity,
  )
  setLandrushRobotShoulderTorchLensContribution(
    rightFixtureLens,
    fixtureOpacity,
    lensEmissiveIntensity,
  )
  if (outerBeam) {
    ;(outerBeam.material as MeshBasicMaterial).opacity = ready
      ? contribution.beamOpacity * beamOpacityScale
      : 0
  }
  if (light) {
    light.intensity = ready ? contribution.lightIntensity : 0
  }
}

function setLandrushRobotShoulderTorchShellOpacity(shell: Mesh | null, opacity: number) {
  if (shell) (shell.material as MeshStandardMaterial).opacity = opacity
}

function setLandrushRobotShoulderTorchLensContribution(
  lens: Mesh | null,
  opacity: number,
  emissiveIntensity: number,
) {
  if (!lens) return
  const material = lens.material as MeshStandardMaterial
  material.opacity = opacity
  material.emissiveIntensity = emissiveIntensity
}

export const LandrushRobotShoulderTorchFixture = memo(function LandrushRobotShoulderTorchFixture({
  design,
  lensRef,
  shellRef,
  texture,
}: {
  design: LandrushRobotShoulderTorchDesign
  lensRef?: RefObject<Mesh | null>
  shellRef?: RefObject<Mesh | null>
  texture: Texture
}) {
  const geometry = useMemo(() => createLandrushRobotShoulderTorchFixtureGeometry(design), [design])
  useEffect(
    () => () => {
      geometry.lens.dispose()
      geometry.shell.dispose()
    },
    [geometry],
  )
  return (
    <group userData={{ design, role: 'shoulder-torch-fixture' }}>
      <mesh geometry={geometry.shell} ref={shellRef}>
        <meshStandardMaterial
          depthWrite={false}
          map={texture}
          metalness={0.58}
          opacity={0}
          roughness={0.38}
          transparent
        />
      </mesh>
      <mesh geometry={geometry.lens} ref={lensRef}>
        <meshStandardMaterial
          color="#fff0bd"
          depthWrite={false}
          emissive="#ffd58a"
          emissiveIntensity={0}
          metalness={0.04}
          opacity={0}
          roughness={0.18}
          transparent
        />
      </mesh>
    </group>
  )
})

export function useLandrushRobotShoulderTorchPixelTexture() {
  const texture = useMemo(createLandrushRobotShoulderTorchPixelTexture, [])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

function useLandrushRobotShoulderTorchBeamAlphaTexture() {
  const texture = useMemo(createLandrushRobotShoulderTorchBeamAlphaTexture, [])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

function updateLandrushRobotShoulderTorchFixture(
  aimTarget: Vector3,
  fixture: Object3D | null,
  lensOrigin: Vector3,
  mount: Vector3,
  scratch: LandrushRobotShoulderTorchScratch,
) {
  scratch.beamDirection.copy(aimTarget).sub(mount)
  const mountToTarget = scratch.beamDirection.length()
  if (mountToTarget <= 0.001) return
  scratch.beamDirection.multiplyScalar(1 / mountToTarget)
  scratch.desiredQuaternion.setFromUnitVectors(LOCAL_FORWARD, scratch.beamDirection)
  lensOrigin.copy(mount).addScaledVector(scratch.beamDirection, TORCH_LENS_OFFSET_METERS)
  if (fixture) {
    applyLandrushRobotShoulderTorchWorldTransform(
      fixture,
      mount,
      scratch.desiredQuaternion,
      scratch.worldScale.setScalar(TORCH_FIXTURE_SCALE),
      scratch,
    )
  }
}

function updateLandrushRobotShoulderTorchBeam(
  leftOrigin: Vector3,
  rightOrigin: Vector3,
  mergeTarget: Vector3,
  beamTarget: Vector3,
  cameraPosition: Vector3,
  light: SpotLight | null,
  outerBeam: Mesh<BufferGeometry> | null,
  scratch: LandrushRobotShoulderTorchScratch,
  target: Object3D | null,
) {
  scratch.beamOrigin.copy(leftOrigin).add(rightOrigin).multiplyScalar(0.5)
  scratch.beamDirection.copy(beamTarget).sub(scratch.beamOrigin)
  const originToTarget = scratch.beamDirection.length()
  if (originToTarget <= 0.001) return
  scratch.beamDirection.multiplyScalar(1 / originToTarget)
  if (outerBeam) {
    updateLandrushRobotShoulderTorchBeamGeometry(
      outerBeam,
      leftOrigin,
      rightOrigin,
      mergeTarget,
      beamTarget,
      cameraPosition,
      scratch,
    )
  }
  if (light) setLandrushRobotShoulderTorchWorldPosition(light, scratch.beamOrigin)
  if (target) setLandrushRobotShoulderTorchWorldPosition(target, beamTarget)
}

function updateLandrushRobotShoulderTorchBeamGeometry(
  beam: Mesh<BufferGeometry>,
  leftOrigin: Vector3,
  rightOrigin: Vector3,
  mergeTarget: Vector3,
  beamTarget: Vector3,
  cameraPosition: Vector3,
  scratch: LandrushRobotShoulderTorchScratch,
) {
  beam.position.set(0, 0, 0)
  beam.quaternion.identity()
  beam.scale.set(1, 1, 1)
  beam.updateWorldMatrix(true, false)
  scratch.worldToBeam.copy(beam.matrixWorld).invert()

  const position = beam.geometry.getAttribute('position') as BufferAttribute
  const positionArray = position.array as Float32Array
  scratch.beamGeometryChanged = false
  updateLandrushRobotShoulderTorchBeamRadial(cameraPosition, beamTarget, scratch)
  const sourceHalfSpan = Math.max(
    TORCH_BEAM_SOURCE_RADIUS_METERS * 2,
    Math.abs(scratch.vertex.copy(rightOrigin).sub(leftOrigin).dot(scratch.beamRadial)),
  )
  let positionOffset = writeLandrushRobotShoulderTorchBeamRow(
    positionArray,
    scratch.beamOrigin,
    sourceHalfSpan,
    scratch,
  )
  positionOffset = writeLandrushRobotShoulderTorchBeamRow(
    positionArray,
    mergeTarget,
    TORCH_BEAM_MERGE_RADIUS,
    scratch,
    positionOffset,
  )
  writeLandrushRobotShoulderTorchBeamRow(
    positionArray,
    beamTarget,
    TORCH_BEAM_TARGET_RADIUS,
    scratch,
    positionOffset,
  )
  if (scratch.beamGeometryChanged) position.needsUpdate = true
}

function updateLandrushRobotShoulderTorchBeamRadial(
  cameraPosition: Vector3,
  beamTarget: Vector3,
  scratch: LandrushRobotShoulderTorchScratch,
) {
  scratch.beamDirection.copy(beamTarget).sub(scratch.beamOrigin)
  if (scratch.beamDirection.lengthSq() <= 0.000_001) scratch.beamDirection.copy(LOCAL_FORWARD)
  else scratch.beamDirection.normalize()
  scratch.segmentCenter.copy(scratch.beamOrigin).add(beamTarget).multiplyScalar(0.5)
  scratch.viewDirection.copy(cameraPosition).sub(scratch.segmentCenter)
  scratch.beamRadial.crossVectors(scratch.viewDirection, scratch.beamDirection)
  if (scratch.beamRadial.lengthSq() <= 0.000_001) {
    scratch.beamRadial.crossVectors(WORLD_UP, scratch.beamDirection)
  }
  if (scratch.beamRadial.lengthSq() <= 0.000_001) scratch.beamRadial.set(1, 0, 0)
  else scratch.beamRadial.normalize()
}

function writeLandrushRobotShoulderTorchBeamRow(
  array: Float32Array,
  center: Vector3,
  radius: number,
  scratch: LandrushRobotShoulderTorchScratch,
  initialOffset = 0,
) {
  let offset = initialOffset
  for (
    let segment = 0;
    segment <= LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_RADIAL_SEGMENT_COUNT;
    segment += 1
  ) {
    const radialProgress = segment / LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_RADIAL_SEGMENT_COUNT
    offset = writeLandrushRobotShoulderTorchBeamPosition(
      array,
      offset,
      center,
      radius * (radialProgress * 2 - 1),
      scratch,
    )
  }
  return offset
}

function writeLandrushRobotShoulderTorchBeamPosition(
  array: Float32Array,
  offset: number,
  center: Vector3,
  radialOffset: number,
  scratch: LandrushRobotShoulderTorchScratch,
) {
  scratch.vertex
    .copy(center)
    .addScaledVector(scratch.beamRadial, radialOffset)
    .applyMatrix4(scratch.worldToBeam)
  const nextX = Math.fround(scratch.vertex.x)
  const nextY = Math.fround(scratch.vertex.y)
  const nextZ = Math.fround(scratch.vertex.z)
  if (array[offset] !== nextX || array[offset + 1] !== nextY || array[offset + 2] !== nextZ) {
    array[offset] = nextX
    array[offset + 1] = nextY
    array[offset + 2] = nextZ
    scratch.beamGeometryChanged = true
  }
  return offset + 3
}

function applyLandrushRobotShoulderTorchWorldTransform(
  object: Object3D,
  worldPosition: Vector3,
  worldQuaternion: Quaternion,
  worldScale: Vector3,
  scratch: LandrushRobotShoulderTorchScratch,
) {
  const parent = object.parent
  if (!parent) {
    object.position.copy(worldPosition)
    object.quaternion.copy(worldQuaternion)
    object.scale.copy(worldScale)
    return
  }
  parent.updateWorldMatrix(true, false)
  object.position.copy(worldPosition)
  parent.worldToLocal(object.position)
  parent.getWorldQuaternion(scratch.parentQuaternion).invert()
  object.quaternion.copy(scratch.parentQuaternion).multiply(worldQuaternion).normalize()
  parent.getWorldScale(scratch.parentScale)
  scratch.localScale.set(
    worldScale.x / Math.max(0.000_001, Math.abs(scratch.parentScale.x)),
    worldScale.y / Math.max(0.000_001, Math.abs(scratch.parentScale.y)),
    worldScale.z / Math.max(0.000_001, Math.abs(scratch.parentScale.z)),
  )
  object.scale.copy(scratch.localScale)
  object.updateWorldMatrix(false, true)
}

function setLandrushRobotShoulderTorchWorldPosition(object: Object3D, worldPosition: Vector3) {
  object.position.copy(worldPosition)
  object.parent?.worldToLocal(object.position)
  object.updateWorldMatrix(false, true)
}

function findLandrushRobotShoulderBones(root: Object3D): LandrushRobotShoulderBones | null {
  let leftShoulder: Object3D | null = null
  let rightShoulder: Object3D | null = null
  root.traverse((object) => {
    const name = object.name.toLowerCase()
    if (name === 'leftshoulder') leftShoulder = object
    else if (name === 'rightshoulder') rightShoulder = object
  })
  return leftShoulder && rightShoulder ? { leftShoulder, rightShoulder } : null
}

function createLandrushRobotShoulderTorchFixtureGeometry(design: LandrushRobotShoulderTorchDesign) {
  const shell: BufferGeometry[] = []
  const lens: BufferGeometry[] = []
  if (design === 'scout') {
    shell.push(
      createCylinderGeometry(0.09, 0.09, 0.22, 8, 0, 0, 0),
      createCylinderGeometry(0.105, 0.105, 0.04, 8, 0, 0, 0.12),
      createBoxGeometry(0.12, 0.055, 0.13, 0, -0.105, -0.045),
      createOctahedronGeometry(0.052, 0, -0.13, -0.07),
    )
    lens.push(createCylinderGeometry(0.072, 0.072, 0.012, 8, 0, 0, 0.146))
  } else if (design === 'breacher') {
    shell.push(
      createBoxGeometry(0.24, 0.095, 0.15, 0, 0, 0),
      createBoxGeometry(0.12, 0.05, 0.12, 0, -0.09, -0.035),
      createBoxGeometry(0.17, 0.025, 0.1, 0, 0.064, -0.02),
      createBoxGeometry(0.027, 0.13, 0.12, -0.132, 0, -0.01),
      createBoxGeometry(0.027, 0.13, 0.12, 0.132, 0, -0.01),
      createOctahedronGeometry(0.048, 0, -0.115, -0.065),
    )
    lens.push(
      createBoxGeometry(0.075, 0.044, 0.012, -0.052, 0.002, 0.081),
      createBoxGeometry(0.075, 0.044, 0.012, 0.052, 0.002, 0.081),
    )
  } else {
    shell.push(
      createBoxGeometry(0.18, 0.13, 0.22, 0, 0, 0),
      createBoxGeometry(0.115, 0.05, 0.13, 0, -0.115, -0.035),
      createBoxGeometry(0.125, 0.025, 0.14, 0, 0.08, -0.025),
      createCylinderGeometry(0.105, 0.105, 0.075, 8, 0, 0, 0.135),
      createBoxGeometry(0.024, 0.115, 0.14, -0.104, 0, -0.015),
      createBoxGeometry(0.024, 0.115, 0.14, 0.104, 0, -0.015),
      createOctahedronGeometry(0.052, 0, -0.14, -0.075),
    )
    lens.push(createCylinderGeometry(0.078, 0.078, 0.014, 8, 0, 0, 0.18))
  }
  return {
    lens: mergeLandrushRobotShoulderTorchGeometry(lens, `${design}-torch-lens`),
    shell: mergeLandrushRobotShoulderTorchGeometry(shell, `${design}-torch-shell`),
  }
}

function createBoxGeometry(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
) {
  const geometry = new BoxGeometry(width, height, depth)
  geometry.translate(x, y, z)
  return geometry
}

function createCylinderGeometry(
  radiusTop: number,
  radiusBottom: number,
  depth: number,
  radialSegments: number,
  x: number,
  y: number,
  z: number,
) {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, depth, radialSegments, 1, false)
  geometry.rotateX(Math.PI / 2)
  geometry.translate(x, y, z)
  return geometry
}

function createOctahedronGeometry(radius: number, x: number, y: number, z: number) {
  const geometry = new OctahedronGeometry(radius, 0)
  geometry.translate(x, y, z)
  return geometry
}

function mergeLandrushRobotShoulderTorchGeometry(parts: BufferGeometry[], name: string) {
  const compatibleParts = parts.map((part) => (part.index ? part.toNonIndexed() : part.clone()))
  const merged = mergeGeometries(compatibleParts, false)
  for (const part of parts) part.dispose()
  for (const part of compatibleParts) part.dispose()
  if (!merged) throw new Error(`Could not compile ${name}.`)
  merged.name = name
  merged.computeBoundingBox()
  merged.computeBoundingSphere()
  return merged
}

export function createLandrushRobotShoulderTorchBeamGeometry() {
  const geometry = new BufferGeometry()
  const triangleCount = LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_SURFACE_TRIANGLE_COUNT
  const verticesPerRow = LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_RADIAL_SEGMENT_COUNT + 1
  const rowCount = 3
  const position = new BufferAttribute(new Float32Array(verticesPerRow * rowCount * 3), 3)
  const uvArray = new Float32Array(verticesPerRow * rowCount * 2)
  const indexArray = new Uint16Array(triangleCount * 3)
  for (let row = 0; row < rowCount; row += 1) {
    const v = row === 0 ? 0 : row === 1 ? TORCH_BEAM_TEXTURE_MERGE_V : 1
    for (let segment = 0; segment < verticesPerRow; segment += 1) {
      const uvOffset = (row * verticesPerRow + segment) * 2
      uvArray[uvOffset] = segment / LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_RADIAL_SEGMENT_COUNT
      uvArray[uvOffset + 1] = v
    }
  }
  let indexOffset = 0
  for (let row = 0; row < rowCount - 1; row += 1) {
    for (
      let segment = 0;
      segment < LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_RADIAL_SEGMENT_COUNT;
      segment += 1
    ) {
      const sourceLeft = row * verticesPerRow + segment
      const sourceRight = sourceLeft + 1
      const targetLeft = sourceLeft + verticesPerRow
      const targetRight = targetLeft + 1
      indexArray[indexOffset] = sourceLeft
      indexArray[indexOffset + 1] = targetLeft
      indexArray[indexOffset + 2] = targetRight
      indexArray[indexOffset + 3] = sourceLeft
      indexArray[indexOffset + 4] = targetRight
      indexArray[indexOffset + 5] = sourceRight
      indexOffset += 6
    }
  }
  const uv = new BufferAttribute(uvArray, 2)
  position.setUsage(DynamicDrawUsage)
  geometry.setIndex(new BufferAttribute(indexArray, 1))
  geometry.setAttribute('position', position)
  geometry.setAttribute('uv', uv)
  return geometry
}

export function createLandrushRobotShoulderTorchPixelTexture() {
  const size = LANDRUSH_ROBOT_SHOULDER_TORCH_TEXTURE_RESOLUTION
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const border = x === 0 || y === 0 || x === size - 1 || y === size - 1
      const hazard = y === 2 || y === 3
      const amber = hazard && (x + y) % 3 !== 0
      const variation = ((x * 13 + y * 7) % 4) * 5
      data[offset] = border ? 18 : amber ? 214 : 54 + variation
      data[offset + 1] = border ? 23 : amber ? 139 : 65 + variation
      data[offset + 2] = border ? 27 : amber ? 42 : 70 + variation
      data[offset + 3] = 255
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.name = 'landrush-shoulder-torch-8px-armor'
  texture.needsUpdate = true
  return texture
}

export function createLandrushRobotShoulderTorchBeamAlphaTexture() {
  const width = LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_ALPHA_TEXTURE_RESOLUTION
  const height = LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_ALPHA_TEXTURE_RESOLUTION
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const alpha = Math.round(
        resolveLandrushRobotShoulderTorchBeamEnvelope(x / (width - 1), y / (height - 1)) * 255,
      )
      data[offset] = alpha
      data[offset + 1] = alpha
      data[offset + 2] = alpha
      data[offset + 3] = alpha
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  texture.generateMipmaps = true
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.name = 'landrush-shoulder-torch-smooth-two-feed-envelope'
  texture.needsUpdate = true
  return texture
}

export function resolveLandrushRobotShoulderTorchBeamEnvelope(u: number, v: number) {
  const normalizedU = Math.min(1, Math.max(0, Number.isFinite(u) ? u : 0))
  const normalizedV = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))
  const mergeProgress = Math.min(1, normalizedV / TORCH_BEAM_TEXTURE_MERGE_V)
  const mergeEase = mergeProgress * mergeProgress * (3 - 2 * mergeProgress)
  const centerOffset = TORCH_BEAM_SOURCE_CENTER_OFFSET * (1 - mergeEase)
  const sdfRadius =
    TORCH_BEAM_SOURCE_SDF_RADIUS +
    (TORCH_BEAM_MERGED_SDF_RADIUS - TORCH_BEAM_SOURCE_SDF_RADIUS) * mergeEase
  const nearestCenterDistance = Math.min(
    Math.abs(normalizedU - (0.5 - centerOffset)),
    Math.abs(normalizedU - (0.5 + centerOffset)),
  )
  const radial = resolveLandrushRobotShoulderTorchRadialEnvelope(nearestCenterDistance / sdfRadius)
  const edgeDistance = Math.min(normalizedU, 1 - normalizedU)
  if (edgeDistance <= TORCH_BEAM_UV_ZERO_BORDER) return 0
  const guardProgress = Math.min(
    1,
    (edgeDistance - TORCH_BEAM_UV_ZERO_BORDER) /
      (TORCH_BEAM_UV_GUARD_END - TORCH_BEAM_UV_ZERO_BORDER),
  )
  const guard = guardProgress * guardProgress * (3 - 2 * guardProgress)
  const tailProgress = Math.min(1, Math.max(0, (normalizedV - 0.78) / 0.22))
  const tail = 1 - tailProgress * tailProgress * (3 - 2 * tailProgress)
  const alpha = radial * guard * tail
  return Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0
}

function resolveLandrushRobotShoulderTorchRadialEnvelope(normalizedDistance: number) {
  if (normalizedDistance >= 1) return 0
  if (normalizedDistance <= TORCH_BEAM_RADIAL_CORE) return 1
  const feather = (normalizedDistance - TORCH_BEAM_RADIAL_CORE) / (1 - TORCH_BEAM_RADIAL_CORE)
  return 1 - feather * feather * (3 - 2 * feather)
}

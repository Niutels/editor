'use client'

import { useFrame } from '@react-three/fiber'
import { memo, type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
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
  Matrix4,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
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
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_BODY_COUNT,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_FEED_COUNT,
  LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_MERGE_DISTANCE,
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
const TORCH_BEAM_TARGET_RADIUS = 1.45
const TORCH_BEAM_MERGE_RADIUS = 0.11
const TORCH_BEAM_SOURCE_RADIUS_METERS = 0.018
const TORCH_BEAM_FEED_ENERGY = 0.5

type LandrushRobotShoulderBones = {
  leftShoulder: Object3D
  rightShoulder: Object3D
}

type LandrushRobotShoulderTorchScratch = {
  beamDirection: Vector3
  beamGeometryChanged: boolean
  beamOrigin: Vector3
  beamRadial: Vector3
  beamUvsChanged: boolean
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
  combatStateRef,
  design = LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN,
  emitSpotLights = true,
  framePriority = 2.505,
  lightingStateRef,
  renderReadinessRegistry,
  showBeams = true,
  showFixtures = true,
  visualRootRef,
}: {
  active?: boolean
  combatStateRef: RefObject<LandrushRobotWeaponCombatState | null>
  design?: LandrushRobotShoulderTorchDesign
  emitSpotLights?: boolean
  framePriority?: number
  lightingStateRef?: RefObject<LandrushRobotShoulderTorchLightingState>
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
      beamUvsChanged: false,
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
    if (!root) return
    if (!(active && visualRoot && combatState)) {
      if (lightingStateRef?.current) lightingStateRef.current.active = false
      applyLandrushRobotShoulderTorchContribution(
        false,
        contribution,
        root,
        leftFixtureRef.current,
        leftFixtureShellRef.current,
        leftFixtureLensRef.current,
        rightFixtureRef.current,
        rightFixtureShellRef.current,
        rightFixtureLensRef.current,
        outerBeamRef.current,
        lightRef.current,
      )
      return
    }
    if (bonesRootRef.current !== visualRoot) {
      bonesRootRef.current = visualRoot
      bonesRef.current = null
    }
    const bones = bonesRef.current ?? findLandrushRobotShoulderBones(visualRoot)
    bonesRef.current = bones
    if (!bones) {
      if (lightingStateRef?.current) lightingStateRef.current.active = false
      applyLandrushRobotShoulderTorchContribution(
        false,
        contribution,
        root,
        leftFixtureRef.current,
        leftFixtureShellRef.current,
        leftFixtureLensRef.current,
        rightFixtureRef.current,
        rightFixtureShellRef.current,
        rightFixtureLensRef.current,
        outerBeamRef.current,
        lightRef.current,
      )
      return
    }

    visualRoot.updateWorldMatrix(true, true)
    root.updateWorldMatrix(true, false)
    bones.leftShoulder.getWorldPosition(scratch.leftShoulder)
    bones.rightShoulder.getWorldPosition(scratch.rightShoulder)
    visualRoot.getWorldPosition(scratch.robotOrigin)
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
        root,
        leftFixtureRef.current,
        leftFixtureShellRef.current,
        leftFixtureLensRef.current,
        rightFixtureRef.current,
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
      root,
      leftFixtureRef.current,
      leftFixtureShellRef.current,
      leftFixtureLensRef.current,
      rightFixtureRef.current,
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
      <group ref={leftFixtureRef} visible>
        <LandrushRobotShoulderTorchFixture
          design={design}
          lensRef={leftFixtureLensRef}
          shellRef={leftFixtureShellRef}
          texture={fixtureTexture}
        />
      </group>
      <group ref={rightFixtureRef} visible>
        <LandrushRobotShoulderTorchFixture
          design={design}
          lensRef={rightFixtureLensRef}
          shellRef={rightFixtureShellRef}
          texture={fixtureTexture}
        />
      </group>
      <mesh frustumCulled={false} geometry={beamGeometry} ref={outerBeamRef} visible>
        <meshBasicMaterial
          alphaMap={beamAlphaTexture}
          blending={AdditiveBlending}
          color="#ffd58a"
          depthWrite={false}
          opacity={0}
          side={FrontSide}
          toneMapped={false}
          transparent
          vertexColors
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
        visible
      />
      <object3D ref={targetRef} />
    </group>
  )
})

function applyLandrushRobotShoulderTorchContribution(
  ready: boolean,
  contribution: LandrushRobotShoulderTorchContribution,
  root: Group,
  leftFixture: Group | null,
  leftFixtureShell: Mesh | null,
  leftFixtureLens: Mesh | null,
  rightFixture: Group | null,
  rightFixtureShell: Mesh | null,
  rightFixtureLens: Mesh | null,
  outerBeam: Mesh | null,
  light: SpotLight | null,
) {
  root.visible = true
  if (leftFixture) leftFixture.visible = true
  if (rightFixture) rightFixture.visible = true
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
    outerBeam.visible = true
    ;(outerBeam.material as MeshBasicMaterial).opacity = ready ? contribution.beamOpacity : 0
  }
  if (light) {
    light.visible = true
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
    <group dispose={null} userData={{ design, role: 'shoulder-torch-fixture' }}>
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
  const uv = beam.geometry.getAttribute('uv') as BufferAttribute
  const uvArray = uv.array as Float32Array
  scratch.beamGeometryChanged = false
  scratch.beamUvsChanged = false
  const fullBeamLength = scratch.beamOrigin.distanceTo(beamTarget)
  const mergeProgress =
    fullBeamLength <= 0.001
      ? 0
      : Math.min(1, scratch.beamOrigin.distanceTo(mergeTarget) / fullBeamLength)
  updateLandrushRobotShoulderTorchBeamRadial(cameraPosition, beamTarget, scratch)
  let positionOffset = 0
  positionOffset = writeLandrushRobotShoulderTorchBeamSection(
    positionArray,
    positionOffset,
    leftOrigin,
    mergeTarget,
    TORCH_BEAM_SOURCE_RADIUS_METERS,
    TORCH_BEAM_MERGE_RADIUS,
    scratch,
  )
  positionOffset = writeLandrushRobotShoulderTorchBeamSection(
    positionArray,
    positionOffset,
    rightOrigin,
    mergeTarget,
    TORCH_BEAM_SOURCE_RADIUS_METERS,
    TORCH_BEAM_MERGE_RADIUS,
    scratch,
  )
  writeLandrushRobotShoulderTorchBeamSection(
    positionArray,
    positionOffset,
    mergeTarget,
    beamTarget,
    TORCH_BEAM_MERGE_RADIUS,
    TORCH_BEAM_TARGET_RADIUS,
    scratch,
  )
  let uvOffset = 0
  uvOffset = writeLandrushRobotShoulderTorchBeamUvRange(
    uvArray,
    uvOffset,
    0,
    mergeProgress,
    scratch,
  )
  uvOffset = writeLandrushRobotShoulderTorchBeamUvRange(
    uvArray,
    uvOffset,
    0,
    mergeProgress,
    scratch,
  )
  writeLandrushRobotShoulderTorchBeamUvRange(uvArray, uvOffset, mergeProgress, 1, scratch)
  if (scratch.beamGeometryChanged) position.needsUpdate = true
  if (scratch.beamUvsChanged) uv.needsUpdate = true
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

function writeLandrushRobotShoulderTorchBeamSection(
  array: Float32Array,
  offset: number,
  origin: Vector3,
  target: Vector3,
  sourceRadius: number,
  targetRadius: number,
  scratch: LandrushRobotShoulderTorchScratch,
) {
  scratch.beamDirection.copy(target).sub(origin)
  const beamLength = scratch.beamDirection.length()
  if (beamLength <= 0.001) return offset
  scratch.beamDirection.multiplyScalar(1 / beamLength)
  offset = writeLandrushRobotShoulderTorchBeamPosition(
    array,
    offset,
    origin,
    -sourceRadius,
    scratch,
  )
  offset = writeLandrushRobotShoulderTorchBeamPosition(
    array,
    offset,
    target,
    -targetRadius,
    scratch,
  )
  offset = writeLandrushRobotShoulderTorchBeamPosition(array, offset, target, targetRadius, scratch)
  offset = writeLandrushRobotShoulderTorchBeamPosition(
    array,
    offset,
    origin,
    -sourceRadius,
    scratch,
  )
  offset = writeLandrushRobotShoulderTorchBeamPosition(array, offset, target, targetRadius, scratch)
  offset = writeLandrushRobotShoulderTorchBeamPosition(array, offset, origin, sourceRadius, scratch)
  return offset
}

function writeLandrushRobotShoulderTorchBeamUvRange(
  array: Float32Array,
  offset: number,
  startV: number,
  endV: number,
  scratch: LandrushRobotShoulderTorchScratch,
) {
  offset = writeLandrushRobotShoulderTorchBeamUv(array, offset, 0, startV, scratch)
  offset = writeLandrushRobotShoulderTorchBeamUv(array, offset, 0, endV, scratch)
  offset = writeLandrushRobotShoulderTorchBeamUv(array, offset, 1, endV, scratch)
  offset = writeLandrushRobotShoulderTorchBeamUv(array, offset, 0, startV, scratch)
  offset = writeLandrushRobotShoulderTorchBeamUv(array, offset, 1, endV, scratch)
  return writeLandrushRobotShoulderTorchBeamUv(array, offset, 1, startV, scratch)
}

function writeLandrushRobotShoulderTorchBeamUv(
  array: Float32Array,
  offset: number,
  u: number,
  v: number,
  scratch: LandrushRobotShoulderTorchScratch,
) {
  const nextU = Math.fround(u)
  const nextV = Math.fround(v)
  if (array[offset] !== nextU || array[offset + 1] !== nextV) {
    array[offset] = nextU
    array[offset + 1] = nextV
    scratch.beamUvsChanged = true
  }
  return offset + 2
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

function createLandrushRobotShoulderTorchBeamGeometry() {
  const geometry = new BufferGeometry()
  const triangleCount =
    (LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_FEED_COUNT +
      LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_BODY_COUNT) *
    2
  const position = new BufferAttribute(new Float32Array(triangleCount * 3 * 3), 3)
  const uv = new BufferAttribute(new Float32Array(triangleCount * 3 * 2), 2)
  const color = new BufferAttribute(new Float32Array(triangleCount * 3 * 3), 3)
  const feedVertexCount = LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_FEED_COUNT * 2 * 3
  for (let vertex = 0; vertex < triangleCount * 3; vertex += 1) {
    const energy = vertex < feedVertexCount ? TORCH_BEAM_FEED_ENERGY : 1
    color.setXYZ(vertex, energy, energy, energy)
  }
  position.setUsage(DynamicDrawUsage)
  uv.setUsage(DynamicDrawUsage)
  geometry.setAttribute('color', color)
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

function createLandrushRobotShoulderTorchBeamAlphaTexture() {
  const width = 32
  const height = 64
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
  texture.generateMipmaps = false
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.name = 'landrush-shoulder-torch-soft-two-feed-unified-envelope'
  texture.needsUpdate = true
  return texture
}

export function resolveLandrushRobotShoulderTorchBeamEnvelope(u: number, v: number) {
  const normalizedU = Math.min(1, Math.max(0, Number.isFinite(u) ? u : 0))
  const normalizedV = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))
  const edgeDistance = Math.abs(normalizedU * 2 - 1)
  const radial = edgeDistance >= 1 ? 0 : Math.cos(edgeDistance * Math.PI * 0.5) ** 1.35
  const headProgress = Math.min(1, normalizedV / 0.018)
  const headEase = headProgress * headProgress * (3 - 2 * headProgress)
  const head = 0.58 + 0.42 * headEase
  const tailProgress = Math.min(1, Math.max(0, (normalizedV - 0.78) / 0.22))
  const tail = 1 - tailProgress * tailProgress * (3 - 2 * tailProgress)
  return (radial * head * tail) ** 0.86
}

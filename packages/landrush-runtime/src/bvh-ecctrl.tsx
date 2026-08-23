// R3F JSX type augmentations (mesh, group, box3Helper, …) for the debug overlay.
import '@react-three/fiber'
import { TransformControls, useKeyboardControls } from '@react-three/drei'
import { type ThreeElements, useFrame, useThree } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { forwardRef, Suspense, useCallback, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clamp } from 'three/src/math/MathUtils.js'
import {
  type BVHEcctrlCollisionResponseMode,
  resolveBVHEcctrlCollisionCorrectionDistance,
  resolveBVHEcctrlCollisionNormalSpeed,
} from './bvh-ecctrl-collision'
import { runBVHEcctrlContactStep } from './bvh-ecctrl-contact-step'
import {
  BVH_ECCTRL_FIXED_STEP_SECONDS,
  canRequestBVHEcctrlJump,
  consumeBVHEcctrlJump,
  createBVHEcctrlLocomotionState,
  requestBVHEcctrlJump,
  resolveBVHEcctrlCapsuleCenterFromFoot,
  resolveBVHEcctrlCapsuleTotalClearance,
  resolveBVHEcctrlCrouchingState,
  resolveBVHEcctrlFixedSteps,
  resolveBVHEcctrlPresentationAlpha,
  resolveBVHEcctrlStanceShape,
  setBVHEcctrlGrounded,
} from './bvh-ecctrl-locomotion'
import { isBVHEcctrlSupportCandidateEligible } from './bvh-ecctrl-support'

export type { BVHEcctrlCollisionResponseMode } from './bvh-ecctrl-collision'

export type MovementInput = {
  forward?: boolean
  backward?: boolean
  leftward?: boolean
  rightward?: boolean
  joystick?: { x: number; y: number }
  worldDirection?: { x: number; z: number } | null
  run?: boolean
  jump?: boolean
  crouch?: boolean
  speedScale?: number
}

export type FloatCheckType = 'RAYCAST' | 'SHAPECAST' | 'BOTH'

export interface BVHEcctrlApi {
  readonly canJump: boolean
  readonly centerFromFoot: number
  readonly crouching: boolean
  group: THREE.Group | null
  readonly isGrounded: boolean
  readonly jumpsUsed: number
  model: THREE.Group | null
  readonly presentationAlpha: number
  readonly presentationSeconds: number
  readonly simulatedSeconds: number
  readonly supportHeight: number | null
  getLinVel: (target?: THREE.Vector3) => THREE.Vector3
  getPresentationPosition: (target?: THREE.Vector3) => THREE.Vector3
  resetLinVel: () => void
  addLinVel: (v: THREE.Vector3) => void
  requestJump: () => boolean
  resetStance: () => void
  setCollisionResponseMode: (mode: BVHEcctrlCollisionResponseMode) => void
  setPaused: (paused: boolean) => void
  setLinVel: (v: THREE.Vector3) => void
  setMovement: (input: MovementInput) => void
}

export interface EcctrlProps extends Omit<ThreeElements['group'], 'ref'> {
  children?: ReactNode
  debug?: boolean
  colliderMeshes?: THREE.Mesh[]
  colliderCapsuleArgs?: [
    radius: number,
    length: number,
    capSegments: number,
    radialSegments: number,
  ]
  paused?: boolean
  delay?: number
  gravity?: number
  fallGravityFactor?: number
  maxFallSpeed?: number
  sleepTimeout?: number
  slowMotionFactor?: number
  turnSpeed?: number
  maxWalkSpeed?: number
  maxRunSpeed?: number
  crouchTotalClearance?: number
  crouchSpeedScale?: number
  acceleration?: number
  deceleration?: number
  counterAccFactor?: number
  airDragFactor?: number
  jumpVel?: number
  maxAirJumps?: number
  airJumpVelocityMultiplier?: number
  floatCheckType?: FloatCheckType
  maxSlope?: number
  floatHeight?: number
  floatPullBackHeight?: number
  floatSensorRadius?: number
  maxStepHeight?: number
  landingSkin?: number
  collisionCheckIteration?: number
  collisionDepenetrationMaxDistance?: number
  collisionSkin?: number
  collisionPushBackDamping?: number
  collisionPushBackThreshold?: number
  standingClearanceSkin?: number
}

const BVHEcctrl = forwardRef<BVHEcctrlApi, EcctrlProps>(
  (
    {
      children,
      debug = false,
      colliderMeshes = [],
      colliderCapsuleArgs = [0.3, 0.6, 4, 8],
      paused = false,
      delay = 1.5,
      gravity = 9.81,
      fallGravityFactor = 4,
      maxFallSpeed = 50,
      sleepTimeout = 10,
      slowMotionFactor = 1,
      turnSpeed = 15,
      maxWalkSpeed = 3,
      maxRunSpeed = 5,
      crouchTotalClearance,
      crouchSpeedScale = 0.5,
      acceleration = 30,
      deceleration = 20,
      counterAccFactor = 0.5,
      airDragFactor = 0.3,
      jumpVel = 5,
      maxAirJumps = 0,
      airJumpVelocityMultiplier = 0.7,
      floatCheckType = 'BOTH',
      maxSlope = 1,
      floatHeight = 0.2,
      floatPullBackHeight = 0.25,
      floatSensorRadius = 0.12,
      maxStepHeight = 0.28,
      landingSkin = 0.03,
      collisionCheckIteration = 3,
      collisionDepenetrationMaxDistance = 0.08,
      collisionSkin = 0.001,
      collisionPushBackDamping = 0.1,
      collisionPushBackThreshold = 0.05,
      standingClearanceSkin = 0.015,
      ...props
    },
    ref,
  ) => {
    const { camera } = useThree()
    const capsuleRadius = useMemo(() => colliderCapsuleArgs[0], [colliderCapsuleArgs])
    const capsuleLength = useMemo(() => colliderCapsuleArgs[1], [colliderCapsuleArgs])
    const standingTotalClearance = useMemo(
      () =>
        resolveBVHEcctrlCapsuleTotalClearance({
          capsuleLength,
          capsuleRadius,
          floatHeight,
        }),
      [capsuleLength, capsuleRadius, floatHeight],
    )
    const crouchingShape = useMemo(
      () =>
        resolveBVHEcctrlStanceShape({
          capsuleLength,
          capsuleRadius,
          floatHeight,
          totalClearance: crouchTotalClearance ?? standingTotalClearance * 0.5,
        }),
      [capsuleLength, capsuleRadius, crouchTotalClearance, floatHeight, standingTotalClearance],
    )
    const characterGroupRef = useRef<THREE.Group | null>(null)
    const characterColliderRef = useRef<THREE.Mesh | null>(null)
    const characterModelRef = useRef<THREE.Group | null>(null)
    const debugLineStart = useRef<THREE.Mesh | null>(null)
    const debugLineEnd = useRef<THREE.Mesh | null>(null)
    const debugRaySensorStart = useRef<THREE.Mesh | null>(null)
    const debugRaySensorEnd = useRef<THREE.Mesh | null>(null)
    const standPointRef = useRef<THREE.Mesh | null>(null)
    const lookDirRef = useRef<THREE.Mesh | null>(null)
    const inputDirRef = useRef<THREE.ArrowHelper | null>(null)
    const moveDirRef = useRef<THREE.ArrowHelper | null>(null)
    const elapsedRef = useRef(0)
    const fixedStepAccumulator = useRef(0)
    const simulatedSecondsRef = useRef(0)
    const presentationPoseInitialized = useRef(false)
    const presentationPreviousPosition = useRef(new THREE.Vector3())
    const presentationCurrentPosition = useRef(new THREE.Vector3())
    const presentationPosition = useRef(new THREE.Vector3())
    const presentationPreviousSeconds = useRef(0)
    const presentationCurrentSeconds = useRef(0)
    const presentationSecondsRef = useRef(0)
    const presentationAlphaRef = useRef(1)

    const [, getKeys] = useKeyboardControls()
    const presetKeys = {
      forward: false,
      backward: false,
      leftward: false,
      rightward: false,
      jump: false,
      run: false,
      crouch: false,
    }

    const upAxis = useRef(new THREE.Vector3(0, 1, 0))
    const localUpAxis = useRef(new THREE.Vector3())
    const gravityDir = useRef(new THREE.Vector3(0, -1, 0))
    const currentLinVel = useRef(new THREE.Vector3())
    const currentLinVelOnPlane = useRef(new THREE.Vector3())
    const isFalling = useRef(false)
    const idleTime = useRef(0)
    const isSleeping = useRef(false)
    const camProjDir = useRef(new THREE.Vector3())
    const camRightDir = useRef(new THREE.Vector3())
    const inputDir = useRef(new THREE.Vector3())
    const inputDirOnPlane = useRef(new THREE.Vector3())
    const movingDir = useRef(new THREE.Vector3())
    const deltaLinVel = useRef(new THREE.Vector3())
    const wantToMoveVel = useRef(new THREE.Vector3())
    const forwardState = useRef(false)
    const backwardState = useRef(false)
    const leftwardState = useRef(false)
    const rightwardState = useRef(false)
    const joystickState = useRef(new THREE.Vector2())
    const worldDirectionState = useRef(new THREE.Vector2())
    const hasWorldDirectionState = useRef(false)
    const runState = useRef(false)
    const jumpHeldState = useRef(false)
    const crouchHeldState = useRef(false)
    const crouchingState = useRef(false)
    const currentCapsuleLength = useRef(capsuleLength)
    const currentFloatHeight = useRef(floatHeight)
    const previousJumpInputState = useRef(false)
    const speedScaleState = useRef(1)
    const collisionResponseModeState = useRef<BVHEcctrlCollisionResponseMode>('push-back')
    const imperativePaused = useRef(false)
    const locomotionState = useRef(createBVHEcctrlLocomotionState())
    const characterModelTargetQuat = useRef(new THREE.Quaternion())
    const characterModelLookMatrix = useRef(new THREE.Matrix4())
    const characterOrigin = useMemo(() => new THREE.Vector3(0, 0, 0), [])
    const contactDepth = useRef(0)
    const contactNormal = useRef(new THREE.Vector3())
    const triContactPoint = useRef(new THREE.Vector3())
    const capsuleContactPoint = useRef(new THREE.Vector3())
    const totalDepth = useRef(0)
    const triangleCount = useRef(0)
    const accumulatedContactNormal = useRef(new THREE.Vector3())
    const accumulatedContactPoint = useRef(new THREE.Vector3())
    const collisionCorrection = useRef(new THREE.Vector3())
    const characterBbox = useRef(new THREE.Box3())
    const characterSegment = useRef(new THREE.Line3())
    const localCharacterBbox = useRef(new THREE.Box3())
    const localCharacterSegment = useRef(new THREE.Line3())
    const collideInvertMatrix = useRef(new THREE.Matrix4())
    const relativeCollideVel = useRef(new THREE.Vector3())
    const scaledContactRadiusVec = useRef(new THREE.Vector3())
    const deltaDist = useRef(new THREE.Vector3())
    const localSupportHeight = useRef(Number.NEGATIVE_INFINITY)
    const localClosestPoint = useRef(new THREE.Vector3())
    const localHitNormal = useRef(new THREE.Vector3())
    const triNormal = useRef(new THREE.Vector3())
    const globalSupportHeight = useRef(Number.NEGATIVE_INFINITY)
    const globalClosestPoint = useRef(new THREE.Vector3())
    const triHitPoint = useRef(new THREE.Vector3())
    const segHitPoint = useRef(new THREE.Vector3())
    const floatHitNormal = useRef(new THREE.Vector3())
    const groundFriction = useRef(0.8)
    const floatSensorBbox = useRef(new THREE.Box3())
    const floatSensorBboxExpendPoint = useRef(new THREE.Vector3())
    const floatSensorSegment = useRef(new THREE.Line3())
    const localFloatSensorBbox = useRef(new THREE.Box3())
    const localFloatSensorBboxExpendPoint = useRef(new THREE.Vector3())
    const localFloatSensorSegment = useRef(new THREE.Line3())
    const floatInvertMatrix = useRef(new THREE.Matrix4())
    const floatNormalInverseMatrix = useRef(new THREE.Matrix3())
    const floatNormalMatrix = useRef(new THREE.Matrix3())
    const floatRaycaster = useRef(new THREE.Raycaster())
    const currentSemanticFootHeight = useRef(0)
    const previousSemanticFootHeight = useRef<number | null>(null)
    const currentSupportHeight = useRef<number | null>(null)
    const totalPlatformDeltaPos = useRef(new THREE.Vector3())
    const isOnMovingPlatform = useRef(false)
    const floatTempPos = useRef(new THREE.Vector3())
    const floatTempQuat = useRef(new THREE.Quaternion())
    const floatTempScale = useRef(new THREE.Vector3())
    const scaledFloatRadiusVec = useRef(new THREE.Vector3())
    const deltaHit = useRef(new THREE.Vector3())
    const rotationDeltaPos = useRef(new THREE.Vector3())
    const yawQuaternion = useRef(new THREE.Quaternion())
    const contactTempPos = useRef(new THREE.Vector3())
    const contactTempQuat = useRef(new THREE.Quaternion())
    const contactTempScale = useRef(new THREE.Vector3())
    const stanceCharacterSegment = useRef(new THREE.Line3())
    const stanceLocalSegment = useRef(new THREE.Line3())
    const stanceLocalBbox = useRef(new THREE.Box3())
    const stanceInvertMatrix = useRef(new THREE.Matrix4())
    const stanceScale = useRef(new THREE.Vector3())
    const stanceQuaternion = useRef(new THREE.Quaternion())
    const stancePosition = useRef(new THREE.Vector3())
    const stanceRadius = useRef(new THREE.Vector3())
    const stanceTrianglePoint = useRef(new THREE.Vector3())
    const stanceCapsulePoint = useRef(new THREE.Vector3())

    floatRaycaster.current.far = capsuleRadius + currentFloatHeight.current + floatPullBackHeight

    const floatRaycastCandidates = useMemo(
      () =>
        colliderMeshes.filter(
          (mesh) => mesh.geometry.boundsTree && !(mesh instanceof THREE.InstancedMesh),
        ),
      [colliderMeshes],
    )

    const applyGravity = useCallback(
      (delta: number) => {
        gravityDir.current.copy(upAxis.current).negate()
        const fallingSpeed = currentLinVel.current.dot(gravityDir.current)
        isFalling.current = fallingSpeed > 0
        if (fallingSpeed < maxFallSpeed) {
          currentLinVel.current.addScaledVector(
            gravityDir.current,
            gravity * (isFalling.current ? fallGravityFactor : 1) * delta,
          )
        }
      },
      [fallGravityFactor, gravity, maxFallSpeed],
    )

    const checkCharacterSleep = useCallback(
      (jump: boolean, delta: number) => {
        const moving = currentLinVel.current.lengthSq() > 1e-6
        const platformIsMoving = totalPlatformDeltaPos.current.lengthSq() > 1e-6

        if (
          !moving &&
          locomotionState.current.grounded &&
          !jump &&
          !isOnMovingPlatform.current &&
          !platformIsMoving
        ) {
          idleTime.current += delta
          if (idleTime.current > sleepTimeout) isSleeping.current = true
        } else {
          idleTime.current = 0
          isSleeping.current = false
        }
      },
      [sleepTimeout],
    )

    const setInputDirection = useCallback(
      (dir: {
        forward?: boolean
        backward?: boolean
        leftward?: boolean
        rightward?: boolean
        joystick?: THREE.Vector2
        worldDirection?: THREE.Vector2 | null
      }) => {
        inputDir.current.set(0, 0, 0)

        if (dir.worldDirection) {
          inputDir.current
            .set(dir.worldDirection.x, 0, dir.worldDirection.y)
            .projectOnPlane(upAxis.current)
            .normalize()
          return
        }

        camera.getWorldDirection(camProjDir.current)
        camProjDir.current.projectOnPlane(upAxis.current).normalize()
        camRightDir.current.crossVectors(camProjDir.current, upAxis.current).normalize()

        if (dir.joystick && dir.joystick.lengthSq() > 0) {
          inputDir.current
            .addScaledVector(camProjDir.current, dir.joystick.y)
            .addScaledVector(camRightDir.current, dir.joystick.x)
        } else {
          if (dir.forward) inputDir.current.add(camProjDir.current)
          if (dir.backward) inputDir.current.sub(camProjDir.current)
          if (dir.leftward) inputDir.current.sub(camRightDir.current)
          if (dir.rightward) inputDir.current.add(camRightDir.current)
        }

        inputDir.current.normalize()
      },
      [camera],
    )

    const handleCharacterMovement = useCallback(
      (run: boolean, crouching: boolean, delta: number) => {
        const friction = clamp(groundFriction.current, 0, 1)

        if (inputDir.current.lengthSq() > 0) {
          if (characterModelRef.current) {
            inputDirOnPlane.current.copy(inputDir.current).projectOnPlane(upAxis.current)
            characterModelLookMatrix.current.lookAt(
              inputDirOnPlane.current,
              characterOrigin,
              upAxis.current,
            )
            characterModelTargetQuat.current.setFromRotationMatrix(characterModelLookMatrix.current)
            characterModelRef.current.quaternion.slerp(
              characterModelTargetQuat.current,
              delta * turnSpeed,
            )
          }

          const stanceSpeedScale = crouching ? Math.max(0, Math.min(1, crouchSpeedScale)) : 1
          const maxSpeed =
            (run ? maxRunSpeed : maxWalkSpeed) * speedScaleState.current * stanceSpeedScale
          wantToMoveVel.current.copy(inputDir.current).multiplyScalar(maxSpeed)
          const dot = movingDir.current.dot(inputDir.current)

          deltaLinVel.current.subVectors(wantToMoveVel.current, currentLinVelOnPlane.current)
          deltaLinVel.current.clampLength(
            0,
            (dot <= 0 ? 1 + counterAccFactor : 1) *
              acceleration *
              friction *
              delta *
              (locomotionState.current.grounded ? 1 : airDragFactor),
          )
          currentLinVel.current.add(deltaLinVel.current)
        } else if (locomotionState.current.grounded) {
          deltaLinVel.current
            .copy(currentLinVelOnPlane.current)
            .clampLength(0, deceleration * friction * delta)
          currentLinVel.current.sub(deltaLinVel.current)
        }
      },
      [
        acceleration,
        airDragFactor,
        counterAccFactor,
        deceleration,
        maxRunSpeed,
        maxWalkSpeed,
        crouchSpeedScale,
        turnSpeed,
        characterOrigin,
      ],
    )

    const updateSegmentBBox = useCallback(() => {
      if (!characterGroupRef.current) return

      characterSegment.current.start
        .set(0, currentCapsuleLength.current / 2, 0)
        .add(characterGroupRef.current.position)
      characterSegment.current.end
        .set(0, -currentCapsuleLength.current / 2, 0)
        .add(characterGroupRef.current.position)

      characterBbox.current
        .makeEmpty()
        .expandByPoint(characterSegment.current.start)
        .expandByPoint(characterSegment.current.end)
        .expandByScalar(capsuleRadius)

      floatSensorSegment.current.start.copy(characterSegment.current.end)
      floatSensorSegment.current.end
        .copy(floatSensorSegment.current.start)
        .addScaledVector(gravityDir.current, currentFloatHeight.current + capsuleRadius)
      floatSensorBboxExpendPoint.current
        .copy(floatSensorSegment.current.end)
        .addScaledVector(gravityDir.current, floatPullBackHeight)
      floatRaycaster.current.far = capsuleRadius + currentFloatHeight.current + floatPullBackHeight

      floatSensorBbox.current
        .makeEmpty()
        .expandByPoint(floatSensorSegment.current.start)
        .expandByPoint(floatSensorBboxExpendPoint.current)
        .expandByScalar(floatSensorRadius)
    }, [capsuleRadius, floatPullBackHeight, floatSensorRadius])

    const collisionCheck = useCallback(
      (mesh: THREE.Mesh, originMatrix: THREE.Matrix4, delta: number) => {
        if (!(mesh.visible && mesh.geometry.boundsTree) || mesh.userData.excludeCollisionCheck)
          return false

        let positionCorrected = false

        originMatrix.decompose(
          contactTempPos.current,
          contactTempQuat.current,
          contactTempScale.current,
        )
        collideInvertMatrix.current.copy(originMatrix).invert()
        localCharacterSegment.current
          .copy(characterSegment.current)
          .applyMatrix4(collideInvertMatrix.current)

        scaledContactRadiusVec.current.set(
          capsuleRadius / contactTempScale.current.x,
          capsuleRadius / contactTempScale.current.y,
          capsuleRadius / contactTempScale.current.z,
        )

        localCharacterBbox.current
          .makeEmpty()
          .expandByPoint(localCharacterSegment.current.start)
          .expandByPoint(localCharacterSegment.current.end)
        localCharacterBbox.current.min.addScaledVector(scaledContactRadiusVec.current, -1)
        localCharacterBbox.current.max.add(scaledContactRadiusVec.current)

        contactDepth.current = 0
        contactNormal.current.set(0, 0, 0)
        totalDepth.current = 0
        triangleCount.current = 0
        accumulatedContactNormal.current.set(0, 0, 0)
        accumulatedContactPoint.current.set(0, 0, 0)

        mesh.geometry.boundsTree.shapecast({
          intersectsBounds: (box) => box.intersectsBox(localCharacterBbox.current),
          intersectsTriangle: (tri) => {
            tri.closestPointToSegment(
              localCharacterSegment.current,
              triContactPoint.current,
              capsuleContactPoint.current,
            )

            deltaDist.current.copy(triContactPoint.current).sub(capsuleContactPoint.current)
            deltaDist.current.divide(scaledContactRadiusVec.current)

            if (deltaDist.current.lengthSq() < 1) {
              triContactPoint.current.applyMatrix4(originMatrix)
              capsuleContactPoint.current.applyMatrix4(originMatrix)

              contactNormal.current
                .copy(capsuleContactPoint.current)
                .sub(triContactPoint.current)
                .normalize()
              contactDepth.current =
                capsuleRadius - capsuleContactPoint.current.distanceTo(triContactPoint.current)

              accumulatedContactNormal.current.addScaledVector(
                contactNormal.current,
                contactDepth.current,
              )
              accumulatedContactPoint.current.add(triContactPoint.current)
              totalDepth.current += contactDepth.current
              triangleCount.current += 1
            }
          },
        })

        if (triangleCount.current > 0) {
          accumulatedContactNormal.current.normalize()
          accumulatedContactPoint.current.divideScalar(triangleCount.current)
          const avgDepth = totalDepth.current / triangleCount.current
          relativeCollideVel.current.copy(currentLinVel.current)
          const intoSurfaceVel = relativeCollideVel.current.dot(accumulatedContactNormal.current)
          const normalSpeed = resolveBVHEcctrlCollisionNormalSpeed({
            averageDepth: avgDepth,
            deltaSeconds: delta,
            mode: collisionResponseModeState.current,
            pushBackDamping: collisionPushBackDamping,
            pushBackThreshold: collisionPushBackThreshold,
            restitution: Number(mesh.userData.restitution ?? 0.05),
            velocityIntoSurface: intoSurfaceVel,
          })
          currentLinVel.current.addScaledVector(accumulatedContactNormal.current, normalSpeed)
          const correctionDistance = resolveBVHEcctrlCollisionCorrectionDistance({
            averageDepth: avgDepth,
            maxCorrectionDistance: collisionDepenetrationMaxDistance,
            mode: collisionResponseModeState.current,
            skin: collisionSkin,
          })
          if (correctionDistance > 0 && characterGroupRef.current) {
            collisionCorrection.current
              .copy(accumulatedContactNormal.current)
              .multiplyScalar(correctionDistance)
            if (collisionCorrection.current.lengthSq() > 0) {
              characterGroupRef.current.position.add(collisionCorrection.current)
              characterSegment.current.start.add(collisionCorrection.current)
              characterSegment.current.end.add(collisionCorrection.current)
              characterBbox.current.translate(collisionCorrection.current)
              positionCorrected = true
            }
          }
        }

        return positionCorrected
      },
      [
        capsuleRadius,
        collisionDepenetrationMaxDistance,
        collisionPushBackDamping,
        collisionPushBackThreshold,
        collisionSkin,
      ],
    )

    const handleCollisionResponse = useCallback(
      (meshes: THREE.Mesh[], delta: number) => {
        let positionCorrected = false

        for (let iteration = 0; iteration < collisionCheckIteration; iteration += 1) {
          for (const mesh of meshes) {
            const meshCorrectedPosition = collisionCheck(mesh, mesh.matrixWorld, delta)
            positionCorrected = meshCorrectedPosition || positionCorrected
          }
        }

        return positionCorrected
      },
      [collisionCheck, collisionCheckIteration],
    )

    const floatingCheck = useCallback(
      (mesh: THREE.Mesh, originMatrix: THREE.Matrix4) => {
        if (!(mesh.visible && mesh.geometry.boundsTree) || mesh.userData.excludeFloatHit) return

        originMatrix.decompose(floatTempPos.current, floatTempQuat.current, floatTempScale.current)
        floatInvertMatrix.current.copy(originMatrix).invert()
        floatNormalInverseMatrix.current.getNormalMatrix(floatInvertMatrix.current)
        floatNormalMatrix.current.getNormalMatrix(originMatrix)

        localFloatSensorSegment.current
          .copy(floatSensorSegment.current)
          .applyMatrix4(floatInvertMatrix.current)
        localFloatSensorBboxExpendPoint.current
          .copy(floatSensorBboxExpendPoint.current)
          .applyMatrix4(floatInvertMatrix.current)

        scaledFloatRadiusVec.current.set(
          floatSensorRadius / floatTempScale.current.x,
          floatSensorRadius / floatTempScale.current.y,
          floatSensorRadius / floatTempScale.current.z,
        )

        localFloatSensorBbox.current
          .makeEmpty()
          .expandByPoint(localFloatSensorSegment.current.start)
          .expandByPoint(localFloatSensorBboxExpendPoint.current)
        localFloatSensorBbox.current.min.addScaledVector(scaledFloatRadiusVec.current, -1)
        localFloatSensorBbox.current.max.add(scaledFloatRadiusVec.current)

        localSupportHeight.current = Number.NEGATIVE_INFINITY
        localClosestPoint.current.set(
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
        )

        mesh.geometry.boundsTree.shapecast({
          intersectsBounds: (box) => box.intersectsBox(localFloatSensorBbox.current),
          intersectsTriangle: (tri) => {
            tri.closestPointToSegment(
              localFloatSensorSegment.current,
              triHitPoint.current,
              segHitPoint.current,
            )
            localUpAxis.current
              .copy(upAxis.current)
              .applyMatrix3(floatNormalInverseMatrix.current)
              .normalize()
            deltaHit.current.subVectors(triHitPoint.current, localFloatSensorSegment.current.start)
            deltaHit.current.divide(scaledFloatRadiusVec.current)

            const totalLengthSq = deltaHit.current.lengthSq()
            const dot = deltaHit.current.dot(localUpAxis.current)
            const verticalLength =
              -dot /
              ((capsuleRadius + currentFloatHeight.current + floatPullBackHeight) /
                floatSensorRadius)
            const horizontalLength = Math.sqrt(Math.max(0, totalLengthSq - dot * dot))

            if (dot <= 0 && horizontalLength < 1 && verticalLength < 1) {
              tri.getNormal(triNormal.current)
              triNormal.current.applyMatrix3(floatNormalMatrix.current).normalize()
              triHitPoint.current.applyMatrix4(originMatrix)

              const slopeAngle = triNormal.current.angleTo(upAxis.current)
              const candidateHeight = triHitPoint.current.dot(upAxis.current)
              if (
                slopeAngle < maxSlope &&
                candidateHeight > localSupportHeight.current &&
                isBVHEcctrlSupportCandidateEligible({
                  candidateHeight,
                  currentFootHeight: currentSemanticFootHeight.current,
                  grounded: locomotionState.current.grounded,
                  landingSkin,
                  maxStepHeight,
                  previousFootHeight:
                    previousSemanticFootHeight.current ?? currentSemanticFootHeight.current,
                  verticalVelocity: currentLinVel.current.dot(upAxis.current),
                })
              ) {
                localSupportHeight.current = candidateHeight
                localClosestPoint.current.copy(triHitPoint.current)
                localHitNormal.current.copy(triNormal.current)
              }
            }
          },
        })

        if (localSupportHeight.current > globalSupportHeight.current) {
          globalSupportHeight.current = localSupportHeight.current
          globalClosestPoint.current.copy(localClosestPoint.current)
          floatHitNormal.current.copy(localHitNormal.current)
        }
      },
      [capsuleRadius, floatPullBackHeight, floatSensorRadius, landingSkin, maxSlope, maxStepHeight],
    )

    const handleFloatingResponse = useCallback(
      (meshes: THREE.Mesh[]) => {
        const characterGroup = characterGroupRef.current
        if (!characterGroup) return
        const centerFromFoot = resolveBVHEcctrlCapsuleCenterFromFoot({
          capsuleLength: currentCapsuleLength.current,
          capsuleRadius,
          floatHeight: currentFloatHeight.current,
        })
        currentSemanticFootHeight.current =
          characterGroup.position.dot(upAxis.current) - centerFromFoot

        globalSupportHeight.current = Number.NEGATIVE_INFINITY
        globalClosestPoint.current.set(
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
          Number.POSITIVE_INFINITY,
        )
        floatHitNormal.current.set(0, 1, 0)
        totalPlatformDeltaPos.current.set(0, 0, 0)
        isOnMovingPlatform.current = false

        if (floatCheckType !== 'RAYCAST') {
          for (const mesh of meshes) {
            floatingCheck(mesh, mesh.matrixWorld)
          }
        }

        if (
          floatCheckType !== 'SHAPECAST' &&
          floatRaycastCandidates.length > 0 &&
          globalSupportHeight.current === Number.NEGATIVE_INFINITY
        ) {
          floatRaycaster.current.ray.origin.copy(floatSensorSegment.current.start)
          floatRaycaster.current.ray.direction.copy(gravityDir.current)
          const hits = floatRaycaster.current.intersectObjects(floatRaycastCandidates, false)
          for (const hit of hits) {
            if (!hit.point || !hit.face) continue
            triNormal.current
              .copy(hit.face.normal)
              .transformDirection(hit.object.matrixWorld)
              .normalize()
            const candidateHeight = hit.point.dot(upAxis.current)
            if (
              triNormal.current.angleTo(upAxis.current) >= maxSlope ||
              !isBVHEcctrlSupportCandidateEligible({
                candidateHeight,
                currentFootHeight: currentSemanticFootHeight.current,
                grounded: locomotionState.current.grounded,
                landingSkin,
                maxStepHeight,
                previousFootHeight:
                  previousSemanticFootHeight.current ?? currentSemanticFootHeight.current,
                verticalVelocity: currentLinVel.current.dot(upAxis.current),
              })
            ) {
              continue
            }
            globalSupportHeight.current = candidateHeight
            globalClosestPoint.current.copy(hit.point)
            floatHitNormal.current.copy(triNormal.current)
            break
          }
        }

        if (globalSupportHeight.current === Number.NEGATIVE_INFINITY) {
          currentSupportHeight.current = null
          setBVHEcctrlGrounded(locomotionState.current, false)
          return
        }

        characterGroup.position.addScaledVector(
          upAxis.current,
          globalSupportHeight.current - currentSemanticFootHeight.current,
        )
        const velocityIntoSupport = currentLinVel.current.dot(floatHitNormal.current)
        if (velocityIntoSupport < 0) {
          currentLinVel.current.addScaledVector(floatHitNormal.current, -velocityIntoSupport)
        }
        const downwardVelocity = currentLinVel.current.dot(upAxis.current)
        if (downwardVelocity < 0) {
          currentLinVel.current.addScaledVector(upAxis.current, -downwardVelocity)
        }
        currentSupportHeight.current = globalSupportHeight.current
        setBVHEcctrlGrounded(locomotionState.current, true)
      },
      [
        capsuleRadius,
        floatCheckType,
        floatRaycastCandidates,
        floatingCheck,
        landingSkin,
        maxSlope,
        maxStepHeight,
      ],
    )

    const updateCharacterWithPlatform = useCallback(() => {
      if (!characterGroupRef.current) return
      rotationDeltaPos.current.copy(totalPlatformDeltaPos.current)
      characterGroupRef.current.position.add(rotationDeltaPos.current)
      yawQuaternion.current.setFromUnitVectors(upAxis.current, floatHitNormal.current)
    }, [])

    const hasStandingClearance = useCallback(() => {
      const characterGroup = characterGroupRef.current
      if (
        !characterGroup ||
        (currentCapsuleLength.current >= capsuleLength && currentFloatHeight.current >= floatHeight)
      ) {
        return true
      }

      const currentCenterFromFoot = resolveBVHEcctrlCapsuleCenterFromFoot({
        capsuleLength: currentCapsuleLength.current,
        capsuleRadius,
        floatHeight: currentFloatHeight.current,
      })
      const standingCenterFromFoot = resolveBVHEcctrlCapsuleCenterFromFoot({
        capsuleLength,
        capsuleRadius,
        floatHeight,
      })
      stanceCharacterSegment.current.start
        .set(0, capsuleLength / 2, 0)
        .add(characterGroup.position)
        .addScaledVector(upAxis.current, standingCenterFromFoot - currentCenterFromFoot)
      stanceCharacterSegment.current.end
        .set(0, -capsuleLength / 2, 0)
        .add(characterGroup.position)
        .addScaledVector(upAxis.current, standingCenterFromFoot - currentCenterFromFoot)

      for (const mesh of colliderMeshes) {
        if (!(mesh.visible && mesh.geometry.boundsTree) || mesh.userData.excludeCollisionCheck) {
          continue
        }
        mesh.matrixWorld.decompose(
          stancePosition.current,
          stanceQuaternion.current,
          stanceScale.current,
        )
        stanceInvertMatrix.current.copy(mesh.matrixWorld).invert()
        stanceLocalSegment.current
          .copy(stanceCharacterSegment.current)
          .applyMatrix4(stanceInvertMatrix.current)
        const standingQueryRadius = capsuleRadius + Math.max(0, standingClearanceSkin)
        stanceRadius.current.set(
          standingQueryRadius / stanceScale.current.x,
          standingQueryRadius / stanceScale.current.y,
          standingQueryRadius / stanceScale.current.z,
        )
        stanceLocalBbox.current
          .makeEmpty()
          .expandByPoint(stanceLocalSegment.current.start)
          .expandByPoint(stanceLocalSegment.current.end)
        stanceLocalBbox.current.min.addScaledVector(stanceRadius.current, -1)
        stanceLocalBbox.current.max.add(stanceRadius.current)
        let blocked = false
        mesh.geometry.boundsTree.shapecast({
          intersectsBounds: (box) => box.intersectsBox(stanceLocalBbox.current),
          intersectsTriangle: (triangle) => {
            triangle.closestPointToSegment(
              stanceLocalSegment.current,
              stanceTrianglePoint.current,
              stanceCapsulePoint.current,
            )
            stanceTrianglePoint.current.sub(stanceCapsulePoint.current).divide(stanceRadius.current)
            if (stanceTrianglePoint.current.lengthSq() >= 1 - 1e-6) return false
            blocked = true
            return true
          },
        })
        if (blocked) return false
      }
      return true
    }, [capsuleLength, capsuleRadius, colliderMeshes, floatHeight, standingClearanceSkin])

    const resetLinVel = useCallback(() => currentLinVel.current.set(0, 0, 0), [])
    const addLinVel = useCallback(
      (velocity: THREE.Vector3) => currentLinVel.current.add(velocity),
      [],
    )
    const getLinVel = useCallback((target = new THREE.Vector3()) => {
      return target.copy(currentLinVel.current)
    }, [])
    const setLinVel = useCallback(
      (velocity: THREE.Vector3) => currentLinVel.current.copy(velocity),
      [],
    )
    const settlePresentationAtAuthoritativePose = useCallback(() => {
      const characterGroup = characterGroupRef.current
      if (!characterGroup) return false
      presentationPreviousPosition.current.copy(characterGroup.position)
      presentationCurrentPosition.current.copy(characterGroup.position)
      presentationPosition.current.copy(characterGroup.position)
      presentationPreviousSeconds.current = simulatedSecondsRef.current
      presentationCurrentSeconds.current = simulatedSecondsRef.current
      presentationSecondsRef.current = simulatedSecondsRef.current
      presentationAlphaRef.current = 1
      presentationPoseInitialized.current = true
      return true
    }, [])
    const setCrouching = useCallback(
      (nextCrouching: boolean, force = false) => {
        const characterGroup = characterGroupRef.current
        if (!characterGroup) return false
        const resolvedCrouching = force
          ? nextCrouching
          : resolveBVHEcctrlCrouchingState({
              crouching: crouchingState.current,
              crouchRequested: nextCrouching,
              stanceTransitionAllowed: locomotionState.current.grounded,
              standingClear:
                !nextCrouching && locomotionState.current.grounded ? hasStandingClearance() : false,
            })
        if (crouchingState.current === resolvedCrouching) return false

        const previousCenterFromFoot = resolveBVHEcctrlCapsuleCenterFromFoot({
          capsuleLength: currentCapsuleLength.current,
          capsuleRadius,
          floatHeight: currentFloatHeight.current,
        })
        const nextCapsuleLength = resolvedCrouching ? crouchingShape.capsuleLength : capsuleLength
        const nextFloatHeight = resolvedCrouching ? crouchingShape.floatHeight : floatHeight
        const nextCenterFromFoot = resolveBVHEcctrlCapsuleCenterFromFoot({
          capsuleLength: nextCapsuleLength,
          capsuleRadius,
          floatHeight: nextFloatHeight,
        })
        characterGroup.position.addScaledVector(
          upAxis.current,
          nextCenterFromFoot - previousCenterFromFoot,
        )
        currentCapsuleLength.current = nextCapsuleLength
        currentFloatHeight.current = nextFloatHeight
        crouchingState.current = resolvedCrouching
        locomotionState.current.jumpQueued = false
        idleTime.current = 0
        isSleeping.current = false
        settlePresentationAtAuthoritativePose()
        return true
      },
      [
        capsuleLength,
        capsuleRadius,
        crouchingShape,
        floatHeight,
        hasStandingClearance,
        settlePresentationAtAuthoritativePose,
      ],
    )
    const resetStance = useCallback(() => {
      crouchHeldState.current = false
      setCrouching(false, true)
    }, [setCrouching])
    const synchronizeExternallyChangedPose = useCallback(() => {
      const characterGroup = characterGroupRef.current
      if (!characterGroup) return false
      if (
        presentationPoseInitialized.current &&
        presentationCurrentPosition.current.equals(characterGroup.position)
      ) {
        return false
      }
      fixedStepAccumulator.current = 0
      currentSupportHeight.current = null
      previousSemanticFootHeight.current = null
      setBVHEcctrlGrounded(locomotionState.current, false)
      idleTime.current = 0
      isSleeping.current = false
      isOnMovingPlatform.current = false
      totalPlatformDeltaPos.current.set(0, 0, 0)
      return settlePresentationAtAuthoritativePose()
    }, [settlePresentationAtAuthoritativePose])
    const getPresentationPosition = useCallback(
      (target = new THREE.Vector3()) => {
        synchronizeExternallyChangedPose()
        return target.copy(presentationPosition.current)
      },
      [synchronizeExternallyChangedPose],
    )
    const setPaused = useCallback(
      (nextPaused: boolean) => {
        imperativePaused.current = nextPaused
        if (!nextPaused) return
        synchronizeExternallyChangedPose()
        fixedStepAccumulator.current = 0
        locomotionState.current.jumpQueued = false
        settlePresentationAtAuthoritativePose()
      },
      [settlePresentationAtAuthoritativePose, synchronizeExternallyChangedPose],
    )
    const setCollisionResponseMode = useCallback((mode: BVHEcctrlCollisionResponseMode) => {
      collisionResponseModeState.current = mode
    }, [])
    const setMovement = useCallback((movement: MovementInput) => {
      if (movement.forward !== undefined) forwardState.current = movement.forward
      if (movement.backward !== undefined) backwardState.current = movement.backward
      if (movement.leftward !== undefined) leftwardState.current = movement.leftward
      if (movement.rightward !== undefined) rightwardState.current = movement.rightward
      if (movement.joystick) joystickState.current.set(movement.joystick.x, movement.joystick.y)
      if ('worldDirection' in movement) {
        hasWorldDirectionState.current = movement.worldDirection != null
        if (movement.worldDirection) {
          worldDirectionState.current.set(movement.worldDirection.x, movement.worldDirection.z)
        } else {
          worldDirectionState.current.set(0, 0)
        }
      }
      if (movement.run !== undefined) runState.current = movement.run
      if (movement.jump !== undefined) jumpHeldState.current = movement.jump
      if (movement.crouch !== undefined) crouchHeldState.current = movement.crouch
      if (movement.speedScale !== undefined) {
        speedScaleState.current = clamp(movement.speedScale, 0, 1)
      } else if (movement.worldDirection === null) {
        speedScaleState.current = 1
      }
    }, [])
    const requestJump = useCallback(() => {
      if (crouchHeldState.current || crouchingState.current) return false
      return requestBVHEcctrlJump(locomotionState.current, maxAirJumps)
    }, [maxAirJumps])

    useImperativeHandle(
      ref,
      () => ({
        get canJump() {
          return (
            !crouchHeldState.current &&
            !crouchingState.current &&
            canRequestBVHEcctrlJump(locomotionState.current, maxAirJumps)
          )
        },
        get centerFromFoot() {
          return resolveBVHEcctrlCapsuleCenterFromFoot({
            capsuleLength: currentCapsuleLength.current,
            capsuleRadius,
            floatHeight: currentFloatHeight.current,
          })
        },
        get crouching() {
          return crouchingState.current
        },
        get group() {
          return characterGroupRef.current
        },
        get isGrounded() {
          return locomotionState.current.grounded
        },
        get jumpsUsed() {
          return locomotionState.current.jumpsUsed
        },
        get model() {
          return characterModelRef.current
        },
        get presentationAlpha() {
          synchronizeExternallyChangedPose()
          return presentationAlphaRef.current
        },
        get presentationSeconds() {
          synchronizeExternallyChangedPose()
          return presentationSecondsRef.current
        },
        get simulatedSeconds() {
          return simulatedSecondsRef.current
        },
        get supportHeight() {
          synchronizeExternallyChangedPose()
          return currentSupportHeight.current
        },
        getLinVel,
        getPresentationPosition,
        resetLinVel,
        addLinVel,
        requestJump,
        resetStance,
        setCollisionResponseMode,
        setPaused,
        setLinVel,
        setMovement,
      }),
      [
        addLinVel,
        getLinVel,
        getPresentationPosition,
        capsuleRadius,
        maxAirJumps,
        requestJump,
        resetStance,
        resetLinVel,
        setCollisionResponseMode,
        setLinVel,
        setMovement,
        setPaused,
        synchronizeExternallyChangedPose,
      ],
    )

    const updateDebugger = useCallback(() => {
      debugLineStart.current?.position.copy(characterSegment.current.start)
      debugLineEnd.current?.position.copy(characterSegment.current.end)
      debugRaySensorStart.current?.position.copy(floatSensorSegment.current.start)
      debugRaySensorEnd.current?.position.copy(floatSensorSegment.current.end)
      standPointRef.current?.position.copy(globalClosestPoint.current)
      if (characterGroupRef.current) {
        lookDirRef.current?.position
          .copy(characterGroupRef.current.position)
          .addScaledVector(upAxis.current, 0.7)
      }
      lookDirRef.current?.lookAt(lookDirRef.current.position.clone().add(camProjDir.current))
      inputDirRef.current?.position.copy(characterSegment.current.end)
      inputDirRef.current?.setDirection(inputDir.current)
      inputDirRef.current?.setLength(inputDir.current.lengthSq())
      moveDirRef.current?.position.copy(characterSegment.current.end)
      moveDirRef.current?.setDirection(currentLinVel.current)
      moveDirRef.current?.setLength(currentLinVel.current.length() / maxWalkSpeed)
    }, [maxWalkSpeed])

    useFrame((_, delta) => {
      elapsedRef.current += delta
      synchronizeExternallyChangedPose()
      if (paused || imperativePaused.current || elapsedRef.current < delay) {
        fixedStepAccumulator.current = 0
        settlePresentationAtAuthoritativePose()
        return
      }

      const keys = getKeys() ?? presetKeys
      const forward = forwardState.current || (keys.forward ?? false)
      const backward = backwardState.current || (keys.backward ?? false)
      const leftward = leftwardState.current || (keys.leftward ?? false)
      const rightward = rightwardState.current || (keys.rightward ?? false)
      const run = runState.current || (keys.run ?? false)
      const crouchPressed = crouchHeldState.current || (keys.crouch ?? false)
      setCrouching(crouchPressed)
      const jumpPressed =
        !crouchPressed && !crouchingState.current && (jumpHeldState.current || (keys.jump ?? false))
      if (jumpPressed && !previousJumpInputState.current) requestJump()
      previousJumpInputState.current = jumpPressed

      setInputDirection({
        forward,
        backward,
        leftward,
        rightward,
        joystick: joystickState.current,
        worldDirection: hasWorldDirectionState.current ? worldDirectionState.current : null,
      })
      const fixedSteps = resolveBVHEcctrlFixedSteps({
        accumulatedSeconds: fixedStepAccumulator.current,
        elapsedSeconds: delta * Math.max(0, slowMotionFactor),
      })
      fixedStepAccumulator.current = fixedSteps.remainderSeconds

      for (let step = 0; step < fixedSteps.steps; step += 1) {
        presentationPreviousPosition.current.copy(presentationCurrentPosition.current)
        presentationPreviousSeconds.current = presentationCurrentSeconds.current
        movingDir.current.copy(currentLinVel.current).normalize()
        currentLinVelOnPlane.current.copy(currentLinVel.current).projectOnPlane(upAxis.current)
        handleCharacterMovement(run, crouchingState.current, BVH_ECCTRL_FIXED_STEP_SECONDS)

        const jumpImpulse = consumeBVHEcctrlJump({
          airJumpVelocityMultiplier,
          jumpVelocity: jumpVel,
          maxAirJumps,
          state: locomotionState.current,
        })
        if (jumpImpulse) {
          currentLinVel.current.y = jumpImpulse.velocity
          isSleeping.current = false
        }
        const gravityAppliedBeforeIntegration = !locomotionState.current.grounded
        if (gravityAppliedBeforeIntegration) applyGravity(BVH_ECCTRL_FIXED_STEP_SECONDS * 0.5)

        checkCharacterSleep(
          jumpPressed || locomotionState.current.jumpQueued || jumpImpulse !== null,
          BVH_ECCTRL_FIXED_STEP_SECONDS,
        )
        if (!isSleeping.current) {
          characterGroupRef.current?.position.addScaledVector(
            currentLinVel.current,
            BVH_ECCTRL_FIXED_STEP_SECONDS,
          )
          runBVHEcctrlContactStep(
            colliderMeshes,
            BVH_ECCTRL_FIXED_STEP_SECONDS,
            updateSegmentBBox,
            handleFloatingResponse,
            handleCollisionResponse,
          )
          updateCharacterWithPlatform()
          if (!locomotionState.current.grounded) {
            applyGravity(
              BVH_ECCTRL_FIXED_STEP_SECONDS * (gravityAppliedBeforeIntegration ? 0.5 : 1),
            )
          }
          previousSemanticFootHeight.current = characterGroupRef.current
            ? characterGroupRef.current.position.dot(upAxis.current) -
              resolveBVHEcctrlCapsuleCenterFromFoot({
                capsuleLength: currentCapsuleLength.current,
                capsuleRadius,
                floatHeight: currentFloatHeight.current,
              })
            : null
        }
        simulatedSecondsRef.current += BVH_ECCTRL_FIXED_STEP_SECONDS
        if (characterGroupRef.current) {
          presentationCurrentPosition.current.copy(characterGroupRef.current.position)
        }
        presentationCurrentSeconds.current = simulatedSecondsRef.current
      }

      const presentationAlpha = resolveBVHEcctrlPresentationAlpha(fixedStepAccumulator.current)
      presentationAlphaRef.current = presentationAlpha
      presentationPosition.current.lerpVectors(
        presentationPreviousPosition.current,
        presentationCurrentPosition.current,
        presentationAlpha,
      )
      presentationSecondsRef.current = THREE.MathUtils.lerp(
        presentationPreviousSeconds.current,
        presentationCurrentSeconds.current,
        presentationAlpha,
      )

      if (debug) updateDebugger()
    })

    return (
      <Suspense fallback={null}>
        <group {...props} dispose={null} ref={characterGroupRef}>
          {debug && (
            <mesh ref={characterColliderRef}>
              <capsuleGeometry args={colliderCapsuleArgs} />
              <meshNormalMaterial wireframe />
            </mesh>
          )}
          <group name="BVHEcctrl-Model" ref={characterModelRef}>
            {children}
          </group>
        </group>

        {debug && (
          <group>
            <TransformControls object={characterGroupRef.current!} />
            <box3Helper args={[characterBbox.current]} />
            <mesh ref={debugLineStart}>
              <octahedronGeometry args={[0.05, 0]} />
              <meshNormalMaterial />
            </mesh>
            <mesh ref={debugLineEnd}>
              <octahedronGeometry args={[0.05, 0]} />
              <meshNormalMaterial />
            </mesh>
            <box3Helper args={[floatSensorBbox.current]} />
            <mesh ref={debugRaySensorStart}>
              <octahedronGeometry args={[0.1, 0]} />
              <meshBasicMaterial color="yellow" wireframe />
            </mesh>
            <mesh ref={debugRaySensorEnd}>
              <octahedronGeometry args={[0.1, 0]} />
              <meshBasicMaterial color="yellow" wireframe />
            </mesh>
            <mesh ref={lookDirRef} scale={[1, 0.5, 4]}>
              <octahedronGeometry args={[0.1, 0]} />
              <meshNormalMaterial />
            </mesh>
            <arrowHelper args={[undefined, undefined, undefined, '#00f']} ref={inputDirRef} />
            <arrowHelper args={[undefined, undefined, undefined, '#f00']} ref={moveDirRef} />
            <mesh ref={standPointRef}>
              <octahedronGeometry args={[0.12, 0]} />
              <meshBasicMaterial color="red" opacity={0.2} transparent />
            </mesh>
          </group>
        )}
      </Suspense>
    )
  },
)

BVHEcctrl.displayName = 'BVHEcctrl'

export default BVHEcctrl

'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useSearchParams } from 'next/navigation'
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { type Group, Quaternion, Vector3 } from 'three'
import { createLandrushRobotWeaponMuzzlePose } from './landrush-robot-weapon-rig'
import { WeaponFitSubject } from './weapon-fit-debug-rig'
import {
  createDefaultWeaponFitSettings,
  getWeaponFitDebugWeapon,
  isWeaponFitDebugWeaponId,
} from './weapon-fit-debug-state'
import { ZOMBIE_ESCAPE_WEAPON_PROFILES } from './zombie-escape-config'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'

const FORWARD = new Vector3(0, 0, 1)
const CAMERA_POSITION = new Vector3(2.8, 2.65, -0.75)
const CAMERA_TARGET = new Vector3(0, 2.35, -0.2)

export function ZombieWeaponRecoilDebugClient() {
  const searchParams = useSearchParams()
  const requestedWeaponId = searchParams.get('weapon')
  const weaponId = isWeaponFitDebugWeaponId(requestedWeaponId)
    ? requestedWeaponId
    : ZOMBIE_ESCAPE_WEAPON_CATALOG[0].id
  const weapon = getWeaponFitDebugWeapon(weaponId)
  const weaponIndex = ZOMBIE_ESCAPE_WEAPON_CATALOG.findIndex(({ id }) => id === weapon.id)
  const weaponProfile = ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]!
  const settings = useMemo(
    () => ({
      ...createDefaultWeaponFitSettings(),
      cameraBookmark: 'near' as const,
      gripMode: weapon.wield,
      weaponId,
    }),
    [weapon, weaponId],
  )
  const shotSequenceRef = useRef(0)
  const muzzlePoseRef = useRef(createLandrushRobotWeaponMuzzlePose())

  return (
    <main className="relative h-screen min-h-[480px] overflow-hidden bg-[#07101b] text-white">
      <Canvas
        camera={{ far: 30, fov: 36, near: 0.02, position: CAMERA_POSITION.toArray() }}
        dpr={[1, 1.5]}
        frameloop="always"
        gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
        shadows={false}
      >
        <color args={['#07101b']} attach="background" />
        <ambientLight intensity={0.78} />
        <hemisphereLight args={['#dbeafe', '#142238', 1.2]} />
        <directionalLight color="#fff4db" intensity={2.5} position={[3.4, 4.8, -3.2]} />
        <directionalLight color="#75d8ff" intensity={0.9} position={[-3, 2.4, 2]} />
        <mesh position={[0, 0.795, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[12, 12]} />
          <meshStandardMaterial color="#0d1c2a" metalness={0.02} roughness={0.94} />
        </mesh>
        <gridHelper args={[6, 48, '#2b7790', '#173448']} position={[0, 0.802, 0]} />
        <HeldTriggerDriver
          shotIntervalSeconds={weaponProfile.shotIntervalSeconds}
          shotSequenceRef={shotSequenceRef}
        />
        <Suspense fallback={<RecoilSubjectLoadingMarker />}>
          <WeaponFitSubject
            muzzlePoseRef={muzzlePoseRef}
            onAssetDiagnosticChange={ignoreAssetDiagnostic}
            onPoseDiagnosticChange={ignorePoseDiagnostic}
            settings={settings}
            shotSequenceRef={shotSequenceRef}
          />
        </Suspense>
        <HeldTriggerMuzzleFlash muzzlePoseRef={muzzlePoseRef} shotSequenceRef={shotSequenceRef} />
        <FixedRecoilCamera />
        <ManualRenderDriver />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-5">
        <div className="rounded-2xl border border-white/12 bg-slate-950/72 px-4 py-3 shadow-2xl backdrop-blur-md">
          <p className="font-black text-[10px] text-cyan-200 uppercase tracking-[0.28em]">
            Held-trigger recoil proof
          </p>
          <h1 className="mt-1 font-black text-xl">{weapon.displayName}</h1>
        </div>
        <div className="rounded-full border border-emerald-300/25 bg-emerald-950/70 px-4 py-2 font-bold text-[11px] text-emerald-100 uppercase tracking-[0.18em] shadow-xl backdrop-blur-md">
          Trigger held · {(1 / weaponProfile.shotIntervalSeconds).toFixed(1)} shots/s
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/68 px-4 py-2 text-[11px] text-white/72 shadow-xl backdrop-blur-md">
        Every flash is one production-rate shot impulse
      </div>
    </main>
  )
}

function HeldTriggerDriver({
  shotIntervalSeconds,
  shotSequenceRef,
}: {
  shotIntervalSeconds: number
  shotSequenceRef: React.MutableRefObject<number>
}) {
  const elapsedSecondsRef = useRef(0)
  useFrame((_, delta) => {
    elapsedSecondsRef.current += Math.max(0, delta)
    shotSequenceRef.current = Math.floor(elapsedSecondsRef.current / shotIntervalSeconds) + 1
  }, 0.5)
  return null
}

function RecoilSubjectLoadingMarker() {
  return (
    <mesh position={[0, 1.42, -0.24]}>
      <octahedronGeometry args={[0.16, 0]} />
      <meshBasicMaterial color="#ffb347" toneMapped={false} />
    </mesh>
  )
}

function HeldTriggerMuzzleFlash({
  muzzlePoseRef,
  shotSequenceRef,
}: {
  muzzlePoseRef: React.MutableRefObject<ReturnType<typeof createLandrushRobotWeaponMuzzlePose>>
  shotSequenceRef: React.MutableRefObject<number>
}) {
  const flashRef = useRef<Group>(null)
  const observedSequenceRef = useRef(0)
  const ageSecondsRef = useRef(Number.POSITIVE_INFINITY)
  const orientation = useMemo(() => new Quaternion(), [])
  useFrame((_, delta) => {
    const flash = flashRef.current
    const pose = muzzlePoseRef.current
    if (!flash) return
    if (observedSequenceRef.current !== shotSequenceRef.current) {
      observedSequenceRef.current = shotSequenceRef.current
      ageSecondsRef.current = 0
    } else {
      ageSecondsRef.current += Math.max(0, delta)
    }
    const envelope = Math.max(0, 1 - ageSecondsRef.current / 0.045)
    flash.visible = pose.ready && envelope > 0
    if (!flash.visible) return
    flash.position.copy(pose.position).addScaledVector(pose.direction, 0.045)
    orientation.setFromUnitVectors(FORWARD, pose.direction)
    flash.quaternion.copy(orientation)
    flash.scale.setScalar(0.72 + envelope * 0.65)
  }, 3)
  return (
    <group ref={flashRef} visible={false}>
      <mesh>
        <sphereGeometry args={[0.042, 10, 8]} />
        <meshBasicMaterial color="#fff4aa" depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.085]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.052, 0.17, 8]} />
        <meshBasicMaterial color="#ff9d3d" depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function FixedRecoilCamera() {
  const camera = useThree((state) => state.camera)
  useFrame(() => {
    camera.position.copy(CAMERA_POSITION)
    camera.lookAt(CAMERA_TARGET)
    camera.updateMatrixWorld(true)
  }, -40)
  useLayoutEffect(() => {
    camera.position.copy(CAMERA_POSITION)
    camera.lookAt(CAMERA_TARGET)
    camera.updateMatrixWorld(true)
  }, [camera])
  return null
}

function ManualRenderDriver() {
  useFrame(({ camera, gl, scene }) => {
    gl.render(scene, camera)
  }, 100)
  return null
}

function ignoreAssetDiagnostic() {}

function ignorePoseDiagnostic() {}

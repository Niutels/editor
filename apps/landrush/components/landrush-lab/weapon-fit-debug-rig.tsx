'use client'

import { LandrushWorldNode } from '@landrush/pascal-plugin'
import { LandrushRobot } from '@landrush/pascal-plugin/landrush-world/robot'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
  forwardRef,
  type MutableRefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import { Box3, type Group, Vector3 } from 'three'
import {
  createLandrushRobotWeaponCombatState,
  createLandrushRobotWeaponMuzzlePose,
  type LandrushRobotWeaponFitSnapshot,
  type LandrushRobotWeaponMuzzlePose,
  LandrushRobotWeaponRig,
} from './landrush-robot-weapon-rig'
import {
  getWeaponFitDebugWeapon,
  type WeaponArmDiagnostic,
  type WeaponAssetDiagnostic,
  type WeaponFitDebugDiagnostics,
  type WeaponFitDebugSettings,
  type WeaponFitDominantHand,
} from './weapon-fit-debug-state'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'

type WeaponFitSubjectProps = {
  muzzlePoseRef?: MutableRefObject<LandrushRobotWeaponMuzzlePose>
  onAssetDiagnosticChange: (asset: WeaponAssetDiagnostic) => void
  onPoseDiagnosticChange: (diagnostics: Pick<WeaponFitDebugDiagnostics, 'arms' | 'grips'>) => void
  playerGroundY?: number
  settings: WeaponFitDebugSettings
}

export const WeaponFitSubject = forwardRef<Group, WeaponFitSubjectProps>(function WeaponFitSubject(
  {
    muzzlePoseRef: externalMuzzlePoseRef,
    onAssetDiagnosticChange,
    onPoseDiagnosticChange,
    playerGroundY = 0.8,
    settings,
  },
  forwardedRef,
) {
  const subjectRef = useRef<Group>(null)
  const visualRootRef = useRef<Group | null>(null)
  const combatStateRef = useRef(createLandrushRobotWeaponCombatState())
  const internalMuzzlePoseRef = useRef(createLandrushRobotWeaponMuzzlePose())
  const muzzlePoseRef = externalMuzzlePoseRef ?? internalMuzzlePoseRef
  const weapon = getWeaponFitDebugWeapon(settings.weaponId)
  const weaponIndex = Math.max(
    0,
    ZOMBIE_ESCAPE_WEAPON_CATALOG.findIndex((candidate) => candidate.id === weapon.id),
  )
  const { scene } = useGLTF(weapon.assetPath)
  const node = useMemo(
    () =>
      LandrushWorldNode.parse({
        id: 'landrush-world_weapon-fit-debug-player',
        landrushMode: 'walk',
        name: 'Weapon fit Orbot',
        playerHeading: Math.PI,
        playerPosition: [0, playerGroundY, 0],
      }),
    [playerGroundY],
  )

  combatStateRef.current.aimAngle = Math.PI
  combatStateRef.current.recoil = 0
  combatStateRef.current.weaponIndex = weaponIndex

  useImperativeHandle(forwardedRef, () => subjectRef.current as Group, [])

  useEffect(() => {
    const bounds = new Box3().setFromObject(scene)
    const size = bounds.getSize(new Vector3())
    const longestAxis = Math.max(size.x, size.y, size.z, 0.000_1)
    onAssetDiagnosticChange({
      message: 'Loaded through the same cached GLB asset used by the mounted weapon.',
      normalizationScale: weapon.canonicalDimensionsMeters.lengthZ / longestAxis,
      sourceSize: size.toArray() as [number, number, number],
      status: 'loaded',
      url: weapon.assetPath,
    })
  }, [onAssetDiagnosticChange, scene, weapon])

  const handleFitSnapshot = useCallback(
    (snapshot: LandrushRobotWeaponFitSnapshot) => {
      const primarySide = settings.dominantHand
      const supportSide = oppositeHand(primarySide)
      const primaryReach =
        primarySide === 'right'
          ? { meters: snapshot.rightArmReachMeters, ratio: snapshot.rightArmReachRatio }
          : { meters: snapshot.leftArmReachMeters, ratio: snapshot.leftArmReachRatio }
      const supportReach =
        supportSide === 'right'
          ? { meters: snapshot.rightArmReachMeters, ratio: snapshot.rightArmReachRatio }
          : { meters: snapshot.leftArmReachMeters, ratio: snapshot.leftArmReachRatio }
      onPoseDiagnosticChange({
        arms: {
          dominant: createArmDiagnostic(primarySide, primaryReach.meters, primaryReach.ratio, true),
          support: createArmDiagnostic(
            supportSide,
            supportReach.meters,
            supportReach.ratio,
            settings.gripMode === 'two-hand',
          ),
        },
        grips: {
          catalogHasSecondary: weapon.grip.secondaryAnchorMeters !== null,
          primaryErrorMeters: snapshot.primaryErrorMeters,
          secondaryErrorMeters: snapshot.secondaryErrorMeters,
        },
      })
    },
    [onPoseDiagnosticChange, settings.dominantHand, settings.gripMode, weapon],
  )

  useFrame(() => {
    node.playerHeading = combatStateRef.current.aimAngle
    node.playerMoving = false
    node.playerSpeed = 0
  }, 1)

  return (
    <group ref={subjectRef}>
      <LandrushRobot framePriority={2} node={node} visualRootRef={visualRootRef} />
      <LandrushRobotWeaponRig
        combatStateRef={combatStateRef}
        debug={settings.showAxes || settings.showSkeleton}
        dominantHand={settings.dominantHand}
        fitAdjustment={{
          offset: [
            settings.transform.offsetX,
            settings.transform.offsetY,
            settings.transform.offsetZ,
          ],
          rotationDegrees: [
            settings.transform.rotationX,
            settings.transform.rotationY,
            settings.transform.rotationZ,
          ],
          scale: settings.transform.scale,
        }}
        framePriority={2.5}
        muzzlePoseRef={muzzlePoseRef}
        onFitSnapshot={handleFitSnapshot}
        supportHandEnabled={settings.gripMode === 'two-hand'}
        visualRootRef={visualRootRef}
      />
    </group>
  )
})

function createArmDiagnostic(
  side: WeaponFitDominantHand,
  reachMeters: number,
  reachRatio: number,
  activeGrip: boolean,
): WeaponArmDiagnostic {
  const safeRatio = Number.isFinite(reachRatio) ? Math.max(0, reachRatio) : 0
  return {
    activeGrip,
    elbowAngleDegrees: 0,
    fit: safeRatio > 1 ? 'overextended' : safeRatio > 0.92 ? 'near-limit' : 'good',
    maximumReachMeters: safeRatio > Number.EPSILON ? reachMeters / safeRatio : 0,
    reachMeters,
    reachRatio: safeRatio,
    side,
  }
}

function oppositeHand(hand: WeaponFitDominantHand): WeaponFitDominantHand {
  return hand === 'right' ? 'left' : 'right'
}

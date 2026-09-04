'use client'

import {
  ZOMBIE_ESCAPE_ARENA,
  ZOMBIE_ESCAPE_DEFAULT_WEAPON,
  ZOMBIE_ESCAPE_SIMULATION,
} from '@landrush/zombie-gameplay/zombie-escape-config'
import type { ZombieEscapeSimulation } from '@landrush/zombie-gameplay/zombie-escape-simulation'
import type { ZombieEscapeArenaData } from '@landrush/zombie-gameplay/zombie-escape-world'
import { useFrame } from '@react-three/fiber'
import { type MutableRefObject, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
  Object3D,
  Shape,
} from 'three'

export function ZombieEscapeArena({
  arena,
  simulationRef,
}: {
  arena: ZombieEscapeArenaData
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const landGeometry = useMemo(
    () => createZombieEscapeIslandGeometry(arena.shoreline, 1, 0.72),
    [arena.shoreline],
  )
  const sandGeometry = useMemo(
    () => createZombieEscapeIslandGeometry(arena.shoreline, 1.035, 0.44),
    [arena.shoreline],
  )
  const rockRef = useRef<InstancedMesh>(null)
  const trunkRef = useRef<InstancedMesh>(null)
  const canopyRef = useRef<InstancedMesh>(null)
  const grassRef = useRef<InstancedMesh>(null)
  const obstacleDebugRef = useRef<InstancedMesh>(null)
  const debugGroupRef = useRef<Group>(null)

  useLayoutEffect(() => {
    const dummy = new Object3D()
    for (const mesh of [
      rockRef.current,
      trunkRef.current,
      canopyRef.current,
      obstacleDebugRef.current,
    ]) {
      mesh?.instanceMatrix.setUsage(DynamicDrawUsage)
    }
    for (let index = 0; index < arena.obstacleCount; index += 1) {
      const x = arena.obstacleX[index]!
      const z = arena.obstacleZ[index]!
      const scale = arena.obstacleScale[index]!
      const radius = arena.obstacleRadius[index]!
      const tree = arena.obstacleKind[index] === 1

      applyStaticInstance(
        rockRef.current,
        index,
        dummy,
        x,
        tree ? -20 : 0.58 * scale,
        z,
        tree ? 0 : radius,
        tree ? 0 : 0.65 * scale,
        tree ? 0 : radius * 0.82,
        index * 1.91,
      )
      applyStaticInstance(
        trunkRef.current,
        index,
        dummy,
        x,
        tree ? 1.45 * scale : -20,
        z,
        tree ? 0.28 * scale : 0,
        tree ? 2.9 * scale : 0,
        tree ? 0.28 * scale : 0,
        index * 0.73,
      )
      applyStaticInstance(
        canopyRef.current,
        index,
        dummy,
        x,
        tree ? 3.1 * scale : -20,
        z,
        tree ? 1.25 * scale : 0,
        tree ? 1.4 * scale : 0,
        tree ? 1.25 * scale : 0,
        index * 0.73,
      )
      applyStaticInstance(
        obstacleDebugRef.current,
        index,
        dummy,
        x,
        0.08,
        z,
        radius,
        0.03,
        radius,
        0,
      )
    }
    for (const mesh of [
      rockRef.current,
      trunkRef.current,
      canopyRef.current,
      obstacleDebugRef.current,
    ]) {
      if (!mesh) continue
      mesh.count = arena.obstacleCount
      mesh.instanceMatrix.needsUpdate = true
    }

    const grass = grassRef.current
    if (grass) {
      grass.instanceMatrix.setUsage(DynamicDrawUsage)
      for (let index = 0; index < arena.decorationCount; index += 1) {
        const scale = arena.decorationScale[index]!
        applyStaticInstance(
          grass,
          index,
          dummy,
          arena.decorationX[index]!,
          0.12,
          arena.decorationZ[index]!,
          0.18 * scale,
          0.42 * scale,
          0.18 * scale,
          arena.decorationRotation[index]!,
        )
      }
      grass.count = arena.decorationCount
      grass.instanceMatrix.needsUpdate = true
    }
  }, [arena])

  useFrame(() => {
    if (debugGroupRef.current) {
      debugGroupRef.current.visible =
        simulationRef.current.debugMode === 'navigation' ||
        simulationRef.current.debugMode === 'pools'
    }
  }, -18)

  useEffect(
    () => () => {
      landGeometry.dispose()
      sandGeometry.dispose()
    },
    [landGeometry, sandGeometry],
  )

  return (
    <group>
      <mesh position={[0, -0.9, 0]} receiveShadow>
        <cylinderGeometry
          args={[ZOMBIE_ESCAPE_ARENA.waterRadius, ZOMBIE_ESCAPE_ARENA.waterRadius, 0.35, 72]}
        />
        <meshStandardMaterial color="#1687a4" metalness={0.05} roughness={0.3} />
      </mesh>
      <mesh geometry={sandGeometry} position={[0, -0.13, 0]} receiveShadow>
        <meshStandardMaterial color="#dcae63" flatShading roughness={0.94} />
      </mesh>
      <mesh geometry={landGeometry} position={[0, 0.03, 0]} receiveShadow>
        <meshStandardMaterial color="#6c9b55" flatShading roughness={0.98} />
      </mesh>

      <instancedMesh args={[undefined, undefined, arena.obstacleCount]} ref={rockRef}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#53666a" flatShading roughness={0.96} />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, arena.obstacleCount]} ref={trunkRef}>
        <cylinderGeometry args={[1, 1.25, 1, 7]} />
        <meshStandardMaterial color="#73513a" flatShading roughness={0.98} />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, arena.obstacleCount]} ref={canopyRef}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#3c7d50" flatShading roughness={0.95} />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, arena.decorationCount]} ref={grassRef}>
        <coneGeometry args={[1, 1, 5]} />
        <meshStandardMaterial color="#8ebb59" flatShading roughness={1} />
      </instancedMesh>

      <group ref={debugGroupRef}>
        <mesh position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[arena.playRadius - 0.08, arena.playRadius, 96]} />
          <meshBasicMaterial color="#5ee7ff" opacity={0.48} side={DoubleSide} transparent />
        </mesh>
        <instancedMesh args={[undefined, undefined, arena.obstacleCount]} ref={obstacleDebugRef}>
          <cylinderGeometry args={[1, 1, 1, 24, 1, true]} />
          <meshBasicMaterial color="#ffcc66" opacity={0.42} transparent wireframe />
        </instancedMesh>
      </group>

      <ZombieEscapeDock arena={arena} simulationRef={simulationRef} />
    </group>
  )
}

function ZombieEscapeDock({
  arena,
  simulationRef,
}: {
  arena: ZombieEscapeArenaData
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const beaconRef = useRef<Mesh>(null)
  const beaconMaterialRef = useRef<MeshBasicMaterial>(null)
  const boatRef = useRef<Group>(null)

  useFrame(() => {
    const simulation = simulationRef.current
    const beacon = beaconRef.current
    if (beacon) {
      beacon.visible = simulation.extractionOpen
      const pulse = 1 + Math.sin(simulation.elapsedSeconds * 5.4) * 0.12
      beacon.scale.setScalar(pulse)
      beacon.rotation.z = simulation.elapsedSeconds * 0.7
    }
    if (beaconMaterialRef.current) {
      beaconMaterialRef.current.opacity = simulation.extractionOpen
        ? 0.55 + Math.sin(simulation.elapsedSeconds * 5.4) * 0.2
        : 0
    }
    if (boatRef.current) {
      boatRef.current.position.y = -0.42 + Math.sin(simulation.elapsedSeconds * 1.4) * 0.08
      boatRef.current.rotation.z = Math.sin(simulation.elapsedSeconds * 1.1) * 0.025
    }
  }, -17)

  return (
    <group position={[arena.escapeX, 0, arena.escapeZ]}>
      {[-2, -1, 0, 1, 2, 3].map((offset) => (
        <mesh key={offset} position={[0, -0.03, offset * -1.05 - 1.4]}>
          <boxGeometry args={[2.6, 0.18, 0.82]} />
          <meshStandardMaterial color={offset % 2 === 0 ? '#9a6744' : '#87583a'} roughness={0.93} />
        </mesh>
      ))}
      <mesh ref={beaconRef} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[
            ZOMBIE_ESCAPE_SIMULATION.escapeRadius * 0.76,
            ZOMBIE_ESCAPE_SIMULATION.escapeRadius,
            48,
          ]}
        />
        <meshBasicMaterial
          color="#75f5ff"
          depthWrite={false}
          opacity={0}
          ref={beaconMaterialRef}
          side={DoubleSide}
          transparent
        />
      </mesh>
      <group
        position={[0, -0.42, -7.5]}
        ref={boatRef}
        userData={{
          futureWeaponAsset: ZOMBIE_ESCAPE_DEFAULT_WEAPON.assetPath,
          placeholder: 'procedural-extraction-skiff',
        }}
      >
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.72, 2.8, 4, 12]} />
          <meshStandardMaterial color="#eef5ed" roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.62, 0.35]}>
          <boxGeometry args={[1.2, 0.52, 1.25]} />
          <meshStandardMaterial color="#e68b45" roughness={0.82} />
        </mesh>
      </group>
    </group>
  )
}

function createZombieEscapeIslandGeometry(shoreline: Float32Array, scale: number, depth: number) {
  const shape = new Shape()
  const firstX = shoreline[0] ?? 0
  const firstZ = shoreline[1] ?? 0
  shape.moveTo(firstX * scale, firstZ * scale)
  for (let index = 2; index < shoreline.length; index += 2) {
    shape.lineTo((shoreline[index] ?? 0) * scale, (shoreline[index + 1] ?? 0) * scale)
  }
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.22,
    bevelThickness: 0.16,
    curveSegments: 1,
    depth,
    steps: 1,
  })
  geometry.rotateX(Math.PI / 2)
  geometry.computeVertexNormals()
  return geometry
}

function applyStaticInstance(
  mesh: InstancedMesh | null,
  index: number,
  dummy: Object3D,
  x: number,
  y: number,
  z: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  rotationY: number,
) {
  if (!mesh) return
  dummy.position.set(x, y, z)
  dummy.rotation.set(0, rotationY, 0)
  dummy.scale.set(scaleX, scaleY, scaleZ)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}

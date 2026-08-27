'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  IcosahedronGeometry,
  type InstancedMesh,
  LinearFilter,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  RingGeometry,
  SphereGeometry,
  TetrahedronGeometry,
  UnsignedByteType,
  Vector3,
} from 'three'
import {
  resolveZombieEscapeDeathDustEnvelope,
  resolveZombieEscapeDeathDustParticleSample,
  ZOMBIE_ESCAPE_DEATH_DUST,
  type ZombieEscapeDeathDustEnvelope,
  type ZombieEscapeDeathDustEventPool,
  type ZombieEscapeDeathDustParticleSample,
  type ZombieEscapeDeathDustVariant,
} from './zombie-escape-death-dust'

const Z_AXIS = new Vector3(0, 0, 1)

export function ZombieEscapeDeathDustPresentation({
  events,
  framePriority,
  getElapsedSeconds,
  variant,
}: {
  events: ZombieEscapeDeathDustEventPool
  framePriority: number
  getElapsedSeconds: () => number
  variant: ZombieEscapeDeathDustVariant
}) {
  const { camera } = useThree()
  const puffCapacity = events.pool.capacity * ZOMBIE_ESCAPE_DEATH_DUST.puffsPerEvent
  const ellipsoidCapacity = events.pool.capacity * ZOMBIE_ESCAPE_DEATH_DUST.ellipsoidsPerEvent
  const clodCapacity = events.pool.capacity * ZOMBIE_ESCAPE_DEATH_DUST.clodsPerEvent
  const puffRef = useRef<InstancedMesh>(null)
  const lowPolyRef = useRef<InstancedMesh>(null)
  const ellipsoidRef = useRef<InstancedMesh>(null)
  const flipbookRefs = useRef<Array<InstancedMesh | null>>(Array(8).fill(null))
  const ringRef = useRef<InstancedMesh>(null)
  const clodRef = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const billboardQuaternion = useMemo(() => new Quaternion(), [])
  const rollQuaternion = useMemo(() => new Quaternion(), [])
  const envelope = useMemo<ZombieEscapeDeathDustEnvelope>(
    () => ({ normalizedAge: 0, opacity: 0, outward: 0, rise: 0, scale: 0 }),
    [],
  )
  const sample = useMemo<ZombieEscapeDeathDustParticleSample>(
    () => ({ opacity: 0, rotation: 0, scale: 0, x: 0, y: 0, z: 0 }),
    [],
  )
  const puffGeometry = useMemo(() => new PlaneGeometry(1, 1), [])
  const ellipsoidGeometry = useMemo(() => new SphereGeometry(1, 14, 9), [])
  const flipbookGeometry = useMemo(() => new PlaneGeometry(1, 1), [])
  const lowPolyGeometry = useMemo(() => new IcosahedronGeometry(1, 1), [])
  const clodGeometry = useMemo(() => new TetrahedronGeometry(1, 0), [])
  const ringGeometry = useMemo(() => new RingGeometry(0.72, 1, 28), [])
  const alphaHashTexture = useMemo(createAlphaHashedDustTexture, [])
  const flipbookTextures = useMemo(createToonDustFlipbookTextures, [])
  const alphaHashMaterial = useMemo(() => {
    const material = new MeshBasicMaterial({
      color: '#ad8b5d',
      depthTest: true,
      depthWrite: true,
      map: alphaHashTexture,
      side: DoubleSide,
      transparent: false,
    })
    material.alphaHash = true
    return material
  }, [alphaHashTexture])
  const lowPolyMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#9d8058', roughness: 1 }),
    [],
  )
  const ellipsoidMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#9b7a50', depthWrite: true, roughness: 1 }),
    [],
  )
  const flipbookMaterials = useMemo(
    () =>
      flipbookTextures.map(
        (texture) =>
          new MeshBasicMaterial({
            alphaTest: 0.24,
            alphaToCoverage: true,
            color: '#b69869',
            depthTest: true,
            depthWrite: true,
            map: texture,
            side: DoubleSide,
            transparent: false,
          }),
      ),
    [flipbookTextures],
  )
  const flipbookFrameCounts = useMemo(
    () => new Uint16Array(flipbookTextures.length),
    [flipbookTextures],
  )
  const ringMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#8b704d', roughness: 1, side: DoubleSide }),
    [],
  )
  const clodMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#735b3d', roughness: 1 }),
    [],
  )

  useLayoutEffect(() => {
    for (const mesh of [
      puffRef.current,
      lowPolyRef.current,
      ellipsoidRef.current,
      ...flipbookRefs.current,
      ringRef.current,
      clodRef.current,
    ]) {
      mesh?.instanceMatrix.setUsage(DynamicDrawUsage)
      if (mesh) mesh.count = 0
    }
    return () => {
      puffGeometry.dispose()
      ellipsoidGeometry.dispose()
      flipbookGeometry.dispose()
      lowPolyGeometry.dispose()
      clodGeometry.dispose()
      ringGeometry.dispose()
      alphaHashTexture.dispose()
      for (const texture of flipbookTextures) texture.dispose()
      alphaHashMaterial.dispose()
      lowPolyMaterial.dispose()
      ellipsoidMaterial.dispose()
      for (const material of flipbookMaterials) material.dispose()
      ringMaterial.dispose()
      clodMaterial.dispose()
    }
  }, [
    alphaHashMaterial,
    alphaHashTexture,
    clodGeometry,
    clodMaterial,
    ellipsoidGeometry,
    ellipsoidMaterial,
    flipbookGeometry,
    flipbookMaterials,
    flipbookTextures,
    lowPolyGeometry,
    lowPolyMaterial,
    puffGeometry,
    ringGeometry,
    ringMaterial,
  ])

  useFrame(() => {
    const elapsedSeconds = getElapsedSeconds()
    billboardQuaternion.copy(camera.quaternion)
    if (variant === 'alpha-hash-puffs') {
      updateBillboardDust({
        billboardQuaternion,
        dummy,
        events,
        mesh: puffRef.current,
        particleCount: ZOMBIE_ESCAPE_DEATH_DUST.puffsPerEvent,
        rollQuaternion,
        sample,
        elapsedSeconds,
        envelope,
        scaleX: 1.28,
        scaleY: 0.9,
      })
      return
    }
    if (variant === 'low-poly-puffs') {
      updateLowPolyDust({
        dummy,
        elapsedSeconds,
        envelope,
        events,
        mesh: lowPolyRef.current,
        sample,
      })
      return
    }
    if (variant === 'ellipsoid-impostors') {
      updateEllipsoidDust({
        dummy,
        elapsedSeconds,
        envelope,
        events,
        mesh: ellipsoidRef.current,
        sample,
      })
      return
    }
    if (variant === 'toon-flipbook') {
      updateFlipbookDust({
        billboardQuaternion,
        dummy,
        elapsedSeconds,
        envelope,
        events,
        frameCounts: flipbookFrameCounts,
        meshes: flipbookRefs.current,
        rollQuaternion,
        sample,
      })
      return
    }
    updateGroundClodDust({
      clodMesh: clodRef.current,
      dummy,
      elapsedSeconds,
      envelope,
      events,
      ringMesh: ringRef.current,
      sample,
    })
  }, framePriority)

  return (
    <group
      userData={{
        allocation: 'fixed-death-event-and-instanced-particle-pools',
        deathDustVariant: variant,
        deterministicMotion: true,
      }}
    >
      {variant === 'alpha-hash-puffs' ? (
        <instancedMesh
          args={[puffGeometry, alphaHashMaterial, puffCapacity]}
          frustumCulled={false}
          ref={puffRef}
        />
      ) : null}
      {variant === 'low-poly-puffs' ? (
        <instancedMesh
          args={[lowPolyGeometry, lowPolyMaterial, puffCapacity]}
          frustumCulled={false}
          ref={lowPolyRef}
        />
      ) : null}
      {variant === 'ellipsoid-impostors' ? (
        <instancedMesh
          args={[ellipsoidGeometry, ellipsoidMaterial, ellipsoidCapacity]}
          frustumCulled={false}
          ref={ellipsoidRef}
        />
      ) : null}
      {variant === 'toon-flipbook'
        ? flipbookMaterials.map((material, frame) => (
            <instancedMesh
              args={[flipbookGeometry, material, puffCapacity]}
              frustumCulled={false}
              key={frame}
              ref={(mesh) => {
                flipbookRefs.current[frame] = mesh
              }}
            />
          ))
        : null}
      {variant === 'ground-clods' ? (
        <>
          <instancedMesh
            args={[ringGeometry, ringMaterial, events.pool.capacity]}
            frustumCulled={false}
            ref={ringRef}
          />
          <instancedMesh
            args={[clodGeometry, clodMaterial, clodCapacity]}
            frustumCulled={false}
            ref={clodRef}
          />
        </>
      ) : null}
    </group>
  )
}

function updateBillboardDust({
  billboardQuaternion,
  dummy,
  elapsedSeconds,
  envelope,
  events,
  mesh,
  particleCount,
  rollQuaternion,
  sample,
  scaleX,
  scaleY,
}: {
  billboardQuaternion: Quaternion
  dummy: Object3D
  elapsedSeconds: number
  envelope: ZombieEscapeDeathDustEnvelope
  events: ZombieEscapeDeathDustEventPool
  mesh: InstancedMesh | null
  particleCount: number
  rollQuaternion: Quaternion
  sample: ZombieEscapeDeathDustParticleSample
  scaleX: number
  scaleY: number
}) {
  if (!mesh) return
  let activeCount = 0
  for (let eventSlot = 0; eventSlot < events.pool.capacity; eventSlot += 1) {
    const active = events.pool.active[eventSlot] !== 0
    if (!active) continue
    const age = elapsedSeconds - (events.spawnElapsedSeconds[eventSlot] ?? 0)
    for (let particle = 0; particle < particleCount; particle += 1) {
      if (
        !resolveZombieEscapeDeathDustParticleSample(
          events,
          eventSlot,
          particle,
          age,
          envelope,
          sample,
        )
      ) {
        continue
      }
      const fadeScale = Math.sqrt(sample.opacity)
      rollQuaternion.setFromAxisAngle(Z_AXIS, sample.rotation)
      dummy.position.set(sample.x, sample.y, sample.z)
      dummy.quaternion.copy(billboardQuaternion).multiply(rollQuaternion)
      dummy.scale.set(sample.scale * scaleX * fadeScale, sample.scale * scaleY * fadeScale, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(activeCount, dummy.matrix)
      activeCount += 1
    }
  }
  mesh.count = activeCount
  if (activeCount > 0) mesh.instanceMatrix.needsUpdate = true
}

function updateEllipsoidDust({
  dummy,
  elapsedSeconds,
  envelope,
  events,
  mesh,
  sample,
}: {
  dummy: Object3D
  elapsedSeconds: number
  envelope: ZombieEscapeDeathDustEnvelope
  events: ZombieEscapeDeathDustEventPool
  mesh: InstancedMesh | null
  sample: ZombieEscapeDeathDustParticleSample
}) {
  if (!mesh) return
  const particleCount = ZOMBIE_ESCAPE_DEATH_DUST.ellipsoidsPerEvent
  let activeCount = 0
  for (let eventSlot = 0; eventSlot < events.pool.capacity; eventSlot += 1) {
    const active = events.pool.active[eventSlot] !== 0
    if (!active) continue
    const age = elapsedSeconds - (events.spawnElapsedSeconds[eventSlot] ?? 0)
    for (let particle = 0; particle < particleCount; particle += 1) {
      if (
        !resolveZombieEscapeDeathDustParticleSample(
          events,
          eventSlot,
          particle,
          age,
          envelope,
          sample,
        )
      ) {
        continue
      }
      const scale = sample.scale * envelope.scale * (0.52 + sample.opacity * 0.48)
      dummy.position.set(sample.x, sample.y, sample.z)
      dummy.rotation.set(sample.rotation * 0.19, sample.rotation * 0.43, sample.rotation * 0.11)
      dummy.scale.set(scale * 1.22, scale * 0.78, scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(activeCount, dummy.matrix)
      activeCount += 1
    }
  }
  mesh.count = activeCount
  if (activeCount > 0) mesh.instanceMatrix.needsUpdate = true
}

function updateLowPolyDust({
  dummy,
  elapsedSeconds,
  envelope,
  events,
  mesh,
  sample,
}: {
  dummy: Object3D
  elapsedSeconds: number
  envelope: ZombieEscapeDeathDustEnvelope
  events: ZombieEscapeDeathDustEventPool
  mesh: InstancedMesh | null
  sample: ZombieEscapeDeathDustParticleSample
}) {
  if (!mesh) return
  const particleCount = ZOMBIE_ESCAPE_DEATH_DUST.puffsPerEvent
  let activeCount = 0
  for (let eventSlot = 0; eventSlot < events.pool.capacity; eventSlot += 1) {
    const active = events.pool.active[eventSlot] !== 0
    if (!active) continue
    const age = elapsedSeconds - (events.spawnElapsedSeconds[eventSlot] ?? 0)
    for (let particle = 0; particle < particleCount; particle += 1) {
      if (
        !resolveZombieEscapeDeathDustParticleSample(
          events,
          eventSlot,
          particle,
          age,
          envelope,
          sample,
        )
      ) {
        continue
      }
      const scale = sample.scale * envelope.scale * (0.46 + sample.opacity * 0.54)
      dummy.position.set(sample.x, sample.y, sample.z)
      dummy.rotation.set(sample.rotation * 0.37, sample.rotation, sample.rotation * 0.19)
      dummy.scale.set(scale, scale * 0.74, scale * 0.91)
      dummy.updateMatrix()
      mesh.setMatrixAt(activeCount, dummy.matrix)
      activeCount += 1
    }
  }
  mesh.count = activeCount
  if (activeCount > 0) mesh.instanceMatrix.needsUpdate = true
}

function updateFlipbookDust({
  billboardQuaternion,
  dummy,
  elapsedSeconds,
  envelope,
  events,
  frameCounts,
  meshes,
  rollQuaternion,
  sample,
}: {
  billboardQuaternion: Quaternion
  dummy: Object3D
  elapsedSeconds: number
  envelope: ZombieEscapeDeathDustEnvelope
  events: ZombieEscapeDeathDustEventPool
  frameCounts: Uint16Array
  meshes: readonly (InstancedMesh | null)[]
  rollQuaternion: Quaternion
  sample: ZombieEscapeDeathDustParticleSample
}) {
  frameCounts.fill(0)
  const particleCount = ZOMBIE_ESCAPE_DEATH_DUST.puffsPerEvent
  for (let eventSlot = 0; eventSlot < events.pool.capacity; eventSlot += 1) {
    const active = events.pool.active[eventSlot] !== 0
    if (!active) continue
    const age = elapsedSeconds - (events.spawnElapsedSeconds[eventSlot] ?? 0)
    if (!resolveZombieEscapeDeathDustEnvelope(age, envelope)) continue
    const selectedFrame = Math.min(
      meshes.length - 1,
      Math.floor(envelope.normalizedAge * meshes.length),
    )
    const mesh = meshes[selectedFrame]
    if (!mesh) continue
    for (let particle = 0; particle < particleCount; particle += 1) {
      if (
        !resolveZombieEscapeDeathDustParticleSample(
          events,
          eventSlot,
          particle,
          age,
          envelope,
          sample,
        )
      ) {
        continue
      }
      rollQuaternion.setFromAxisAngle(Z_AXIS, sample.rotation)
      dummy.position.set(sample.x, sample.y, sample.z)
      dummy.quaternion.copy(billboardQuaternion).multiply(rollQuaternion)
      dummy.scale.set(sample.scale * envelope.scale * 1.34, sample.scale * envelope.scale, 1)
      dummy.updateMatrix()
      const activeCount = frameCounts[selectedFrame] ?? 0
      mesh.setMatrixAt(activeCount, dummy.matrix)
      frameCounts[selectedFrame] = activeCount + 1
    }
  }
  for (let frame = 0; frame < meshes.length; frame += 1) {
    const mesh = meshes[frame]
    if (!mesh) continue
    const activeCount = frameCounts[frame] ?? 0
    mesh.count = activeCount
    if (activeCount > 0) mesh.instanceMatrix.needsUpdate = true
  }
}

function updateGroundClodDust({
  clodMesh,
  dummy,
  elapsedSeconds,
  envelope,
  events,
  ringMesh,
  sample,
}: {
  clodMesh: InstancedMesh | null
  dummy: Object3D
  elapsedSeconds: number
  envelope: ZombieEscapeDeathDustEnvelope
  events: ZombieEscapeDeathDustEventPool
  ringMesh: InstancedMesh | null
  sample: ZombieEscapeDeathDustParticleSample
}) {
  if (!(clodMesh && ringMesh)) return
  const particleCount = ZOMBIE_ESCAPE_DEATH_DUST.clodsPerEvent
  let activeClodCount = 0
  let activeRingCount = 0
  for (let eventSlot = 0; eventSlot < events.pool.capacity; eventSlot += 1) {
    const active = events.pool.active[eventSlot] !== 0
    if (!active) continue
    const age = elapsedSeconds - (events.spawnElapsedSeconds[eventSlot] ?? 0)
    const envelopeActive = active && resolveZombieEscapeDeathDustEnvelope(age, envelope)
    if (envelopeActive && envelope.normalizedAge < 0.64) {
      dummy.position.set(
        events.originX[eventSlot] ?? 0,
        (events.groundY[eventSlot] ?? 0) + 0.025,
        events.originZ[eventSlot] ?? 0,
      )
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      const ringFade = Math.sqrt(1 - smoothstep(0.42, 0.64, envelope.normalizedAge))
      const ringScale = (0.16 + envelope.outward * 1.58) * ringFade
      dummy.scale.setScalar(ringScale)
      dummy.updateMatrix()
      ringMesh.setMatrixAt(activeRingCount, dummy.matrix)
      activeRingCount += 1
    }
    for (let particle = 0; particle < particleCount; particle += 1) {
      if (
        !envelopeActive ||
        !resolveZombieEscapeDeathDustParticleSample(
          events,
          eventSlot,
          particle,
          age,
          envelope,
          sample,
        )
      ) {
        continue
      }
      const ballisticLift =
        Math.sin(envelope.normalizedAge * Math.PI) * (0.22 + (particle % 4) * 0.055)
      const scale = sample.scale * envelope.scale * 0.26 * (0.45 + sample.opacity * 0.55)
      const groundY = events.groundY[eventSlot] ?? 0
      dummy.position.set(sample.x, groundY + (sample.y - groundY) * 0.32 + ballisticLift, sample.z)
      dummy.rotation.set(sample.rotation, sample.rotation * 0.63, sample.rotation * 0.31)
      dummy.scale.set(scale * 0.74, scale * 1.32, scale * 0.74)
      dummy.updateMatrix()
      clodMesh.setMatrixAt(activeClodCount, dummy.matrix)
      activeClodCount += 1
    }
  }
  ringMesh.count = activeRingCount
  clodMesh.count = activeClodCount
  if (activeRingCount > 0) ringMesh.instanceMatrix.needsUpdate = true
  if (activeClodCount > 0) clodMesh.instanceMatrix.needsUpdate = true
}

function createAlphaHashedDustTexture() {
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = ((x + 0.5) / size) * 2 - 1
      const v = ((y + 0.5) / size) * 2 - 1
      const angle = Math.atan2(v, u)
      const lobeRadius = 0.78 + Math.sin(angle * 5 + 0.7) * 0.12 + Math.sin(angle * 9) * 0.07
      const radial = 1 - smoothstep(lobeRadius * 0.5, lobeRadius, Math.hypot(u, v))
      const breakup = 0.78 + hashDustTexel(x, y) * 0.22
      const alpha = Math.round(255 * Math.max(0, Math.min(1, radial * breakup)))
      const index = (y * size + x) * 4
      data[index] = 255
      data[index + 1] = 255
      data[index + 2] = 255
      data[index + 3] = alpha
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  texture.generateMipmaps = false
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

function hashDustTexel(x: number, y: number) {
  let value = Math.imul(x + 1, 0x45d9_f3b) ^ Math.imul(y + 1, 0x119d_e1f3)
  value = Math.imul(value ^ (value >>> 16), 0x45d9_f3b)
  value ^= value >>> 16
  return (value >>> 0) / 4_294_967_296
}

function createToonDustFlipbookTextures() {
  const frameSize = 48
  const frameCount = 8
  const textures: DataTexture[] = []
  for (let frame = 0; frame < frameCount; frame += 1) {
    const data = new Uint8Array(frameSize * frameSize * 4)
    const progress = frame / (frameCount - 1)
    const primaryRadius = 0.2 + progress * 0.3
    for (let y = 0; y < frameSize; y += 1) {
      for (let x = 0; x < frameSize; x += 1) {
        const u = ((x + 0.5) / frameSize) * 2 - 1
        const v = ((y + 0.5) / frameSize) * 2 - 1
        let density = 0
        for (let lobe = 0; lobe < 6; lobe += 1) {
          const angle = (lobe / 6) * Math.PI * 2 + progress * 0.38
          const orbit = progress * (0.12 + (lobe % 2) * 0.055)
          const centerX = Math.cos(angle) * orbit
          const centerY = Math.sin(angle) * orbit + progress * 0.04
          const radius = primaryRadius * (0.72 + (lobe % 3) * 0.12)
          const distance = Math.hypot(u - centerX, v - centerY)
          density = Math.max(density, 1 - smoothstep(radius * 0.58, radius, distance))
        }
        const index = (y * frameSize + x) * 4
        const value = Math.round(255 * Math.max(0, Math.min(1, density)))
        data[index] = 184
        data[index + 1] = 151
        data[index + 2] = 103
        data[index + 3] = value
      }
    }
    const texture = new DataTexture(data, frameSize, frameSize, RGBAFormat, UnsignedByteType)
    texture.generateMipmaps = false
    texture.magFilter = LinearFilter
    texture.minFilter = LinearFilter
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.needsUpdate = true
    textures.push(texture)
  }
  return textures
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return progress * progress * (3 - progress * 2)
}

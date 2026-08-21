'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { type MutableRefObject, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  type AnimationClip,
  AnimationMixer,
  Box3,
  Color,
  Euler,
  Group,
  LoopRepeat,
  type Material,
  type Mesh,
  Vector3,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { ZombieEscapeQuality } from './zombie-escape-config'
import { resolveZombieEscapeHitFlickerPhase } from './zombie-escape-hit-flicker'
import {
  createZombieEscapePresentationPose,
  resolveZombieEscapePresentationPose,
} from './zombie-escape-presentation-pose'
import type { ZombieEscapeSimulation } from './zombie-escape-simulation'
import {
  registerZombieEscapeImpactVisual,
  type ZombieEscapeImpactVisualRegistry,
} from './zombie-escape-skinned-impact-attachment'
import {
  ZOMBIE_ESCAPE_WEAPON_CATALOG,
  type ZombieEscapeWeaponSpecification,
} from './zombie-escape-weapon-catalog'
import {
  ZOMBIE_ESCAPE_ZOMBIE_CATALOG,
  type ZombieEscapeZombieCatalogEntry,
} from './zombie-escape-zombie-catalog'

type GeneratedZombieVisual = {
  animationRoot: Group
  generation: number
  hitMaterials: Array<{
    baseColor: Color | null
    baseEmissive: Color
    baseEmissiveIntensity: number
    material: Material & { color?: Color; emissive: Color; emissiveIntensity: number }
  }>
  mixer: AnimationMixer
  ownedMaterials: Material[]
  root: Group
  runAction: ReturnType<AnimationMixer['clipAction']> | null
  unregisterImpactVisual: () => void
  walkAction: ReturnType<AnimationMixer['clipAction']> | null
}

const ZOMBIE_HIT_BLACK = new Color('#030104')
const ZOMBIE_HIT_RED = new Color('#ff1738')

export function ZombieEscapeGeneratedAssets({
  impactVisualRegistry,
  loadedZombieVariantsRef,
  omitHeldWeapon = false,
  quality,
  simulationRef,
  zombiePresentationFramePriority,
}: {
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  loadedZombieVariantsRef: MutableRefObject<Set<number>>
  omitHeldWeapon?: boolean
  quality: ZombieEscapeQuality
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  zombiePresentationFramePriority?: number
}) {
  return (
    <>
      <ZombieEscapeGeneratedWeapons omitHeldWeapon={omitHeldWeapon} simulationRef={simulationRef} />
      {quality === 'balanced' ? (
        <ZombieEscapeGeneratedZombies
          impactVisualRegistry={impactVisualRegistry}
          loadedZombieVariantsRef={loadedZombieVariantsRef}
          simulationRef={simulationRef}
          zombiePresentationFramePriority={zombiePresentationFramePriority}
        />
      ) : null}
    </>
  )
}

function ZombieEscapeGeneratedWeapons({
  omitHeldWeapon,
  simulationRef,
}: {
  omitHeldWeapon: boolean
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  return (
    <group userData={{ generatedWeaponCount: ZOMBIE_ESCAPE_WEAPON_CATALOG.length }}>
      {omitHeldWeapon
        ? null
        : ZOMBIE_ESCAPE_WEAPON_CATALOG.map((weapon, weaponIndex) => (
            <GeneratedHeldWeapon
              key={`held-${weapon.id}`}
              simulationRef={simulationRef}
              weapon={weapon}
              weaponIndex={weaponIndex}
            />
          ))}
      {ZOMBIE_ESCAPE_WEAPON_CATALOG.map((weapon, weaponIndex) => (
        <GeneratedWeaponPickup
          key={`pickup-${weapon.id}`}
          simulationRef={simulationRef}
          weapon={weapon}
          weaponIndex={weaponIndex}
        />
      ))}
    </group>
  )
}

function GeneratedHeldWeapon({
  simulationRef,
  weapon,
  weaponIndex,
}: {
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  weapon: ZombieEscapeWeaponSpecification
  weaponIndex: number
}) {
  const rootRef = useRef<Group>(null)

  useFrame(() => {
    const root = rootRef.current
    if (!root) return
    const player = simulationRef.current.player
    root.visible = player.weaponIndex === weaponIndex
    root.position.set(player.x, 0, player.z)
    root.rotation.y = player.aimAngle
  }, -19)

  return (
    <group ref={rootRef}>
      <group position={[0.52, 1.12, 0.43]} scale={weapon.wield === 'one-hand' ? 1.45 : 1.12}>
        <GeneratedWeaponModel weapon={weapon} />
      </group>
    </group>
  )
}

function GeneratedWeaponPickup({
  simulationRef,
  weapon,
  weaponIndex,
}: {
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  weapon: ZombieEscapeWeaponSpecification
  weaponIndex: number
}) {
  const rootRef = useRef<Group>(null)
  const markerRef = useRef<Group>(null)

  useFrame((_, delta) => {
    const marker = markerRef.current
    if (!marker) return
    const simulation = simulationRef.current
    const pickup = simulation.weaponPickups.find(
      (candidate) => candidate.weaponIndex === weaponIndex,
    )
    marker.visible = Boolean(pickup) && simulation.purchasedWeapons[weaponIndex] === 0
    if (!(pickup && marker.visible)) return

    const nearbyPickup = simulation.weaponPickups[simulation.nearbyPickupIndex]
    const selected = nearbyPickup?.weaponIndex === weaponIndex
    marker.position.set(pickup.x, pickup.y + 0.04, pickup.z)
    marker.scale.setScalar(selected ? 1.18 : 1)
    if (rootRef.current) rootRef.current.rotation.y += Math.min(0.05, delta) * 0.7
  }, -18)

  return (
    <group ref={markerRef} visible={false}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.62, 0.76, 0.22, 16]} />
        <meshStandardMaterial color="#1d5261" metalness={0.24} roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.64, 24]} />
        <meshBasicMaterial color="#7ef7ff" toneMapped={false} />
      </mesh>
      <group position={[0, 0.62, 0]} ref={rootRef} rotation={[0.12, 0, 0]} scale={1.65}>
        <GeneratedWeaponModel weapon={weapon} />
      </group>
    </group>
  )
}

export function GeneratedWeaponModel({ weapon }: { weapon: ZombieEscapeWeaponSpecification }) {
  const gltf = useGLTF(weapon.assetPath)
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  const transform = useMemo(() => computeWeaponTransform(gltf.scene, weapon), [gltf.scene, weapon])

  useEffect(() => {
    model.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = false
      mesh.receiveShadow = false
    })
  }, [model])

  return (
    <group rotation={transform.rotation} scale={transform.scale}>
      <primitive object={model} position={transform.offset} />
    </group>
  )
}

function ZombieEscapeGeneratedZombies({
  impactVisualRegistry,
  loadedZombieVariantsRef,
  simulationRef,
  zombiePresentationFramePriority,
}: {
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  loadedZombieVariantsRef: MutableRefObject<Set<number>>
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  zombiePresentationFramePriority?: number
}) {
  const requestedVariantMaskRef = useRef(0)
  const [requestedVariantIndices, setRequestedVariantIndices] = useState<readonly number[]>([])

  useFrame(() => {
    const zombies = simulationRef.current.zombies
    let requestedMask = requestedVariantMaskRef.current
    for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
      if (zombies.pool.active[slot] === 0) continue
      requestedMask |= 1 << zombies.variant[slot]!
    }
    if (requestedMask === requestedVariantMaskRef.current) return
    requestedVariantMaskRef.current = requestedMask
    const indices: number[] = []
    for (let index = 0; index < ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length; index += 1) {
      if ((requestedMask & (1 << index)) !== 0) indices.push(index)
    }
    setRequestedVariantIndices(indices)
  }, -21)

  return (
    <group
      userData={{
        generatedZombieVariantCapacity: ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length,
        loading: 'on-first-spawn',
      }}
    >
      {requestedVariantIndices.map((variantIndex) => {
        const zombie = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[variantIndex]
        if (!zombie) return null
        return (
          <Suspense fallback={null} key={zombie.id}>
            <GeneratedZombieVariant
              framePriority={zombiePresentationFramePriority ?? -17}
              impactVisualRegistry={impactVisualRegistry}
              loadedZombieVariantsRef={loadedZombieVariantsRef}
              simulationRef={simulationRef}
              variantIndex={variantIndex}
              zombie={zombie}
            />
          </Suspense>
        )
      })}
    </group>
  )
}

function GeneratedZombieVariant({
  framePriority,
  impactVisualRegistry,
  loadedZombieVariantsRef,
  simulationRef,
  variantIndex,
  zombie,
}: {
  framePriority: number
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  loadedZombieVariantsRef: MutableRefObject<Set<number>>
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  variantIndex: number
  zombie: ZombieEscapeZombieCatalogEntry
}) {
  const runGltf = useGLTF(zombie.glb.run.path)
  const walkGltf = useGLTF(zombie.glb.walk.path)
  const groupRef = useRef<Group>(null)
  const visualsRef = useRef(new Map<number, GeneratedZombieVisual>())
  const presentationPose = useMemo(() => createZombieEscapePresentationPose(), [])
  const modelTransform = useMemo(
    () => computeZombieTransform(runGltf.scene, zombie.characterHeightMeters),
    [runGltf.scene, zombie.characterHeightMeters],
  )
  const runClip = useMemo(
    () => runGltf.animations.find((clip) => clip.name === zombie.glb.run.expectedClipName) ?? null,
    [runGltf.animations, zombie.glb.run.expectedClipName],
  )
  const walkClip = useMemo(
    () =>
      walkGltf.animations.find((clip) => clip.name === zombie.glb.walk.expectedClipName) ?? null,
    [walkGltf.animations, zombie.glb.walk.expectedClipName],
  )

  useEffect(() => {
    loadedZombieVariantsRef.current.add(variantIndex)
    return () => {
      loadedZombieVariantsRef.current.delete(variantIndex)
      for (const visual of visualsRef.current.values())
        releaseZombieVisual(visual, groupRef.current)
      visualsRef.current.clear()
    }
  }, [loadedZombieVariantsRef, variantIndex])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return
    const simulation = simulationRef.current
    const zombies = simulation.zombies
    const visuals = visualsRef.current

    for (const [slot, visual] of visuals) {
      if (
        zombies.pool.active[slot] !== 0 &&
        zombies.pool.generation[slot] === visual.generation &&
        zombies.variant[slot] === variantIndex
      ) {
        continue
      }
      releaseZombieVisual(visual, group)
      visuals.delete(slot)
    }

    for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
      if (zombies.pool.active[slot] === 0 || zombies.variant[slot] !== variantIndex) continue
      let visual = visuals.get(slot)
      if (!visual) {
        visual = createZombieVisual({
          group,
          generation: zombies.pool.generation[slot] ?? 0,
          impactVisualRegistry,
          modelTransform,
          runClip,
          source: runGltf.scene,
          slot,
          walkClip,
        })
        visuals.set(slot, visual)
      }
      resolveZombieEscapePresentationPose(
        zombies.x[slot] ?? 0,
        0,
        zombies.z[slot] ?? 0,
        zombies.heading[slot] ?? 0,
        zombies.hitReaction[slot] ?? 0,
        zombies.hitImpulseX[slot] ?? 0,
        zombies.hitImpulseY[slot] ?? 0,
        zombies.hitImpulseZ[slot] ?? 0,
        presentationPose,
      )
      visual.root.position.set(presentationPose.x, presentationPose.y, presentationPose.z)
      visual.root.quaternion.set(
        presentationPose.quaternionX,
        presentationPose.quaternionY,
        presentationPose.quaternionZ,
        presentationPose.quaternionW,
      )
      const hitPhase = resolveZombieEscapeHitFlickerPhase(zombies.hitFlash[slot] ?? 0)
      for (const materialState of visual.hitMaterials) {
        if (hitPhase === 'none') {
          if (materialState.baseColor && materialState.material.color) {
            materialState.material.color.copy(materialState.baseColor)
          }
          materialState.material.emissive.copy(materialState.baseEmissive)
          materialState.material.emissiveIntensity = materialState.baseEmissiveIntensity
          continue
        }
        const hitColor = hitPhase === 'red' ? ZOMBIE_HIT_RED : ZOMBIE_HIT_BLACK
        materialState.material.color?.copy(hitColor)
        materialState.material.emissive.copy(hitColor)
        materialState.material.emissiveIntensity = hitPhase === 'red' ? 3.6 : 0
      }
      const runBlend = zombies.runBlend[slot] ?? 0
      visual.walkAction?.setEffectiveWeight(1 - runBlend)
      visual.walkAction?.setEffectiveTimeScale(0.82 + (zombies.speedScale[slot] ?? 1) * 0.18)
      visual.runAction?.setEffectiveWeight(runBlend)
      visual.runAction?.setEffectiveTimeScale(0.9 + runBlend * 0.35)
      visual.mixer.update(simulation.paused ? 0 : Math.min(0.05, Math.max(0, delta)))
    }
  }, framePriority)

  return <group ref={groupRef} userData={{ zombieAssetId: zombie.id }} />
}

function createZombieVisual({
  group,
  generation,
  impactVisualRegistry,
  modelTransform,
  runClip,
  source,
  slot,
  walkClip,
}: {
  group: Group
  generation: number
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  modelTransform: ReturnType<typeof computeZombieTransform>
  runClip: AnimationClip | null
  source: Group
  slot: number
  walkClip: AnimationClip | null
}) {
  const visualRoot = cloneSkeleton(source) as Group
  const hitMaterials: GeneratedZombieVisual['hitMaterials'] = []
  const ownedMaterials: Material[] = []
  visualRoot.position.copy(modelTransform.offset)
  visualRoot.scale.setScalar(modelTransform.scale)
  visualRoot.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const clonedMaterials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(
      (sourceMaterial) => {
        const material = sourceMaterial.clone()
        ownedMaterials.push(material)
        const flashable = material as Material & {
          color?: Color
          emissive?: Color
          emissiveIntensity?: number
        }
        if (flashable.emissive instanceof Color) {
          hitMaterials.push({
            baseColor: flashable.color instanceof Color ? flashable.color.clone() : null,
            baseEmissive: flashable.emissive.clone(),
            baseEmissiveIntensity: flashable.emissiveIntensity ?? 1,
            material: flashable as Material & {
              color?: Color
              emissive: Color
              emissiveIntensity: number
            },
          })
        }
        return material
      },
    )
    mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0]!
    mesh.castShadow = false
    mesh.frustumCulled = false
    mesh.receiveShadow = false
  })
  const root = new Group()
  root.add(visualRoot)
  group.add(root)
  const mixer = new AnimationMixer(visualRoot)
  const walkAction = walkClip ? mixer.clipAction(walkClip, visualRoot) : null
  const runAction = runClip ? mixer.clipAction(runClip, visualRoot) : null
  for (const action of [walkAction, runAction]) {
    action?.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
    action?.play()
  }
  return {
    animationRoot: visualRoot,
    generation,
    hitMaterials,
    mixer,
    ownedMaterials,
    root,
    runAction,
    unregisterImpactVisual: registerZombieEscapeImpactVisual(
      impactVisualRegistry,
      slot,
      generation,
      visualRoot,
    ),
    walkAction,
  }
}

function releaseZombieVisual(visual: GeneratedZombieVisual, group: Group | null) {
  visual.unregisterImpactVisual()
  visual.mixer.stopAllAction()
  visual.mixer.uncacheRoot(visual.animationRoot)
  for (const material of visual.ownedMaterials) material.dispose()
  group?.remove(visual.root)
}

export function computeWeaponTransform(source: Group, weapon: ZombieEscapeWeaponSpecification) {
  const bounds = new Box3().setFromObject(source)
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  if (size.x >= size.y && size.x >= size.z) {
    return {
      offset: center.multiplyScalar(-1),
      rotation: new Euler(0, Math.PI / 2, 0),
      scale: weapon.canonicalDimensionsMeters.lengthZ / Math.max(0.000_1, size.x),
    }
  }
  if (size.y >= size.z) {
    return {
      offset: center.multiplyScalar(-1),
      rotation: new Euler(Math.PI / 2, 0, 0),
      scale: weapon.canonicalDimensionsMeters.lengthZ / Math.max(0.000_1, size.y),
    }
  }
  return {
    offset: center.multiplyScalar(-1),
    rotation: new Euler(),
    scale: weapon.canonicalDimensionsMeters.lengthZ / Math.max(0.000_1, size.z),
  }
}

function computeZombieTransform(source: Group, characterHeightMeters: number) {
  const bounds = new Box3().setFromObject(source)
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const scale = characterHeightMeters / Math.max(0.000_1, size.y)
  return {
    offset: new Vector3(-center.x * scale, -bounds.min.y * scale, -center.z * scale),
    scale,
  }
}

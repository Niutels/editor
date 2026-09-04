'use client'

import type { ZombieEscapeWeaponSpecification } from '@landrush/zombie-gameplay/zombie-escape-weapon-catalog'
import { useEffect, useState } from 'react'
import {
  Box3,
  type BufferGeometry,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { WeaponAssetDiagnostic } from './weapon-fit-debug-state'

type LoadedWeapon = {
  normalizationScale: number
  root: Object3D
  sourceCenter: Vector3
  sourceRotation: readonly [number, number, number]
}

export function CatalogWeaponAsset({
  onDiagnosticChange,
  weapon,
}: {
  onDiagnosticChange: (diagnostic: WeaponAssetDiagnostic) => void
  weapon: ZombieEscapeWeaponSpecification
}) {
  const [loaded, setLoaded] = useState<LoadedWeapon | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'fallback'>('loading')

  useEffect(() => {
    let cancelled = false
    let ownedRoot: Object3D | null = null
    setLoaded(null)
    setLoadState('loading')
    onDiagnosticChange({
      message: 'Requesting catalog GLB; placeholder remains visible until ready.',
      normalizationScale: null,
      sourceSize: null,
      status: 'loading',
      url: weapon.assetPath,
    })

    const loader = new GLTFLoader()
    loader.load(
      weapon.assetPath,
      (gltf) => {
        const root = gltf.scene
        if (cancelled) {
          disposeObjectResources(root)
          return
        }
        const sourceBounds = new Box3().setFromObject(root)
        const sourceSize = sourceBounds.getSize(new Vector3())
        const sourceCenter = sourceBounds.getCenter(new Vector3())
        const sourceFrame = getSourceLongitudinalFrame(sourceSize)
        if (sourceBounds.isEmpty() || sourceFrame.length <= 1e-6) {
          disposeObjectResources(root)
          setLoadState('fallback')
          onDiagnosticChange({
            message: 'GLB contained no usable longitudinal bounds; deterministic fallback active.',
            normalizationScale: null,
            sourceSize: null,
            status: 'fallback',
            url: weapon.assetPath,
          })
          return
        }

        root.traverse((object) => {
          const mesh = object as Mesh
          if (!mesh.isMesh) return
          mesh.castShadow = false
          mesh.receiveShadow = false
        })
        const normalizationScale = weapon.canonicalDimensionsMeters.lengthZ / sourceFrame.length
        ownedRoot = root
        setLoaded({
          normalizationScale,
          root,
          sourceCenter,
          sourceRotation: sourceFrame.rotation,
        })
        onDiagnosticChange({
          message: `Catalog GLB loaded; source ${sourceFrame.axis.toUpperCase()} extent aligned to +Z and normalized to canonical length.`,
          normalizationScale,
          sourceSize: sourceSize.toArray() as [number, number, number],
          status: 'loaded',
          url: weapon.assetPath,
        })
      },
      undefined,
      (error) => {
        if (cancelled) return
        setLoadState('fallback')
        onDiagnosticChange({
          message: `${describeLoadError(error)} Deterministic safety-orange fallback active.`,
          normalizationScale: null,
          sourceSize: null,
          status: 'fallback',
          url: weapon.assetPath,
        })
      },
    )

    return () => {
      cancelled = true
      if (ownedRoot) disposeObjectResources(ownedRoot)
    }
  }, [onDiagnosticChange, weapon])

  if (!loaded) return <WeaponPlaceholder state={loadState} weapon={weapon} />

  return (
    <group rotation={loaded.sourceRotation} scale={loaded.normalizationScale}>
      <primitive
        object={loaded.root}
        position={loaded.sourceCenter.clone().multiplyScalar(-1).toArray()}
      />
    </group>
  )
}

function getSourceLongitudinalFrame(sourceSize: Vector3): {
  axis: 'x' | 'y' | 'z'
  length: number
  rotation: readonly [number, number, number]
} {
  if (sourceSize.x >= sourceSize.y && sourceSize.x >= sourceSize.z) {
    return { axis: 'x', length: sourceSize.x, rotation: [0, Math.PI / 2, 0] }
  }
  if (sourceSize.y >= sourceSize.z) {
    return { axis: 'y', length: sourceSize.y, rotation: [Math.PI / 2, 0, 0] }
  }
  return { axis: 'z', length: sourceSize.z, rotation: [0, 0, 0] }
}

function WeaponPlaceholder({
  state,
  weapon,
}: {
  state: 'loading' | 'fallback'
  weapon: ZombieEscapeWeaponSpecification
}) {
  const { heightY: height, lengthZ: length, widthX: width } = weapon.canonicalDimensionsMeters
  const primary = weapon.grip.primaryAnchorMeters
  const isCompact = weapon.wield === 'one-hand'
  const isBroad = width / length > 0.22
  const bodyColor = state === 'fallback' ? '#f59e0b' : '#5c7188'
  const accentColor = state === 'fallback' ? '#22d3ee' : '#8da2b7'
  const opacity = state === 'fallback' ? 1 : 0.38

  return (
    <group>
      <mesh position={[0, height * 0.08, isCompact ? 0.025 : -length * 0.02]}>
        <boxGeometry
          args={[
            width * (isBroad ? 0.92 : 0.78),
            height * (isCompact ? 0.32 : 0.38),
            length * (isCompact ? 0.62 : 0.48),
          ]}
        />
        <meshStandardMaterial
          color={bodyColor}
          opacity={opacity}
          roughness={0.62}
          transparent={opacity < 1}
        />
      </mesh>
      <mesh
        position={[0, height * 0.12, length * (isCompact ? 0.32 : 0.29)]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry
          args={[
            width * (isBroad ? 0.39 : 0.22),
            width * (isBroad ? 0.44 : 0.26),
            length * (isCompact ? 0.35 : 0.54),
            12,
          ]}
        />
        <meshStandardMaterial
          color={accentColor}
          opacity={opacity}
          roughness={0.48}
          transparent={opacity < 1}
        />
      </mesh>
      <mesh
        position={[primary[0], primary[1] - height * 0.11, primary[2]]}
        rotation={[-0.18, 0, 0]}
      >
        <boxGeometry args={[width * 0.5, height * 0.38, Math.max(0.055, length * 0.1)]} />
        <meshStandardMaterial color="#233044" opacity={opacity} transparent={opacity < 1} />
      </mesh>
      {!isCompact ? (
        <mesh position={[0, height * 0.01, -length * 0.37]}>
          <boxGeometry args={[width * 0.72, height * 0.48, length * 0.23]} />
          <meshStandardMaterial color="#36465b" opacity={opacity} transparent={opacity < 1} />
        </mesh>
      ) : null}
      <mesh position={weapon.muzzle.anchorMeters} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[Math.max(0.018, width * 0.24), width * 0.06, 6, 16]} />
        <meshBasicMaterial color={state === 'fallback' ? '#fb7185' : '#9fb4c7'} />
      </mesh>
      <mesh>
        <boxGeometry args={[width, height, length]} />
        <meshBasicMaterial
          color={state === 'fallback' ? '#fbbf24' : '#64748b'}
          opacity={state === 'fallback' ? 0.28 : 0.18}
          transparent
          wireframe
        />
      </mesh>
    </group>
  )
}

function describeLoadError(error: unknown): string {
  const status = (error as { target?: { status?: number } })?.target?.status
  if (typeof status === 'number' && status > 0) return `GLB request returned HTTP ${status}.`
  if (error instanceof Error && error.message) return `GLB load failed: ${error.message}.`
  return 'GLB is not present at the catalog URL.'
}

function disposeObjectResources(root: Object3D) {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()

  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    if (mesh.geometry) geometries.add(mesh.geometry)
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of meshMaterials) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && 'isTexture' in value) {
          textures.add(value as Texture)
        }
      }
    }
  })

  for (const texture of textures) texture.dispose()
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
}

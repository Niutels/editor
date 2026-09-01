'use client'

import { useGpuResourceLifetime } from '@pascal-app/viewer'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  type BufferGeometry,
  Color,
  DodecahedronGeometry,
  Euler,
  Float32BufferAttribute,
  type InstancedMesh,
  Matrix4,
  Quaternion,
  StaticDrawUsage,
  Vector3,
} from 'three'
import {
  LANDRUSH_ISLAND_ROCK_CLUSTER_BUDGET,
  type LandrushIslandRockClusterLayout,
  type LandrushIslandRockPlacement,
} from './landrush-island-rock-cluster-layout'
import {
  createProceduralRockMaterial,
  createProceduralRockToonGradientTexture,
} from './procedural-rock-material'

const CLIFF_ROCK_PALETTE = [new Color('#8d5148'), new Color('#c16e50'), new Color('#e99a6d')]

export function LandrushIslandRockClusterLayer({
  layout,
  renderOrder = 11,
}: {
  layout: LandrushIslandRockClusterLayout
  renderOrder?: number
}) {
  const geometries = useMemo(
    () =>
      Array.from({ length: LANDRUSH_ISLAND_ROCK_CLUSTER_BUDGET.variants }, (_, variant) =>
        createLandrushIslandRockVariantGeometry(variant),
      ),
    [],
  )
  const toonGradient = useMemo(createProceduralRockToonGradientTexture, [])
  const material = useMemo(
    () => createProceduralRockMaterial('final', toonGradient),
    [toonGradient],
  )
  const rocksByVariant = useMemo(
    () =>
      Array.from({ length: LANDRUSH_ISLAND_ROCK_CLUSTER_BUDGET.variants }, (_, variant) =>
        layout.rocks.filter((rock) => rock.variant === variant),
      ),
    [layout.rocks],
  )

  useGpuResourceLifetime(geometries[0])
  useGpuResourceLifetime(geometries[1])
  useGpuResourceLifetime(geometries[2])
  useGpuResourceLifetime(toonGradient)
  useGpuResourceLifetime(material)

  if (layout.rocks.length === 0) return null

  return (
    <group
      name="landrush-island-instanced-rock-clusters"
      userData={{
        deterministicSeed: layout.seed,
        drawCallBudget: LANDRUSH_ISLAND_ROCK_CLUSTER_BUDGET.maximumDrawCalls,
        placementScan: 'setup-only',
      }}
    >
      {rocksByVariant.map((rocks, variant) => (
        <LandrushIslandRockVariantInstances
          geometry={geometries[variant]!}
          key={`rock-variant-${variant}`}
          material={material}
          renderOrder={renderOrder}
          rocks={rocks}
          variant={variant}
        />
      ))}
    </group>
  )
}

function LandrushIslandRockVariantInstances({
  geometry,
  material,
  renderOrder,
  rocks,
  variant,
}: {
  geometry: BufferGeometry
  material: ReturnType<typeof createProceduralRockMaterial>
  renderOrder: number
  rocks: readonly LandrushIslandRockPlacement[]
  variant: number
}) {
  const meshRef = useRef<InstancedMesh>(null)
  const matrices = useMemo(() => rocks.map(createRockInstanceMatrix), [rocks])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.instanceMatrix.setUsage(StaticDrawUsage)
    mesh.count = matrices.length
    for (let index = 0; index < matrices.length; index += 1) {
      mesh.setMatrixAt(index, matrices[index]!)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [matrices])

  if (rocks.length === 0) return null

  return (
    <instancedMesh
      args={[geometry, material, rocks.length]}
      castShadow
      frustumCulled={false}
      name={`landrush-island-rock-cluster-variant-${variant}`}
      receiveShadow
      ref={meshRef}
      renderOrder={renderOrder}
    />
  )
}

function createRockInstanceMatrix(rock: LandrushIslandRockPlacement) {
  return new Matrix4().compose(
    new Vector3(...rock.position),
    new Quaternion().setFromEuler(new Euler(...rock.rotation)),
    new Vector3(...rock.scale),
  )
}

function createLandrushIslandRockVariantGeometry(variant: number) {
  const source = new DodecahedronGeometry(1, 0)
  const geometry = source.index ? source.toNonIndexed() : source
  if (geometry !== source) source.dispose()
  const positions = geometry.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  const position = new Vector3()
  const color = new Color()

  for (let index = 0; index < positions.count; index += 1) {
    position.fromBufferAttribute(positions, index)
    const directionalVariation =
      1 +
      Math.sin(position.x * 4.71 + position.y * 3.19 + position.z * 5.23 + variant * 2.17) * 0.065
    const crownBias = 1 + Math.max(0, position.y) * (0.04 + variant * 0.015)
    position.x *= directionalVariation * (0.94 + variant * 0.035)
    position.y *= directionalVariation * crownBias
    position.z *= directionalVariation * (1.04 - variant * 0.02)
    positions.setXYZ(index, position.x, position.y, position.z)

    const heightRatio = clamp01(position.y * 0.42 + 0.5)
    const palettePosition = heightRatio * (CLIFF_ROCK_PALETTE.length - 1)
    const lowerIndex = Math.min(Math.floor(palettePosition), CLIFF_ROCK_PALETTE.length - 2)
    color
      .copy(CLIFF_ROCK_PALETTE[lowerIndex]!)
      .lerp(CLIFF_ROCK_PALETTE[lowerIndex + 1]!, palettePosition - lowerIndex)
    colors[index * 3] = color.r
    colors[index * 3 + 1] = color.g
    colors[index * 3 + 2] = color.b
  }

  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.name = `landrush-island-cliff-language-rock-variant-${variant}`
  geometry.userData.landrushIslandRockCluster = {
    sourceLanguage: 'procedural-rock-cliffs',
    trianglesPerInstance: LANDRUSH_ISLAND_ROCK_CLUSTER_BUDGET.trianglesPerInstance,
    variant,
  }
  return geometry
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

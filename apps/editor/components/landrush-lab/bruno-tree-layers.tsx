// @ts-nocheck -- Adapted from Bruno Simon folio-2025 foliage/tree source; see packages/nodes/src/landrush-world/BRUNO_SIMON_LICENSE.md.
'use client'

import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { getMaterialRendererBackend } from '@pascal-app/viewer'
import { type RefObject, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  DoubleSide,
  type InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Spherical,
  type Texture,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { float } from 'three/tsl'
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import type { LandrushTree } from '@/components/landrush/types'
import { measureLandrushFrameSlice } from './frame-load-profiler'
import type { GrassBladeTuning } from './grass-material'
import { createLandrushRobotScreenRevealOpacityNode } from './robot-screen-reveal-mask'

export type BrunoTreeReference = {
  elevation: number
  tree: LandrushTree
}

type BrunoTreeKind = LandrushTree['kind']

type TreeStyle = {
  assetPath: string
  body: string
  modelScale: number
}

type TreeVisual = {
  bodyGeometry: BufferGeometry | null
  leafMatrices: readonly Matrix4[]
}

type FoliageBillboard = {
  color: Color
  position: Vector3
  roll: number
  scale: number
}

const BRUNO_FOLIAGE_TEXTURE_PATH = '/landrush-lab/bruno-foliage/foliageSDF.png'
const BRUNO_TREE_ASSET_BASE = '/landrush-lab/bruno-trees'
const FOLIAGE_PLANE_COUNT = 80
const FALLBACK_FOLIAGE_COLOR = new Color(0.47, 0.62, 0.28)

const TREE_STYLES: Record<BrunoTreeKind, TreeStyle> = {
  canopy: {
    assetPath: `${BRUNO_TREE_ASSET_BASE}/oakTreesVisual.glb`,
    body: '#5f4228',
    modelScale: 0.48,
  },
  flowering: {
    assetPath: `${BRUNO_TREE_ASSET_BASE}/cherryTreesVisual.glb`,
    body: '#63452b',
    modelScale: 0.48,
  },
  pine: {
    assetPath: `${BRUNO_TREE_ASSET_BASE}/birchTreesVisual.glb`,
    body: '#5f4228',
    modelScale: 0.48,
  },
}

export function BrunoTreeLayer({
  colorTexture,
  fieldSize,
  references,
  tuning,
}: {
  colorTexture: Texture
  fieldSize: number
  references: readonly BrunoTreeReference[]
  tuning: GrassBladeTuning
}) {
  const canopyBodyRef = useRef<InstancedMesh>(null)
  const floweringBodyRef = useRef<InstancedMesh>(null)
  const pineBodyRef = useRef<InstancedMesh>(null)
  const canopyLeavesRef = useRef<InstancedMesh>(null)
  const floweringLeavesRef = useRef<InstancedMesh>(null)
  const pineLeavesRef = useRef<InstancedMesh>(null)
  const foliageTexture = useTexture(BRUNO_FOLIAGE_TEXTURE_PATH) as Texture
  configureBrunoFoliageTexture(foliageTexture)

  const canopyVisual = useBrunoTreeVisual(TREE_STYLES.canopy.assetPath)
  const floweringVisual = useBrunoTreeVisual(TREE_STYLES.flowering.assetPath)
  const pineVisual = useBrunoTreeVisual(TREE_STYLES.pine.assetPath)
  const foliageGeometries = useMemo(() => {
    const random = createRandom('foliage')
    return {
      pine: createBrunoFoliageGeometry(random),
      canopy: createBrunoFoliageGeometry(random),
      flowering: createBrunoFoliageGeometry(random),
    }
  }, [])
  const treeGroups = useMemo(() => groupTreeReferences(references), [references])
  const bodyMatrices = useMemo(
    () => ({
      canopy: treeGroups.canopy.map((reference) =>
        createTreeModelMatrix(reference, TREE_STYLES.canopy),
      ),
      flowering: treeGroups.flowering.map((reference) =>
        createTreeModelMatrix(reference, TREE_STYLES.flowering),
      ),
      pine: treeGroups.pine.map((reference) => createTreeModelMatrix(reference, TREE_STYLES.pine)),
    }),
    [treeGroups],
  )
  const foliageBillboards = useMemo(
    () => ({
      canopy: createBrunoFoliageBillboards({
        colorTexture,
        fieldSize,
        references: treeGroups.canopy,
        style: TREE_STYLES.canopy,
        tuning,
        visual: canopyVisual,
      }),
      flowering: createBrunoFoliageBillboards({
        colorTexture,
        fieldSize,
        references: treeGroups.flowering,
        style: TREE_STYLES.flowering,
        tuning,
        visual: floweringVisual,
      }),
      pine: createBrunoFoliageBillboards({
        colorTexture,
        fieldSize,
        references: treeGroups.pine,
        style: TREE_STYLES.pine,
        tuning,
        visual: pineVisual,
      }),
    }),
    [canopyVisual, colorTexture, fieldSize, floweringVisual, pineVisual, treeGroups, tuning],
  )
  useCameraFacingFoliage(canopyLeavesRef, foliageBillboards.canopy, 'canopy')
  useCameraFacingFoliage(floweringLeavesRef, foliageBillboards.flowering, 'flowering')
  useCameraFacingFoliage(pineLeavesRef, foliageBillboards.pine, 'pine')

  useLayoutEffect(
    () => () => {
      foliageGeometries.canopy.dispose()
      foliageGeometries.flowering.dispose()
      foliageGeometries.pine.dispose()
    },
    [foliageGeometries],
  )

  useLayoutEffect(() => {
    applyInstancedMatrices(canopyBodyRef.current, bodyMatrices.canopy)
    applyInstancedMatrices(floweringBodyRef.current, bodyMatrices.flowering)
    applyInstancedMatrices(pineBodyRef.current, bodyMatrices.pine)
  }, [bodyMatrices])

  return (
    <>
      <TreeBodies
        color={TREE_STYLES.canopy.body}
        count={bodyMatrices.canopy.length}
        geometry={canopyVisual.bodyGeometry}
        meshRef={canopyBodyRef}
      />
      <TreeBodies
        color={TREE_STYLES.flowering.body}
        count={bodyMatrices.flowering.length}
        geometry={floweringVisual.bodyGeometry}
        meshRef={floweringBodyRef}
      />
      <TreeBodies
        color={TREE_STYLES.pine.body}
        count={bodyMatrices.pine.length}
        geometry={pineVisual.bodyGeometry}
        meshRef={pineBodyRef}
      />
      <FoliageInstances
        alphaMap={foliageTexture}
        billboards={foliageBillboards.canopy}
        geometry={foliageGeometries.canopy}
        meshRef={canopyLeavesRef}
        opacity={tuning.foliageOpacity}
      />
      <FoliageInstances
        alphaMap={foliageTexture}
        billboards={foliageBillboards.flowering}
        geometry={foliageGeometries.flowering}
        meshRef={floweringLeavesRef}
        opacity={tuning.foliageOpacity}
      />
      <FoliageInstances
        alphaMap={foliageTexture}
        billboards={foliageBillboards.pine}
        geometry={foliageGeometries.pine}
        meshRef={pineLeavesRef}
        opacity={tuning.foliageOpacity}
      />
    </>
  )
}

function TreeBodies({
  color,
  count,
  geometry,
  meshRef,
}: {
  color: string
  count: number
  geometry: BufferGeometry | null
  meshRef: RefObject<InstancedMesh | null>
}) {
  const material = useMemo(() => {
    if (getMaterialRendererBackend() === 'webgl') {
      return new MeshStandardMaterial({
        color,
        depthWrite: false,
        roughness: 0.92,
        transparent: true,
      })
    }
    const nextMaterial = new MeshStandardNodeMaterial({
      color,
      depthWrite: false,
      roughness: 0.92,
      transparent: true,
    })
    nextMaterial.opacityNode = createLandrushRobotScreenRevealOpacityNode()
    nextMaterial.userData.landrushRobotScreenRevealSoftMask = true
    return nextMaterial
  }, [color])

  useLayoutEffect(() => () => material.dispose(), [material])
  if (count === 0 || !geometry) return null

  return (
    <group userData={{ landrushRobotOccluder: true }}>
      <instancedMesh
        args={[undefined, undefined, count]}
        frustumCulled={false}
        ref={meshRef}
        renderOrder={16}
      >
        <primitive attach="geometry" object={geometry} />
        <primitive attach="material" object={material} />
      </instancedMesh>
    </group>
  )
}

function FoliageInstances({
  alphaMap,
  billboards,
  geometry,
  meshRef,
  opacity,
}: {
  alphaMap: Texture
  billboards: readonly FoliageBillboard[]
  geometry: ReturnType<typeof createBrunoFoliageGeometry>
  meshRef: RefObject<InstancedMesh | null>
  opacity: number
}) {
  const count = billboards.length
  const material = useMemo(() => {
    if (getMaterialRendererBackend() === 'webgl') {
      return new MeshBasicMaterial({
        alphaMap,
        alphaTest: 0.035,
        depthWrite: false,
        opacity,
        side: DoubleSide,
        toneMapped: false,
        transparent: true,
        vertexColors: true,
      })
    }
    const nextMaterial = new MeshBasicNodeMaterial({
      alphaMap,
      alphaTest: 0.035,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
      transparent: true,
      vertexColors: true,
    })
    nextMaterial.opacityNode = createLandrushRobotScreenRevealOpacityNode(float(opacity))
    nextMaterial.userData.landrushRobotScreenRevealSoftMask = true
    return nextMaterial
  }, [alphaMap, opacity])

  useLayoutEffect(() => () => material.dispose(), [material])
  if (count === 0) return null

  return (
    <group userData={{ landrushRobotOccluder: true }}>
      <instancedMesh
        args={[undefined, undefined, count]}
        frustumCulled={false}
        ref={meshRef}
        renderOrder={17}
      >
        <primitive attach="geometry" object={geometry} />
        <primitive attach="material" object={material} />
      </instancedMesh>
    </group>
  )
}

function useBrunoTreeVisual(assetPath: string): TreeVisual {
  const { scene } = useGLTF(assetPath)

  return useMemo(() => {
    const leafMatrices: Matrix4[] = []
    let bodyGeometry: BufferGeometry | null = null

    scene.updateMatrixWorld(true)
    scene.traverse((child) => {
      if (!child.isMesh) return
      child.updateMatrix()

      if (child.name.startsWith('treeLeaves')) {
        leafMatrices.push(child.matrix.clone())
      } else if (child.name.startsWith('treeBody')) {
        bodyGeometry = child.geometry
      }
    })

    return { bodyGeometry, leafMatrices }
  }, [scene])
}

function configureBrunoFoliageTexture(texture: Texture) {
  texture.flipY = false
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
}

function groupTreeReferences(references: readonly BrunoTreeReference[]) {
  return {
    canopy: references.filter((reference) => reference.tree.kind === 'canopy'),
    flowering: references.filter((reference) => reference.tree.kind === 'flowering'),
    pine: references.filter((reference) => reference.tree.kind === 'pine'),
  }
}

function createTreeModelMatrix(reference: BrunoTreeReference, style: TreeStyle) {
  const transform = new Object3D()
  const scale = reference.tree.canopyRadius * style.modelScale
  transform.position.set(reference.tree.position.x, reference.elevation, reference.tree.position.z)
  transform.rotation.set(0, reference.tree.rotation, 0)
  transform.scale.setScalar(scale)
  transform.updateMatrix()
  return transform.matrix.clone()
}

function createBrunoFoliageBillboards({
  colorTexture,
  fieldSize,
  references,
  style,
  tuning,
  visual,
}: {
  colorTexture: Texture
  fieldSize: number
  references: readonly BrunoTreeReference[]
  style: TreeStyle
  tuning: GrassBladeTuning
  visual: TreeVisual
}) {
  const billboards: FoliageBillboard[] = []
  const random = createRandom(`foliage-${style.assetPath}`)
  const treeTransform = new Object3D()
  const finalMatrix = new Matrix4()
  const finalPosition = new Vector3()
  const finalRotation = new Quaternion()
  const finalScale = new Vector3()

  for (const reference of references) {
    const treeScale = reference.tree.canopyRadius * style.modelScale
    const baseColor = sampleGrassTextureColor(
      colorTexture,
      fieldSize,
      reference.tree.position.x,
      reference.tree.position.z,
    )
    treeTransform.position.set(
      reference.tree.position.x,
      reference.elevation,
      reference.tree.position.z,
    )
    treeTransform.rotation.set(0, reference.tree.rotation, 0)
    treeTransform.scale.setScalar(treeScale)
    treeTransform.updateMatrixWorld(true)

    for (const leafMatrix of visual.leafMatrices) {
      finalMatrix.copy(leafMatrix).premultiply(treeTransform.matrixWorld)
      finalMatrix.decompose(finalPosition, finalRotation, finalScale)

      billboards.push({
        color: grassTunedFoliageColor(baseColor.color, tuning, baseColor.alpha, random()),
        position: finalPosition.clone(),
        roll: Math.PI * 2 * random(),
        scale: finalScale.x,
      })
    }
  }

  return billboards
}

function useCameraFacingFoliage(
  meshRef: RefObject<InstancedMesh | null>,
  billboards: readonly FoliageBillboard[],
  kind: BrunoTreeKind,
) {
  const camera = useThree((state) => state.camera)
  const transform = useMemo(() => new Object3D(), [])
  const hasAppliedMatricesRef = useRef(false)
  const previousCameraMatrixRef = useRef(new Matrix4())
  const hasPreviousCameraMatrixRef = useRef(false)

  useLayoutEffect(() => {
    hasAppliedMatricesRef.current = applyBillboardMatrices(
      meshRef.current,
      billboards,
      camera.position,
      transform,
    )
    camera.updateMatrixWorld()
    previousCameraMatrixRef.current.copy(camera.matrixWorld)
    hasPreviousCameraMatrixRef.current = true
  }, [billboards, camera, meshRef, transform])

  useFrame(() => {
    if (billboards.length === 0) return
    measureLandrushFrameSlice(`scene.trees.${kind}.billboard-frame`, () => {
      const cameraChanged = measureLandrushFrameSlice(`scene.trees.${kind}.camera-check`, () => {
        camera.updateMatrixWorld()
        return !(
          hasAppliedMatricesRef.current &&
          hasPreviousCameraMatrixRef.current &&
          matrixElementsEqual(previousCameraMatrixRef.current, camera.matrixWorld)
        )
      })
      if (!cameraChanged) return

      previousCameraMatrixRef.current.copy(camera.matrixWorld)
      hasPreviousCameraMatrixRef.current = true
      hasAppliedMatricesRef.current = measureLandrushFrameSlice(
        `scene.trees.${kind}.apply-billboard-matrices`,
        () => applyBillboardMatrices(meshRef.current, billboards, camera.position, transform),
      )
    })
  })
}

function matrixElementsEqual(first: Matrix4, second: Matrix4) {
  const firstElements = first.elements
  const secondElements = second.elements
  for (let index = 0; index < firstElements.length; index += 1) {
    if (Math.abs((firstElements[index] ?? 0) - (secondElements[index] ?? 0)) > 0.00001) {
      return false
    }
  }
  return true
}

function applyBillboardMatrices(
  mesh: InstancedMesh | null,
  billboards: readonly FoliageBillboard[],
  cameraPosition: Vector3,
  transform: Object3D,
) {
  if (!mesh) return false
  billboards.forEach((billboard, index) => {
    transform.position.copy(billboard.position)
    transform.up.set(Math.sin(billboard.roll), Math.cos(billboard.roll), 0)
    transform.lookAt(cameraPosition)
    transform.scale.setScalar(billboard.scale)
    transform.updateMatrix()
    mesh.setMatrixAt(index, transform.matrix)
    mesh.setColorAt(index, billboard.color)
  })
  mesh.count = billboards.length
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  return true
}

function sampleGrassTextureColor(texture: Texture, fieldSize: number, x: number, z: number) {
  const image = texture.image as { data?: Uint8Array; height?: number; width?: number } | undefined
  const data = image?.data
  const resolution = image?.width ?? 0
  if (!data || resolution <= 1 || image?.height !== resolution) {
    return { alpha: 1, color: FALLBACK_FOLIAGE_COLOR.clone() }
  }

  const u = x / fieldSize + 0.5
  const v = z / fieldSize + 0.5
  if (u < 0 || u > 1 || v < 0 || v > 1) {
    return { alpha: 1, color: FALLBACK_FOLIAGE_COLOR.clone() }
  }

  const pixelX = Math.max(0, Math.min(resolution - 1, Math.round(u * (resolution - 1))))
  const pixelY = Math.max(0, Math.min(resolution - 1, Math.round(v * (resolution - 1))))
  const index = (pixelY * resolution + pixelX) * 4

  return {
    alpha: (data[index + 3] ?? 255) / 255,
    color: new Color(
      (data[index] ?? 120) / 255,
      (data[index + 1] ?? 158) / 255,
      (data[index + 2] ?? 72) / 255,
    ),
  }
}

function grassTunedFoliageColor(
  color: Color,
  tuning: GrassBladeTuning,
  alpha: number,
  variation: number,
) {
  const brightness = Math.max(0, tuning.brightness)
  const rootShadow = Math.max(0, Math.min(1, tuning.rootShadow))
  const density = Math.max(0, Math.min(1, alpha))
  const bladeTop = 0.74 + density * 0.12
  const canopyVariation = 0.94 + variation * 0.12
  const shadowTint = 1 - rootShadow * (0.03 + variation * 0.03)
  const scale = brightness * bladeTop * canopyVariation * shadowTint
  return color.clone().multiplyScalar(Math.max(0, scale))
}

function applyInstancedMatrices(mesh: InstancedMesh | null, matrices: readonly Matrix4[]) {
  if (!mesh) return
  matrices.forEach((matrix, index) => {
    mesh.setMatrixAt(index, matrix)
  })
  mesh.count = matrices.length
  mesh.instanceMatrix.needsUpdate = true
}

function createBrunoFoliageGeometry(random: () => number) {
  const planes: PlaneGeometry[] = []

  for (let index = 0; index < FOLIAGE_PLANE_COUNT; index += 1) {
    const plane = new PlaneGeometry(0.8, 0.8)
    const spherical = new Spherical(1 - random() ** 3, Math.PI * 2 * random(), Math.PI * random())
    const position = new Vector3().setFromSpherical(spherical)

    plane.rotateZ(random() * 9999)
    plane.rotateY(0)
    plane.translate(position.x, position.y, position.z)

    const normal = position.clone().normalize()
    const normalArray = new Float32Array(12)
    const positionAttribute = plane.getAttribute('position')
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const offset = vertex * 3
      const vertexPosition = new Vector3(
        positionAttribute.getX(vertex),
        positionAttribute.getY(vertex),
        positionAttribute.getZ(vertex),
      )
      const mixedNormal = vertexPosition.lerp(normal, 0.85)
      normalArray[offset] = mixedNormal.x
      normalArray[offset + 1] = mixedNormal.y
      normalArray[offset + 2] = mixedNormal.z
    }

    plane.setAttribute('normal', new BufferAttribute(normalArray, 3))
    planes.push(plane)
  }

  const merged = mergeGeometries(planes, false) ?? planes[0]!
  for (const plane of planes) {
    if (plane !== merged) plane.dispose()
  }
  return merged
}

function createRandom(seed: string) {
  let state = hashSeed(seed)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(seed: string) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

useTexture.preload(BRUNO_FOLIAGE_TEXTURE_PATH)
useGLTF.preload(TREE_STYLES.canopy.assetPath)
useGLTF.preload(TREE_STYLES.flowering.assetPath)
useGLTF.preload(TREE_STYLES.pine.assetPath)

import type { LandrushWorldNode } from '@pascal-app/core'
import {
  DataTexture,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  NearestFilter,
  RGBAFormat,
  type Texture,
  UnsignedByteType,
} from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import type { LandrushGrassPatch } from './render-types'
import { GRASS_COLORS } from './style-constants'
import { createLandrushWaterMaterial, type LandrushWaterSurfaceMaterial } from './water-surface'

export function createLandrushMaterials(
  renderer: WebGPURenderer,
  toonRamp: Texture,
  grassRegionTexture: Texture,
  terrainTexture: Texture,
  bounds: LandrushWorldNode['perimeter']['bounds'],
): {
  water: LandrushWaterSurfaceMaterial
  shoreSand: MeshBasicMaterial
  grassBase: MeshBasicMaterial
  grassBlade: MeshBasicMaterial
  grassVariants: MeshBasicMaterial[]
  road: MeshBasicMaterial
  roadCrown: MeshBasicMaterial
  sidewalk: MeshBasicMaterial
  parcelLine: MeshBasicMaterial
  ownerLine: MeshBasicMaterial
  trunk: MeshBasicMaterial
  canopy: MeshBasicMaterial
  canopyLight: MeshBasicMaterial
  robotBody: MeshBasicMaterial
} {
  const toon = (color: string, options: { opacity?: number; transparent?: boolean } = {}) =>
    createToonMaterial(color, toonRamp, options)

  return {
    water: createLandrushWaterMaterial(renderer, terrainTexture, bounds),
    shoreSand: new MeshBasicMaterial({
      color: '#d8c58d',
      opacity: 0.74,
      transparent: true,
      side: DoubleSide,
    }),
    grassBase: new MeshBasicMaterial({
      map: grassRegionTexture,
      side: FrontSide,
    }),
    grassBlade: new MeshBasicMaterial({
      side: DoubleSide,
      vertexColors: true,
    }),
    grassVariants: GRASS_COLORS.map((color, index) =>
      toon(color, { opacity: index === 0 ? 0.34 : 0.28, transparent: true }),
    ),
    road: new MeshBasicMaterial({
      color: '#b4aa8d',
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    }),
    roadCrown: new MeshBasicMaterial({
      color: '#d8ceb3',
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    }),
    sidewalk: new MeshBasicMaterial({
      color: '#efe6c9',
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    }),
    parcelLine: new MeshBasicMaterial({
      color: '#e7e0bf',
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    }),
    ownerLine: new MeshBasicMaterial({
      color: '#f7d154',
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    }),
    trunk: toon('#6f5030'),
    canopy: toon('#2e7f3f'),
    canopyLight: toon('#61a84c'),
    robotBody: toon('#e7eef2'),
  }
}

export type LandrushMaterials = ReturnType<typeof createLandrushMaterials>

export function disposeLandrushMaterials(materials: LandrushMaterials) {
  materials.water.dispose()
  materials.shoreSand.dispose()
  materials.grassBase.dispose()
  materials.grassBlade.dispose()
  for (const material of materials.grassVariants) {
    material.dispose()
  }
  materials.road.dispose()
  materials.roadCrown.dispose()
  materials.sidewalk.dispose()
  materials.parcelLine.dispose()
  materials.ownerLine.dispose()
  materials.trunk.dispose()
  materials.canopy.dispose()
  materials.canopyLight.dispose()
  materials.robotBody.dispose()
}

export function createTritoneRamp(): Texture {
  const texture = new DataTexture(
    new Uint8Array([62, 62, 62, 255, 166, 166, 166, 255, 255, 255, 255, 255]),
    3,
    1,
    RGBAFormat,
    UnsignedByteType,
  )
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

export function createSolidMaterialMap(colors: readonly string[]) {
  const materials = new Map<string, MeshBasicMaterial>()
  for (const colorValue of colors) {
    if (materials.has(colorValue)) continue
    materials.set(
      colorValue,
      new MeshBasicMaterial({
        color: colorValue,
        side: FrontSide,
      }),
    )
  }
  return materials
}

export function createGrassPatchMaterials(patches: readonly LandrushGrassPatch[]) {
  const materials = new Map<string, MeshBasicMaterial>()
  for (const patch of patches) {
    materials.set(
      patch.id,
      new MeshBasicMaterial({
        color: GRASS_COLORS[patch.colorIndex] ?? GRASS_COLORS[0],
        opacity: patch.opacity,
        side: FrontSide,
        transparent: true,
      }),
    )
  }
  return materials
}

export function createParcelFillMaterials(parcels: LandrushWorldNode['parcels']) {
  const materials = new Map<string, MeshBasicMaterial>()
  for (const parcel of parcels) {
    materials.set(
      parcel.id,
      new MeshBasicMaterial({
        color: parcel.fillColor,
        opacity: parcel.kind === 'owner' ? 0.52 : 0.34,
        side: FrontSide,
        transparent: true,
      }),
    )
  }
  return materials
}

export function disposeMaterialMap(materials: Map<string, { dispose: () => void }>) {
  for (const material of materials.values()) {
    material.dispose()
  }
}

function createToonMaterial(
  color: string,
  _gradientMap: Texture,
  { opacity = 1, transparent = false }: { opacity?: number; transparent?: boolean } = {},
) {
  return new MeshBasicMaterial({
    color,
    opacity,
    side: FrontSide,
    transparent: transparent || opacity < 1,
  })
}

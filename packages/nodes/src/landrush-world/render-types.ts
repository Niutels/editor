import type { LandrushWorldNode } from '@pascal-app/core'
import type { BufferGeometry, Texture } from 'three'

export type Point2 = { x: number; z: number }

export type LandrushTerrainSample = {
  colorIndex: number
  detail: number
  grassDensity: number
  highlight: number
  roadMask: number
  shoreEdge: number
  waterDepth: number
  waterShoreLine: number
}

export type LandrushTerrainData = {
  bounds: LandrushWorldNode['perimeter']['bounds']
  grassTexture: Texture
  sample: (x: number, z: number) => LandrushTerrainSample
  texture: Texture
}

export type LandrushGrassPatch = {
  colorIndex: number
  id: string
  opacity: number
  points: Point2[]
}

export type LandrushParcelYardDetail = {
  color: string
  footprint: [number, number, number]
  id: string
  parcelId: string
  position: [number, number, number]
  rotation: number
  type: 'walk' | 'garden' | 'hedge'
}

export type LandrushDock = {
  id: string
  planks: readonly LandrushDockPlank[]
  posts: readonly [number, number, number][]
}

export type LandrushDockPlank = {
  footprint: [number, number, number]
  position: [number, number, number]
  rotation: number
}

export type LandrushShoreRock = {
  color: string
  id: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  shape: 'cliff' | 'rock'
}

export type LandrushShoreTerrace = {
  color: string
  id: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export type LandrushCoastTower = {
  id: string
  position: [number, number, number]
  rotation: number
}

export type LandrushRibbonGeometrySet = {
  neighborParcelOutlines: BufferGeometry
  ownerParcelOutlines: BufferGeometry
  roadCrowns: BufferGeometry
  roads: BufferGeometry
  shoreSand: BufferGeometry
  sidewalks: BufferGeometry
}

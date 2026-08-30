import { describe, expect, test } from 'bun:test'
import { BufferGeometry, Float32BufferAttribute, Mesh } from 'three'
import { color as tslColor } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  prepareLandrushZombieNightSurfaceMaterials,
  readPreparedLandrushZombieNightSurfaceRole,
} from './landrush-zombie-night-presentation-material'
import {
  createStylizedGrassRenderGeometry,
  withStylizedGrassInstanceAttributes,
} from './stylized-scene-land-layers'

const BLADE_COUNT = 6
const SOURCE_TRIANGLES_PER_BLADE = 8
const RENDER_TRIANGLES_PER_BLADE = 2

function createGrassClusterGeometry() {
  const positions: number[] = []
  const indices: number[] = []
  const levels = [
    { width: 0, y: 0 },
    { width: 0.16, y: 0.2 },
    { width: 0.14, y: 0.4 },
    { width: 0.1, y: 0.6 },
    { width: 0.055, y: 0.8 },
    { width: 0, y: 1 },
  ] as const

  for (let blade = 0; blade < BLADE_COUNT; blade += 1) {
    const vertexOffset = positions.length / 3
    const rootX = blade * 0.4
    const rootZ = (blade % 2) * 0.15
    positions.push(rootX, levels[0].y, rootZ)
    for (const level of levels.slice(1, -1)) {
      positions.push(rootX - level.width, level.y, rootZ)
      positions.push(rootX + level.width, level.y, rootZ)
    }
    positions.push(rootX, levels.at(-1)!.y, rootZ)

    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2)
    for (let level = 0; level < 3; level += 1) {
      const lowerLeft = vertexOffset + 1 + level * 2
      const lowerRight = lowerLeft + 1
      const upperLeft = lowerLeft + 2
      const upperRight = lowerRight + 2
      indices.push(lowerLeft, upperLeft, lowerRight, lowerRight, upperLeft, upperRight)
    }
    const lastLeft = vertexOffset + 7
    const lastRight = vertexOffset + 8
    const tip = vertexOffset + 9
    indices.push(lastLeft, tip, lastRight)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

function triangleCount(geometry: BufferGeometry) {
  return (geometry.getIndex()?.count ?? 0) / 3
}

describe('stylized grass render geometry budget', () => {
  test('keeps every blade while reducing each cluster to a fixed two-triangle silhouette', () => {
    const source = createGrassClusterGeometry()
    const render = createStylizedGrassRenderGeometry(source)

    expect(triangleCount(source)).toBe(BLADE_COUNT * SOURCE_TRIANGLES_PER_BLADE)
    expect(triangleCount(render)).toBe(BLADE_COUNT * RENDER_TRIANGLES_PER_BLADE)
    expect(triangleCount(render) / triangleCount(source)).toBe(0.25)
    expect(render.getAttribute('position').count).toBe(BLADE_COUNT * 4)
    expect(render.boundingBox?.min.y).toBe(0)
    expect(render.boundingBox?.max.y).toBe(1)

    source.dispose()
    render.dispose()
  })

  test('retains root UVs and the attributes that opt the blade material into night tinting', () => {
    const source = createGrassClusterGeometry()
    const render = createStylizedGrassRenderGeometry(source)
    const instanced = withStylizedGrassInstanceAttributes(render, 16)
    const material = new MeshBasicNodeMaterial()
    material.colorNode = tslColor('#7fb13f')
    const mesh = new Mesh(instanced, material)

    expect(instanced.getAttribute('uv').count).toBe(instanced.getAttribute('position').count)
    expect(prepareLandrushZombieNightSurfaceMaterials(mesh, [material])).toBe(1)
    expect(readPreparedLandrushZombieNightSurfaceRole(material)).toBe('grass-blades')

    source.dispose()
    render.dispose()
    instanced.dispose()
    material.dispose()
  })
})

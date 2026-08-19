import { BufferGeometry, Color, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three'

export type WorldPolygonArea = readonly (readonly WorldPolygonRing[])[]
export type WorldPolygonRing = readonly (readonly [number, number])[]

export type WorldPolygonGeometryRole = {
  key: string
  value: string
}

export function createWorldPolygonSurfaceGeometry(
  layers: readonly { area: WorldPolygonArea; color?: string }[],
  y: number,
  role: WorldPolygonGeometryRole,
) {
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const indices: number[] = []
  const colors: number[] = []
  const usesVertexColors = layers.some((layer) => layer.color !== undefined)

  for (const layer of layers) {
    const layerColor = layer.color ? new Color(layer.color) : null
    for (const polygon of layer.area) {
      const rings = polygon
        .map(openWorldPolygonRing)
        .filter((ring): ring is WorldPolygonRing => ring.length >= 3)
      const contourRing = rings[0]
      if (!contourRing) continue
      const contour = contourRing.map(([x, z]) => new Vector2(x, z))
      const holes = rings.slice(1).map((ring) => ring.map(([x, z]) => new Vector2(x, z)))
      const faces = ShapeUtils.triangulateShape(contour, holes)
      const flattened = [contourRing, ...rings.slice(1)].flat()
      const vertexOffset = positions.length / 3
      for (const [x, z] of flattened) {
        positions.push(x, y, z)
        if (usesVertexColors) {
          colors.push(layerColor?.r ?? 1, layerColor?.g ?? 1, layerColor?.b ?? 1)
        }
      }

      for (const face of faces) {
        const [a, b, c] = face
        if (a === undefined || b === undefined || c === undefined) continue
        const pointA = flattened[a]
        const pointB = flattened[b]
        const pointC = flattened[c]
        if (!(pointA && pointB && pointC)) continue
        const signedArea =
          (pointB[0] - pointA[0]) * (pointC[1] - pointA[1]) -
          (pointB[1] - pointA[1]) * (pointC[0] - pointA[0])
        if (signedArea < 0) {
          indices.push(vertexOffset + a, vertexOffset + b, vertexOffset + c)
        } else {
          indices.push(vertexOffset + a, vertexOffset + c, vertexOffset + b)
        }
      }
    }
  }

  finalizeWorldPolygonGeometry(geometry, positions, indices, role)
  if (usesVertexColors && colors.length === positions.length) {
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  }
  return geometry
}

export function createWorldPolygonBoundaryWallsGeometry(
  bands: readonly { area: WorldPolygonArea; bottomY: number; topY: number }[],
  role: WorldPolygonGeometryRole,
) {
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const indices: number[] = []

  for (const { area, bottomY, topY } of bands) {
    if (Math.abs(topY - bottomY) <= 0.0001) continue
    for (const polygon of area) {
      for (const ring of polygon.map(openWorldPolygonRing)) {
        for (let index = 0; index < ring.length; index += 1) {
          const start = ring[index]
          const end = ring[(index + 1) % ring.length]
          if (!(start && end) || Math.hypot(end[0] - start[0], end[1] - start[1]) <= 0.0001) {
            continue
          }
          const vertexOffset = positions.length / 3
          positions.push(
            start[0],
            topY,
            start[1],
            start[0],
            bottomY,
            start[1],
            end[0],
            topY,
            end[1],
            end[0],
            bottomY,
            end[1],
          )
          indices.push(
            vertexOffset,
            vertexOffset + 1,
            vertexOffset + 2,
            vertexOffset + 2,
            vertexOffset + 1,
            vertexOffset + 3,
          )
        }
      }
    }
  }

  finalizeWorldPolygonGeometry(geometry, positions, indices, role)
  return geometry
}

export function countWorldPolygonSurfaceTriangles(area: WorldPolygonArea) {
  let count = 0
  for (const polygon of area) {
    const rings = polygon
      .map(openWorldPolygonRing)
      .filter((ring): ring is WorldPolygonRing => ring.length >= 3)
    const contour = rings[0]
    if (!contour) continue
    count += ShapeUtils.triangulateShape(
      contour.map(([x, z]) => new Vector2(x, z)),
      rings.slice(1).map((ring) => ring.map(([x, z]) => new Vector2(x, z))),
    ).length
  }
  return count
}

function openWorldPolygonRing(ring: WorldPolygonRing): WorldPolygonRing {
  if (ring.length <= 1) return [...ring]
  const first = ring[0]
  const last = ring.at(-1)
  if (first && last && first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1)
  return [...ring]
}

function finalizeWorldPolygonGeometry(
  geometry: BufferGeometry,
  positions: number[],
  indices: number[],
  role: WorldPolygonGeometryRole,
) {
  geometry.userData[role.key] = role.value
  if (positions.length === 0 || indices.length === 0) return
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
}

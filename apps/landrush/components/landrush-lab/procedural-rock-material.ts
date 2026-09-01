import {
  DataTexture,
  LinearFilter,
  type Material,
  MeshBasicMaterial,
  MeshNormalMaterial,
  MeshToonMaterial,
  RedFormat,
  type Texture,
} from 'three'
import type { ProceduralRockCliffDebugMode } from './procedural-rock-cliff-geometry'

export function createProceduralRockMaterial(
  debugMode: ProceduralRockCliffDebugMode,
  toonGradient: Texture,
): Material {
  if (debugMode === 'normals') {
    return new MeshNormalMaterial({ flatShading: true })
  }
  if (debugMode === 'wireframe') {
    return new MeshBasicMaterial({ color: '#d9ebef', wireframe: true })
  }
  if (debugMode !== 'final') {
    return new MeshBasicMaterial({ color: '#ffffff', vertexColors: true })
  }
  return new MeshToonMaterial({
    color: '#ffffff',
    dithering: true,
    emissive: '#160b0d',
    emissiveIntensity: 0.035,
    gradientMap: toonGradient,
    vertexColors: true,
  })
}

export function createProceduralRockToonGradientTexture() {
  const width = 64
  const data = new Uint8Array(width)
  const softness = 0.68
  const cavityDarkening = 0.78
  const transition = mixNumber(0.008, 0.075, softness)
  const shadow = mixNumber(0.5, 0.32, cavityDarkening)
  const dark = mixNumber(0.64, 0.5, cavityDarkening)
  const mid = mixNumber(0.78, 0.68, cavityDarkening)
  const light = mixNumber(0.9, 0.85, cavityDarkening)

  for (let index = 0; index < width; index += 1) {
    const ratio = index / (width - 1)
    let value = shadow
    value = mixNumber(value, dark, smoothstep(0.2 - transition, 0.2 + transition, ratio))
    value = mixNumber(value, mid, smoothstep(0.42 - transition, 0.42 + transition, ratio))
    value = mixNumber(value, light, smoothstep(0.66 - transition, 0.66 + transition, ratio))
    value = mixNumber(value, 1, smoothstep(0.84 - transition, 0.84 + transition, ratio))
    data[index] = Math.round(value * 255)
  }

  const texture = new DataTexture(data, width, 1, RedFormat)
  texture.generateMipmaps = false
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.name = 'pascal-procedural-rock-height-toon-ramp'
  texture.needsUpdate = true
  return texture
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const ratio = Math.max(0, Math.min(1, (value - edge0) / Math.max(edge1 - edge0, 0.000_1)))
  return ratio * ratio * (3 - 2 * ratio)
}

function mixNumber(first: number, second: number, ratio: number) {
  return first + (second - first) * ratio
}

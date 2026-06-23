import { BufferGeometry, Float32BufferAttribute, type Texture } from 'three'

export const GRASS_BLADE_SUBDIVISIONS = 280
export const GRASS_BLADE_PATCHES_PER_AXIS = 3
export const GRASS_BLADE_PATCH_COUNT = GRASS_BLADE_PATCHES_PER_AXIS * GRASS_BLADE_PATCHES_PER_AXIS
export const GRASS_BLADE_COUNT =
  GRASS_BLADE_SUBDIVISIONS * GRASS_BLADE_SUBDIVISIONS * GRASS_BLADE_PATCH_COUNT
export const GRASS_BLADE_CANDIDATE_COUNT = GRASS_BLADE_COUNT
export const GRASS_BLADE_TRIANGLES_PER_BLADE = 2
export const GRASS_HEIGHT_VARIATION_RATIO = 0.6
export const GRASS_WEBGPU_BLADE_SUBDIVISIONS = 240
export const GRASS_WEBGPU_BLADE_PREVIEW_SUBDIVISIONS = 96
export const GRASS_MIN_SPAWN_ALPHA = 0.08

export function resolveGrassWebGpuBladeSubdivisions(density: number) {
  const normalizedDensity = Math.max(0, Math.min(1, Number.isFinite(density) ? density : 1))
  const densityScale = normalizedDensity * normalizedDensity * normalizedDensity
  return Math.round(
    GRASS_WEBGPU_BLADE_PREVIEW_SUBDIVISIONS +
      (GRASS_WEBGPU_BLADE_SUBDIVISIONS - GRASS_WEBGPU_BLADE_PREVIEW_SUBDIVISIONS) *
        densityScale,
  )
}

type GrassBladeGeometryOptions = {
  center?: {
    x: number
    z: number
  }
  planeSize: number
}

type GrassBladeColorGeometryOptions = {
  bladeSubdivisions?: number
  brightness: number
  colorTexture?: Texture
  fieldSize: number
  fieldTexture: Texture
  height: number
  rootShadow: number
  width: number
  wind: number
}

export function createGrassBladeGeometry({ center, planeSize }: GrassBladeGeometryOptions) {
  const geometry = new BufferGeometry()
  const positions = new Float32Array(GRASS_BLADE_COUNT * 3 * 3)
  const corners = new Float32Array(GRASS_BLADE_COUNT * 3)
  const heightRandomness = new Float32Array(GRASS_BLADE_COUNT * 3)
  const patchSize = planeSize / GRASS_BLADE_PATCHES_PER_AXIS
  const fragmentSize = patchSize / GRASS_BLADE_SUBDIVISIONS
  const centerOffset = center ?? { x: 0, z: 0 }
  let vertex = 0

  for (let patchX = 0; patchX < GRASS_BLADE_PATCHES_PER_AXIS; patchX += 1) {
    const patchCenterX = (patchX / GRASS_BLADE_PATCHES_PER_AXIS - 0.5) * planeSize + patchSize * 0.5

    for (let patchZ = 0; patchZ < GRASS_BLADE_PATCHES_PER_AXIS; patchZ += 1) {
      const patchCenterZ =
        (patchZ / GRASS_BLADE_PATCHES_PER_AXIS - 0.5) * planeSize + patchSize * 0.5

      for (let xIndex = 0; xIndex < GRASS_BLADE_SUBDIVISIONS; xIndex += 1) {
        const cellX =
          patchCenterX + (xIndex / GRASS_BLADE_SUBDIVISIONS - 0.5) * patchSize + fragmentSize * 0.5

        for (let zIndex = 0; zIndex < GRASS_BLADE_SUBDIVISIONS; zIndex += 1) {
          const cellZ =
            patchCenterZ +
            (zIndex / GRASS_BLADE_SUBDIVISIONS - 0.5) * patchSize +
            fragmentSize * 0.5
          const centerX = centerOffset.x + cellX + (Math.random() - 0.5) * fragmentSize
          const centerZ = centerOffset.z + cellZ + (Math.random() - 0.5) * fragmentSize

          for (let corner = 0; corner < 3; corner += 1) {
            positions[vertex * 3] = centerX
            positions[vertex * 3 + 1] = 0
            positions[vertex * 3 + 2] = centerZ
            corners[vertex] = corner
            heightRandomness[vertex] = Math.random()
            vertex += 1
          }
        }
      }
    }
  }

  geometry.boundingSphere = null
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aCorner', new Float32BufferAttribute(corners, 1))
  geometry.setAttribute('aHeightRandomness', new Float32BufferAttribute(heightRandomness, 1))
  geometry.computeBoundingSphere()
  return geometry
}

export function createGrassBladeColorGeometry({
  bladeSubdivisions,
  brightness,
  colorTexture,
  fieldSize,
  fieldTexture,
  height,
  rootShadow,
  width,
  wind,
}: GrassBladeColorGeometryOptions) {
  const geometry = new BufferGeometry()
  const image = fieldTexture.image as
    | { data?: Uint8Array; height?: number; width?: number }
    | undefined
  const data = image?.data
  const resolution = image?.width ?? 0
  if (!data || resolution <= 1 || image?.height !== resolution) return geometry
  const colorImage = colorTexture?.image as
    | { data?: Uint8Array; height?: number; width?: number }
    | undefined
  const colorData = colorImage?.data
  const colorResolution =
    colorData && colorImage?.height === colorImage?.width ? (colorImage.width ?? 0) : 0

  const positions: number[] = []
  const colors: number[] = []
  const subdivisions = Math.max(
    48,
    Math.round(bladeSubdivisions ?? GRASS_WEBGPU_BLADE_SUBDIVISIONS),
  )
  const patchSize = fieldSize / GRASS_BLADE_PATCHES_PER_AXIS
  const fragmentSize = patchSize / subdivisions
  const rootShadowStrength = Math.max(0, Math.min(1, rootShadow))
  const brightnessScale = Math.max(0, brightness)
  const windBend = Math.max(0, wind)
  const addBlade = (centerX: number, centerZ: number, sample: GrassTextureSample, seed: number) => {
    const alpha = sample.a / 255
    if (alpha < GRASS_MIN_SPAWN_ALPHA) return false

    const angle = hashUnit(seed, 31.1) * Math.PI * 2
    const sideX = Math.cos(angle)
    const sideZ = Math.sin(angle)
    const bendX = -sideZ
    const bendZ = sideX
    const heightNoise = 0.58 + hashUnit(seed, 47.3) * 0.84
    const densityScale = 0.52 + alpha * 0.68
    const bladeHeight = height * heightNoise * densityScale
    const bladeWidth = width * (0.55 + alpha * 0.75)
    const tipBend = (hashUnit(seed, 64.5) - 0.5) * bladeHeight * windBend * 0.42
    const tipX = centerX + bendX * tipBend
    const tipZ = centerZ + bendZ * tipBend
    const bladeColor = grassBladeBaseColor(sample, alpha)
    const topColor = scaleColor(bladeColor, brightnessScale * (0.74 + alpha * 0.12))
    const rootColor = scaleColor(
      bladeColor,
      brightnessScale * (0.42 + alpha * 0.08 - rootShadowStrength * 0.18),
    )

    pushBladeTriangle(positions, colors, {
      bladeHeight,
      bladeWidth,
      centerX,
      centerZ,
      rootColor,
      sideX,
      sideZ,
      tipX,
      tipZ,
      topColor,
    })
    pushBladeTriangle(positions, colors, {
      bladeHeight,
      bladeWidth: bladeWidth * 0.82,
      centerX,
      centerZ,
      rootColor,
      sideX: bendX,
      sideZ: bendZ,
      tipX,
      tipZ,
      topColor,
    })
    return true
  }

  for (let patchX = 0; patchX < GRASS_BLADE_PATCHES_PER_AXIS; patchX += 1) {
    const patchCenterX = (patchX / GRASS_BLADE_PATCHES_PER_AXIS - 0.5) * fieldSize + patchSize * 0.5

    for (let patchZ = 0; patchZ < GRASS_BLADE_PATCHES_PER_AXIS; patchZ += 1) {
      const patchCenterZ =
        (patchZ / GRASS_BLADE_PATCHES_PER_AXIS - 0.5) * fieldSize + patchSize * 0.5

      for (let xIndex = 0; xIndex < subdivisions; xIndex += 1) {
        const cellX = patchCenterX + (xIndex / subdivisions - 0.5) * patchSize + fragmentSize * 0.5

        for (let zIndex = 0; zIndex < subdivisions; zIndex += 1) {
          const cellZ =
            patchCenterZ + (zIndex / subdivisions - 0.5) * patchSize + fragmentSize * 0.5
          const seed = patchX * 928.13 + patchZ * 379.41 + xIndex * 19.17 + zIndex * 7.31
          const jitterX = (hashUnit(seed, 1.7) - 0.5) * fragmentSize * 0.35
          const jitterZ = (hashUnit(seed, 9.3) - 0.5) * fragmentSize * 0.35
          const centerX = cellX + jitterX
          const centerZ = cellZ + jitterZ
          const sample = sampleGrassTexture(data, resolution, fieldSize, centerX, centerZ)
          if (!sample) continue

          const alpha = sample.a / 255
          if (alpha < GRASS_MIN_SPAWN_ALPHA) continue

          const colorSample =
            colorData && colorResolution > 1
              ? sampleGrassTexture(colorData, colorResolution, fieldSize, centerX, centerZ)
              : null
          addBlade(
            centerX,
            centerZ,
            colorSample
              ? { ...sample, b: colorSample.b, g: colorSample.g, r: colorSample.r }
              : sample,
            seed,
          )
        }
      }
    }
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()
  return geometry
}

function pushBladeTriangle(
  positions: number[],
  colors: number[],
  {
    bladeHeight,
    bladeWidth,
    centerX,
    centerZ,
    rootColor,
    sideX,
    sideZ,
    tipX,
    tipZ,
    topColor,
  }: {
    bladeHeight: number
    bladeWidth: number
    centerX: number
    centerZ: number
    rootColor: { b: number; g: number; r: number }
    sideX: number
    sideZ: number
    tipX: number
    tipZ: number
    topColor: { b: number; g: number; r: number }
  },
) {
  positions.push(
    centerX - sideX * bladeWidth,
    0,
    centerZ - sideZ * bladeWidth,
    centerX + sideX * bladeWidth,
    0,
    centerZ + sideZ * bladeWidth,
    tipX,
    bladeHeight,
    tipZ,
  )
  colors.push(
    rootColor.r,
    rootColor.g,
    rootColor.b,
    rootColor.r,
    rootColor.g,
    rootColor.b,
    topColor.r,
    topColor.g,
    topColor.b,
  )
}

type GrassTextureSample = {
  a: number
  b: number
  g: number
  r: number
}

function sampleGrassTexture(
  data: Uint8Array,
  resolution: number,
  fieldSize: number,
  x: number,
  z: number,
) {
  const u = x / fieldSize + 0.5
  const v = z / fieldSize + 0.5
  if (u < 0 || u > 1 || v < 0 || v > 1) return null
  const pixelX = Math.max(0, Math.min(resolution - 1, Math.round(u * (resolution - 1))))
  const pixelY = Math.max(0, Math.min(resolution - 1, Math.round(v * (resolution - 1))))
  const index = (pixelY * resolution + pixelX) * 4

  return {
    a: data[index + 3] ?? 0,
    b: (data[index + 2] ?? 0) / 255,
    g: (data[index + 1] ?? 0) / 255,
    r: (data[index] ?? 0) / 255,
  }
}

function grassBladeBaseColor(color: { b: number; g: number; r: number }, _density: number) {
  return {
    b: clamp01(color.b),
    g: clamp01(color.g),
    r: clamp01(color.r),
  }
}

function scaleColor(color: { b: number; g: number; r: number }, scale: number) {
  return {
    b: clamp01(color.b * scale),
    g: clamp01(color.g * scale),
    r: clamp01(color.r * scale),
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function hashUnit(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return value - Math.floor(value)
}

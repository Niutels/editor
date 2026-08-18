export type GrassPattern = {
  colors: Uint8ClampedArray
  detailLevel: Uint8Array
  exposure: Uint8Array
  family: Uint8Array
  foundationFamily: Uint8Array
  resolution: number
}

export type GrassPatternOptions = {
  resolution?: number
  seed?: number
}

export type GrassPatternRgb = readonly [number, number, number]

const DEFAULT_RESOLUTION = 512
const DEFAULT_SEED = 0x5eedc0de

// Family order: golden olive, core olive, warm muted olive, cool moss olive.
export const ORGANIC_GRASS_PALETTE: readonly (readonly GrassPatternRgb[])[] = [
  [hexRgb(0x8e8f42), hexRgb(0x99954b), hexRgb(0xaca456)],
  [hexRgb(0x8f8d4a), hexRgb(0x96924e), hexRgb(0x9b9653)],
  [hexRgb(0x918d4f), hexRgb(0x999355), hexRgb(0x9d9759)],
  [hexRgb(0x898c4e), hexRgb(0x8d9052), hexRgb(0x969759)],
]

const FAMILY_BIASES = [-0.01, 0.015, 0, -0.005] as const
const FAMILY_COUNT = ORGANIC_GRASS_PALETTE.length
let cachedDefaultPattern: GrassPattern | null = null

export function getOrganicGrassPattern() {
  cachedDefaultPattern ??= createOrganicGrassPattern()
  return cachedDefaultPattern
}

export function createOrganicGrassPattern({
  resolution = DEFAULT_RESOLUTION,
  seed = DEFAULT_SEED,
}: GrassPatternOptions = {}): GrassPattern {
  const size = Math.max(32, Math.round(resolution))
  const pixelCount = size * size
  const family = new Uint8Array(pixelCount)
  const foundationFamily = new Uint8Array(pixelCount)
  const detailLevel = new Uint8Array(pixelCount)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      const [warpedU, warpedV] = grassPatternCoordinates(u, v, seed)
      const macro = selectMacroFamily(warpedU, warpedV, seed)
      let selectedFamily = macro.roughFamily
      let insideMesoPatch = false
      let selectedDetailLevel = 0

      const largeMeso = roughPatchField(warpedU, warpedV, 4.1, seed + 2003)
      if (largeMeso > 0.64) {
        selectedFamily = selectDifferentFamily(selectedFamily, warpedU, warpedV, 2.8, seed + 2203)
        insideMesoPatch = true
        selectedDetailLevel = 1
      }

      const smallMeso = roughPatchField(warpedU + 7.31, warpedV - 5.73, 8.3, seed + 3001)
      if (smallMeso > 0.7) {
        selectedFamily = selectDifferentFamily(
          selectedFamily,
          warpedU + 3.17,
          warpedV - 2.41,
          4.9,
          seed + 3203,
        )
        insideMesoPatch = true
        selectedDetailLevel = 2
      }

      if (
        insideMesoPatch &&
        roughPatchField(warpedU - 11.19, warpedV + 8.47, 19.5, seed + 4001) > 0.735
      ) {
        selectedFamily = selectDifferentFamily(
          selectedFamily,
          warpedU - 4.13,
          warpedV + 6.61,
          10.5,
          seed + 4201,
        )
        selectedDetailLevel = 3
      }

      family[index] = selectedFamily
      foundationFamily[index] = macro.foundationFamily
      detailLevel[index] = selectedDetailLevel
    }
  }

  removeSmallIslands(family, size, scaledCleanupArea(size), 2)

  const exposure = assignPatchExposure(family, size, seed)
  const colors = new Uint8ClampedArray(pixelCount * 4)
  for (let index = 0; index < pixelCount; index += 1) {
    const familyIndex = family[index] ?? 1
    const exposureIndex = exposure[index] ?? 1
    const swatch = ORGANIC_GRASS_PALETTE[familyIndex]?.[exposureIndex] ??
      ORGANIC_GRASS_PALETTE[1]?.[1] ?? [150, 146, 78]
    const outputIndex = index * 4
    colors[outputIndex] = swatch[0]
    colors[outputIndex + 1] = swatch[1]
    colors[outputIndex + 2] = swatch[2]
    colors[outputIndex + 3] = 255
  }

  return { colors, detailLevel, exposure, family, foundationFamily, resolution: size }
}

export function sampleOrganicGrassPattern(
  pattern: Pick<GrassPattern, 'colors' | 'resolution'>,
  u: number,
  v: number,
): GrassPatternRgb {
  const size = pattern.resolution
  const x = Math.round(clamp01(u) * (size - 1))
  const y = Math.round(clamp01(v) * (size - 1))
  const index = (y * size + x) * 4
  return [
    pattern.colors[index] ?? 0,
    pattern.colors[index + 1] ?? 0,
    pattern.colors[index + 2] ?? 0,
  ]
}

function grassPatternCoordinates(u: number, v: number, seed: number) {
  const broadWarpU = fractalNoise(u, v, 1.45, 2, seed + 401, 0.52) - 0.5
  const broadWarpV = fractalNoise(u + 9.17, v - 6.31, 1.45, 2, seed + 457, 0.52) - 0.5
  const mesoWarpU = valueNoise(u * 6.7 + 13.1, v * 6.7 - 7.9, seed + 509) - 0.5
  const mesoWarpV = valueNoise(u * 6.7 - 4.3, v * 6.7 + 15.7, seed + 563) - 0.5
  return [
    u + broadWarpU * 0.17 + mesoWarpU * 0.035,
    v + broadWarpV * 0.17 + mesoWarpV * 0.035,
  ] as const
}

function selectMacroFamily(u: number, v: number, seed: number) {
  const foundationA = fractalNoise(u + 2.73, v - 1.91, 1.85, 3, seed + 601, 0.52)
  const foundationB = fractalNoise(
    u * 0.61 - v * 0.79 + 5.19,
    u * 0.79 + v * 0.61 - 3.47,
    1.65,
    3,
    seed + 653,
    0.52,
  )
  const roughA =
    foundationA +
    (fractalNoise(u, v, 10.5, 2, seed + 701, 0.48) - 0.5) * 0.18 +
    (valueNoise(u * 37.5 + 3.7, v * 37.5 - 8.1, seed + 733) - 0.5) * 0.075 +
    (valueNoise(u * 91.5 - 6.3, v * 91.5 + 2.9, seed + 761) - 0.5) * 0.03
  const roughB =
    foundationB +
    (fractalNoise(u + 11.3, v - 7.7, 9.5, 2, seed + 809, 0.48) - 0.5) * 0.18 +
    (valueNoise(u * 33.5 - 5.1, v * 33.5 + 9.7, seed + 853) - 0.5) * 0.075 +
    (valueNoise(u * 87.5 + 7.9, v * 87.5 - 4.1, seed + 887) - 0.5) * 0.03

  return {
    foundationFamily: familyFromAxes(foundationA, foundationB),
    roughFamily: familyFromAxes(roughA, roughB),
  }
}

function roughPatchField(u: number, v: number, baseFrequency: number, seed: number) {
  const body = fractalNoise(u, v, baseFrequency, 2, seed, 0.5)
  const asymmetricLobe = valueNoise(
    u * baseFrequency * 0.57 + 17.3,
    v * baseFrequency * 0.57 - 11.9,
    seed + 43,
  )
  const boundaryBand = fractalNoise(u + 5.17, v - 3.71, baseFrequency * 3.4, 2, seed + 97, 0.46)
  const fineBoundary = valueNoise(
    u * baseFrequency * 10.7 - 7.1,
    v * baseFrequency * 10.7 + 13.7,
    seed + 181,
  )
  return (
    body * 0.82 + asymmetricLobe * 0.18 + (boundaryBand - 0.5) * 0.22 + (fineBoundary - 0.5) * 0.085
  )
}

function selectDifferentFamily(
  currentFamily: number,
  u: number,
  v: number,
  frequency: number,
  seed: number,
) {
  const axisA = fractalNoise(u + 3.7, v - 2.3, frequency, 2, seed, 0.5)
  const axisB = fractalNoise(
    u * 0.68 - v * 0.73 - 4.9,
    u * 0.73 + v * 0.68 + 6.1,
    frequency * 0.91,
    2,
    seed + 61,
    0.5,
  )
  const candidate = familyFromAxes(axisA, axisB)
  if (candidate !== currentFamily) return candidate
  const offset =
    1 +
    Math.min(
      FAMILY_COUNT - 2,
      Math.floor(valueNoise(u * frequency, v * frequency, seed + 127) * (FAMILY_COUNT - 1)),
    )
  return (currentFamily + offset) % FAMILY_COUNT
}

function familyFromAxes(axisA: number, axisB: number) {
  let bestFamily = 0
  let bestScore = Number.NEGATIVE_INFINITY
  for (let candidate = 0; candidate < FAMILY_COUNT; candidate += 1) {
    const directionA = candidate & 1 ? 1 : -1
    const directionB = candidate & 2 ? 1 : -1
    const score =
      (axisA - 0.5) * directionA + (axisB - 0.5) * directionB + (FAMILY_BIASES[candidate] ?? 0)
    if (score > bestScore) {
      bestScore = score
      bestFamily = candidate
    }
  }
  return bestFamily
}

function scaledCleanupArea(size: number) {
  return Math.max(2, Math.round((size * size * 4) / (512 * 512)))
}

function removeSmallIslands(family: Uint8Array, size: number, minArea: number, passes: number) {
  const pixelCount = family.length
  const visited = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  const component = new Int32Array(pixelCount)

  for (let pass = 0; pass < passes; pass += 1) {
    visited.fill(0)
    let changed = false
    for (let start = 0; start < pixelCount; start += 1) {
      if (visited[start]) continue
      const targetFamily = family[start] ?? 0
      const neighboringCounts = [0, 0, 0, 0]
      let read = 0
      let queued = 1
      let componentSize = 0
      queue[0] = start
      visited[start] = 1

      while (read < queued) {
        const index = queue[read++] ?? 0
        component[componentSize++] = index
        const x = index % size
        const y = Math.floor(index / size)
        for (const [offsetX, offsetY] of FOUR_NEIGHBORS) {
          const sampleX = x + offsetX
          const sampleY = y + offsetY
          if (sampleX < 0 || sampleX >= size || sampleY < 0 || sampleY >= size) continue
          const sampleIndex = sampleY * size + sampleX
          const candidateFamily = family[sampleIndex] ?? 0
          if (candidateFamily === targetFamily) {
            if (!visited[sampleIndex]) {
              visited[sampleIndex] = 1
              queue[queued++] = sampleIndex
            }
          } else {
            neighboringCounts[candidateFamily] = (neighboringCounts[candidateFamily] ?? 0) + 1
          }
        }
      }

      if (componentSize >= minArea) continue
      neighboringCounts[targetFamily] = 0
      let replacement = targetFamily
      let replacementCount = 0
      for (let candidate = 0; candidate < neighboringCounts.length; candidate += 1) {
        const count = neighboringCounts[candidate] ?? 0
        if (count > replacementCount) {
          replacement = candidate
          replacementCount = count
        }
      }
      if (replacement === targetFamily) continue
      for (let index = 0; index < componentSize; index += 1) {
        family[component[index] ?? 0] = replacement
      }
      changed = true
    }
    if (!changed) return
  }
}

function assignPatchExposure(family: Uint8Array, size: number, seed: number) {
  const exposure = new Uint8Array(family.length)
  const visited = new Uint8Array(family.length)
  const queue = new Int32Array(family.length)
  let patchId = 0

  for (let start = 0; start < family.length; start += 1) {
    if (visited[start]) continue
    patchId += 1
    const targetFamily = family[start] ?? 0
    const roll = hash01(seed + patchId * 0x45d9f3b)
    const patchExposure = roll < 0.22 ? 0 : roll > 0.78 ? 2 : 1
    let read = 0
    let queued = 1
    queue[0] = start
    visited[start] = 1

    while (read < queued) {
      const index = queue[read++] ?? 0
      exposure[index] = patchExposure
      const x = index % size
      const y = Math.floor(index / size)
      for (const [offsetX, offsetY] of EIGHT_NEIGHBORS) {
        const sampleX = x + offsetX
        const sampleY = y + offsetY
        if (sampleX < 0 || sampleX >= size || sampleY < 0 || sampleY >= size) continue
        const sampleIndex = sampleY * size + sampleX
        if (visited[sampleIndex] || family[sampleIndex] !== targetFamily) continue
        visited[sampleIndex] = 1
        queue[queued++] = sampleIndex
      }
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x
      const familyIndex = family[index] ?? 0
      const u = (x + 0.5) / size + familyIndex * 4.71
      const v = (y + 0.5) / size - familyIndex * 3.83
      const tonePatch = roughPatchField(u, v, 6.2, seed + 5003 + familyIndex * 211)
      let insideTonePatch = false

      if (tonePatch > 0.65) {
        exposure[index] = selectDifferentExposure(
          exposure[index] ?? 1,
          u,
          v,
          seed + 5209 + familyIndex * 227,
        )
        insideTonePatch = true
      }

      if (
        insideTonePatch &&
        roughPatchField(u - 9.7, v + 12.1, 21.5, seed + 6007 + familyIndex * 239) > 0.72
      ) {
        exposure[index] = selectDifferentExposure(
          exposure[index] ?? 1,
          u - 5.3,
          v + 7.9,
          seed + 6203 + familyIndex * 251,
        )
      }
    }
  }

  removeSmallIslands(exposure, size, scaledCleanupArea(size), 1)
  return exposure
}

function selectDifferentExposure(currentExposure: number, u: number, v: number, seed: number) {
  const roll = valueNoise(u * 3.7 + 5.1, v * 3.7 - 8.3, seed)
  const candidate = roll < 0.5 ? 0 : 2
  return candidate === currentExposure ? 1 : candidate
}

function fractalNoise(
  u: number,
  v: number,
  baseFrequency: number,
  octaves: number,
  seed: number,
  gain: number,
) {
  let amplitude = 1
  let frequency = baseFrequency
  let total = 0
  let normalization = 0
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(u * frequency, v * frequency, seed + octave * 1013) * amplitude
    normalization += amplitude
    amplitude *= gain
    frequency *= 2
  }
  return normalization > 0 ? total / normalization : 0
}

function valueNoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = quintic(x - x0)
  const ty = quintic(y - y0)
  const top = lerp(hashLattice(x0, y0, seed), hashLattice(x0 + 1, y0, seed), tx)
  const bottom = lerp(hashLattice(x0, y0 + 1, seed), hashLattice(x0 + 1, y0 + 1, seed), tx)
  return lerp(top, bottom, ty)
}

function hashLattice(x: number, y: number, seed: number) {
  return hash01(Math.imul(x, 0x1e35a7bd) ^ Math.imul(y, 0x94d049bb) ^ seed)
}

function hash01(value: number) {
  let hash = value | 0
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return (hash >>> 8) / 0x1000000
}

function hexRgb(value: number): GrassPatternRgb {
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function quintic(value: number) {
  return value * value * value * (value * (value * 6 - 15) + 10)
}

function lerp(first: number, second: number, amount: number) {
  return first + (second - first) * amount
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

const EIGHT_NEIGHBORS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
]

const FOUR_NEIGHBORS: readonly (readonly [number, number])[] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
]

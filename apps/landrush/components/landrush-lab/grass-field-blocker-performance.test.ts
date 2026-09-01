import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createGrassFieldTexture } from './grass-field-texture'

const GRASS_FIELD_DETERMINISM_OPTIONS = {
  alphaMode: 'density' as const,
  blockers: [
    {
      clearanceMeters: 0.175,
      featherMeters: 0.28,
      points: [
        { x: -1, z: -1 },
        { x: 1, z: -1 },
        { x: 1, z: 1 },
        { x: -1, z: 1 },
        { x: -1, z: -1 },
      ],
    },
  ],
  density: 0.73,
  edgeFadeMeters: 2.4,
  patchSize: 17,
  patchSoftness: 0.21,
  perimeter: [
    { x: -4, z: -4 },
    { x: 4, z: -4 },
    { x: 4, z: 4 },
    { x: -4, z: 4 },
    { x: -4, z: -4 },
  ],
  planeSize: 8,
  resolution: 12,
  roads: [
    {
      points: [
        { x: -4, z: 0 },
        { x: 4, z: 0 },
      ],
      width: 1.2,
    },
  ],
}

describe('grass field blocker setup budget', () => {
  test('compiles blocker rings once before main-thread and worker raster loops', () => {
    const scopes: string[] = []
    const field = createGrassFieldTexture({
      blockers: [
        {
          clearanceMeters: 0.175,
          featherMeters: 0.28,
          points: [
            { x: -1, z: -1 },
            { x: 1, z: -1 },
            { x: 1, z: 1 },
            { x: -1, z: 1 },
            { x: -1, z: -1 },
          ],
        },
      ],
      perimeter: [
        { x: -4, z: -4 },
        { x: 4, z: -4 },
        { x: 4, z: 4 },
        { x: -4, z: 4 },
        { x: -4, z: -4 },
      ],
      planeSize: 8,
      profileMeasure: (id, callback) => {
        scopes.push(id)
        return callback()
      },
      resolution: 8,
      roads: [],
    })
    expect(scopes.filter((scope) => scope.endsWith('.data.compile-blockers'))).toHaveLength(1)
    field.texture.dispose()

    const mainSource = readFileSync(new URL('./grass-field-texture.ts', import.meta.url), 'utf8')
    const workerSource = readFileSync(
      new URL('../../public/landrush-lab/grass-field-worker.js', import.meta.url),
      'utf8',
    )
    expect(mainSource.indexOf('const compiledBlockers = measure(')).toBeLessThan(
      mainSource.indexOf('.data.sample-pixels'),
    )
    expect(
      workerSource.indexOf('const compiledBlockers = compileGrassFieldBlockers(blockers)'),
    ).toBeLessThan(workerSource.indexOf('for (let y = 0; y < fieldResolution; y += 1)'))
    expect(readFunction(mainSource, 'sampleBlockerDistance')).not.toContain('openRing(')
    expect(readFunction(workerSource, 'sampleBlockerDistance')).not.toContain('openRing(')
  })

  test('hoists invariant patch options and preserves deterministic generator output', () => {
    const mainSource = readFileSync(new URL('./grass-field-texture.ts', import.meta.url), 'utf8')
    const workerSource = readFileSync(
      new URL('../../public/landrush-lab/grass-field-worker.js', import.meta.url),
      'utf8',
    )
    const mainPixelLoop = mainSource.indexOf('for (let y = rowStart; y < rowEnd; y += 1)')
    const workerPixelLoop = workerSource.indexOf('for (let y = 0; y < fieldResolution; y += 1)')

    expect(mainSource.indexOf('const patchOptions = measure(')).toBeLessThan(mainPixelLoop)
    expect(workerSource.indexOf('const patchOptions = {')).toBeLessThan(workerPixelLoop)
    expect(workerSource.slice(workerPixelLoop, workerSource.indexOf('const shares ='))).toContain(
      'patchOptions,',
    )
    expect(
      workerSource.slice(workerPixelLoop, workerSource.indexOf('const shares =')),
    ).not.toContain('density: density ??')

    const firstMain = createGrassFieldTexture(GRASS_FIELD_DETERMINISM_OPTIONS)
    const secondMain = createGrassFieldTexture(GRASS_FIELD_DETERMINISM_OPTIONS)
    const firstMainBytes = firstMain.texture.image.data as Uint8Array
    const secondMainBytes = secondMain.texture.image.data as Uint8Array
    const firstWorker = runGrassFieldWorker(workerSource, GRASS_FIELD_DETERMINISM_OPTIONS)
    const secondWorker = runGrassFieldWorker(workerSource, GRASS_FIELD_DETERMINISM_OPTIONS)

    expect(byteHash(firstMainBytes)).toBe(
      '2a5a0ff1341fb05aa7746c84225f8bf22ae98e999eeeb6f86da4c33efea5d759',
    )
    expect(byteHash(secondMainBytes)).toBe(byteHash(firstMainBytes))
    expect(byteHash(firstWorker.bytes)).toBe(
      'bf798ac2c48e2dad691f3375b95b4228f44866a386c48645ed64f85ef049cfc9',
    )
    expect(byteHash(secondWorker.bytes)).toBe(byteHash(firstWorker.bytes))
    expect(alphaBytes(firstWorker.bytes)).toEqual(alphaBytes(firstMainBytes))
    expect(firstWorker.resolution).toBe(GRASS_FIELD_DETERMINISM_OPTIONS.resolution)
    expect(firstWorker.stats).toEqual(firstMain.stats)

    firstMain.texture.dispose()
    secondMain.texture.dispose()
  })

  test('keeps deterministic rock setup independent from change-driven building blockers', () => {
    const source = readFileSync(new URL('./grass-water-layers.tsx', import.meta.url), 'utf8')
    const rockLayoutSetup = source.slice(
      source.indexOf('const rockClusterLayout = useMemo('),
      source.indexOf('const visibleRockClusterLayout = useMemo('),
    )
    expect(rockLayoutSetup).toContain('blockers: grassBlockers')
    expect(rockLayoutSetup).not.toContain('blockers: sourceBladeGrassBlockers')
    expect(rockLayoutSetup).toContain('grassBlockers,')

    const changeDrivenVisibility = source.slice(
      source.indexOf('const visibleRockClusterLayout = useMemo('),
      source.indexOf('const resolvedBladeGrassBlockers = useMemo('),
    )
    expect(changeDrivenVisibility).toContain('blockers: sourceBladeGrassBlockers')
    expect(changeDrivenVisibility).toContain(
      'createLandrushIslandRockGrassBlockers(visibleRockClusterLayout)',
    )
    expect(changeDrivenVisibility.indexOf('const visibleRockClusterLayout')).toBeLessThan(
      changeDrivenVisibility.indexOf('const rockGrassBlockers'),
    )

    const groundSurfaceSetup = source.slice(
      source.indexOf('const groundField = useMemo('),
      source.indexOf('const spawnPreviewField = useMemo('),
    )
    expect(groundSurfaceSetup.match(/blockers: grassBlockers/g)).toHaveLength(2)
    expect(groundSurfaceSetup).not.toContain('rockGrassBlockers')
    expect(source).not.toContain('const resolvedGroundGrassBlockers')

    const bladeAndTreeSetup = source.slice(
      source.indexOf('const resolvedBladeGrassBlockers = useMemo('),
      source.indexOf('const resolvedBladeRenderOrder ='),
    )
    expect(bladeAndTreeSetup.match(/rockGrassBlockers/g)?.length).toBeGreaterThanOrEqual(4)
  })
})

function readFunction(source: string, name: string) {
  const start = source.indexOf(`function ${name}`)
  const nextFunction = source.indexOf('\nfunction ', start + 1)
  return source.slice(start, nextFunction < 0 ? undefined : nextFunction)
}

type GrassFieldWorkerResult = {
  bytes: Uint8Array
  resolution: number
  stats: {
    activeColorCount: number
    densityCoverage: number
    regionBalanceMin: number
    roadClearancePass: boolean
    shoreFadePass: boolean
  }
}

function runGrassFieldWorker(source: string, options: unknown): GrassFieldWorkerResult {
  let result: GrassFieldWorkerResult | null = null
  const workerScope: {
    onmessage?: (event: { data: unknown }) => void
    postMessage: (payload: Omit<GrassFieldWorkerResult, 'bytes'> & { bytes: ArrayBuffer }) => void
  } = {
    postMessage: (payload) => {
      result = { ...payload, bytes: new Uint8Array(payload.bytes) }
    },
  }
  runInNewContext(source, { self: workerScope })
  workerScope.onmessage?.({ data: options })
  if (!result) throw new Error('Grass field worker did not post a result')
  return result
}

function byteHash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function alphaBytes(bytes: Uint8Array) {
  const alpha = new Uint8Array(bytes.length / 4)
  for (let source = 3, target = 0; source < bytes.length; source += 4, target += 1) {
    alpha[target] = bytes[source] ?? 0
  }
  return alpha
}

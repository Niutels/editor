import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { inspectGlb } from './landrush-glb-audit.mjs'

const sourceUrl = new URL(
  '../assets/zombie-escape-meshy-source/props/street-lightpost/model.glb',
  import.meta.url,
)
const generationUrl = new URL(
  '../assets/zombie-escape-meshy-source/props/street-lightpost/meshy-generation.json',
  import.meta.url,
)
const optimizationUrl = new URL(
  '../assets/zombie-escape-meshy-source/props/street-lightpost/runtime-optimization.json',
  import.meta.url,
)
const runtimeUrl = new URL(
  '../public/landrush-lab/zombie-escape/assets/props/street-lightpost.glb',
  import.meta.url,
)

test('keeps the Meshy source and reduced textured runtime lightpost auditable', async () => {
  const [source, runtime, generation, optimization] = await Promise.all([
    inspectGlb(fileURLToPath(sourceUrl)),
    inspectGlb(fileURLToPath(runtimeUrl)),
    readJson(generationUrl),
    readJson(optimizationUrl),
  ])

  assert.equal(generation.aiModel, 'meshy-t2')
  assert.equal(generation.targetFaceCount, 3000)
  assert.equal(generation.textureResolution, '2k')
  assert.equal(generation.previewTaskIdStatus, 'SUCCEEDED')
  assert.equal(generation.refineTaskIdStatus, 'SUCCEEDED')
  assert.ok(source.triangleCount <= 3100)
  assert.equal(source.triangleCount, generation.sourceInspection.triangleCount)
  assert.equal(source.contentHash, generation.artifacts.model.sha256)

  assert.ok(runtime.triangleCount < 3000)
  assert.ok(runtime.triangleCount <= optimization.simplification.targetTriangleCount)
  assert.ok(runtime.triangleCount < source.triangleCount)
  assert.ok(runtime.byteLength < source.byteLength)
  assert.equal(runtime.materialCount, 1)
  assert.equal(runtime.textureCount, 4)
  assert.equal(runtime.imageCount, 4)
  assert.equal(runtime.nonTrianglePrimitiveCount, 0)
  assert.equal(runtime.primitiveWithoutMaterialCount, 0)
  assert.ok(
    runtime.images.every(
      (image) =>
        image.embedded &&
        image.mimeType === 'image/jpeg' &&
        image.width === 512 &&
        image.height === 512,
    ),
  )
  assert.ok(
    runtime.materials.every(
      (material) =>
        material.textureSlots.baseColor &&
        material.textureSlots.metallicRoughness &&
        material.textureSlots.normal &&
        material.textureSlots.emissive,
    ),
  )

  assert.equal(optimization.generatedBy, 'optimize-zombie-night-street-lightpost.mjs')
  assert.equal(optimization.meshy.generationFingerprint, generation.generationFingerprint)
  assert.equal(optimization.meshy.previewTaskId, generation.previewTaskId)
  assert.equal(optimization.meshy.refineTaskId, generation.refineTaskId)
  assert.equal(optimization.source.contentHash, source.contentHash)
  assert.equal(optimization.source.triangleCount, source.triangleCount)
  assert.equal(optimization.runtime.contentHash, runtime.contentHash)
  assert.equal(optimization.runtime.triangleCount, runtime.triangleCount)
  assert.equal(optimization.runtime.textureResolution, 512)
  assert.ok(!optimization.source.path.startsWith('public/'))
  assert.ok(optimization.runtime.path.startsWith('public/'))

  assert.equal(await sha256(sourceUrl), source.contentHash)
  assert.equal(await sha256(runtimeUrl), runtime.contentHash)
})

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'))
}

async function sha256(url) {
  return createHash('sha256').update(await readFile(url)).digest('hex')
}

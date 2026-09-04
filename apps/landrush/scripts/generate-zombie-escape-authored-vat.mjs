import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { Texture } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createZombieEscapeAttackClip } from '../components/landrush-lab/zombie-escape-attack-presentation.ts'
import { createZombieEscapeDeathClip } from '../components/landrush-lab/zombie-escape-death-presentation.ts'
import {
  decodeZombieEscapeAuthoredVat,
  encodeZombieEscapeAuthoredVat,
  resolveZombieEscapeAuthoredVatPath,
} from '../components/landrush-lab/zombie-escape-authored-vat.ts'
import { bakeZombieEscapeAuthoredVat } from '../components/landrush-lab/zombie-escape-instanced-skinned-presentation.ts'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from '@landrush/zombie-gameplay/zombie-escape-zombie-catalog'

const APP_ROOT = resolve(import.meta.dirname, '..')
const PUBLIC_ROOT = resolve(APP_ROOT, 'public')
const CHECK_ONLY = process.argv.includes('--check')

globalThis.self ??= globalThis
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, init = {}) {
    this.type = type
    Object.assign(this, init)
  }
}

let rawByteLength = 0
let compressedByteLength = 0
for (let variantIndex = 0; variantIndex < ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length; variantIndex += 1) {
  const zombie = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[variantIndex]
  const [riggedGltf, runGltf, walkGltf] = await Promise.all([
    loadGltf(zombie.glb.riggedBase.path),
    loadGltf(zombie.glb.run.path),
    loadGltf(zombie.glb.walk.path),
  ])
  const runClip = findRequiredClip(runGltf.animations, zombie.glb.run.expectedClipName, zombie.id)
  const walkClip = findRequiredClip(
    walkGltf.animations,
    zombie.glb.walk.expectedClipName,
    zombie.id,
  )
  const payload = bakeZombieEscapeAuthoredVat({
    attackClip: createZombieEscapeAttackClip(riggedGltf.scene, walkClip),
    deathClip: createZombieEscapeDeathClip(riggedGltf.scene),
    runClip,
    source: riggedGltf.scene,
    walkClip,
  })
  const raw = encodeZombieEscapeAuthoredVat(payload)
  const outputPath = resolvePublicPath(resolveZombieEscapeAuthoredVatPath(zombie.id))
  if (CHECK_ONLY) {
    const compressed = await readFile(outputPath)
    const current = gunzipSync(compressed)
    assertDecodedVatMatchesBaker(payload, decodeZombieEscapeAuthoredVat(current), zombie.id)
    if (!Buffer.from(raw).equals(current)) {
      throw new Error(
        `${relative(APP_ROOT, outputPath)} is stale; run generate:zombie-escape-authored-vat.`,
      )
    }
    rawByteLength += current.byteLength
    compressedByteLength += compressed.byteLength
    continue
  }
  const compressed = gzipSync(raw, { level: 9, mtime: 0 })
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, compressed)
  rawByteLength += raw.byteLength
  compressedByteLength += compressed.byteLength
  console.log(
    `${zombie.id}: ${formatBytes(raw.byteLength)} -> ${formatBytes(compressed.byteLength)} (${sha256(compressed).slice(0, 12)})`,
  )
}

console.log(
  `${CHECK_ONLY ? 'Verified' : 'Generated'} ${ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length} authored VAT assets: ${formatBytes(rawByteLength)} raw, ${formatBytes(compressedByteLength)} gzip.`,
)

async function loadGltf(assetPath) {
  const bytes = await readFile(resolvePublicPath(assetPath))
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const loader = new GLTFLoader().setKTX2Loader({
    load(_url, onLoad) {
      queueMicrotask(() => onLoad(new Texture()))
      return {}
    },
  })
  return new Promise((resolvePromise, rejectPromise) => {
    loader.parse(buffer, '', resolvePromise, rejectPromise)
  })
}

function findRequiredClip(animations, expectedName, zombieId) {
  const clip = animations.find(({ name }) => name === expectedName)
  if (!clip) throw new Error(`${zombieId}: missing required animation clip ${expectedName}.`)
  return clip
}

function resolvePublicPath(assetPath) {
  if (!(assetPath.startsWith('/') && !assetPath.includes('..'))) {
    throw new Error(`Invalid public asset path: ${assetPath}.`)
  }
  return resolve(PUBLIC_ROOT, assetPath.slice(1))
}

function assertDecodedVatMatchesBaker(expected, actual, zombieId) {
  if (expected.frameCount !== actual.frameCount || expected.meshes.length !== actual.meshes.length) {
    throw new Error(`${zombieId}: decoded authored VAT structure differs from the runtime baker.`)
  }
  for (let index = 0; index < expected.meshes.length; index += 1) {
    const expectedMesh = expected.meshes[index]
    const actualMesh = actual.meshes[index]
    if (
      expectedMesh.vertexCount !== actualMesh.vertexCount ||
      expectedMesh.width !== actualMesh.width ||
      expectedMesh.height !== actualMesh.height ||
      !Buffer.from(expectedMesh.data.buffer).equals(Buffer.from(actualMesh.data.buffer))
    ) {
      throw new Error(
        `${zombieId}: decoded authored VAT mesh ${index} differs from the runtime baker.`,
      )
    }
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

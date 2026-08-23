import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  islandAmbientPristineSourcePath,
  islandAmbientPristineSourceReference,
} from './island-ambient-glb-optimizer.mjs'

const publicRoot = resolve(import.meta.dirname, '../public/landrush-lab/island-ambient-assets')
const statePath = resolve(publicRoot, 'meshy-generation.json')
const manifestPath = resolve(publicRoot, 'asset-manifest.json')
const dryRun = process.argv.includes('--dry-run')
const state = JSON.parse(await readFile(statePath, 'utf8'))
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const migrated = []

for (const asset of manifest.assets) {
  const record = state.assets?.[asset.id]
  if (!record) throw new Error(`${asset.id}: missing generation record.`)
  const publicAssetDirectory = resolve(
    publicRoot,
    { boat: 'boats', fish: 'fish', npc: 'npcs', palm: 'palms' }[asset.kind],
    asset.id,
  )
  const pristineAssetDirectory = dirname(islandAmbientPristineSourcePath(asset, 'model'))
  const sourceImagePath = resolve(pristineAssetDirectory, 'source.png')
  await migrateVerifiedFile({
    byteLength: record.sourceByteLength,
    destination: sourceImagePath,
    sha256: record.sourceSha256,
    source: resolve(publicAssetDirectory, 'source.png'),
  })
  record.sourcePath = islandAmbientPristineSourceReference(sourceImagePath)

  const authoringArtifactKeys =
    asset.kind === 'npc' ? ['model', 'rigged', 'idle', 'run', 'walk'] : ['model']
  for (const artifactKey of authoringArtifactKeys) {
    const artifact = record.artifacts?.[artifactKey]
    if (!artifact) throw new Error(`${asset.id}: missing ${artifactKey} source provenance.`)
    const destination = islandAmbientPristineSourcePath(asset, artifactKey)
    const source =
      asset.kind === 'npc' && artifactKey !== 'rigged'
        ? resolve(publicAssetDirectory, `${artifactKey}.glb`)
        : null
    await migrateVerifiedFile({
      byteLength: artifact.byteLength,
      destination,
      sha256: artifact.sha256,
      source,
    })
    const reference = islandAmbientPristineSourceReference(destination)
    artifact.path = reference
    artifact.sourcePath = reference
  }

  record.outputs = expectedRuntimeOutputs(asset)
  asset.outputs = { ...record.outputs }
}

state.authoringStorage = {
  publicRuntimeOnly: true,
  root: 'assets/island-ambient-meshy-source',
  schemaVersion: 1,
}
if (!dryRun) {
  await atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`)
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}
console.log(
  `${dryRun ? 'Validated' : 'Migrated'} ${migrated.length} island ambient authoring files outside public.`,
)

async function migrateVerifiedFile({ byteLength, destination, sha256, source }) {
  const destinationBody = await readOptional(destination)
  if (destinationBody) assertContent(destination, destinationBody, byteLength, sha256)
  const sourceBody = source ? await readOptional(source) : null
  if (sourceBody) assertContent(source, sourceBody, byteLength, sha256)
  if (!(destinationBody || sourceBody)) {
    throw new Error(`Missing authoring source at ${destination}${source ? ` or ${source}` : ''}.`)
  }
  if (dryRun) return
  if (!destinationBody) {
    await mkdir(dirname(destination), { recursive: true })
    const temporaryPath = `${destination}.${process.pid}.${randomUUID()}.tmp`
    try {
      await copyFile(source, temporaryPath)
      assertContent(destination, await readFile(temporaryPath), byteLength, sha256)
      await rename(temporaryPath, destination)
    } finally {
      await rm(temporaryPath, { force: true })
    }
  }
  if (sourceBody) {
    await rm(source)
    migrated.push({ destination, source })
  }
}

function assertContent(path, body, byteLength, expectedSha256) {
  const actualSha256 = createHash('sha256').update(body).digest('hex')
  if (body.byteLength !== byteLength || actualSha256 !== expectedSha256) {
    throw new Error(`${path}: content does not match recorded Meshy provenance.`)
  }
}

function expectedRuntimeOutputs(asset) {
  const directory = { boat: 'boats', fish: 'fish', npc: 'npcs', palm: 'palms' }[asset.kind]
  const base = `/landrush-lab/island-ambient-assets/${directory}/${asset.id}`
  return asset.kind === 'npc'
    ? {
        idleAnimation: `${base}/idle.anim.glb`,
        rigged: `${base}/rigged.glb`,
        runAnimation: `${base}/run.anim.glb`,
        walkAnimation: `${base}/walk.anim.glb`,
      }
    : { model: `${base}/model.glb` }
}

async function readOptional(path) {
  try {
    return await readFile(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function atomicWrite(destination, value) {
  const temporaryPath = `${destination}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, value)
  try {
    await rename(temporaryPath, destination)
  } catch (error) {
    if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) throw error
    await copyFile(temporaryPath, destination)
    await rm(temporaryPath)
  }
}

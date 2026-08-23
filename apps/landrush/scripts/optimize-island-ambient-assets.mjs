import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  ISLAND_AMBIENT_PRISTINE_SOURCE_DIRECTORY,
  ISLAND_AMBIENT_TEXTURE_OPTIMIZER,
  optimizeIslandAmbientRuntimeAssets,
} from './island-ambient-glb-optimizer.mjs'

const publicDirectory = resolve(import.meta.dirname, '../public')
const assetRoot = resolve(publicDirectory, 'landrush-lab/island-ambient-assets')
const statePath = resolve(assetRoot, 'meshy-generation.json')
const manifest = JSON.parse(await readFile(resolve(assetRoot, 'asset-manifest.json'), 'utf8'))
const state = JSON.parse(await readFile(statePath, 'utf8'))
const requestedIds = readListArgument('--ids')
const concurrency = readNumberArgument('--concurrency', 2)
const assets = manifest.assets.filter((asset) => !requestedIds || requestedIds.has(asset.id))

if (requestedIds) {
  const unknownIds = [...requestedIds].filter((id) => !manifest.assets.some((asset) => asset.id === id))
  if (unknownIds.length > 0) throw new Error(`Unknown asset ids: ${unknownIds.join(', ')}`)
}

const summaries = await optimizeIslandAmbientRuntimeAssets({
  assets,
  concurrency,
  force: process.argv.includes('--force'),
  persistState: (value) => atomicWrite(statePath, `${JSON.stringify(value, null, 2)}\n`),
  publicDirectory,
  sourceDirectory: ISLAND_AMBIENT_PRISTINE_SOURCE_DIRECTORY,
  state,
})
state.runtimeTextureOptimization = ISLAND_AMBIENT_TEXTURE_OPTIMIZER
manifest.runtimeTextures = ISLAND_AMBIENT_TEXTURE_OPTIMIZER
await Promise.all([
  atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`),
  atomicWrite(
    resolve(assetRoot, 'asset-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  ),
])
const optimizedCount = summaries.filter(({ skipped }) => !skipped).length
console.log(
  `Island ambient runtime optimization complete: ${optimizedCount} optimized, ${summaries.length - optimizedCount} current.`,
)

function readListArgument(name) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`))
  const index = process.argv.indexOf(name)
  const value = inline?.slice(name.length + 1) ?? (index >= 0 ? process.argv[index + 1] : null)
  if (!value) return null
  return new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))
}

function readNumberArgument(name, fallback) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`))
  const index = process.argv.indexOf(name)
  const value = inline?.slice(name.length + 1) ?? (index >= 0 ? process.argv[index + 1] : null)
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) {
    throw new Error(`${name} must be an integer from 1 to 4.`)
  }
  return parsed
}

async function atomicWrite(destination, value) {
  await mkdir(dirname(destination), { recursive: true })
  const temporaryPath = `${destination}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, value)
  try {
    await rename(temporaryPath, destination)
  } catch (error) {
    if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) throw error
    await copyFile(temporaryPath, destination)
    await rm(temporaryPath, { force: true })
  }
}

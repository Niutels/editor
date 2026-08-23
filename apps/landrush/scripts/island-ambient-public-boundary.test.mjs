import assert from 'node:assert/strict'
import { access, readdir, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import test from 'node:test'

const appRoot = resolve(import.meta.dirname, '..')
const publicDirectory = resolve(appRoot, 'public')
const publicRoot = resolve(publicDirectory, 'landrush-lab/island-ambient-assets')
const sourceRoot = resolve(appRoot, 'assets/island-ambient-meshy-source')

test('public ambient tree contains only catalog-reachable runtime payloads', async () => {
  const manifest = JSON.parse(await readFile(resolve(publicRoot, 'asset-manifest.json'), 'utf8'))
  const state = JSON.parse(await readFile(resolve(publicRoot, 'meshy-generation.json'), 'utf8'))
  const expectedPublicFiles = new Set()
  for (const asset of manifest.assets) {
    const expectedOutputs = runtimeOutputs(asset)
    assert.deepEqual(asset.outputs, expectedOutputs)
    assert.deepEqual(state.assets[asset.id].outputs, expectedOutputs)
    for (const publicPath of Object.values(expectedOutputs)) {
      expectedPublicFiles.add(publicPath.replace(/^\/+/, ''))
    }
  }

  const publicFiles = (await walkFiles(publicRoot))
    .map((path) => relative(publicDirectory, path).replaceAll('\\', '/'))
    .filter((path) => !path.endsWith('.json'))
    .sort()
  assert.deepEqual(publicFiles, [...expectedPublicFiles].sort())
})

test('source images and Meshy authoring GLBs remain available outside public', async () => {
  const manifest = JSON.parse(await readFile(resolve(publicRoot, 'asset-manifest.json'), 'utf8'))
  const state = JSON.parse(await readFile(resolve(publicRoot, 'meshy-generation.json'), 'utf8'))
  for (const asset of manifest.assets) {
    const record = state.assets[asset.id]
    assert.match(record.sourcePath, /^assets\/island-ambient-meshy-source\//u)
    await access(resolve(appRoot, record.sourcePath))
    const artifactKeys = asset.kind === 'npc' ? ['model', 'rigged', 'idle', 'run', 'walk'] : ['model']
    for (const artifactKey of artifactKeys) {
      const artifact = record.artifacts[artifactKey]
      assert.match(artifact.path, /^assets\/island-ambient-meshy-source\//u)
      assert.equal(artifact.sourcePath, artifact.path)
      await access(resolve(appRoot, artifact.path))
    }
  }
})

function runtimeOutputs(asset) {
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

async function walkFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walkFiles(path)))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

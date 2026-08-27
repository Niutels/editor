import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import {
  ZOMBIE_ESCAPE_WEAPON_IDS,
  optimizeZombieEscapeWeaponRuntimeAssets,
  zombieEscapeWeaponSourcePath,
} from './zombie-escape-weapon-glb-optimizer.mjs'

const appRoot = resolve(import.meta.dirname, '..')
const checkedInPublicDirectory = resolve(appRoot, 'public')
const generationPath = resolve(
  checkedInPublicDirectory,
  'landrush-lab/zombie-escape/assets/meshy-generation.json',
)

test('weapon optimization is deterministic, cacheable, source-safe, and budget-atomic', async (t) => {
  const fixtureRoot = await mkdtemp(resolve(tmpdir(), 'landrush-weapon-optimizer-test-'))
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }))
  const publicDirectory = resolve(fixtureRoot, 'public')
  const state = JSON.parse(await readFile(generationPath, 'utf8'))

  for (const id of ZOMBIE_ESCAPE_WEAPON_IDS) {
    const publicPath = state.assets[id].outputs.model.replace(/^\/+/, '')
    const source = resolve(checkedInPublicDirectory, publicPath)
    const destination = resolve(publicDirectory, publicPath)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(source, destination)
  }

  const id = ZOMBIE_ESCAPE_WEAPON_IDS[0]
  const publicPath = state.assets[id].outputs.model.replace(/^\/+/, '')
  const checkedInRuntimePath = resolve(checkedInPublicDirectory, publicPath)
  const fixtureRuntimePath = resolve(publicDirectory, publicPath)
  const sourcePath = zombieEscapeWeaponSourcePath(id)
  const sourceHashBefore = await fileHash(sourcePath)
  let persistCount = 0

  const generated = await optimizeZombieEscapeWeaponRuntimeAssets({
    force: true,
    ids: [id],
    persistState: async () => {
      persistCount += 1
    },
    publicDirectory,
    state,
  })
  assert.equal(generated[0].skipped, false)
  assert.equal(await fileHash(fixtureRuntimePath), await fileHash(checkedInRuntimePath))
  assert.equal(await fileHash(sourcePath), sourceHashBefore)
  assert.equal(persistCount, 1)

  const cached = await optimizeZombieEscapeWeaponRuntimeAssets({
    ids: [id],
    persistState: async () => {
      persistCount += 1
    },
    publicDirectory,
    state,
  })
  assert.equal(cached[0].skipped, true)
  assert.equal(persistCount, 1)

  const alternateId = ZOMBIE_ESCAPE_WEAPON_IDS[1]
  const alternatePublicPath = state.assets[alternateId].outputs.model.replace(/^\/+/, '')
  await copyFile(resolve(publicDirectory, alternatePublicPath), fixtureRuntimePath)
  const stateBeforePersistFailure = structuredClone(state)
  const runtimeHashBeforePersistFailure = await fileHash(fixtureRuntimePath)
  await assert.rejects(
    optimizeZombieEscapeWeaponRuntimeAssets({
      force: true,
      ids: [id],
      persistState: async () => {
        persistCount += 1
        throw new Error('injected state persistence failure')
      },
      publicDirectory,
      state,
    }),
    /injected state persistence failure/,
  )
  assert.deepEqual(state, stateBeforePersistFailure)
  assert.equal(await fileHash(fixtureRuntimePath), runtimeHashBeforePersistFailure)
  assert.equal(persistCount, 2)

  const stateBeforeRejectedRun = structuredClone(state)
  const runtimeHashBeforeRejectedRun = await fileHash(fixtureRuntimePath)
  await assert.rejects(
    optimizeZombieEscapeWeaponRuntimeAssets({
      force: true,
      ids: [id],
      maxRuntimeBytes: 1,
      persistState: async () => {
        persistCount += 1
      },
      publicDirectory,
      state,
    }),
    /runtime payload is .* budget is 1/,
  )
  assert.deepEqual(state, stateBeforeRejectedRun)
  assert.equal(await fileHash(fixtureRuntimePath), runtimeHashBeforeRejectedRun)
  assert.equal(persistCount, 2)
})

async function fileHash(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

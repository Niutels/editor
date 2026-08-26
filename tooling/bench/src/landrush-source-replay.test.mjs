import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  installLandrushBenchmarkFixture,
  loadLandrushBenchmarkFixture,
} from './landrush-fixture.mjs'
import {
  createLandrushBenchmarkFixtureFromSourceReplay,
  LANDRUSH_SOURCE_REPLAY_SCHEMA_VERSION,
  loadLandrushSourceReplay,
  loadLandrushSourceReplayWithIntegrity,
  parseLandrushSourceReplay,
} from './landrush-source-replay.mjs'
import { restoreLandrushBenchmarkFixture } from './scenario/scenario-utils.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const CANONICAL_REPLAY_PATH = path.join(
  REPO_ROOT,
  'tooling',
  'bench',
  'fixtures',
  'landrush-zombie-navigation-real-island-source.v1.json',
)
const CANONICAL_REPLAY_SHA_256 = '725f5e60276d4c2d5a207e300022582cfb3023d12f2b32f2bc348c11a83df69e'

function createReplay() {
  return {
    capturedAt: '2026-08-25T00:00:00.000Z',
    report: {
      camera: {
        position: [10, 20, 30],
        quaternion: [0, 0, 0, 1],
        target: [1, 2, 3],
      },
      mode: {
        buildParcelId: null,
        fpv: false,
        view: 'player',
      },
      player: {
        heading: 1.25,
        position: [4, 5, 6],
        profile: {
          color: '#abcdef',
          id: 'player-1',
          name: 'Builder',
        },
      },
      save: {
        builds: [{ nodes: [{ customNodeField: true }], parcelId: 'parcel-1' }],
        ownerships: [{ parcelId: 'parcel-1' }],
        tvMediaStates: [{ nodeId: 'tv-1' }],
        worldId: 'world-1',
      },
    },
    schemaVersion: LANDRUSH_SOURCE_REPLAY_SCHEMA_VERSION,
  }
}

test('loads the stripped replay contract and preserves opaque scene payloads', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'landrush-source-replay-'))
  const sourcePath = path.join(directory, 'source.v1.json')
  const replay = createReplay()
  await writeFile(sourcePath, `${JSON.stringify(replay)}\n`)
  try {
    const loaded = await loadLandrushSourceReplay(sourcePath)
    assert.deepEqual(loaded, replay)
    assert.notEqual(loaded.report.save.builds, replay.report.save.builds)
    assert.deepEqual(loaded.report.save.builds[0].nodes, [{ customNodeField: true }])
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('authenticates the canonical 147-node real-island source replay', async () => {
  const loaded = await loadLandrushSourceReplayWithIntegrity(CANONICAL_REPLAY_PATH, {
    expectedSha256: CANONICAL_REPLAY_SHA_256,
  })
  assert.equal(loaded.sha256, CANONICAL_REPLAY_SHA_256)
  assert.equal(loaded.replay.report.save.builds.length, 4)
  assert.equal(
    loaded.replay.report.save.builds.reduce((count, build) => count + build.nodes.length, 0),
    147,
  )
  assert.equal(loaded.replay.report.save.ownerships.length, 4)
  assert.equal(loaded.replay.report.save.tvMediaStates.length, 0)
  assert.equal(
    loaded.replay.report.save.worldId,
    'landrush-world:landrush-island:mvp-loop-1-295:world-parcels:12:12:15:0:0.18:0.12:0.82',
  )
})

test('routes the canonical replay through the existing benchmark fixture loader', async () => {
  const fixture = await loadLandrushBenchmarkFixture({
    name: 'zombie-navigation-real-island',
    repoRoot: REPO_ROOT,
  })
  assert.equal(fixture.name, 'zombie-navigation-real-island')
  assert.equal(fixture.sourcePath, CANONICAL_REPLAY_PATH)
  assert.equal(
    fixture.report.save.builds.reduce((count, build) => count + build.nodes.length, 0),
    147,
  )
})

test('returns the existing fixture shape and installs/restores it through the benchmark flow', async () => {
  const sourcePath = 'fixture/source.v1.json'
  const replay = createReplay()
  const fixture = createLandrushBenchmarkFixtureFromSourceReplay(replay, { sourcePath })
  const storage = new Map()
  const previousWindow = globalThis.window
  const starts = []
  const cameraPoses = []
  globalThis.window = {
    __LANDRUSH_ISLAND_NAV_TEST__: {
      setupStart(value) {
        starts.push(value)
      },
    },
    localStorage: {
      setItem(key, value) {
        storage.set(key, value)
      },
    },
  }
  const page = {
    async addInitScript(callback, argument) {
      callback(argument)
    },
    async evaluate(callback, argument) {
      return callback(argument)
    },
  }
  try {
    await installLandrushBenchmarkFixture(page, fixture)
    const restored = await restoreLandrushBenchmarkFixture(
      page,
      {
        async setCameraPose(pose) {
          cameraPoses.push(pose)
        },
      },
      { player: true, timeoutMs: 10 },
    )

    assert.equal(fixture.name, 'outside')
    assert.equal(fixture.sourcePath, sourcePath)
    assert.deepEqual(restored, {
      camera: replay.report.camera,
      mode: replay.report.mode,
      player: replay.report.player,
    })
    assert.deepEqual(starts, [
      {
        heading: replay.report.player.heading,
        label: 'benchmark-fixture',
        start: { x: 4, y: 5, z: 6 },
      },
    ])
    assert.deepEqual(cameraPoses, [replay.report.camera])
    assert.deepEqual(
      JSON.parse(storage.get('landrush-lab-world-multiplayer-offline-parcels')),
      {
        'world-1': {
          builds: replay.report.save.builds,
          ownerships: replay.report.save.ownerships,
          tvMediaStates: replay.report.save.tvMediaStates,
        },
      },
    )
    assert.deepEqual(
      JSON.parse(storage.get('landrush-lab-world-multiplayer-player')),
      replay.report.player.profile,
    )
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('fails closed on schema drift and invalid runtime coordinates', () => {
  const extraReportField = createReplay()
  extraReportField.report.diagnostics = {}
  assert.throws(
    () => parseLandrushSourceReplay(extraReportField, { sourcePath: 'extra.json' }),
    /report keys differ.*diagnostics/,
  )

  const staleSchema = createReplay()
  staleSchema.schemaVersion = 2
  assert.throws(
    () => parseLandrushSourceReplay(staleSchema, { sourcePath: 'stale.json' }),
    /unsupported schema version 2/,
  )

  const invalidPlayer = createReplay()
  invalidPlayer.report.player.position[2] = Number.NaN
  assert.throws(
    () => parseLandrushSourceReplay(invalidPlayer, { sourcePath: 'player.json' }),
    /report\.player\.position\[2\] must be finite/,
  )

  const invalidCamera = createReplay()
  invalidCamera.report.camera.quaternion = [0, 0, 1]
  assert.throws(
    () => parseLandrushSourceReplay(invalidCamera, { sourcePath: 'camera.json' }),
    /report\.camera\.quaternion must contain 4 values/,
  )
})

test('fails closed before parsing when replay bytes do not match the expected SHA-256', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'landrush-source-corruption-'))
  const sourcePath = path.join(directory, 'corrupt.v1.json')
  await writeFile(sourcePath, `${JSON.stringify(createReplay())} `)
  try {
    await assert.rejects(
      loadLandrushSourceReplayWithIntegrity(sourcePath, {
        expectedSha256: CANONICAL_REPLAY_SHA_256,
      }),
      /source replay SHA-256 mismatch/,
    )
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('does not mislabel the outside replay as an untransformed build fixture', () => {
  assert.throws(
    () => createLandrushBenchmarkFixtureFromSourceReplay(createReplay(), { name: 'build' }),
    /unsupported Landrush source replay fixture "build"/,
  )
})

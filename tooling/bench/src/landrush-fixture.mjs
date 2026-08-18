import { readFile } from 'node:fs/promises'
import path from 'node:path'

const OFFLINE_PARCEL_STATE_STORAGE_KEY = 'landrush-lab-world-multiplayer-offline-parcels'
const PLAYER_STORAGE_KEY = 'landrush-lab-world-multiplayer-player'

export async function loadLandrushBenchmarkFixture({ name, repoRoot }) {
  if (!['build', 'inside', 'outside'].includes(name)) {
    throw new Error(`unsupported Landrush benchmark fixture "${name}"`)
  }

  const sourceName = name === 'inside' ? 'inside' : 'outside'
  const sourcePath = path.join(repoRoot, '.landrush-local', 'benchmark-reports', `${sourceName}.json`)
  const report = JSON.parse(await readFile(sourcePath, 'utf8'))
  assertFixtureReport(report, sourcePath)

  if (name === 'build') applyBuildMode(report)

  return {
    capturedAt: report.capturedAt,
    name,
    report,
    sourcePath,
  }
}

export async function installLandrushBenchmarkFixture(page, fixture) {
  await page.addInitScript(
    ({ offlineStorageKey, playerStorageKey, report }) => {
      const { builds, ownerships, tvMediaStates, worldId } = report.save
      window.localStorage.setItem(
        offlineStorageKey,
        JSON.stringify({
          [worldId]: { builds, ownerships, tvMediaStates },
        }),
      )
      window.localStorage.setItem(playerStorageKey, JSON.stringify(report.player.profile))
      window.__LANDRUSH_BENCHMARK_FIXTURE__ = {
        camera: report.camera,
        mode: report.mode,
        player: report.player,
      }
    },
    {
      offlineStorageKey: OFFLINE_PARCEL_STATE_STORAGE_KEY,
      playerStorageKey: PLAYER_STORAGE_KEY,
      report: fixture.report,
    },
  )
}

export function summarizeLandrushBenchmarkFixture(fixture) {
  if (!fixture) return null
  return {
    buildCount: fixture.report.save.builds.length,
    capturedAt: fixture.capturedAt,
    name: fixture.name,
    nodeCount: fixture.report.save.builds.reduce(
      (count, build) => count + build.nodes.length,
      0,
    ),
    worldId: fixture.report.save.worldId,
  }
}

function assertFixtureReport(report, sourcePath) {
  if (
    !report ||
    typeof report !== 'object' ||
    !report.camera ||
    !report.mode ||
    !report.player?.profile ||
    !report.save ||
    typeof report.save.worldId !== 'string' ||
    !Array.isArray(report.save.builds) ||
    !Array.isArray(report.save.ownerships) ||
    !Array.isArray(report.save.tvMediaStates)
  ) {
    throw new Error(`invalid Landrush benchmark report: ${sourcePath}`)
  }
}

function applyBuildMode(report) {
  const build = [...report.save.builds].sort(
    (left, right) => right.nodes.length - left.nodes.length,
  )[0]
  const ownership = build
    ? report.save.ownerships.find((candidate) => candidate.parcelId === build.parcelId)
    : null
  if (!build || !ownership) {
    throw new Error('build fixture has no owned parcel build')
  }

  report.mode = {
    buildParcelId: build.parcelId,
    fpv: false,
    view: 'build',
  }
  report.player = {
    ...report.player,
    profile: ownership.owner,
  }
}

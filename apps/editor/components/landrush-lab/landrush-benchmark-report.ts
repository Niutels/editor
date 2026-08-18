import 'server-only'

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { type LandrushBugReport, parseLandrushBugReportJson } from './landrush-bug-report'
import type { PascalOpenworldIntegrationSnapshot } from './pascal-openworld-integration-contract'

export type LandrushBenchmarkReportName = 'build' | 'inside' | 'outside'

const REPORT_DIRECTORY = '.landrush-local/benchmark-reports'

export function isLandrushBenchmarkReportName(
  value: string | null | undefined,
): value is LandrushBenchmarkReportName {
  return value === 'build' || value === 'inside' || value === 'outside'
}

export async function loadLandrushBenchmarkReport(
  name: LandrushBenchmarkReportName | null,
): Promise<LandrushBugReport | null> {
  if (!name) return null
  const sourceName = name === 'inside' ? 'inside' : 'outside'

  for (const directory of reportDirectories()) {
    try {
      const parsed = parseLandrushBugReportJson(
        await readFile(resolve(directory, `${sourceName}.json`), 'utf8'),
      )
      if (!parsed.ok) continue
      return name === 'build' ? createBuildBenchmarkReport(parsed.report) : parsed.report
    } catch {
      // Dev servers can start from either the repository root or apps/editor.
    }
  }
  return null
}

export function createBenchmarkSnapshot(
  report: LandrushBugReport,
): PascalOpenworldIntegrationSnapshot {
  return {
    buildNodeCount: report.save.builds.reduce((count, build) => count + build.nodes.length, 0),
    builds: report.save.builds,
    ownerships: report.save.ownerships,
    savedAt: Date.parse(report.capturedAt),
    schemaVersion: 1,
    tvMediaStates: report.save.tvMediaStates,
    worldId: report.save.worldId,
  }
}

function reportDirectories() {
  return [
    resolve(process.cwd(), REPORT_DIRECTORY),
    resolve(process.cwd(), '..', '..', REPORT_DIRECTORY),
  ]
}

function createBuildBenchmarkReport(report: LandrushBugReport): LandrushBugReport {
  const build = [...report.save.builds].sort(
    (left, right) => right.nodes.length - left.nodes.length,
  )[0]
  const ownership = build
    ? report.save.ownerships.find((candidate) => candidate.parcelId === build.parcelId)
    : null
  if (!build || !ownership) return report

  return {
    ...report,
    mode: {
      buildParcelId: build.parcelId,
      fpv: false,
      view: 'build',
    },
    player: {
      ...report.player,
      profile: ownership.owner,
    },
  }
}

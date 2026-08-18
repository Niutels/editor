import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import {
  createBenchmarkSnapshot,
  isLandrushBenchmarkReportName,
  loadLandrushBenchmarkReport,
} from '@/components/landrush-lab/landrush-benchmark-report'
import { PascalOpenworldFullSceneRuntime } from '@/components/landrush-lab/pascal-openworld-full-scene-runtime'
import { loadPascalOpenworldIntegrationSnapshot } from '@/components/landrush-lab/pascal-openworld-integration-snapshot'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PascalMultiplayerIslandBenchmarkPage({ searchParams }: PageProps) {
  const params = await searchParams
  if (firstSearchParam(params.offline) !== '1' || firstSearchParam(params.landrushProbe) !== '1') {
    const query = copySearchParams(params)
    query.set('landrushProbe', '1')
    query.set('landrushProbeDom', '1')
    query.set('offline', '1')
    redirect(`/landrush-lab/pascal-multiplayer-island-benchmark?${query}`)
  }

  const requestedReport = firstSearchParam(params.benchmarkReport)
  const report = await loadLandrushBenchmarkReport(
    isLandrushBenchmarkReportName(requestedReport) ? requestedReport : null,
  )
  const snapshot = report
    ? createBenchmarkSnapshot(report)
    : await loadPascalOpenworldIntegrationSnapshot()

  return (
    <Suspense fallback={null}>
      <PascalOpenworldFullSceneRuntime bugReportReplay={report} snapshot={snapshot} />
    </Suspense>
  )
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function copySearchParams(params: Record<string, string | string[] | undefined>) {
  const result = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item)
    } else if (value !== undefined) {
      result.set(key, value)
    }
  }
  return result
}

import { headers } from 'next/headers'
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

export default async function PascalOpenworldIntegrationFullScenePage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const requestHeaders = await headers()
  const host = requestHeaders.get('host') ?? ''
  const query = copySearchParams(resolvedSearchParams)

  query.set('offline', '1')
  query.set('landrushProbe', '1')
  query.set('landrushProbeDom', '1')
  query.set('integrationSidecar', '1')
  query.set('embedded', '1')
  query.delete('clean')
  query.delete('rendererBackend')
  if (firstSearchParam(resolvedSearchParams.post) === '1') query.set('benchPostFx', '1')
  else query.delete('benchPostFx')

  if (
    host.toLowerCase().startsWith('127.0.0.1') ||
    firstSearchParam(resolvedSearchParams.embedded) !== '1'
  ) {
    const port = host.includes(':') ? host.slice(host.lastIndexOf(':') + 1) : '3002'
    const shellQuery = copySearchParams(resolvedSearchParams)
    shellQuery.delete('embedded')
    redirect(
      `http://127.0.0.1:${port}/landrush-lab/pascal-openworld-integration-full-scene.html?${shellQuery.toString()}`,
    )
  }

  if (
    firstSearchParam(resolvedSearchParams.offline) !== '1' ||
    firstSearchParam(resolvedSearchParams.integrationSidecar) !== '1' ||
    firstSearchParam(resolvedSearchParams.rendererBackend) !== undefined ||
    firstSearchParam(resolvedSearchParams.embedded) !== '1' ||
    firstSearchParam(resolvedSearchParams.clean) !== undefined ||
    (firstSearchParam(resolvedSearchParams.post) === '1' &&
      firstSearchParam(resolvedSearchParams.benchPostFx) !== '1') ||
    (firstSearchParam(resolvedSearchParams.post) !== '1' &&
      firstSearchParam(resolvedSearchParams.benchPostFx) !== undefined)
  ) {
    redirect(`/landrush-lab/pascal-openworld-integration-full-scene?${query.toString()}`)
  }

  const requestedReport = firstSearchParam(resolvedSearchParams.benchmarkReport)
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

import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { PascalBugReportDebugClient } from '@/components/landrush-lab/pascal-bug-report-debug-client'

type PascalMultiplayerIslandBugReportPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function PascalMultiplayerIslandBugReportPage({
  searchParams,
}: PascalMultiplayerIslandBugReportPageProps) {
  const params = (await searchParams) ?? {}
  if (params.offline !== '1') {
    const offlineParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') offlineParams.set(key, value)
      else if (Array.isArray(value)) {
        for (const entry of value) offlineParams.append(key, entry)
      }
    }
    offlineParams.set('landrushProbe', '1')
    offlineParams.set('landrushProbeDom', '1')
    offlineParams.set('offline', '1')
    redirect(`/landrush-lab/pascal-multiplayer-island-bug-report?${offlineParams}`)
  }

  return (
    <Suspense fallback={null}>
      <PascalBugReportDebugClient />
    </Suspense>
  )
}

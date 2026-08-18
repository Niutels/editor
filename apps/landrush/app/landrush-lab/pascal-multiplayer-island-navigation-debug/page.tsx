import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { LandrushIslandClient } from '@/components/landrush-lab/landrush-island-client'
import { PascalNavigationDebugControls } from '@/components/landrush-lab/pascal-navigation-debug-controls'

type PascalNavigationDebugPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const DEFAULT_DEBUG_PARAMS = new URLSearchParams({
  clean: '1',
  landrushProbe: '1',
  navDebug: '1',
  navDebugLiveScenario: 'room',
  navDebugLiveScenarioAuto: '0',
  navDebugLiveScenarioImmediate: '1',
  offline: '1',
})

export default async function PascalMultiplayerIslandNavigationDebugPage({
  searchParams,
}: PascalNavigationDebugPageProps) {
  const params = (await searchParams) ?? {}
  const scenario =
    typeof params.navDebugLiveScenario === 'string'
      ? params.navDebugLiveScenario
      : typeof params.landrushNavLiveScenario === 'string'
        ? params.landrushNavLiveScenario
        : null

  if (!scenario) {
    redirect(`/landrush-lab/pascal-multiplayer-island-navigation-debug?${DEFAULT_DEBUG_PARAMS}`)
  }

  return (
    <Suspense fallback={null}>
      <LandrushIslandClient experience="pascal-multiplayer-island" />
      <PascalNavigationDebugControls />
    </Suspense>
  )
}

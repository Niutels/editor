import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PascalOpenworldIntegrationClient } from '@/components/landrush-lab/pascal-openworld-integration-client'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PascalOpenworldIntegrationLabPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const requestHeaders = await headers()
  const host = requestHeaders.get('host') ?? ''

  if (host.toLowerCase().startsWith('localhost')) {
    const port = host.includes(':') ? host.slice(host.lastIndexOf(':') + 1) : '3002'
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(resolvedSearchParams)) {
      if (Array.isArray(value)) {
        for (const item of value) query.append(key, item)
      } else if (value !== undefined) {
        query.set(key, value)
      }
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    redirect(`http://127.0.0.1:${port}/landrush-lab/pascal-openworld-integration-lab${suffix}`)
  }

  const requestedCell = firstSearchParam(resolvedSearchParams.cell)
  const initialCell =
    requestedCell === 'pascal' || requestedCell === 'world' || requestedCell === 'combined'
      ? requestedCell
      : 'combined'
  const requestedCamera = firstSearchParam(resolvedSearchParams.camera)
  const initialCamera =
    requestedCamera === 'near' || requestedCamera === 'design' || requestedCamera === 'far'
      ? requestedCamera
      : 'design'
  const initialPostFx = firstSearchParam(resolvedSearchParams.post) === '1'
  const initialRunning = firstSearchParam(resolvedSearchParams.run) === '1'

  if (initialCell === 'combined' && !initialRunning) {
    const fullSceneQuery = copySearchParams(resolvedSearchParams)
    fullSceneQuery.set('offline', '1')
    fullSceneQuery.set('landrushProbe', '1')
    fullSceneQuery.set('landrushProbeDom', '1')
    fullSceneQuery.set('integrationSidecar', '1')
    redirect(
      `/landrush-lab/pascal-openworld-integration-full-scene.html?${fullSceneQuery.toString()}`,
    )
  }

  if (!initialRunning) {
    const launcherQuery = new URLSearchParams({ cell: initialCell, camera: initialCamera })
    if (initialPostFx) launcherQuery.set('post', '1')
    redirect(`/landrush-lab/pascal-openworld-integration-sidecar.html?${launcherQuery.toString()}`)
  }

  if (initialCell === 'combined') {
    const fullSceneQuery = copySearchParams(resolvedSearchParams)
    fullSceneQuery.set('offline', '1')
    fullSceneQuery.set('landrushProbe', '1')
    fullSceneQuery.set('landrushProbeDom', '1')
    fullSceneQuery.set('integrationSidecar', '1')
    fullSceneQuery.delete('clean')
    if (initialPostFx) fullSceneQuery.set('benchPostFx', '1')
    else fullSceneQuery.delete('benchPostFx')
    redirect(
      `/landrush-lab/pascal-openworld-integration-full-scene.html?${fullSceneQuery.toString()}`,
    )
  }

  return (
    <PascalOpenworldIntegrationClient
      initialCamera={initialCamera}
      initialCell={initialCell}
      initialPostFx={initialPostFx}
      initialRunning={initialRunning}
    />
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

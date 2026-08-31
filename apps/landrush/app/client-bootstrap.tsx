'use client'

// Loads Pascal's built-ins and the Landrush plugin into the node registry on the
// client. Mounted from `layout.tsx` so every page in the standalone
// editor gets the registry populated before its first `<Viewer>` /
// `<Editor>` mounts — without this the registry is empty on the client
// (the server registers in its own module instance, which is unreachable
// from hydrated pages) and every `NodeRenderer` resolves to `null`. The
// `loaded` guard inside `../lib/bootstrap` keeps the side effect
// idempotent under HMR.
import '../lib/bootstrap'
import { useAudio } from '@pascal-app/editor'
import { type ComponentType, type ReactNode, useEffect, useState } from 'react'
import { applyLandrushInitialAudioPreference } from '../lib/landrush-audio-default'
import { LandrushZombieEscapeHudPortalOutlet } from '../lib/zombie-escape-hud-portal'
import { installLandrushDevToolsIndicatorPlacement } from './dev-tools-indicator-placement'

if (typeof window !== 'undefined') {
  applyLandrushInitialAudioPreference(window.localStorage, useAudio)
}

export function ClientBootstrap({ children }: { children: ReactNode }) {
  const [AgentationComponent, setAgentationComponent] = useState<ComponentType | null>(null)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    const removeDevToolsIndicatorPlacement = installLandrushDevToolsIndicatorPlacement()
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('reactScan') === '1') {
      void import('react-scan').then(({ scan }) => scan({ enabled: true }))
    }
    if (searchParams.get('agentation') === '1') {
      void import('agentation').then(({ Agentation }) => setAgentationComponent(() => Agentation))
    }
    return removeDevToolsIndicatorPlacement
  }, [])

  return (
    <>
      {children}
      <LandrushZombieEscapeHudPortalOutlet />
      {AgentationComponent ? <AgentationComponent /> : null}
    </>
  )
}

import type { ReactNode } from 'react'
import { LandrushIslandLoadingShell } from '@/components/landrush-lab/landrush-island-loading-shell'

export default function PascalMultiplayerIslandLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LandrushIslandLoadingShell />
      {children}
    </>
  )
}

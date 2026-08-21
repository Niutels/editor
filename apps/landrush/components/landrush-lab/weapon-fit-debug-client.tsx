'use client'

import { useCallback, useEffect, useState } from 'react'
import { WeaponFitDebugControls } from './weapon-fit-debug-controls'
import { WeaponFitDebugScene } from './weapon-fit-debug-scene'
import {
  createDefaultWeaponFitDiagnostics,
  createDefaultWeaponFitSettings,
  parseWeaponFitDebugParams,
  serializeWeaponFitDebugParams,
  type WeaponFitCameraBookmark,
  type WeaponFitDebugDiagnostics,
  type WeaponFitDebugSettings,
} from './weapon-fit-debug-state'

type WeaponFitDebugSnapshot = {
  diagnostics: WeaponFitDebugDiagnostics
  invariants: readonly string[]
  settings: WeaponFitDebugSettings
}

declare global {
  interface Window {
    __WEAPON_FIT_DEBUG__?: WeaponFitDebugSnapshot
  }
}

export function WeaponFitDebugClient() {
  const [settings, setSettings] = useState(createDefaultWeaponFitSettings)
  const [diagnostics, setDiagnostics] = useState(() => createDefaultWeaponFitDiagnostics(settings))
  const [bookmarkRevision, setBookmarkRevision] = useState(0)
  const [urlReady, setUrlReady] = useState(false)

  useEffect(() => {
    const readLocation = () => {
      setSettings(parseWeaponFitDebugParams(new URLSearchParams(window.location.search)))
      setBookmarkRevision((revision) => revision + 1)
    }
    readLocation()
    setUrlReady(true)
    window.addEventListener('popstate', readLocation)
    return () => window.removeEventListener('popstate', readLocation)
  }, [])

  useEffect(() => {
    if (!urlReady) return
    const query = serializeWeaponFitDebugParams(settings).toString()
    const nextUrl = `${window.location.pathname}?${query}${window.location.hash}`
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (nextUrl !== currentUrl) window.history.replaceState(window.history.state, '', nextUrl)
  }, [settings, urlReady])

  const handleDiagnosticsChange = useCallback((patch: Partial<WeaponFitDebugDiagnostics>) => {
    setDiagnostics((current) => ({ ...current, ...patch }))
  }, [])

  const handleCameraBookmarkChange = useCallback((bookmark: WeaponFitCameraBookmark) => {
    setSettings((current) => ({ ...current, cameraBookmark: bookmark }))
    setBookmarkRevision((revision) => revision + 1)
  }, [])

  useEffect(() => {
    const snapshot: WeaponFitDebugSnapshot = {
      diagnostics,
      invariants: [
        'The subject is the exact LandrushRobot GLB, skeleton, normalization, and locomotion component used by multiplayer island.',
        'Weapon options and semantic anchors come from ZOMBIE_ESCAPE_WEAPON_CATALOG.',
        'Primary and support grips are solved against the real RightHand/LeftHand bone chains.',
        'Near, design, and far camera offsets derive from current subject bounds.',
        'The scene has no post-processing passes.',
        'Missing GLBs produce deterministic visible placeholder geometry.',
      ],
      settings,
    }
    window.__WEAPON_FIT_DEBUG__ = snapshot
    return () => {
      if (window.__WEAPON_FIT_DEBUG__ === snapshot) delete window.__WEAPON_FIT_DEBUG__
    }
  }, [diagnostics, settings])

  if (!urlReady) {
    return (
      <main className="grid h-screen w-screen place-items-center overflow-hidden bg-[#090e17] text-slate-100">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
          Reading weapon-fit URL state…
        </div>
      </main>
    )
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#090e17]">
      <WeaponFitDebugScene
        bookmarkRevision={bookmarkRevision}
        onDiagnosticsChange={handleDiagnosticsChange}
        settings={settings}
      />
      <WeaponFitDebugControls
        diagnostics={diagnostics}
        onCameraBookmarkChange={handleCameraBookmarkChange}
        onSettingsChange={setSettings}
        settings={settings}
      />
    </main>
  )
}

'use client'

import { Editor, ItemsPanel } from '@pascal-app/editor'
import { Layers, Package, Settings } from 'lucide-react'
import Link from 'next/link'
import {
  CommunityViewerToolbarLeft,
  CommunityViewerToolbarRight,
} from '@/components/viewer-toolbar'

const SIDEBAR_TABS = [
  {
    id: 'site',
    label: 'Scene',
    component: () => null,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Layers className="h-5 w-5" />,
  },
  {
    id: 'items',
    label: 'Items',
    component: ItemsPanel,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Package className="h-5 w-5" />,
  },
  {
    id: 'settings',
    label: 'Settings',
    component: () => null,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Settings className="h-5 w-5" />,
  },
]

type StandaloneEditorShellProps = {
  projectId: string
  bannerLabel?: string
  showSceneLinks?: boolean
}

export function StandaloneEditorShell({
  projectId,
  bannerLabel,
  showSceneLinks = false,
}: StandaloneEditorShellProps) {
  return (
    <div className="relative h-screen w-screen">
      {bannerLabel ? (
        <div className="pointer-events-none absolute top-3 left-1/2 z-40 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border/60 bg-background/90 px-4 py-1.5 text-xs shadow-sm backdrop-blur">
            <span className="text-muted-foreground">{bannerLabel}</span>
            {showSceneLinks ? (
              <>
                <Link className="font-medium text-foreground hover:underline" href="/scenes">
                  Open recent scenes
                </Link>
                <span aria-hidden className="text-muted-foreground">
                  |
                </span>
                <Link className="font-medium text-foreground hover:underline" href="/scenes">
                  Create new
                </Link>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <Editor
        layoutVersion="v2"
        projectId={projectId}
        sidebarTabs={SIDEBAR_TABS}
        viewerToolbarLeft={<CommunityViewerToolbarLeft />}
        viewerToolbarRight={<CommunityViewerToolbarRight />}
      />
    </div>
  )
}

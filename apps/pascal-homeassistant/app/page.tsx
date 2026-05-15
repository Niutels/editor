'use client'

import { Editor, type SidebarTab, ViewerToolbarLeft, ViewerToolbarRight } from '@pascal-app/editor'

const SIDEBAR_TABS: (SidebarTab & { component: React.ComponentType })[] = [
  {
    id: 'site',
    label: 'Scene',
    component: () => null,
  },
]

const PROJECT_ID = 'pascal-homeassistant-local'

export default function HomeAssistantAuthoringPage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <Editor
        homeAssistantApiEnabled={false}
        layoutVersion="v2"
        projectId={PROJECT_ID}
        sidebarTabs={SIDEBAR_TABS}
        viewerToolbarLeft={<ViewerToolbarLeft />}
        viewerToolbarRight={<ViewerToolbarRight />}
      />
    </main>
  )
}

'use client'

import { HomeAssistantPanel as HomeAssistantPanelView } from '@pascal-app/home-assistant/editor'
import type { HomeAssistantConnectionMode } from '@pascal-app/home-assistant/editor'

export function HomeAssistantPanel({
  apiEnabled = true,
  connectionMode,
}: {
  apiEnabled?: boolean
  connectionMode?: HomeAssistantConnectionMode
}) {
  return <HomeAssistantPanelView apiEnabled={apiEnabled} connectionMode={connectionMode} />
}

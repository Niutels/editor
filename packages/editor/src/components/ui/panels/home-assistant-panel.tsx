'use client'

import { HomeAssistantPanel as HomeAssistantPanelView } from '@pascal-app/home-assistant/editor'

export function HomeAssistantPanel({ apiEnabled = true }: { apiEnabled?: boolean }) {
  return <HomeAssistantPanelView apiEnabled={apiEnabled} />
}

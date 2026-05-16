import type { HomeAssistantDeviceActionDispatch } from './home-assistant-interactive-system'
import { runBrowserHomeAssistantCollectionAction } from '../client/home-assistant-browser-client'

export function dispatchHomeAssistantEditorDeviceAction(
  payload: HomeAssistantDeviceActionDispatch,
) {
  void fetch('/api/home-assistant/device-action', {
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  }).catch(() => {})
}

export function dispatchBrowserHomeAssistantEditorDeviceAction(
  payload: HomeAssistantDeviceActionDispatch,
) {
  void runBrowserHomeAssistantCollectionAction(payload).catch(() => {})
}

const DEV_TOOLS_INDICATOR_STYLE_ID = 'landrush-dev-tools-indicator-placement'
const DEV_TOOLS_INDICATOR_WAIT_MS = 10_000

export const LANDRUSH_DEV_TOOLS_INDICATOR_STYLE = `#devtools-indicator {
  top: auto !important;
  right: max(0.75rem, env(safe-area-inset-right)) !important;
  bottom: max(3rem, calc(env(safe-area-inset-bottom) + 2.25rem)) !important;
  left: auto !important;
}`

type DevToolsIndicatorPlacementEnvironment = {
  cancelExpiry: (expiryId: number) => void
  createObserver: (callback: () => void) => Pick<MutationObserver, 'disconnect' | 'observe'>
  scheduleExpiry: (callback: () => void, delayMs: number) => number
  targetDocument: Document
}

function browserEnvironment(): DevToolsIndicatorPlacementEnvironment {
  return {
    cancelExpiry: (expiryId) => window.clearTimeout(expiryId),
    createObserver: (callback) => new MutationObserver(callback),
    scheduleExpiry: (callback, delayMs) => window.setTimeout(callback, delayMs),
    targetDocument: document,
  }
}

export function installLandrushDevToolsIndicatorPlacement(
  environment: DevToolsIndicatorPlacementEnvironment = browserEnvironment(),
) {
  const { cancelExpiry, createObserver, scheduleExpiry, targetDocument } = environment
  let installedStyle: HTMLStyleElement | null = null
  let observer: Pick<MutationObserver, 'disconnect' | 'observe'> | null = null
  let expiryId: number | null = null

  const stopWatching = () => {
    observer?.disconnect()
    observer = null
    if (expiryId !== null) {
      cancelExpiry(expiryId)
      expiryId = null
    }
  }

  const tryInstall = () => {
    if (installedStyle) return true
    const shadowRoot = targetDocument.querySelector('nextjs-portal')?.shadowRoot
    if (!shadowRoot) return false

    shadowRoot.getElementById(DEV_TOOLS_INDICATOR_STYLE_ID)?.remove()
    const style = targetDocument.createElement('style')
    style.id = DEV_TOOLS_INDICATOR_STYLE_ID
    style.textContent = LANDRUSH_DEV_TOOLS_INDICATOR_STYLE
    shadowRoot.append(style)
    installedStyle = style
    return true
  }

  if (!tryInstall()) {
    observer = createObserver(() => {
      if (tryInstall()) stopWatching()
    })
    observer.observe(targetDocument.documentElement, { childList: true, subtree: true })
    expiryId = scheduleExpiry(stopWatching, DEV_TOOLS_INDICATOR_WAIT_MS)
  }

  return () => {
    stopWatching()
    installedStyle?.remove()
    installedStyle = null
  }
}

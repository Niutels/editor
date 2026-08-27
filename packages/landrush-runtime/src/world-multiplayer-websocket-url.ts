const WORLD_MULTIPLAYER_WEBSOCKET_PATH = '/api/landrush-lab/world-multiplayer/ws'

export function resolveWorldMultiplayerWebSocketUrl({
  currentUrl,
  hostedUrl,
}: {
  currentUrl: string
  hostedUrl: string | null | undefined
}) {
  const pageUrl = new URL(currentUrl)
  const explicitUrl = pageUrl.searchParams.get('ws')
  if (explicitUrl) return normalizeWebSocketUrl(explicitUrl, pageUrl)

  const url = new URL(WORLD_MULTIPLAYER_WEBSOCKET_PATH, pageUrl)
  if (
    pageUrl.port === '3002' ||
    pageUrl.hostname === 'localhost' ||
    pageUrl.hostname === '127.0.0.1'
  ) {
    url.port = '3003'
    url.protocol = pageUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    return url.toString()
  }

  if (hostedUrl) return normalizeWebSocketUrl(hostedUrl, pageUrl)

  url.protocol = pageUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function normalizeWebSocketUrl(rawUrl: string, baseUrl: URL) {
  const url = new URL(rawUrl, baseUrl)
  if (url.protocol === 'https:') url.protocol = 'wss:'
  if (url.protocol === 'http:') url.protocol = 'ws:'
  return url.toString()
}

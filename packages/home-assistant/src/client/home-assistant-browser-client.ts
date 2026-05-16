'use client'

import type {
  HomeAssistantAction,
  HomeAssistantActionRequest,
  HomeAssistantCollectionBinding,
  HomeAssistantCollectionCapability,
  HomeAssistantResourceKind,
} from '../home-assistant-binding'
import type { HomeAssistantImportedResource } from '../home-assistant-collections'
import type { HomeAssistantDeviceActionDispatch } from '../editor/home-assistant-interactive-system'

const BROWSER_PROFILE_STORAGE_KEY = 'pascal:home-assistant:browser-profile:v1'
const SOCKET_TIMEOUT_MS = 10_000

type BrowserHomeAssistantProfile = {
  accessToken: string
  instanceUrl: string
  linkedAt: string
}

type HomeAssistantEntityState = {
  attributes?: Record<string, unknown>
  entity_id: string
  state: string
}

type BrowserHomeAssistantConnectionStatus = {
  entityCount: number
  instanceUrl: string | null
  linked: boolean
  message: string
  mode: 'browser-local' | 'unlinked'
  success: boolean
}

type PendingSocketRequest = {
  reject: (error: Error) => void
  resolve: (value: unknown) => void
  timeoutId: number
}

type HomeAssistantSocketMessage = {
  error?: {
    code?: string
    message?: string
  }
  id?: number
  result?: unknown
  success?: boolean
  type?: string
}

class BrowserHomeAssistantSocket {
  private nextId = 1
  private pendingRequests = new Map<number, PendingSocketRequest>()

  constructor(private readonly socket: WebSocket) {
    this.socket.addEventListener('message', this.handleMessage)
    this.socket.addEventListener('close', this.handleClose)
    this.socket.addEventListener('error', this.handleError)
  }

  close() {
    this.socket.removeEventListener('message', this.handleMessage)
    this.socket.removeEventListener('close', this.handleClose)
    this.socket.removeEventListener('error', this.handleError)
    for (const request of this.pendingRequests.values()) {
      window.clearTimeout(request.timeoutId)
      request.reject(new Error('Home Assistant connection closed.'))
    }
    this.pendingRequests.clear()
    this.socket.close()
  }

  request<T>(message: Record<string, unknown>): Promise<T> {
    const id = this.nextId++
    const payload = {
      ...message,
      id,
    }

    return new Promise<T>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error('Home Assistant did not respond in time.'))
      }, SOCKET_TIMEOUT_MS)

      this.pendingRequests.set(id, {
        reject,
        resolve: (value) => resolve(value as T),
        timeoutId,
      })

      this.socket.send(JSON.stringify(payload))
    })
  }

  private readonly handleMessage = (event: MessageEvent<string>) => {
    const message = parseSocketMessage(event.data)
    if (!message?.id) {
      return
    }

    const request = this.pendingRequests.get(message.id)
    if (!request) {
      return
    }

    window.clearTimeout(request.timeoutId)
    this.pendingRequests.delete(message.id)

    if (message.success === false) {
      request.reject(new Error(message.error?.message ?? 'Home Assistant request failed.'))
      return
    }

    request.resolve(message.result)
  }

  private readonly handleClose = () => {
    for (const request of this.pendingRequests.values()) {
      window.clearTimeout(request.timeoutId)
      request.reject(new Error('Home Assistant connection closed.'))
    }
    this.pendingRequests.clear()
  }

  private readonly handleError = () => {
    for (const request of this.pendingRequests.values()) {
      window.clearTimeout(request.timeoutId)
      request.reject(new Error('Home Assistant connection failed.'))
    }
    this.pendingRequests.clear()
  }
}

function parseSocketMessage(data: string): HomeAssistantSocketMessage | null {
  try {
    return JSON.parse(data) as HomeAssistantSocketMessage
  } catch {
    return null
  }
}

function readStoredProfile(): BrowserHomeAssistantProfile | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const payload = window.localStorage.getItem(BROWSER_PROFILE_STORAGE_KEY)
    if (!payload) {
      return null
    }

    const parsed = JSON.parse(payload) as Partial<BrowserHomeAssistantProfile>
    if (
      typeof parsed.instanceUrl !== 'string' ||
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.linkedAt !== 'string'
    ) {
      return null
    }

    return {
      accessToken: parsed.accessToken,
      instanceUrl: parsed.instanceUrl,
      linkedAt: parsed.linkedAt,
    }
  } catch {
    return null
  }
}

function writeStoredProfile(profile: BrowserHomeAssistantProfile) {
  window.localStorage.setItem(BROWSER_PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

function normalizeHomeAssistantUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, '')
  const url = new URL(trimmed)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Home Assistant URL must start with http:// or https://.')
  }
  return url.toString().replace(/\/$/, '')
}

function toWebSocketUrl(instanceUrl: string) {
  const url = new URL('/api/websocket', instanceUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function getFriendlyName(state: HomeAssistantEntityState) {
  const friendlyName = state.attributes?.friendly_name
  return typeof friendlyName === 'string' && friendlyName.trim().length > 0
    ? friendlyName.trim()
    : state.entity_id
}

function createAction(
  domain: string,
  service: string,
  label: string,
  capability: HomeAssistantCollectionCapability,
  fields: HomeAssistantAction['fields'] = [],
): HomeAssistantAction {
  return {
    capability,
    domain,
    fields,
    key: `${domain}.${service}`,
    label,
    service,
  }
}

function getActionsForState(state: HomeAssistantEntityState): HomeAssistantAction[] {
  const domain = state.entity_id.split('.')[0] ?? ''

  switch (domain) {
    case 'automation':
      return [createAction('automation', 'trigger', 'Trigger', 'trigger')]
    case 'cover':
      return [
        createAction('cover', 'open_cover', 'Open', 'power'),
        createAction('cover', 'close_cover', 'Close', 'power'),
        createAction('cover', 'stop_cover', 'Stop', 'power'),
      ]
    case 'fan':
      return [
        createAction('fan', 'turn_on', 'Turn on', 'power'),
        createAction('fan', 'turn_off', 'Turn off', 'power'),
        createAction('fan', 'toggle', 'Toggle', 'power'),
        createAction('fan', 'set_percentage', 'Speed', 'speed', [
          {
            defaultValue: 50,
            key: 'percentage',
            label: 'Speed',
            required: false,
            selector: { number: { max: 100, min: 0, mode: 'slider' } },
          },
        ]),
      ]
    case 'input_boolean':
    case 'light':
    case 'switch':
      return [
        createAction(domain, 'turn_on', 'Turn on', 'power'),
        createAction(domain, 'turn_off', 'Turn off', 'power'),
        createAction(domain, 'toggle', 'Toggle', 'power'),
        ...(domain === 'light'
          ? [
              createAction('light', 'turn_on', 'Brightness', 'brightness', [
                {
                  defaultValue: 80,
                  key: 'brightness_pct',
                  label: 'Brightness',
                  required: false,
                  selector: { number: { max: 100, min: 0, mode: 'slider' } },
                },
              ]),
            ]
          : []),
      ]
    case 'lock':
      return [
        createAction('lock', 'lock', 'Lock', 'power'),
        createAction('lock', 'unlock', 'Unlock', 'power'),
      ]
    case 'media_player':
      return [
        createAction('media_player', 'media_play', 'Play', 'media'),
        createAction('media_player', 'media_pause', 'Pause', 'media'),
        createAction('media_player', 'media_stop', 'Stop', 'media'),
        createAction('media_player', 'volume_set', 'Volume', 'volume', [
          {
            defaultValue: 0.5,
            key: 'volume_level',
            label: 'Volume',
            required: false,
            selector: { number: { max: 1, min: 0, mode: 'slider', step: 0.01 } },
          },
        ]),
      ]
    case 'scene':
      return [createAction('scene', 'turn_on', 'Run', 'trigger')]
    case 'script':
      return [createAction('script', 'turn_on', 'Run', 'trigger')]
    default:
      return []
  }
}

function toImportedResource(state: HomeAssistantEntityState): HomeAssistantImportedResource | null {
  const actions = getActionsForState(state)
  if (actions.length === 0) {
    return null
  }

  const domain = state.entity_id.split('.')[0] ?? null
  const capabilities = Array.from(new Set(actions.map((action) => action.capability)))
  const kind: HomeAssistantResourceKind =
    domain === 'automation' || domain === 'scene' || domain === 'script' ? domain : 'entity'

  return {
    actions,
    capabilities,
    defaultActionKey: actions[0]?.key ?? null,
    description: `${kind} imported from Home Assistant`,
    domain,
    entityId: state.entity_id,
    id: state.entity_id,
    kind,
    label: getFriendlyName(state),
    state: state.state,
  }
}

function getResourceActionForRequest(
  binding: HomeAssistantCollectionBinding,
  resource: HomeAssistantCollectionBinding['resources'][number],
  request: HomeAssistantActionRequest,
) {
  const actions = resource.actions ?? []
  const defaultAction =
    (resource.defaultActionKey
      ? actions.find((action) => action.key === resource.defaultActionKey)
      : null) ??
    actions[0] ??
    null

  if (request.kind === 'trigger') {
    return defaultAction
  }

  if (request.kind === 'toggle') {
    const desiredServices = request.value ? ['turn_on', 'open_cover'] : ['turn_off', 'close_cover']
    return (
      actions.find((action) => desiredServices.includes(action.service)) ??
      actions.find((action) => action.service === 'toggle') ??
      defaultAction
    )
  }

  const serviceCandidatesByCapability: Record<
    Extract<HomeAssistantActionRequest, { kind: 'range' }>['capability'],
    string[]
  > = {
    brightness: ['turn_on', 'set_percentage'],
    speed: ['set_percentage', 'set_fan_speed'],
    temperature: ['set_temperature'],
    volume: ['volume_set'],
  }

  return (
    actions.find((action) =>
      serviceCandidatesByCapability[request.capability].includes(action.service),
    ) ?? defaultAction
  )
}

function normalizeRangeValueForField(fieldKey: string, value: number) {
  if (fieldKey === 'brightness_pct' || fieldKey === 'percentage') {
    return value <= 1
      ? Math.max(0, Math.min(100, Math.round(value * 100)))
      : Math.max(0, Math.min(100, Math.round(value)))
  }

  if (fieldKey === 'brightness') {
    if (value <= 1) {
      return Math.max(0, Math.min(255, Math.round(value * 255)))
    }
    if (value <= 100) {
      return Math.max(0, Math.min(255, Math.round((value / 100) * 255)))
    }
    return Math.max(0, Math.min(255, Math.round(value)))
  }

  if (fieldKey === 'volume_level') {
    return value <= 1 ? Math.max(0, Math.min(1, value)) : Math.max(0, Math.min(1, value / 100))
  }

  return value
}

function buildCollectionServiceData(
  action: NonNullable<ReturnType<typeof getResourceActionForRequest>>,
  request: HomeAssistantActionRequest,
) {
  if (request.kind !== 'range') {
    return {}
  }

  const fieldKeys = (action.fields ?? []).map((field) => field.key)
  const preferredFieldKeyByCapability: Record<
    Extract<HomeAssistantActionRequest, { kind: 'range' }>['capability'],
    string[]
  > = {
    brightness: ['brightness_pct', 'brightness'],
    speed: ['percentage', 'fan_speed'],
    temperature: ['temperature'],
    volume: ['volume_level'],
  }
  const targetFieldKey =
    preferredFieldKeyByCapability[request.capability].find((fieldKey) =>
      fieldKeys.includes(fieldKey),
    ) ?? fieldKeys[0]

  return targetFieldKey
    ? {
        [targetFieldKey]: normalizeRangeValueForField(targetFieldKey, request.value),
      }
    : {}
}

function getUnlinkedStatus(): BrowserHomeAssistantConnectionStatus {
  return {
    entityCount: 0,
    instanceUrl: null,
    linked: false,
    message: 'Home Assistant is not linked yet.',
    mode: 'unlinked',
    success: false,
  }
}

async function openBrowserHomeAssistantSocket(profile: BrowserHomeAssistantProfile) {
  const socket = new WebSocket(toWebSocketUrl(profile.instanceUrl))

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup()
      socket.close()
      reject(new Error('Home Assistant did not respond in time.'))
    }, SOCKET_TIMEOUT_MS)

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      socket.removeEventListener('message', handleMessage)
      socket.removeEventListener('error', handleError)
      socket.removeEventListener('close', handleClose)
    }

    const handleMessage = (event: MessageEvent<string>) => {
      const message = parseSocketMessage(event.data)
      if (!message) {
        return
      }

      if (message.type === 'auth_required') {
        socket.send(JSON.stringify({ access_token: profile.accessToken, type: 'auth' }))
        return
      }

      if (message.type === 'auth_ok') {
        cleanup()
        resolve()
        return
      }

      if (message.type === 'auth_invalid') {
        cleanup()
        socket.close()
        reject(new Error(message.error?.message ?? 'Home Assistant rejected the token.'))
      }
    }

    const handleError = () => {
      cleanup()
      reject(new Error('Could not connect to Home Assistant.'))
    }

    const handleClose = () => {
      cleanup()
      reject(new Error('Home Assistant connection closed before authentication completed.'))
    }

    socket.addEventListener('message', handleMessage)
    socket.addEventListener('error', handleError)
    socket.addEventListener('close', handleClose)
  })

  return new BrowserHomeAssistantSocket(socket)
}

async function withBrowserHomeAssistantSocket<T>(
  profile: BrowserHomeAssistantProfile,
  callback: (socket: BrowserHomeAssistantSocket) => Promise<T>,
) {
  const socket = await openBrowserHomeAssistantSocket(profile)
  try {
    return await callback(socket)
  } finally {
    socket.close()
  }
}

export async function connectBrowserHomeAssistant(instanceUrl: string, accessToken: string) {
  const profile = {
    accessToken: accessToken.trim(),
    instanceUrl: normalizeHomeAssistantUrl(instanceUrl),
    linkedAt: new Date().toISOString(),
  }

  if (!profile.accessToken) {
    throw new Error('Home Assistant token is required.')
  }

  await withBrowserHomeAssistantSocket(profile, async (socket) => {
    await socket.request<HomeAssistantEntityState[]>({ type: 'get_states' })
  })

  writeStoredProfile(profile)
  return getBrowserHomeAssistantConnectionStatus()
}

export function clearBrowserHomeAssistantConnection() {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(BROWSER_PROFILE_STORAGE_KEY)
}

export async function getBrowserHomeAssistantConnectionStatus() {
  const profile = readStoredProfile()
  if (!profile) {
    return getUnlinkedStatus()
  }

  try {
    const states = await withBrowserHomeAssistantSocket(profile, (socket) =>
      socket.request<HomeAssistantEntityState[]>({ type: 'get_states' }),
    )

    return {
      entityCount: states.length,
      instanceUrl: profile.instanceUrl,
      linked: true,
      message: `Connected to Home Assistant at ${profile.instanceUrl}.`,
      mode: 'browser-local',
      success: true,
    } satisfies BrowserHomeAssistantConnectionStatus
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not connect to Home Assistant.'
    return {
      entityCount: 0,
      instanceUrl: profile.instanceUrl,
      linked: false,
      message,
      mode: 'browser-local',
      success: false,
    } satisfies BrowserHomeAssistantConnectionStatus
  }
}

export async function listBrowserHomeAssistantResources() {
  const profile = readStoredProfile()
  if (!profile) {
    throw new Error('Home Assistant is not linked yet.')
  }

  const states = await withBrowserHomeAssistantSocket(profile, (socket) =>
    socket.request<HomeAssistantEntityState[]>({ type: 'get_states' }),
  )

  return states
    .map(toImportedResource)
    .filter((resource): resource is HomeAssistantImportedResource => Boolean(resource))
    .sort((left, right) => left.label.localeCompare(right.label))
}

export async function runBrowserHomeAssistantCollectionAction({
  binding,
  collectionName,
  request,
}: HomeAssistantDeviceActionDispatch) {
  const profile = readStoredProfile()
  if (!profile) {
    throw new Error('Home Assistant is not linked yet.')
  }

  const resources = binding.resources ?? []
  if (resources.length === 0) {
    throw new Error(`No Home Assistant resources are linked to ${collectionName}.`)
  }

  const shouldUsePrimaryOnly = binding.aggregation === 'primary' || binding.aggregation === 'single'
  const primaryResourceId = binding.primaryResourceId ?? resources[0]?.id ?? null
  const targetResources = shouldUsePrimaryOnly
    ? resources.filter((resource) => resource.id === primaryResourceId).slice(0, 1)
    : resources

  return withBrowserHomeAssistantSocket(profile, async (socket) => {
    const results: Array<{
      entityId: string | null
      finalState: string | null
      resourceId: string
    }> = []

    for (const resource of targetResources) {
      const action = getResourceActionForRequest(binding, resource, request)
      if (!action) {
        continue
      }

      const entityId = resource.entityId ?? null
      const serviceData = buildCollectionServiceData(action, request)
      await socket.request({
        domain: action.domain,
        service: action.service,
        service_data: serviceData,
        target: entityId ? { entity_id: entityId } : undefined,
        type: 'call_service',
      })

      const states = entityId
        ? await socket.request<HomeAssistantEntityState[]>({ type: 'get_states' })
        : []
      const finalState = states.find((state) => state.entity_id === entityId)?.state ?? null

      results.push({
        entityId,
        finalState,
        resourceId: resource.id,
      })
    }

    return {
      collectionName,
      message: `Ran Home Assistant action for ${collectionName}.`,
      results,
      success: results.length > 0,
    }
  })
}

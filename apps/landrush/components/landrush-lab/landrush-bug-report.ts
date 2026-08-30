import type { LocalPlayerProfile, ParcelOwnership, TvMediaStateSnapshot } from '@landrush/protocol'
import type { ParcelBuildNodesSnapshot } from '@landrush/runtime'

export const LANDRUSH_BUG_REPORT_FORMAT = 'landrush-bug-report'
export const LANDRUSH_BUG_REPORT_VERSION = 1
export const LANDRUSH_BUG_REPORT_REPLAY_STORAGE_KEY = 'active-report'

const LANDRUSH_BUG_REPORT_REPLAY_DATABASE = 'landrush-island-bug-reports-v1'
const LANDRUSH_BUG_REPORT_REPLAY_STORE = 'reports'

export type LandrushBugReportViewMode = 'build' | 'map' | 'player'
export type LandrushBugReportVector3 = [number, number, number]
export type LandrushBugReportQuaternion = [number, number, number, number]

export type LandrushBugReportCamera = {
  distance: number
  pitch: number
  position: LandrushBugReportVector3
  quaternion: LandrushBugReportQuaternion
  target: LandrushBugReportVector3
  yaw: number
  zoom: number | null
}

export type LandrushBugReportPlayer = {
  cameraTargetY: number | null
  falling: boolean
  heading: number
  moving: boolean
  position: LandrushBugReportVector3
  profile: LocalPlayerProfile
  speed: number
  velocity: LandrushBugReportVector3
}

export type LandrushBugReportSave = {
  builds: ParcelBuildNodesSnapshot[]
  id: string
  ownerships: ParcelOwnership[]
  roomId: string
  source: 'multiplayer' | 'offline'
  tvMediaStates: TvMediaStateSnapshot[]
  worldId: string
}

export type LandrushBugReport = {
  app: {
    experience: string
    url: string
  }
  camera: LandrushBugReportCamera
  capturedAt: string
  diagnostics: Record<string, unknown>
  floor: {
    buildingId: string | null
    levelId: string | null
    levelNumber: number | null
    scopeId: string | null
  }
  format: typeof LANDRUSH_BUG_REPORT_FORMAT
  mode: {
    buildParcelId: string | null
    fpv: boolean
    view: LandrushBugReportViewMode
  }
  player: LandrushBugReportPlayer
  save: LandrushBugReportSave
  scene: {
    nodeCount: number
    rootNodeIds: string[]
  }
  screenshot: {
    dataUrl: string
    height: number
    mimeType: 'image/png'
    pixelRatio: number
    width: number
  }
  version: typeof LANDRUSH_BUG_REPORT_VERSION
}

export type LandrushBugReportParseResult =
  | { ok: true; report: LandrushBugReport }
  | { error: string; ok: false }

export function parseLandrushBugReport(value: unknown): LandrushBugReportParseResult {
  if (!isRecord(value))
    return { error: 'The selected file is not a Landrush bug report.', ok: false }
  if (value.format !== LANDRUSH_BUG_REPORT_FORMAT) {
    return { error: 'The selected JSON is not a Landrush bug report.', ok: false }
  }
  if (value.version !== LANDRUSH_BUG_REPORT_VERSION) {
    return {
      error: `Unsupported Landrush bug report version: ${String(value.version)}.`,
      ok: false,
    }
  }
  if (!isApp(value.app)) return { error: 'The report app context is invalid.', ok: false }
  if (!isCamera(value.camera)) return { error: 'The report camera pose is invalid.', ok: false }
  if (typeof value.capturedAt !== 'string' || !Number.isFinite(Date.parse(value.capturedAt))) {
    return { error: 'The report capture time is invalid.', ok: false }
  }
  if (!isRecord(value.diagnostics)) {
    return { error: 'The report diagnostics are invalid.', ok: false }
  }
  if (!isFloor(value.floor)) return { error: 'The report floor context is invalid.', ok: false }
  if (!isMode(value.mode)) return { error: 'The report view mode is invalid.', ok: false }
  if (!isPlayer(value.player)) return { error: 'The report player pose is invalid.', ok: false }
  if (!isSave(value.save)) return { error: 'The report save snapshot is invalid.', ok: false }
  if (!isScene(value.scene)) return { error: 'The report scene context is invalid.', ok: false }
  if (
    !isRecord(value.screenshot) ||
    typeof value.screenshot.dataUrl !== 'string' ||
    !value.screenshot.dataUrl.startsWith('data:image/png;base64,') ||
    value.screenshot.mimeType !== 'image/png' ||
    !isPositiveFiniteNumber(value.screenshot.height) ||
    !isPositiveFiniteNumber(value.screenshot.pixelRatio) ||
    !isPositiveFiniteNumber(value.screenshot.width)
  ) {
    return { error: 'The report does not contain a PNG screenshot.', ok: false }
  }

  return { ok: true, report: value as LandrushBugReport }
}

export function parseLandrushBugReportJson(json: string): LandrushBugReportParseResult {
  try {
    return parseLandrushBugReport(JSON.parse(json))
  } catch {
    return { error: 'The selected file is not valid JSON.', ok: false }
  }
}

export function createLandrushBugReportFileName(capturedAt: string) {
  const stamp = capturedAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  return `landrush-bug-report_${stamp}.json`
}

export function downloadLandrushBugReport(report: LandrushBugReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = createLandrushBugReportFileName(report.capturedAt)
  link.href = url
  link.click()
  URL.revokeObjectURL(url)
}

export async function storeLandrushBugReportReplay(report: LandrushBugReport) {
  const database = await openLandrushBugReportDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LANDRUSH_BUG_REPORT_REPLAY_STORE, 'readwrite')
      transaction
        .objectStore(LANDRUSH_BUG_REPORT_REPLAY_STORE)
        .put(structuredClone(report), LANDRUSH_BUG_REPORT_REPLAY_STORAGE_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Replay storage failed.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Replay storage aborted.'))
    })
  } finally {
    database.close()
  }
}

export async function readLandrushBugReportReplay(): Promise<LandrushBugReport | null> {
  const database = await openLandrushBugReportDatabase()
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = database
        .transaction(LANDRUSH_BUG_REPORT_REPLAY_STORE, 'readonly')
        .objectStore(LANDRUSH_BUG_REPORT_REPLAY_STORE)
        .get(LANDRUSH_BUG_REPORT_REPLAY_STORAGE_KEY)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Replay storage read failed.'))
    })
    if (value === undefined) return null
    const parsed = parseLandrushBugReport(value)
    if (parsed.ok) return parsed.report
  } finally {
    database.close()
  }
  await clearLandrushBugReportReplay()
  return null
}

export async function clearLandrushBugReportReplay() {
  const database = await openLandrushBugReportDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LANDRUSH_BUG_REPORT_REPLAY_STORE, 'readwrite')
      transaction
        .objectStore(LANDRUSH_BUG_REPORT_REPLAY_STORE)
        .delete(LANDRUSH_BUG_REPORT_REPLAY_STORAGE_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Replay cleanup failed.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Replay cleanup aborted.'))
    })
  } finally {
    database.close()
  }
}

export function createLandrushBugReportReplayUrl(currentUrl: string, report: LandrushBugReport) {
  const url = new URL(currentUrl)
  url.searchParams.delete('build')
  url.searchParams.delete('camera')
  url.searchParams.delete('clean')
  url.searchParams.delete('map')
  url.searchParams.delete('pascalBuild')
  url.searchParams.set('bugReportReplay', '1')
  url.searchParams.set('landrushProbe', '1')
  url.searchParams.set('landrushProbeDom', '1')
  url.searchParams.set('offline', '1')
  url.searchParams.set('room', report.save.roomId)
  if (report.mode.view === 'map') url.searchParams.set('map', '1')
  return url.toString()
}

export function cloneLandrushBugReportBuilds(
  builds: readonly ParcelBuildNodesSnapshot[],
): ParcelBuildNodesSnapshot[] {
  return builds.map((build) => ({
    ...build,
    nodes: structuredClone(build.nodes),
  }))
}

export function resolveLandrushCanvasPixelRatio(
  canvas: Pick<HTMLCanvasElement, 'clientHeight' | 'clientWidth' | 'height' | 'width'>,
) {
  const widthRatio = canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : null
  if (widthRatio !== null && isPositiveFiniteNumber(widthRatio)) return widthRatio

  const heightRatio = canvas.clientHeight > 0 ? canvas.height / canvas.clientHeight : null
  if (heightRatio !== null && isPositiveFiniteNumber(heightRatio)) return heightRatio

  throw new Error('The Landrush canvas CSS dimensions are unavailable.')
}

function isCamera(value: unknown): value is LandrushBugReportCamera {
  return (
    isRecord(value) &&
    isFiniteVector(value.position, 3) &&
    isFiniteVector(value.quaternion, 4) &&
    isFiniteVector(value.target, 3) &&
    isFiniteNumber(value.distance) &&
    isFiniteNumber(value.pitch) &&
    isFiniteNumber(value.yaw) &&
    (value.zoom === null || isFiniteNumber(value.zoom))
  )
}

function isApp(value: unknown): value is LandrushBugReport['app'] {
  return isRecord(value) && typeof value.experience === 'string' && typeof value.url === 'string'
}

function isFloor(value: unknown): value is LandrushBugReport['floor'] {
  return (
    isRecord(value) &&
    isNullableString(value.buildingId) &&
    isNullableString(value.levelId) &&
    (value.levelNumber === null || isFiniteNumber(value.levelNumber)) &&
    isNullableString(value.scopeId)
  )
}

function isMode(value: unknown): value is LandrushBugReport['mode'] {
  return (
    isRecord(value) &&
    isNullableString(value.buildParcelId) &&
    typeof value.fpv === 'boolean' &&
    isViewMode(value.view)
  )
}

function isPlayer(value: unknown): value is LandrushBugReportPlayer {
  return (
    isRecord(value) &&
    isFiniteVector(value.position, 3) &&
    isFiniteVector(value.velocity, 3) &&
    isFiniteNumber(value.heading) &&
    isFiniteNumber(value.speed) &&
    (value.cameraTargetY === null || isFiniteNumber(value.cameraTargetY)) &&
    typeof value.falling === 'boolean' &&
    typeof value.moving === 'boolean' &&
    isProfile(value.profile)
  )
}

function isSave(value: unknown): value is LandrushBugReportSave {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.roomId === 'string' &&
    typeof value.worldId === 'string' &&
    (value.source === 'multiplayer' || value.source === 'offline') &&
    Array.isArray(value.builds) &&
    value.builds.every(isBuild) &&
    Array.isArray(value.ownerships) &&
    value.ownerships.every(isOwnership) &&
    Array.isArray(value.tvMediaStates) &&
    value.tvMediaStates.every(isTvMediaState)
  )
}

function isBuild(value: unknown): value is ParcelBuildNodesSnapshot {
  return (
    isRecord(value) &&
    typeof value.parcelId === 'string' &&
    typeof value.worldId === 'string' &&
    typeof value.updatedAt === 'number' &&
    typeof value.updatedBy === 'string' &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isRecord)
  )
}

function isOwnership(value: unknown): value is ParcelOwnership {
  return (
    isRecord(value) &&
    isFiniteNumber(value.claimedAt) &&
    isProfile(value.owner) &&
    typeof value.parcelId === 'string' &&
    typeof value.worldId === 'string'
  )
}

function isTvMediaState(value: unknown): value is TvMediaStateSnapshot {
  return (
    isRecord(value) &&
    typeof value.muted === 'boolean' &&
    typeof value.parcelId === 'string' &&
    isFiniteNumber(value.playbackSeconds) &&
    isFiniteNumber(value.playbackUpdatedAt) &&
    typeof value.playing === 'boolean' &&
    typeof value.tvId === 'string' &&
    isFiniteNumber(value.updatedAt) &&
    typeof value.updatedBy === 'string' &&
    typeof value.url === 'string' &&
    isFiniteNumber(value.userVolume) &&
    typeof value.worldId === 'string'
  )
}

function isScene(value: unknown): value is LandrushBugReport['scene'] {
  return (
    isRecord(value) &&
    Number.isInteger(value.nodeCount) &&
    typeof value.nodeCount === 'number' &&
    value.nodeCount >= 0 &&
    Array.isArray(value.rootNodeIds) &&
    value.rootNodeIds.every((id) => typeof id === 'string')
  )
}

function isProfile(value: unknown): value is LocalPlayerProfile {
  return (
    isRecord(value) &&
    typeof value.color === 'string' &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
  )
}

function isViewMode(value: unknown): value is LandrushBugReportViewMode {
  return value === 'build' || value === 'map' || value === 'player'
}

function isFiniteVector(value: unknown, length: number) {
  return Array.isArray(value) && value.length === length && value.every(isFiniteNumber)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function openLandrushBugReportDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(LANDRUSH_BUG_REPORT_REPLAY_DATABASE, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(LANDRUSH_BUG_REPORT_REPLAY_STORE)) {
        database.createObjectStore(LANDRUSH_BUG_REPORT_REPLAY_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Replay storage is unavailable.'))
    request.onblocked = () => reject(new Error('Replay storage is blocked by another tab.'))
  })
}

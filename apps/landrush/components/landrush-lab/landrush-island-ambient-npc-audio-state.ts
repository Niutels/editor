export const LANDRUSH_ISLAND_AMBIENT_NPC_BUMP_ENTER_DISTANCE_METERS = 0.92
export const LANDRUSH_ISLAND_AMBIENT_NPC_BUMP_EXIT_DISTANCE_METERS = 1.24
export const LANDRUSH_ISLAND_AMBIENT_NPC_BUMP_REPEAT_INTERVAL_SECONDS = 4.5

export type LandrushIslandAmbientNpcAudioPositions = Readonly<{
  active: Uint8Array
  x: Float32Array
  y: Float32Array
  z: Float32Array
}>

export type LandrushIslandAmbientNpcBumpRuntime = {
  contactState: Uint8Array
  lastGlobalPlaybackSeconds: number
  lastPlaybackSeconds: Float64Array
}

const landrushIslandAmbientNpcAudioPositionsByRuntime = new WeakMap<
  object,
  LandrushIslandAmbientNpcAudioPositions[]
>()

export function createLandrushIslandAmbientNpcAudioPositions(
  capacity: number,
): LandrushIslandAmbientNpcAudioPositions {
  const normalizedCapacity = Math.max(0, Math.trunc(capacity))
  return {
    active: new Uint8Array(normalizedCapacity),
    x: new Float32Array(normalizedCapacity),
    y: new Float32Array(normalizedCapacity),
    z: new Float32Array(normalizedCapacity),
  }
}

export function createLandrushIslandAmbientNpcBumpRuntime(
  capacity: number,
): LandrushIslandAmbientNpcBumpRuntime {
  const normalizedCapacity = Math.max(0, Math.trunc(capacity))
  const lastPlaybackSeconds = new Float64Array(normalizedCapacity)
  lastPlaybackSeconds.fill(Number.NEGATIVE_INFINITY)
  return {
    contactState: new Uint8Array(normalizedCapacity),
    lastGlobalPlaybackSeconds: Number.NEGATIVE_INFINITY,
    lastPlaybackSeconds,
  }
}

export function registerLandrushIslandAmbientNpcAudioPositions(
  runtimeOwner: object,
  positions: LandrushIslandAmbientNpcAudioPositions,
) {
  const registered = landrushIslandAmbientNpcAudioPositionsByRuntime.get(runtimeOwner) ?? []
  registered.push(positions)
  landrushIslandAmbientNpcAudioPositionsByRuntime.set(runtimeOwner, registered)
  let active = true
  return () => {
    if (!active) return
    active = false
    const current = landrushIslandAmbientNpcAudioPositionsByRuntime.get(runtimeOwner)
    if (!current) return
    const index = current.lastIndexOf(positions)
    if (index >= 0) current.splice(index, 1)
    if (current.length === 0) landrushIslandAmbientNpcAudioPositionsByRuntime.delete(runtimeOwner)
  }
}

export function readLandrushIslandAmbientNpcAudioPositions(runtimeOwner: object) {
  const registered = landrushIslandAmbientNpcAudioPositionsByRuntime.get(runtimeOwner)
  return registered?.[registered.length - 1] ?? null
}

export function setLandrushIslandAmbientNpcAudioPosition(
  positions: LandrushIslandAmbientNpcAudioPositions,
  index: number,
  x: number,
  y: number,
  z: number,
) {
  if (!isValidLandrushIslandAmbientNpcAudioIndex(positions, index)) return false
  positions.active[index] = 1
  positions.x[index] = x
  positions.y[index] = y
  positions.z[index] = z
  return true
}

export function clearLandrushIslandAmbientNpcAudioPosition(
  positions: LandrushIslandAmbientNpcAudioPositions,
  index: number,
) {
  if (!isValidLandrushIslandAmbientNpcAudioIndex(positions, index)) return false
  positions.active[index] = 0
  return true
}

export function advanceLandrushIslandAmbientNpcBumpAudio(
  runtime: LandrushIslandAmbientNpcBumpRuntime,
  positions: LandrushIslandAmbientNpcAudioPositions,
  playerX: number,
  playerY: number,
  playerZ: number,
  nowSeconds: number,
  playbackAvailable: boolean,
  globalIntervalSeconds: number,
) {
  const enterDistanceSquared = LANDRUSH_ISLAND_AMBIENT_NPC_BUMP_ENTER_DISTANCE_METERS ** 2
  const exitDistanceSquared = LANDRUSH_ISLAND_AMBIENT_NPC_BUMP_EXIT_DISTANCE_METERS ** 2
  let selectedIndex = -1
  let selectedDistanceSquared = Number.POSITIVE_INFINITY
  const globalIntervalElapsed =
    nowSeconds - runtime.lastGlobalPlaybackSeconds >= Math.max(0, globalIntervalSeconds)

  for (let index = 0; index < positions.active.length; index += 1) {
    if (positions.active[index] !== 1) {
      runtime.contactState[index] = 0
      continue
    }
    const offsetX = positions.x[index]! - playerX
    const offsetY = positions.y[index]! - playerY
    const offsetZ = positions.z[index]! - playerZ
    const distanceSquared = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ
    const state = runtime.contactState[index] ?? 0
    if (distanceSquared > exitDistanceSquared) {
      runtime.contactState[index] = 0
      continue
    }
    if (
      state === 0 &&
      distanceSquared <= enterDistanceSquared &&
      playbackAvailable &&
      globalIntervalElapsed &&
      nowSeconds - runtime.lastPlaybackSeconds[index]! >=
        LANDRUSH_ISLAND_AMBIENT_NPC_BUMP_REPEAT_INTERVAL_SECONDS &&
      distanceSquared < selectedDistanceSquared
    ) {
      selectedIndex = index
      selectedDistanceSquared = distanceSquared
    }
    if (state === 0 && distanceSquared <= enterDistanceSquared) {
      runtime.contactState[index] = 2
    }
  }

  if (selectedIndex < 0) return -1
  runtime.lastPlaybackSeconds[selectedIndex] = nowSeconds
  runtime.lastGlobalPlaybackSeconds = nowSeconds
  return selectedIndex
}

function isValidLandrushIslandAmbientNpcAudioIndex(
  positions: LandrushIslandAmbientNpcAudioPositions,
  index: number,
) {
  return Number.isInteger(index) && index >= 0 && index < positions.active.length
}

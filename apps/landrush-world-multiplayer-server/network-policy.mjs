import { isIP } from 'node:net'

const PREFIX = 'LANDRUSH_WORLD_MULTIPLAYER_'

export function createMultiplayerNetworkPolicy(environment = process.env) {
  const host = environment[`${PREFIX}HOST`]?.trim()
  if (host !== undefined && host !== 'localhost' && !isIP(host)) {
    throw new Error(`${PREFIX}HOST must be an IP address or localhost`)
  }
  const configuredOrigins = environment[`${PREFIX}ALLOWED_ORIGINS`]
  let allowedOrigins = null
  if (configuredOrigins !== undefined) {
    allowedOrigins = new Set()
    for (const value of configuredOrigins.split(',')) {
      const origin = value.trim()
      let parsed
      try {
        parsed = new URL(origin)
      } catch {
        throw new Error(`${PREFIX}ALLOWED_ORIGINS must contain exact HTTP(S) origins`)
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
        throw new Error(`${PREFIX}ALLOWED_ORIGINS must contain exact HTTP(S) origins`)
      }
      allowedOrigins.add(origin)
    }
  }
  return {
    host,
    allowedOrigins,
    maxConnections: readLimit(environment, 'MAX_CONNECTIONS', 256, 4096),
    messagesPerSecond: readLimit(environment, 'MESSAGES_PER_SECOND', 120, 1000),
    messageBurst: readLimit(environment, 'MESSAGE_BURST', 240, 2000),
    bytesPerSecond: readLimit(environment, 'BYTES_PER_SECOND', 8 * 1024 * 1024, 64 * 1024 * 1024),
    byteBurst: readLimit(environment, 'BYTE_BURST', 16 * 1024 * 1024, 128 * 1024 * 1024),
    prejoinTimeoutMs: readLimit(environment, 'PREJOIN_TIMEOUT_MS', 15_000, 300_000),
  }
}

export function isMultiplayerOriginAllowed(policy, origin) {
  return policy.allowedOrigins === null || policy.allowedOrigins.has(origin)
}

export function createMultiplayerMessageBudget(policy, nowMs) {
  return { bytes: policy.byteBurst, messages: policy.messageBurst, lastAtMs: nowMs }
}

export function consumeMultiplayerMessageBudget(budget, policy, byteLength, nowMs) {
  const elapsedSeconds = Math.max(0, nowMs - budget.lastAtMs) / 1000
  budget.lastAtMs = Math.max(nowMs, budget.lastAtMs)
  budget.messages = Math.min(policy.messageBurst, budget.messages + elapsedSeconds * policy.messagesPerSecond)
  budget.bytes = Math.min(policy.byteBurst, budget.bytes + elapsedSeconds * policy.bytesPerSecond)
  if (budget.messages < 1 || byteLength > budget.bytes) return false
  budget.messages -= 1
  budget.bytes -= byteLength
  return true
}

function readLimit(environment, suffix, fallback, maximum) {
  const key = `${PREFIX}${suffix}`
  if (environment[key] === undefined) return fallback
  const value = Number(environment[key])
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${key} must be an integer from 1 to ${maximum}`)
  }
  return value
}

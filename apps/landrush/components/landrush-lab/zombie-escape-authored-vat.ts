export const ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT = 12
export const ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT =
  1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 4
export const ZOMBIE_ESCAPE_AUTHORED_TEXTURE_FETCHES_PER_VERTEX = 2

const ZOMBIE_ESCAPE_AUTHORED_VAT_MAGIC = 'ZEVAT002'
const ZOMBIE_ESCAPE_AUTHORED_VAT_HEADER_BYTES = 16
const ZOMBIE_ESCAPE_AUTHORED_VAT_MESH_HEADER_BYTES = 16
const ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_DIMENSION = 4096
const ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_VERTEX_COUNT =
  ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_DIMENSION ** 2 /
  ZOMBIE_ESCAPE_AUTHORED_TEXTURE_FETCHES_PER_VERTEX
const ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_MESH_COUNT = 64
const ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_BYTES = 64 * 1024 * 1024
const ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_TRANSFER_BYTES =
  ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_BYTES + 1024 * 1024
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

export type ZombieEscapeAuthoredVatMesh = Readonly<{
  data: Uint16Array
  height: number
  vertexCount: number
  width: number
}>

export type ZombieEscapeAuthoredVat = Readonly<{
  frameCount: number
  meshes: readonly ZombieEscapeAuthoredVatMesh[]
}>

type ZombieEscapeAuthoredVatCacheEntry = {
  readonly abortController: AbortController
  pending: boolean
  readonly request: Promise<ZombieEscapeAuthoredVat>
  waiterCount: number
}

const authoredVatCache = new Map<string, ZombieEscapeAuthoredVatCacheEntry>()

export function resolveZombieEscapeAuthoredVatPath(zombieId: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(zombieId)) {
    throw new Error(`Invalid Zombie Escape authored VAT id: ${zombieId}.`)
  }
  return `/landrush-lab/zombie-escape/assets/zombies/authored-vat/${zombieId}.zvat.gz`
}

export function resolveZombieEscapeAuthoredVatTextureLayout(vertexCount: number) {
  if (
    !(
      Number.isSafeInteger(vertexCount) &&
      vertexCount >= 1 &&
      vertexCount <= ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_VERTEX_COUNT
    )
  ) {
    throw new Error(
      `Authored VAT vertex count must be a positive integer; received ${vertexCount}.`,
    )
  }
  const texelCount = vertexCount * ZOMBIE_ESCAPE_AUTHORED_TEXTURE_FETCHES_PER_VERTEX
  let bestWidth = 0
  let bestHeight = 0
  let bestTexelCount = Number.POSITIVE_INFINITY
  const minimumHeight = Math.max(
    1,
    Math.ceil(texelCount / ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_DIMENSION),
  )
  const maximumHeight = Math.min(ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_DIMENSION, texelCount)
  for (let height = minimumHeight; height <= maximumHeight; height += 1) {
    const width = Math.ceil(texelCount / height / 2) * 2
    if (width > ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_DIMENSION) continue
    const paddedTexelCount = width * height
    if (
      paddedTexelCount < bestTexelCount ||
      (paddedTexelCount === bestTexelCount && width > bestWidth)
    ) {
      bestWidth = width
      bestHeight = height
      bestTexelCount = paddedTexelCount
    }
  }
  if (bestWidth === 0) {
    throw new Error(`Authored VAT vertex count ${vertexCount} exceeds the supported texture size.`)
  }
  return { height: bestHeight, width: bestWidth }
}

export function encodeZombieEscapeAuthoredVat(payload: ZombieEscapeAuthoredVat) {
  validateZombieEscapeAuthoredVat(payload)
  const meshHeaderBytes = payload.meshes.length * ZOMBIE_ESCAPE_AUTHORED_VAT_MESH_HEADER_BYTES
  const dataBytes = payload.meshes.reduce((total, mesh) => total + mesh.data.byteLength, 0)
  const bytes = new Uint8Array(
    ZOMBIE_ESCAPE_AUTHORED_VAT_HEADER_BYTES + meshHeaderBytes + dataBytes,
  )
  for (let index = 0; index < ZOMBIE_ESCAPE_AUTHORED_VAT_MAGIC.length; index += 1) {
    bytes[index] = ZOMBIE_ESCAPE_AUTHORED_VAT_MAGIC.charCodeAt(index)
  }
  const view = new DataView(bytes.buffer)
  view.setUint32(8, payload.frameCount, true)
  view.setUint32(12, payload.meshes.length, true)
  let dataOffset = ZOMBIE_ESCAPE_AUTHORED_VAT_HEADER_BYTES + meshHeaderBytes
  for (let index = 0; index < payload.meshes.length; index += 1) {
    const mesh = payload.meshes[index]!
    const headerOffset = ZOMBIE_ESCAPE_AUTHORED_VAT_HEADER_BYTES + index * 16
    view.setUint32(headerOffset, mesh.vertexCount, true)
    view.setUint32(headerOffset + 4, mesh.width, true)
    view.setUint32(headerOffset + 8, mesh.height, true)
    view.setUint32(headerOffset + 12, mesh.data.length, true)
    writeDeltaEncodedVatMesh(bytes, dataOffset, mesh)
    dataOffset += mesh.data.byteLength
  }
  return bytes
}

export function decodeZombieEscapeAuthoredVat(source: ArrayBuffer | ArrayBufferView) {
  const bytes =
    source instanceof ArrayBuffer
      ? new Uint8Array(source)
      : new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
  if (
    bytes.byteLength < ZOMBIE_ESCAPE_AUTHORED_VAT_HEADER_BYTES ||
    bytes.byteLength > ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_BYTES
  ) {
    throw new Error(`Zombie Escape authored VAT has an invalid byte length: ${bytes.byteLength}.`)
  }
  for (let index = 0; index < ZOMBIE_ESCAPE_AUTHORED_VAT_MAGIC.length; index += 1) {
    if (bytes[index] !== ZOMBIE_ESCAPE_AUTHORED_VAT_MAGIC.charCodeAt(index)) {
      throw new Error('Zombie Escape authored VAT has an invalid signature.')
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const frameCount = view.getUint32(8, true)
  const meshCount = view.getUint32(12, true)
  if (frameCount !== ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT) {
    throw new Error(`Zombie Escape authored VAT has an unsupported frame count: ${frameCount}.`)
  }
  if (meshCount < 1 || meshCount > ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_MESH_COUNT) {
    throw new Error(`Zombie Escape authored VAT has an invalid mesh count: ${meshCount}.`)
  }
  const meshHeaderBytes = meshCount * ZOMBIE_ESCAPE_AUTHORED_VAT_MESH_HEADER_BYTES
  let dataOffset = ZOMBIE_ESCAPE_AUTHORED_VAT_HEADER_BYTES + meshHeaderBytes
  if (dataOffset > bytes.byteLength) {
    throw new Error('Zombie Escape authored VAT is truncated before its mesh payloads.')
  }
  const meshes: ZombieEscapeAuthoredVatMesh[] = []
  for (let index = 0; index < meshCount; index += 1) {
    const headerOffset = ZOMBIE_ESCAPE_AUTHORED_VAT_HEADER_BYTES + index * 16
    const vertexCount = view.getUint32(headerOffset, true)
    const width = view.getUint32(headerOffset + 4, true)
    const height = view.getUint32(headerOffset + 8, true)
    const dataLength = view.getUint32(headerOffset + 12, true)
    const byteLength = dataLength * Uint16Array.BYTES_PER_ELEMENT
    if (dataOffset + byteLength > bytes.byteLength) {
      throw new Error(`Zombie Escape authored VAT mesh ${index} is truncated.`)
    }
    const data = readUint16LittleEndian(bytes, dataOffset, dataLength)
    restoreDeltaEncodedVatMesh(data, width * height * 4, frameCount)
    meshes.push({ data, height, vertexCount, width })
    dataOffset += byteLength
  }
  if (dataOffset !== bytes.byteLength) {
    throw new Error('Zombie Escape authored VAT contains trailing bytes.')
  }
  const payload = { frameCount, meshes }
  validateZombieEscapeAuthoredVat(payload)
  return payload
}

export function loadZombieEscapeAuthoredVat(path: string, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(resolveAbortReason(signal))
  const entry = authoredVatCache.get(path) ?? createZombieEscapeAuthoredVatCacheEntry(path)
  entry.waiterCount += 1
  const request = signal ? waitForZombieEscapeAuthoredVat(entry.request, signal) : entry.request
  return request.finally(() => releaseZombieEscapeAuthoredVatWaiter(path, entry))
}

export function clearZombieEscapeAuthoredVatCache(paths?: readonly string[]) {
  if (!paths) {
    for (const [path, entry] of authoredVatCache) {
      clearZombieEscapeAuthoredVatCacheEntry(path, entry)
    }
    return
  }
  for (const path of paths) {
    const entry = authoredVatCache.get(path)
    if (entry) clearZombieEscapeAuthoredVatCacheEntry(path, entry)
  }
}

function createZombieEscapeAuthoredVatCacheEntry(path: string) {
  const abortController = new AbortController()
  const entry: ZombieEscapeAuthoredVatCacheEntry = {
    abortController,
    pending: true,
    request: fetchAndDecodeZombieEscapeAuthoredVat(path, abortController.signal),
    waiterCount: 0,
  }
  authoredVatCache.set(path, entry)
  void entry.request.then(
    () => {
      entry.pending = false
    },
    () => {
      entry.pending = false
      if (authoredVatCache.get(path) === entry) authoredVatCache.delete(path)
    },
  )
  return entry
}

function releaseZombieEscapeAuthoredVatWaiter(
  path: string,
  entry: ZombieEscapeAuthoredVatCacheEntry,
) {
  entry.waiterCount -= 1
  if (entry.waiterCount !== 0 || !entry.pending || authoredVatCache.get(path) !== entry) return
  authoredVatCache.delete(path)
  entry.abortController.abort(createZombieEscapeAuthoredVatAbortError())
}

function clearZombieEscapeAuthoredVatCacheEntry(
  path: string,
  entry: ZombieEscapeAuthoredVatCacheEntry,
) {
  if (authoredVatCache.get(path) !== entry) return
  authoredVatCache.delete(path)
  if (entry.pending) {
    entry.abortController.abort(
      createZombieEscapeAuthoredVatAbortError('Zombie Escape authored VAT cache was cleared.'),
    )
  }
}

function validateZombieEscapeAuthoredVat(payload: ZombieEscapeAuthoredVat) {
  if (payload.frameCount !== ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT) {
    throw new Error(
      `Zombie Escape authored VAT has an unsupported frame count: ${payload.frameCount}.`,
    )
  }
  if (
    payload.meshes.length < 1 ||
    payload.meshes.length > ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_MESH_COUNT
  ) {
    throw new Error(
      `Zombie Escape authored VAT has an invalid mesh count: ${payload.meshes.length}.`,
    )
  }
  for (let index = 0; index < payload.meshes.length; index += 1) {
    const mesh = payload.meshes[index]!
    const expectedLayout = resolveZombieEscapeAuthoredVatTextureLayout(mesh.vertexCount)
    const expectedLength =
      mesh.width * mesh.height * 4 * ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT
    if (
      mesh.width !== expectedLayout.width ||
      mesh.height !== expectedLayout.height ||
      mesh.data.length !== expectedLength
    ) {
      throw new Error(`Zombie Escape authored VAT mesh ${index} has an invalid texture layout.`)
    }
  }
}

async function fetchAndDecodeZombieEscapeAuthoredVat(path: string, signal: AbortSignal) {
  const response = await fetch(path, { signal })
  throwIfZombieEscapeAuthoredVatAborted(signal)
  if (!response.ok) {
    throw new Error(
      `Failed to load Zombie Escape authored VAT ${path}: ${response.status} ${response.statusText}.`,
    )
  }
  if (!response.body) {
    throw new Error(`Failed to load Zombie Escape authored VAT ${path}: response has no body.`)
  }
  const transferredBytes = await readBoundedZombieEscapeAuthoredVatStream(
    response.body,
    ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_TRANSFER_BYTES,
    'transfer',
    signal,
  )
  const bytes = hasZombieEscapeAuthoredVatSignature(transferredBytes)
    ? transferredBytes
    : await decompressZombieEscapeAuthoredVat(transferredBytes, signal)
  throwIfZombieEscapeAuthoredVatAborted(signal)
  return decodeZombieEscapeAuthoredVat(bytes)
}

function hasZombieEscapeAuthoredVatSignature(bytes: Uint8Array) {
  if (bytes.length < ZOMBIE_ESCAPE_AUTHORED_VAT_MAGIC.length) return false
  for (let index = 0; index < ZOMBIE_ESCAPE_AUTHORED_VAT_MAGIC.length; index += 1) {
    if (bytes[index] !== ZOMBIE_ESCAPE_AUTHORED_VAT_MAGIC.charCodeAt(index)) return false
  }
  return true
}

async function decompressZombieEscapeAuthoredVat(
  compressed: Uint8Array<ArrayBuffer>,
  signal: AbortSignal,
) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress Zombie Escape authored VAT assets.')
  }
  throwIfZombieEscapeAuthoredVatAborted(signal)
  const stream = new Blob([compressed.buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return readBoundedZombieEscapeAuthoredVatStream(
    stream,
    ZOMBIE_ESCAPE_AUTHORED_VAT_MAXIMUM_BYTES,
    'decompressed payload',
    signal,
  )
}

async function readBoundedZombieEscapeAuthoredVatStream(
  stream: ReadableStream<Uint8Array>,
  maximumBytes: number,
  label: string,
  signal: AbortSignal,
) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  const handleAbort = () => {
    void reader.cancel(resolveAbortReason(signal)).catch(() => {})
  }
  signal.addEventListener('abort', handleAbort, { once: true })
  try {
    while (true) {
      throwIfZombieEscapeAuthoredVatAborted(signal)
      const { done, value } = await reader.read()
      throwIfZombieEscapeAuthoredVatAborted(signal)
      if (done) break
      if (value.byteLength === 0) continue
      if (value.byteLength > maximumBytes - byteLength) {
        const error = new Error(
          `Zombie Escape authored VAT ${label} exceeds the ${maximumBytes}-byte limit.`,
        )
        try {
          await reader.cancel(error)
        } catch {}
        throw error
      }
      chunks.push(value)
      byteLength += value.byteLength
    }
  } catch (error) {
    if (signal.aborted) throw resolveAbortReason(signal)
    throw error
  } finally {
    signal.removeEventListener('abort', handleAbort)
    reader.releaseLock()
  }
  throwIfZombieEscapeAuthoredVatAborted(signal)
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function writeDeltaEncodedVatMesh(
  target: Uint8Array,
  offset: number,
  mesh: ZombieEscapeAuthoredVatMesh,
) {
  const source = mesh.data
  const frameStride = mesh.width * mesh.height * 4
  if (LITTLE_ENDIAN && (target.byteOffset + offset) % Uint16Array.BYTES_PER_ELEMENT === 0) {
    const encoded = new Uint16Array(target.buffer, target.byteOffset + offset, source.length)
    encoded.set(source.subarray(0, frameStride))
    for (let frame = 1; frame < ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT; frame += 1) {
      const frameOffset = frame * frameStride
      for (let index = 0; index < frameStride; index += 1) {
        encoded[frameOffset + index] =
          source[frameOffset + index]! ^ source[frameOffset - frameStride + index]!
      }
    }
    return
  }
  const view = new DataView(target.buffer, target.byteOffset + offset, source.byteLength)
  for (let frame = 0; frame < ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT; frame += 1) {
    const frameOffset = frame * frameStride
    for (let index = 0; index < frameStride; index += 1) {
      const value =
        frame === 0
          ? source[index]!
          : source[frameOffset + index]! ^ source[frameOffset - frameStride + index]!
      view.setUint16((frameOffset + index) * Uint16Array.BYTES_PER_ELEMENT, value, true)
    }
  }
}

function restoreDeltaEncodedVatMesh(data: Uint16Array, frameStride: number, frameCount: number) {
  for (let frame = 1; frame < frameCount; frame += 1) {
    const frameOffset = frame * frameStride
    for (let index = 0; index < frameStride; index += 1) {
      data[frameOffset + index] =
        data[frameOffset + index]! ^ data[frameOffset - frameStride + index]!
    }
  }
}

function readUint16LittleEndian(source: Uint8Array, offset: number, length: number) {
  const result = new Uint16Array(length)
  if (LITTLE_ENDIAN && (source.byteOffset + offset) % Uint16Array.BYTES_PER_ELEMENT === 0) {
    result.set(new Uint16Array(source.buffer, source.byteOffset + offset, length))
    return result
  }
  const view = new DataView(
    source.buffer,
    source.byteOffset + offset,
    length * Uint16Array.BYTES_PER_ELEMENT,
  )
  for (let index = 0; index < length; index += 1) {
    result[index] = view.getUint16(index * Uint16Array.BYTES_PER_ELEMENT, true)
  }
  return result
}

function waitForZombieEscapeAuthoredVat(
  request: Promise<ZombieEscapeAuthoredVat>,
  signal: AbortSignal,
) {
  if (signal.aborted) return Promise.reject(resolveAbortReason(signal))
  return new Promise<ZombieEscapeAuthoredVat>((resolve, reject) => {
    const handleAbort = () => reject(resolveAbortReason(signal))
    signal.addEventListener('abort', handleAbort, { once: true })
    void request.then(
      (payload) => {
        signal.removeEventListener('abort', handleAbort)
        resolve(payload)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', handleAbort)
        reject(error)
      },
    )
  })
}

function resolveAbortReason(signal: AbortSignal) {
  if (signal.reason instanceof Error) return signal.reason
  return createZombieEscapeAuthoredVatAbortError()
}

function throwIfZombieEscapeAuthoredVatAborted(signal: AbortSignal) {
  if (signal.aborted) throw resolveAbortReason(signal)
}

function createZombieEscapeAuthoredVatAbortError(
  message = 'Zombie Escape authored VAT loading was aborted.',
) {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

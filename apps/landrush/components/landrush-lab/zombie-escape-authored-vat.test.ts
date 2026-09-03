import { afterEach, describe, expect, mock, test } from 'bun:test'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  clearZombieEscapeAuthoredVatCache,
  decodeZombieEscapeAuthoredVat,
  encodeZombieEscapeAuthoredVat,
  loadZombieEscapeAuthoredVat,
  resolveZombieEscapeAuthoredVatPath,
  resolveZombieEscapeAuthoredVatTextureLayout,
  ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT,
} from './zombie-escape-authored-vat'

const originalFetch = globalThis.fetch
const originalDecompressionStreamDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'DecompressionStream',
)

afterEach(() => {
  clearZombieEscapeAuthoredVatCache()
  globalThis.fetch = originalFetch
  if (originalDecompressionStreamDescriptor) {
    Object.defineProperty(globalThis, 'DecompressionStream', originalDecompressionStreamDescriptor)
  } else {
    Reflect.deleteProperty(globalThis, 'DecompressionStream')
  }
})

describe('Zombie Escape authored VAT assets', () => {
  test('round-trips every half-float bit exactly through the delta format', () => {
    const vertexCount = 3
    const { height, width } = resolveZombieEscapeAuthoredVatTextureLayout(vertexCount)
    const data = new Uint16Array(
      width * height * 4 * ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT,
    )
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.imul(index, 8191) + Math.floor(index / 17)) & 0xffff
    }
    const encoded = encodeZombieEscapeAuthoredVat({
      frameCount: ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT,
      meshes: [{ data, height, vertexCount, width }],
    })
    const encodedCopy = encoded.slice()
    const decoded = decodeZombieEscapeAuthoredVat(encoded)

    expect(encoded).toEqual(encodedCopy)
    expect(decoded.frameCount).toBe(ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT)
    expect(decoded.meshes[0]?.vertexCount).toBe(vertexCount)
    expect(decoded.meshes[0]?.width * decoded.meshes[0]?.height).toBe(vertexCount * 2)
    expect(decoded.meshes[0]?.data).toEqual(data)
  })

  test('loads the exact checked format once through the runtime cache', async () => {
    const { data, encoded } = createTestZombieEscapeAuthoredVat()
    const path = 'https://example.test/cached.zvat'
    const request = mock(async () => new Response(encoded))
    globalThis.fetch = request as typeof fetch

    const first = await loadZombieEscapeAuthoredVat(path)
    const second = await loadZombieEscapeAuthoredVat(path)

    expect(request).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    expect(first.meshes[0]?.data).toEqual(data)
  })

  test('keeps one shared transfer alive while an unsignalled waiter remains', async () => {
    const { data, encoded } = createTestZombieEscapeAuthoredVat()
    const path = 'https://example.test/shared.zvat'
    let internalSignal: AbortSignal | undefined
    let resolveResponse: ((response: Response) => void) | undefined
    const request = mock(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          internalSignal = init?.signal ?? undefined
          resolveResponse = resolve
          internalSignal?.addEventListener('abort', () => reject(internalSignal?.reason), {
            once: true,
          })
        }),
    )
    globalThis.fetch = request as typeof fetch
    const controller = new AbortController()

    const cancelled = loadZombieEscapeAuthoredVat(path, controller.signal).catch(
      (error: unknown) => error,
    )
    const surviving = loadZombieEscapeAuthoredVat(path)
    controller.abort()

    expect(((await cancelled) as Error).name).toBe('AbortError')
    expect(request).toHaveBeenCalledTimes(1)
    expect(internalSignal?.aborted).toBe(false)
    resolveResponse?.(new Response(encoded))
    expect((await surviving).meshes[0]?.data).toEqual(data)
  })

  test('cancels and evicts the request after its last waiter aborts', async () => {
    const { encoded } = createTestZombieEscapeAuthoredVat()
    const path = 'https://example.test/last-waiter.zvat'
    let attempt = 0
    let firstSignal: AbortSignal | undefined
    const request = mock((_input: RequestInfo | URL, init?: RequestInit) => {
      attempt += 1
      if (attempt > 1) return Promise.resolve(new Response(encoded))
      firstSignal = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) => {
        firstSignal?.addEventListener('abort', () => reject(firstSignal?.reason), { once: true })
      })
    })
    globalThis.fetch = request as typeof fetch
    const controller = new AbortController()
    const cancelled = loadZombieEscapeAuthoredVat(path, controller.signal).catch(
      (error: unknown) => error,
    )

    controller.abort()

    expect(((await cancelled) as Error).name).toBe('AbortError')
    expect(firstSignal?.aborted).toBe(true)
    await loadZombieEscapeAuthoredVat(path)
    expect(request).toHaveBeenCalledTimes(2)
  })

  test('does not fetch for a pre-aborted waiter', async () => {
    const path = 'https://example.test/pre-aborted.zvat'
    const request = mock(async () => new Response())
    globalThis.fetch = request as typeof fetch
    const controller = new AbortController()
    controller.abort()

    await expect(loadZombieEscapeAuthoredVat(path, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(request).not.toHaveBeenCalled()
  })

  test('aborts a cleared request without letting its stale rejection evict a replacement', async () => {
    const { encoded } = createTestZombieEscapeAuthoredVat()
    const path = 'https://example.test/cleared.zvat'
    let attempt = 0
    let firstSignal: AbortSignal | undefined
    const request = mock((_input: RequestInfo | URL, init?: RequestInit) => {
      attempt += 1
      if (attempt > 1) return Promise.resolve(new Response(encoded))
      firstSignal = init?.signal ?? undefined
      return new Promise<Response>((_resolve, reject) => {
        firstSignal?.addEventListener('abort', () => reject(firstSignal?.reason), { once: true })
      })
    })
    globalThis.fetch = request as typeof fetch
    const stale = loadZombieEscapeAuthoredVat(path).catch((error: unknown) => error)

    clearZombieEscapeAuthoredVatCache([path])
    const replacement = await loadZombieEscapeAuthoredVat(path)

    expect(((await stale) as Error).name).toBe('AbortError')
    expect(firstSignal?.aborted).toBe(true)
    expect(await loadZombieEscapeAuthoredVat(path)).toBe(replacement)
    expect(request).toHaveBeenCalledTimes(2)
  })

  test('decompresses gzip payloads through the bounded stream path', async () => {
    const { data, encoded } = createTestZombieEscapeAuthoredVat()
    const path = 'https://example.test/compressed.zvat.gz'
    installGunzipTestDecompressionStream()
    const request = mock(async () => new Response(gzipSync(encoded)))
    globalThis.fetch = request as typeof fetch

    const payload = await loadZombieEscapeAuthoredVat(path)

    expect(payload.meshes[0]?.data).toEqual(data)
  })

  test('cancels a pending gzip reader when the last waiter aborts', async () => {
    const path = 'https://example.test/decompressing.zvat.gz'
    let cancelledWith: unknown
    let markDecompressionStarted: (() => void) | undefined
    const decompressionStarted = new Promise<void>((resolve) => {
      markDecompressionStarted = resolve
    })
    installTestDecompressionStream(
      () =>
        new ReadableStream<Uint8Array>({
          cancel(reason) {
            cancelledWith = reason
          },
          start() {
            markDecompressionStarted?.()
          },
        }),
    )
    globalThis.fetch = mock(async () => new Response(new Uint8Array([0]))) as typeof fetch
    const controller = new AbortController()
    const cancelled = loadZombieEscapeAuthoredVat(path, controller.signal).catch(
      (error: unknown) => error,
    )
    await decompressionStarted

    controller.abort()

    expect(((await cancelled) as Error).name).toBe('AbortError')
    expect(cancelledWith).toMatchObject({ name: 'AbortError' })
  })

  test('cancels decompression before accepting output above the decoded byte limit', async () => {
    const path = 'https://example.test/oversized.zvat.gz'
    let readerCancelled = false
    installTestDecompressionStream(
      () =>
        new ReadableStream<Uint8Array>({
          cancel() {
            readerCancelled = true
          },
          start(controller) {
            controller.enqueue({ byteLength: 64 * 1024 * 1024 + 1 } as Uint8Array)
          },
        }),
    )
    globalThis.fetch = mock(async () => new Response(new Uint8Array([0]))) as typeof fetch

    await expect(loadZombieEscapeAuthoredVat(path)).rejects.toThrow(
      'decompressed payload exceeds the 67108864-byte limit',
    )
    expect(readerCancelled).toBe(true)
  })

  test('uses stable contained paths and rejects invalid ids', () => {
    expect(resolveZombieEscapeAuthoredVatPath('boardwalk-chef')).toBe(
      '/landrush-lab/zombie-escape/assets/zombies/authored-vat/boardwalk-chef.zvat.gz',
    )
    expect(() => resolveZombieEscapeAuthoredVatPath('../outside')).toThrow(
      'Invalid Zombie Escape authored VAT id',
    )
  })
})

function createTestZombieEscapeAuthoredVat() {
  const vertexCount = 1
  const { height, width } = resolveZombieEscapeAuthoredVatTextureLayout(vertexCount)
  const data = new Uint16Array(width * height * 4 * ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT)
  data.fill(0x3555)
  const encoded = encodeZombieEscapeAuthoredVat({
    frameCount: ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT,
    meshes: [{ data, height, vertexCount, width }],
  })
  return { data, encoded }
}

function installTestDecompressionStream(createReadable: () => ReadableStream<Uint8Array>) {
  class TestDecompressionStream {
    readonly readable = createReadable()
    readonly writable = new WritableStream<BufferSource>()
  }
  Object.defineProperty(globalThis, 'DecompressionStream', {
    configurable: true,
    value: TestDecompressionStream,
    writable: true,
  })
}

function installGunzipTestDecompressionStream() {
  class TestDecompressionStream {
    readonly readable: ReadableStream<Uint8Array>
    readonly writable: WritableStream<Uint8Array>

    constructor() {
      const chunks: Uint8Array[] = []
      const transform = new TransformStream<Uint8Array, Uint8Array>({
        flush(controller) {
          const compressed = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
          controller.enqueue(new Uint8Array(gunzipSync(compressed)))
        },
        transform(chunk) {
          chunks.push(chunk.slice())
        },
      })
      this.readable = transform.readable
      this.writable = transform.writable
    }
  }
  Object.defineProperty(globalThis, 'DecompressionStream', {
    configurable: true,
    value: TestDecompressionStream,
    writable: true,
  })
}

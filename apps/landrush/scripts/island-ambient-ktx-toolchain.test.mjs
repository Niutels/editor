import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  PINNED_KTX_SOFTWARE,
  assertSha256,
  pinnedKtxCachePaths,
  windowsPathToWsl,
} from './island-ambient-ktx-toolchain.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../../..')

test('KTX encoder provenance is pinned to one official archive and its extracted payloads', () => {
  assert.equal(PINNED_KTX_SOFTWARE.version, '4.4.2')
  assert.equal(
    PINNED_KTX_SOFTWARE.archiveUrl,
    'https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Linux-x86_64.tar.bz2',
  )
  assert.match(PINNED_KTX_SOFTWARE.archiveSha256, /^[\da-f]{64}$/u)
  assert.match(PINNED_KTX_SOFTWARE.executable.sha256, /^[\da-f]{64}$/u)
  assert.match(PINNED_KTX_SOFTWARE.library.sha256, /^[\da-f]{64}$/u)
  assert.throws(
    () => assertSha256('fixture', Buffer.from('modified'), '0'.repeat(64)),
    /SHA-256 mismatch/u,
  )
})

test('KTX executable cache is repository-local and Windows paths map without a shell', () => {
  const paths = pinnedKtxCachePaths()
  assert.match(paths.executablePath, /[\\/]\.landrush-local[\\/]tooling[\\/]ktx-software/u)
  assert.equal(windowsPathToWsl('C:\\repo with spaces\\bin\\ktx'), '/mnt/c/repo with spaces/bin/ktx')
})

test('viewer uses pinned same-origin Basis transcoder files and no mutable CDN', async () => {
  const viewerPath = resolve(repositoryRoot, 'packages/viewer/src/lib/ktx2-loader.ts')
  const viewerSource = await readFile(viewerPath, 'utf8')
  assert.match(viewerSource, /KTX2_TRANSCODER_PATH = '\/basis\/'/u)
  assert.match(viewerSource, /setTranscoderPath\(\s*KTX2_TRANSCODER_PATH/u)
  assert.doesNotMatch(viewerSource, /https?:\/\//u)

  const expectedHashes = {
    'basis_transcoder.js': '8478b5b6d6b74e7d3082b89f6417321d8d1dc0307f2b30d4484bb11b441696a1',
    'basis_transcoder.wasm': '6cf17dc889352c42e9acf8897107978d127005fe3386c36a0e3845e27967630a',
  }
  for (const app of ['editor', 'landrush']) {
    for (const [fileName, expectedHash] of Object.entries(expectedHashes)) {
      const body = await readFile(resolve(repositoryRoot, `apps/${app}/public/basis`, fileName))
      assert.equal(createHash('sha256').update(body).digest('hex'), expectedHash)
    }
  }
})

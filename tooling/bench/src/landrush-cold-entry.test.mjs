import assert from 'node:assert/strict'
import test from 'node:test'
import {
  areOwnedColdEntryResourcesCleaned,
  extractColdEntryBuildId,
  extractColdEntryPreflightBuildId,
  isExpectedColdEntryCanceledMediaPreload,
  parseColdEntryArgs,
} from './landrush-cold-entry.mjs'

function flightHtml(...chunks) {
  return chunks
    .map((chunk) => `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`)
    .join('')
}

test('extracts the build ID from a nonzero split flight root record', () => {
  const html = flightHtml(
    '1:I["module",[]]\n2a:{"P":null,',
    '"b":"build-id_1"}\n',
  )

  assert.equal(extractColdEntryBuildId(html), 'build-id_1')
})

test('ignores non-root and nested b fields', () => {
  const html = flightHtml(
    '1:I["module",[]]\n',
    '2:{"data":{"b":"nested"}}\n',
    '7:{"P":null,"b":"served-build"}\n',
  )

  assert.equal(extractColdEntryBuildId(html), 'served-build')
})

test('fails closed when build metadata is missing, duplicated, or invalid', () => {
  assert.throws(() => extractColdEntryBuildId(flightHtml('1:I["module",[]]\n')), /received 0/)
  assert.throws(
    () => extractColdEntryBuildId(flightHtml('1:{"b":"one"}\n2:{"b":"two"}\n')),
    /received 2/,
  )
  assert.throws(
    () => extractColdEntryBuildId(flightHtml('a:{"b":"invalid build"}\n')),
    /Next build ID is missing/,
  )
})

test('uses the exact no-slash canonical URL', () => {
  const options = parseColdEntryArgs([
    '--base-url',
    'http://localhost:3012',
    '--expected-build-id',
    'served-build',
    '--expected-source',
    'a'.repeat(40),
    '--source-kind',
    'worktree',
    '--ws',
    'wss://multiplayer.example/world/ws',
  ])

  assert.equal(
    options.url,
    'http://localhost:3012/landrush-lab/pascal-multiplayer-island?game=zombie-escape&ws=wss%3A%2F%2Fmultiplayer.example%2Fworld%2Fws',
  )
})

test('rejects redirects before attempting to parse Flight metadata', () => {
  const requestedUrl = 'http://localhost:3012/landrush-lab/pascal-multiplayer-island/'
  assert.throws(
    () => extractColdEntryPreflightBuildId(
      {
        status: 308,
        url: requestedUrl,
        location: '/landrush-lab/pascal-multiplayer-island',
      },
      requestedUrl,
      'not Flight HTML',
    ),
    /Preflight redirected with HTTP 308/,
  )
})

test('cleanup succeeds when no resources were owned and requires cleanup only after creation', () => {
  assert.equal(
    areOwnedColdEntryResourcesCleaned({
      browserCreated: false,
      browserClosed: false,
      profileCreated: false,
      profileRemoved: false,
    }),
    true,
  )
  assert.equal(
    areOwnedColdEntryResourcesCleaned({
      browserCreated: true,
      browserClosed: false,
      profileCreated: true,
      profileRemoved: true,
    }),
    false,
  )
  assert.equal(
    areOwnedColdEntryResourcesCleaned({
      browserCreated: true,
      browserClosed: true,
      profileCreated: true,
      profileRemoved: false,
    }),
    false,
  )
  assert.equal(
    areOwnedColdEntryResourcesCleaned({
      browserCreated: true,
      browserClosed: true,
      profileCreated: true,
      profileRemoved: true,
    }),
    true,
  )
})

test('classifies only an exact canceled media preload as nonfatal', () => {
  assert.equal(isExpectedColdEntryCanceledMediaPreload('media', 'net::ERR_ABORTED'), true)
  assert.equal(isExpectedColdEntryCanceledMediaPreload('media', 'net::ERR_FAILED'), false)
  assert.equal(isExpectedColdEntryCanceledMediaPreload('script', 'net::ERR_ABORTED'), false)
  assert.equal(isExpectedColdEntryCanceledMediaPreload('media', undefined), false)
})

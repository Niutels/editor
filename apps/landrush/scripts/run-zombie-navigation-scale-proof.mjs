import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { launchBenchBrowser } from '../../../tooling/bench/src/chrome.mjs'
import {
  summarizeZombieNavigationScaleProof,
  zombieNavigationScaleProofIssues,
} from '../../../tooling/bench/src/scenario/scenarios/landrush-zombie-navigation-scale-proof-contract.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const COLLISION_WORKER_NAME = 'landrush-zombie-escape-collision-world.worker.js'
const EXPECTED_WORKER_NAMES = [
  COLLISION_WORKER_NAME,
  'natural-road-plan.worker.js',
  'procedural-rock-cliff.worker.js',
]
const EXPECTED_WORKER_SHA256 = '64cd13849ae0753b3fd92153c61ae00d6f22cce6049a4e64fd5989e6f915c799'
const EXPECTED_FIXTURE_SHA256 = 'b39732d667dc2a33dd4cf15276f08a138a38bdd15daddaaad248503146280c49'
const EXPECTED_PAYLOAD_SHA256 = '87b04c9d1738ec7d909cc8578377ef1398dd9f326aa217ffcf22e122f6210055'
const EXPECTED_REPLAY_SHA256 = '725f5e60276d4c2d5a207e300022582cfb3023d12f2b32f2bc348c11a83df69e'
const EXPECTED_TOPOLOGY_HASH = '6b467ba653262498'
const EXPECTED_NODE_COUNT = 2578
const EXPECTED_CHROMIUM = Object.freeze({
  jsVersion: '14.9.207.21',
  product: 'Chrome/149.0.7827.55',
  revision: '@3188f8a607ae7e067593be8aab7f02d2451fec07',
})
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM']
const REQUIRED_REQUEST_PATHS = [
  '/',
  '/collision-worker.mjs',
  '/fixture.json',
  '/proof-executor.mjs',
  '/source-replay.json',
]

export async function runLandrushZombieNavigationScaleProofChromiumKernel({
  argv = process.argv.slice(2),
  bunExecutable = process.platform === 'win32' ? 'bun.exe' : 'bun',
  createTempDirectory = (prefix) => mkdtemp(prefix),
  launchBrowser = launchBenchBrowser,
  removeTempDirectory = (directory) => rm(directory, { force: true, recursive: true }),
  repoRoot = REPO_ROOT,
  runtimeVersions = process.versions,
  signalTarget = process,
  spawnProcess = spawn,
  tempRoot = tmpdir(),
} = {}) {
  assertNodeRuntime(runtimeVersions)
  const timeoutMs = readLandrushZombieNavigationScaleProofTimeoutMs(argv)
  const coldStartedAt = performance.now()
  const workerBuildScript = path.join(
    repoRoot,
    'apps/landrush/scripts/build-landrush-runtime-workers.mjs',
  )
  const proofExecutorEntrypoint = path.join(
    repoRoot,
    'apps/landrush/scripts/zombie-navigation-scale-proof-browser-executor.ts',
  )
  const fixturePath = path.join(
    repoRoot,
    'tooling/bench/fixtures/landrush-zombie-navigation-real-island.v2.json',
  )
  const sourceReplayPath = path.join(
    repoRoot,
    'tooling/bench/fixtures/landrush-zombie-navigation-real-island-source.v1.json',
  )
  const resolvedTempRoot = path.resolve(tempRoot)
  const tempPrefix = path.join(resolvedTempRoot, 'landrush-zombie-navigation-proof-')
  const tempDirectory = path.resolve(await createTempDirectory(tempPrefix))
  assertSafeTempDirectory(resolvedTempRoot, tempPrefix, tempDirectory)
  const workerDirectory = path.join(tempDirectory, 'workers')
  const proofExecutorPath = path.join(tempDirectory, 'proof-executor.mjs')
  let activeChild = null
  let browser = null
  let host = null
  let forwardedSignal = null
  const signalHandlers = new Map(
    FORWARDED_SIGNALS.map((signal) => [
      signal,
      () => {
        forwardedSignal ??= signal
        activeChild?.kill(signal)
        void browser?.close()
      },
    ]),
  )
  for (const [signal, handler] of signalHandlers) signalTarget.on(signal, handler)

  let primaryError = null
  let launchResult = null
  const cleanupErrors = []
  try {
    const workerBuildResult = await runChildProcess({
      args: [workerBuildScript, '--minify', `--outdir=${workerDirectory}`],
      command: bunExecutable,
      cwd: repoRoot,
      onStart: (child) => {
        activeChild = child
      },
      spawnProcess,
    })
    activeChild = null
    if (workerBuildResult.code !== 0 || workerBuildResult.signal || forwardedSignal) {
      launchResult = forwardedSignal
        ? { code: null, output: null, signal: forwardedSignal }
        : { ...workerBuildResult, output: null }
    } else {
      const executorBuildResult = await runChildProcess({
        args: [
          'build',
          proofExecutorEntrypoint,
          '--target=browser',
          '--format=esm',
          '--minify',
          `--outfile=${proofExecutorPath}`,
        ],
        command: bunExecutable,
        cwd: repoRoot,
        onStart: (child) => {
          activeChild = child
        },
        spawnProcess,
      })
      activeChild = null
      if (executorBuildResult.code !== 0 || executorBuildResult.signal || forwardedSignal) {
        launchResult = forwardedSignal
          ? { code: null, output: null, signal: forwardedSignal }
          : { ...executorBuildResult, output: null }
      } else {
        const workerNames = (await readdir(workerDirectory)).sort()
        if (JSON.stringify(workerNames) !== JSON.stringify(EXPECTED_WORKER_NAMES)) {
          throw new Error(
            `Isolated navigation proof worker build was not closed: ${JSON.stringify(workerNames)}.`,
          )
        }
        const [workerBytes, executorBytes, fixtureBytes, replayBytes] = await Promise.all([
          readFile(path.join(workerDirectory, COLLISION_WORKER_NAME)),
          readFile(proofExecutorPath),
          readFile(fixturePath),
          readFile(sourceReplayPath),
        ])
        const workerSha256 = sha256(workerBytes)
        const fixtureSha256 = sha256(fixtureBytes)
        const replaySha256 = sha256(replayBytes)
        if (workerSha256 !== EXPECTED_WORKER_SHA256) {
          throw new Error(`Production collision worker SHA-256 changed to ${workerSha256}.`)
        }
        if (fixtureSha256 !== EXPECTED_FIXTURE_SHA256) {
          throw new Error(`Canonical navigation fixture SHA-256 changed to ${fixtureSha256}.`)
        }
        if (replaySha256 !== EXPECTED_REPLAY_SHA256) {
          throw new Error(`Canonical source replay SHA-256 changed to ${replaySha256}.`)
        }
        host = await createLoopbackStaticHost(
          new Map([
            [
              '/',
              {
                body: '<!doctype html><meta charset="utf-8"><title>Landrush proof</title>',
                contentType: 'text/html; charset=utf-8',
              },
            ],
            [
              '/collision-worker.mjs',
              { body: workerBytes, contentType: 'text/javascript; charset=utf-8' },
            ],
            [
              '/fixture.json',
              { body: fixtureBytes, contentType: 'application/json; charset=utf-8' },
            ],
            [
              '/proof-executor.mjs',
              { body: executorBytes, contentType: 'text/javascript; charset=utf-8' },
            ],
            [
              '/source-replay.json',
              { body: replayBytes, contentType: 'application/json; charset=utf-8' },
            ],
          ]),
        )
        const requestPaths = []
        const blockedRequests = []
        const pageErrors = []
        const consoleErrors = []
        browser = await launchBrowser({
          headless: true,
          profileDir: path.join(tempDirectory, 'chromium-profile'),
        })
        const version = await browser.cdp.send('Browser.getVersion')
        assertPinnedLandrushProofChromium(version)
        await browser.context.route('**/*', async (route) => {
          const url = new URL(route.request().url())
          if (url.origin === host.origin && REQUIRED_REQUEST_PATHS.includes(url.pathname)) {
            requestPaths.push(url.pathname)
            await route.continue()
            return
          }
          blockedRequests.push(route.request().url())
          await route.abort('blockedbyclient')
        })
        browser.page.on('pageerror', (error) => pageErrors.push(error.message))
        browser.page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text())
        })
        await browser.page.goto(host.origin, { waitUntil: 'load' })
        const output = await runProofInChromiumPage(browser.page, {
          fixtureSha256,
          replaySha256,
          timeoutMs,
        })
        assertClosedRequestSet(requestPaths, blockedRequests)
        if (pageErrors.length > 0 || consoleErrors.length > 0) {
          throw new Error(
            `Isolated navigation proof emitted page errors: ${JSON.stringify({ consoleErrors, pageErrors })}.`,
          )
        }
        const issues = zombieNavigationScaleProofIssues(output.result)
        if (issues.length > 0) {
          throw new Error(`Navigation scale proof result contract failed: ${issues.join('; ')}`)
        }
        const canonicalOutput = {
          ...output,
          runtime: {
            browser: {
              executablePath: browser.executablePath,
              jsVersion: version.jsVersion,
              product: version.product,
              revision: version.revision,
            },
            coldDurationMs: performance.now() - coldStartedAt,
            fixtureSha256,
            requestPaths,
            workerSha256,
          },
          summary: summarizeZombieNavigationScaleProof(output.result),
        }
        assertLandrushZombieNavigationScaleProofKernelResult(JSON.stringify(canonicalOutput))
        launchResult = { code: 0, output: canonicalOutput, signal: null }
      }
    }
  } catch (error) {
    primaryError = error
  } finally {
    for (const [signal, handler] of signalHandlers) signalTarget.off(signal, handler)
    if (browser) {
      try {
        await browser.close()
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (host) {
      try {
        await host.close()
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    try {
      await removeTempDirectory(tempDirectory)
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (primaryError || cleanupErrors.length > 0) {
    const errors = [...(primaryError ? [primaryError] : []), ...cleanupErrors]
    if (errors.length === 1) throw errors[0]
    throw new AggregateError(
      errors,
      'Landrush navigation proof and isolated-kernel cleanup both failed.',
    )
  }
  return launchResult
}

async function runProofInChromiumPage(page, { fixtureSha256, replaySha256, timeoutMs }) {
  return page.evaluate(
    async ({ expectedFixtureSha256, expectedReplaySha256, proofTimeoutMs }) => {
      const requestId = 1947
      const readBytes = async (url) => {
        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) throw new Error(`${url} returned HTTP ${String(response.status)}.`)
        return new Uint8Array(await response.arrayBuffer())
      }
      const digest = async (bytes) => {
        const hash = await crypto.subtle.digest('SHA-256', bytes)
        return [...new Uint8Array(hash)]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('')
      }
      const [fixtureBytes, replayBytes] = await Promise.all([
        readBytes('/fixture.json'),
        readBytes('/source-replay.json'),
      ])
      const [actualFixtureSha256, actualReplaySha256] = await Promise.all([
        digest(fixtureBytes),
        digest(replayBytes),
      ])
      if (actualFixtureSha256 !== expectedFixtureSha256) {
        throw new Error('Browser fixture SHA-256 did not match the canonical bytes.')
      }
      if (actualReplaySha256 !== expectedReplaySha256) {
        throw new Error('Browser source replay SHA-256 did not match the canonical bytes.')
      }
      const fixtureValue = JSON.parse(new TextDecoder().decode(fixtureBytes))
      const payloadBefore = JSON.stringify(fixtureValue.compilation?.payload)
      if (typeof payloadBefore !== 'string') {
        throw new Error('Browser fixture omitted its compilation payload.')
      }
      const actualPayloadSha256 = await digest(new TextEncoder().encode(payloadBefore))
      const executor = await import('/proof-executor.mjs')
      if (typeof executor.runLandrushZombieNavigationScaleProofBrowserExecutor !== 'function') {
        throw new Error('Browser proof executor bundle omitted its canonical export.')
      }
      const collisionWorld = await new Promise((resolve, reject) => {
        const worker = new Worker('/collision-worker.mjs', { type: 'module' })
        let accepted = false
        let requested = false
        const timer = setTimeout(() => {
          worker.terminate()
          reject(new Error('Production collision worker timed out.'))
        }, Math.min(60_000, proofTimeoutMs))
        const fail = (error) => {
          clearTimeout(timer)
          worker.terminate()
          reject(error)
        }
        worker.onerror = (event) => fail(new Error(event.message || 'Collision worker error.'))
        worker.onmessageerror = () => fail(new Error('Collision worker message could not clone.'))
        worker.onmessage = (event) => {
          const message = event.data
          if (message?.type === 'ready') {
            if (requested || accepted) {
              fail(new Error('Collision worker emitted an out-of-order ready event.'))
              return
            }
            requested = true
            worker.postMessage({
              payload: fixtureValue.compilation.payload,
              payloadIntegrity: fixtureValue.compilation.payloadIntegrity,
              requestId,
              signature: fixtureValue.compilation.signature,
              type: 'compile',
            })
            return
          }
          if (message?.type === 'accepted') {
            if (
              !requested ||
              accepted ||
              message.requestId !== requestId ||
              message.signature !== fixtureValue.compilation.signature
            ) {
              fail(new Error('Collision worker emitted an invalid accepted event.'))
              return
            }
            accepted = true
            return
          }
          if (
            !accepted ||
            message?.requestId !== requestId ||
            message?.signature !== fixtureValue.compilation.signature
          ) {
            fail(new Error('Collision worker response violated ready/accepted ordering.'))
            return
          }
          clearTimeout(timer)
          worker.terminate()
          if (message.ok !== true) {
            reject(
              new Error(
                `Collision worker rejected fixture: ${String(message.error?.name)}: ${String(message.error?.message)}`,
              ),
            )
            return
          }
          resolve(message.worlds.navigation)
        }
      })
      const proofPromise = executor.runLandrushZombieNavigationScaleProofBrowserExecutor({
        collisionWorld,
        fixtureValue,
        payloadSha256: actualPayloadSha256,
        replaySha256: actualReplaySha256,
        timeoutMs: proofTimeoutMs,
      })
      const output = await Promise.race([
        proofPromise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Isolated Chromium navigation proof timed out.')),
            proofTimeoutMs + 5_000,
          ),
        ),
      ])
      if (JSON.stringify(fixtureValue.compilation?.payload) !== payloadBefore) {
        throw new Error('Production worker or proof executor mutated the canonical fixture payload.')
      }
      return output
    },
    {
      expectedFixtureSha256: fixtureSha256,
      expectedReplaySha256: replaySha256,
      proofTimeoutMs: timeoutMs,
    },
  )
}

export function readLandrushZombieNavigationScaleProofTimeoutMs(argv) {
  const inlineEntry = argv.find((argument) => argument.startsWith('--timeout-ms='))
  const optionIndex = argv.indexOf('--timeout-ms')
  const rawValue =
    inlineEntry?.slice('--timeout-ms='.length) ??
    (optionIndex >= 0 ? argv[optionIndex + 1] : undefined)
  if (rawValue === undefined && optionIndex < 0) return 120_000
  const timeoutMs = Number(rawValue)
  if (!(Number.isSafeInteger(timeoutMs) && timeoutMs > 0)) {
    throw new Error(`Invalid --timeout-ms value ${String(rawValue)}.`)
  }
  return timeoutMs
}

export function assertPinnedLandrushProofChromium(version) {
  for (const [key, expected] of Object.entries(EXPECTED_CHROMIUM)) {
    if (version?.[key] !== expected) {
      throw new Error(
        `Landrush navigation proof requires pinned Chromium ${key} ${expected}, received ${String(version?.[key])}.`,
      )
    }
  }
}

export function assertLandrushZombieNavigationScaleProofKernelResult(stdout) {
  if (typeof stdout !== 'string' || stdout.trim().length === 0) {
    throw new Error('Isolated Chromium navigation proof returned no JSON result.')
  }
  let output
  try {
    output = JSON.parse(stdout)
  } catch (error) {
    throw new Error('Isolated Chromium navigation proof returned malformed JSON.', { cause: error })
  }
  if (
    output?.fixture?.payloadSha256 !== EXPECTED_PAYLOAD_SHA256 ||
    output?.fixture?.replaySha256 !== EXPECTED_REPLAY_SHA256 ||
    output?.runtime?.fixtureSha256 !== EXPECTED_FIXTURE_SHA256 ||
    output?.runtime?.workerSha256 !== EXPECTED_WORKER_SHA256 ||
    output?.world?.nodeCount !== EXPECTED_NODE_COUNT ||
    output?.world?.fingerprint?.topologyHash !== EXPECTED_TOPOLOGY_HASH
  ) {
    throw new Error('Isolated Chromium proof did not match the canonical browser world.')
  }
  assertPinnedLandrushProofChromium(output.runtime.browser)
  return output
}

function assertNodeRuntime(runtimeVersions) {
  if (
    typeof runtimeVersions?.v8 !== 'string' ||
    runtimeVersions.v8.length === 0 ||
    typeof runtimeVersions.bun === 'string'
  ) {
    throw new Error('Landrush navigation proof launcher requires the Node runtime.')
  }
}

function assertSafeTempDirectory(tempRoot, tempPrefix, tempDirectory) {
  const relativePath = path.relative(tempRoot, tempDirectory)
  if (
    relativePath.length === 0 ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === '..' ||
    path.isAbsolute(relativePath) ||
    !path.basename(tempDirectory).startsWith(path.basename(tempPrefix))
  ) {
    throw new Error('Landrush navigation proof launcher received an unsafe temp directory.')
  }
}

function assertClosedRequestSet(requestPaths, blockedRequests) {
  const sortedPaths = [...requestPaths].sort()
  if (
    blockedRequests.length > 0 ||
    JSON.stringify(sortedPaths) !== JSON.stringify(REQUIRED_REQUEST_PATHS)
  ) {
    throw new Error(
      `Isolated navigation proof import closure failed: ${JSON.stringify({ blockedRequests, requestPaths })}.`,
    )
  }
}

async function createLoopbackStaticHost(resources) {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const resource = resources.get(pathname)
    if (!(resource && (request.method === 'GET' || request.method === 'HEAD'))) {
      response.writeHead(404, { 'cache-control': 'no-store' })
      response.end()
      return
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': resource.contentType,
      'cross-origin-resource-policy': 'same-origin',
    })
    response.end(request.method === 'HEAD' ? undefined : resource.body)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not resolve isolated navigation proof loopback address.')
  }
  return {
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
    origin: `http://127.0.0.1:${String(address.port)}`,
  }
}

function runChildProcess({ args, command, cwd, onStart, spawnProcess }) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd,
      stdio: ['ignore', 'ignore', 'inherit'],
      windowsHide: true,
    })
    onStart(child)
    const onError = (error) => {
      child.off('close', onClose)
      reject(error)
    }
    const onClose = (code, signal) => {
      child.off('error', onError)
      resolve({ code, signal })
    }
    child.once('error', onError)
    child.once('close', onClose)
  })
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

if (import.meta.main) {
  try {
    const launchResult = await runLandrushZombieNavigationScaleProofChromiumKernel()
    if (launchResult.signal) {
      process.kill(process.pid, launchResult.signal)
    } else {
      if (launchResult.code === 0) {
        process.stdout.write(`${JSON.stringify(launchResult.output, null, 2)}\n`)
      }
      process.exitCode = launchResult.code ?? 1
    }
  } catch (error) {
    process.stderr.write(`${formatLauncherError(error)}\n`)
    process.exitCode = 1
  }
}

function formatLauncherError(error) {
  if (error instanceof AggregateError) {
    return [
      `${error.name}: ${error.message}`,
      ...error.errors.map((nestedError) => formatLauncherError(nestedError)),
    ].join('\n')
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

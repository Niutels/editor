// Chrome launch + CDP plumbing for the bench harness.
//
// Executable resolution order:
//   1. PASCAL_BENCH_CHROME env var
//   2. newest chrome.exe in the user-level ms-playwright cache
//   3. system Chrome
//
// Runs under node (not bun — playwright-core misbehaves under bun on this
// machine, established in earlier sessions).

import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

export function resolveChromeExecutable() {
  const fromEnv = process.env.PASCAL_BENCH_CHROME
  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const msPlaywright = path.join(homedir(), 'AppData', 'Local', 'ms-playwright')
  if (existsSync(msPlaywright)) {
    const candidates = readdirSync(msPlaywright)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    for (const dir of candidates) {
      for (const sub of ['chrome-win64', 'chrome-win']) {
        const exe = path.join(msPlaywright, dir, sub, 'chrome.exe')
        if (existsSync(exe)) return exe
      }
    }
  }

  for (const exe of [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]) {
    if (existsSync(exe)) return exe
  }

  throw new Error(
    'No Chrome executable found. Set PASCAL_BENCH_CHROME or install Chrome / the ms-playwright chromium cache.',
  )
}

export function chromeArgs({ headless = false, width = 1600, height = 1000 } = {}) {
  const args = [
    `--window-size=${width},${height}`,
    '--force-device-scale-factor=1',
    // Keep timers/rendering at full speed when the window is occluded or
    // backgrounded — load-bearing for unattended runs on a shared desktop.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    // Unquantized GPU timestamps (default quantization is 100us — fine for our
    // 3ms gates, but full precision costs nothing here).
    '--enable-dawn-features=allow_unsafe_apis',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    '--mute-audio',
  ]
  if (headless) {
    // New headless keeps real GPU rasterization; WebGPU-in-headless is proven
    // on this machine from prior sessions.
    args.push('--headless=new', '--hide-scrollbars')
  }
  return args
}

/**
 * Launch Chrome with a persistent profile (keeps GPU shader caches warm across
 * runs, cutting first-frame pipeline-compile noise). Returns page + raw CDP
 * session.
 */
export async function launchBenchBrowser({
  headless = false,
  width = 1600,
  height = 1000,
  profileDir,
  executablePath = resolveChromeExecutable(),
} = {}) {
  const userDataDir =
    profileDir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.chrome-profile')

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    // Flag-level headless via --headless=new (added in chromeArgs) so the flag
    // set stays explicit; playwright-level headless would inject its own flags.
    headless: false,
    args: chromeArgs({ headless, width, height }),
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
  })

  const page = context.pages()[0] ?? (await context.newPage())
  const cdp = await context.newCDPSession(page)

  return {
    context,
    page,
    cdp,
    executablePath,
    close: async () => {
      try {
        await context.close()
      } catch {
        /* already gone */
      }
    },
  }
}

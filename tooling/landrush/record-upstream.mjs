import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const toolingDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolingDirectory, '../..')
const manifestPath = join(toolingDirectory, 'upstream-boundary.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const requestedRef = process.argv[2]

if (!requestedRef) {
  console.error('Usage: node tooling/landrush/record-upstream.mjs <merged-upstream-ref>')
  process.exit(1)
}

function git(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

const commit = git(['rev-parse', `${requestedRef}^{commit}`])
try {
  git(['merge-base', '--is-ancestor', commit, 'HEAD'])
} catch {
  console.error(`${requestedRef} (${commit}) has not been merged into HEAD.`)
  process.exit(1)
}

const changedUpstreamPaths = git([
  'diff',
  '--name-only',
  commit,
  '--',
  ...manifest.upstreamOwnedPaths,
])
if (changedUpstreamPaths) {
  console.error('Pascal-owned paths do not exactly match the requested upstream ref:')
  console.error(changedUpstreamPaths)
  process.exit(1)
}

manifest.integratedCommit = commit
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`Recorded merged Pascal upstream commit ${commit}.`)

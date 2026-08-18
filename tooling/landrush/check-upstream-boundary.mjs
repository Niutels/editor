import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const toolingDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(toolingDirectory, '../..')
const manifestPath = join(toolingDirectory, 'upstream-boundary.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const violations = []

function git(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

try {
  git(['cat-file', '-e', `${manifest.integratedCommit}^{commit}`])
} catch {
  violations.push(`Pinned Pascal commit is unavailable locally: ${manifest.integratedCommit}`)
}

try {
  git(['merge-base', '--is-ancestor', manifest.integratedCommit, 'HEAD'])
} catch {
  violations.push(`Pinned Pascal commit is not an ancestor of HEAD: ${manifest.integratedCommit}`)
}

if (violations.length === 0) {
  const changedUpstreamPaths = git([
    'diff',
    '--name-only',
    manifest.integratedCommit,
    '--',
    ...manifest.upstreamOwnedPaths,
  ])
  if (changedUpstreamPaths) {
    violations.push(
      `Pascal-owned paths differ from the pinned upstream commit:\n${changedUpstreamPaths}`,
    )
  }
}

const trackedFiles = git(['ls-files', '--cached', '--others', '--exclude-standard'])
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((path) => existsSync(join(repositoryRoot, path)))

const sourceExtensions = /\.(?:cjs|js|jsx|mjs|ts|tsx)$/
const upstreamFiles = trackedFiles.filter(
  (path) =>
    sourceExtensions.test(path) &&
    manifest.upstreamOwnedPaths.some(
      (ownedPath) => path === ownedPath || path.startsWith(`${ownedPath}/`),
    ),
)
const landrushFiles = trackedFiles.filter(
  (path) =>
    sourceExtensions.test(path) &&
    (path.startsWith('apps/landrush/') ||
      path.startsWith('apps/landrush-world-multiplayer-server/') ||
      path.startsWith('packages/landrush-')),
)

const landrushImport = /(?:from\s*|import\s*\()\s*['"](?:@landrush\/|[^'"]*(?:apps|packages)\/landrush)/
for (const path of upstreamFiles) {
  if (landrushImport.test(readFileSync(join(repositoryRoot, path), 'utf8'))) {
    violations.push(`Pascal-owned source imports Landrush code: ${path}`)
  }
}

const privatePascalImport =
  /(?:from\s*|import\s*\()\s*['"](?:@pascal-app\/(?:cli|core|editor|mcp|nodes|viewer)\/(?:dist|internal|src)|[^'"]*packages\/(?:cli|core|editor|mcp|nodes|viewer)\/src)/
for (const path of landrushFiles) {
  if (privatePascalImport.test(readFileSync(join(repositoryRoot, path), 'utf8'))) {
    violations.push(`Landrush source imports a private Pascal path: ${path}`)
  }
}

const labRoot = join(repositoryRoot, 'apps/landrush/app/landrush-lab')
const allowedPageRoutes = new Set([
  'pascal-multiplayer-island',
  'pascal-multiplayer-island-bug-report',
  'pascal-multiplayer-island-navigation-debug',
  'pascal-multiplayer-island-water-debug',
])
const pageRoutes = readdirSync(labRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(labRoot, entry.name, 'page.tsx')))
  .map((entry) => entry.name)
for (const route of pageRoutes) {
  if (!allowedPageRoutes.has(route)) violations.push(`Unsupported Landrush lab page remains: ${route}`)
}
for (const route of allowedPageRoutes) {
  if (!pageRoutes.includes(route)) violations.push(`Required Landrush island route is missing: ${route}`)
}

if (violations.length > 0) {
  console.error('Landrush/Pascal boundary check failed:\n')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(
  `Landrush/Pascal boundary is clean at ${manifest.integratedCommit.slice(0, 12)} (${relative(repositoryRoot, manifestPath)}).`,
)

import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appRoot, '..', '..')
export const landrushRuntimeWorkerWatchDirectory = repoRoot
const workerSourceDirectory = join(appRoot, 'components', 'landrush-lab')
const workerOutputDirectory = join(appRoot, 'public', 'landrush-lab', 'workers')
const workerEntrypoints = [
  join(workerSourceDirectory, 'landrush-zombie-escape-collision-world.worker.ts'),
  join(workerSourceDirectory, 'natural-road-plan.worker.ts'),
  join(workerSourceDirectory, 'procedural-rock-cliff.worker.ts'),
]

export async function buildLandrushRuntimeWorkers({
  minify = false,
  outdir = workerOutputDirectory,
} = {}) {
  const resolvedOutputDirectory = resolve(outdir)
  const result = await Bun.build({
    entrypoints: workerEntrypoints,
    format: 'esm',
    minify,
    naming: '[name].js',
    outdir: resolvedOutputDirectory,
    root: repoRoot,
    splitting: false,
    target: 'browser',
  })

  if (!result.success) {
    for (const message of result.logs) console.error(message)
    throw new Error('Could not build the Landrush runtime workers.')
  }

  const expectedOutputs = workerEntrypoints.map((entrypoint) =>
    join(resolvedOutputDirectory, `${entrypointName(entrypoint)}.js`),
  )
  const emittedOutputs = new Set(result.outputs.map((output) => resolve(output.path)))
  const missingOutputs = expectedOutputs.filter((output) => !emittedOutputs.has(resolve(output)))
  if (missingOutputs.length > 0) {
    throw new Error(
      `Landrush runtime-worker build omitted: ${missingOutputs
        .map((output) => relative(appRoot, output))
        .join(', ')}`,
    )
  }

  console.log(
    `Built ${expectedOutputs.length} Landrush runtime workers in ${relative(
      appRoot,
      resolvedOutputDirectory,
    )}`,
  )
}

export function readLandrushRuntimeWorkerOutputDirectory(argv) {
  const inlineEntry = argv.find((argument) => argument.startsWith('--outdir='))
  const optionIndex = argv.indexOf('--outdir')
  const rawValue =
    inlineEntry?.slice('--outdir='.length) ??
    (optionIndex >= 0 ? argv[optionIndex + 1] : undefined)
  if (rawValue === undefined && optionIndex < 0) return workerOutputDirectory
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    throw new Error('Landrush runtime-worker --outdir requires a path.')
  }
  return resolve(rawValue)
}

export function createLandrushRuntimeWorkerWatchArguments() {
  return [
    'build',
    ...workerEntrypoints,
    '--outdir',
    workerOutputDirectory,
    '--root',
    repoRoot,
    '--target',
    'browser',
    '--format',
    'esm',
    '--entry-naming',
    '[name].js',
    '--watch',
    '--no-clear-screen',
  ]
}

function entrypointName(entrypoint) {
  return basename(entrypoint, '.ts')
}

if (import.meta.main) {
  await buildLandrushRuntimeWorkers({
    minify: process.argv.includes('--minify'),
    outdir: readLandrushRuntimeWorkerOutputDirectory(process.argv.slice(2)),
  })
}

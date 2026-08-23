import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadTypescriptModuleGraph } from './load-typescript-module-graph.mjs'

test('loads an extensionless transitive TypeScript module graph', async (context) => {
  const sourceRoot = await createFixtureDirectory(context)
  await mkdir(join(sourceRoot, 'nested'))
  await writeFile(
    join(sourceRoot, 'leaf.ts'),
    'export type NumericText = `${number}`\nexport const base = 40\n',
  )
  await writeFile(
    join(sourceRoot, 'nested/middle.ts'),
    [
      "import { base, type NumericText } from '../leaf'",
      'export const next: NumericText = String(base + 1) as NumericText',
      '',
    ].join('\n'),
  )
  await writeFile(
    join(sourceRoot, 'entry.ts'),
    [
      "import { next } from './nested/middle'",
      'export const answer: number = Number(next) + 1',
      '',
    ].join('\n'),
  )

  const loaded = await loadTypescriptModuleGraph(join(sourceRoot, 'entry.ts'), {
    sourceRoot,
  })

  assert.equal(loaded.answer, 42)
})

test('writes the complete graph before evaluating cyclic modules', async (context) => {
  const sourceRoot = await createFixtureDirectory(context)
  await writeFile(
    join(sourceRoot, 'a.ts'),
    [
      "import { callA } from './b'",
      "export function valueFromA() { return 'a' }",
      'export const cycleResult = callA()',
      '',
    ].join('\n'),
  )
  await writeFile(
    join(sourceRoot, 'b.ts'),
    [
      "import { valueFromA } from './a'",
      'export function callA() { return `${valueFromA()}b` }',
      '',
    ].join('\n'),
  )

  const loaded = await loadTypescriptModuleGraph(join(sourceRoot, 'a.ts'), {
    sourceRoot,
  })

  assert.equal(loaded.cycleResult, 'ab')
})

test('reports an unresolved local import without a data URL stack', async (context) => {
  const sourceRoot = await createFixtureDirectory(context)
  const entryPath = join(sourceRoot, 'entry.ts')
  await writeFile(entryPath, "import { missing } from './missing'\nexport { missing }\n")

  await assert.rejects(loadTypescriptModuleGraph(entryPath, { sourceRoot }), (error) => {
    assert.match(error.message, /Cannot resolve local TypeScript import "\.\/missing"/)
    assert.match(error.message, /entry\.ts/)
    assert.doesNotMatch(error.message, /data:text\/javascript/)
    return true
  })
})

async function createFixtureDirectory(context) {
  const directory = await mkdtemp(join(tmpdir(), 'landrush-typescript-module-test-'))
  context.after(() => rm(directory, { force: true, recursive: true }))
  return directory
}

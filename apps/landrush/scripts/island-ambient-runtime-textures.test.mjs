import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const componentRoot = resolve(import.meta.dirname, '../components/landrush-lab')

test('runtime textured ambient GLBs use the KTX2-aware loader from their first request', async () => {
  const ambientSource = await readFile(resolve(componentRoot, 'landrush-island-ambient-life.tsx'), 'utf8')
  const zombieSource = await readFile(resolve(componentRoot, 'zombie-escape-generated-assets.tsx'), 'utf8')

  for (const call of [
    'useGLTFKTX2(modelPath)',
    'useGLTFKTX2(fish.modelPath)',
    'useGLTFKTX2(boat.modelPath)',
    'useGLTFKTX2(npc.glb.rigged)',
  ]) {
    assert.match(ambientSource, new RegExp(escapeRegExp(call), 'u'))
  }
  assert.doesNotMatch(ambientSource, /useGLTF\((?:modelPath|fish\.modelPath|boat\.modelPath|npc\.glb\.rigged)\)/u)
  assert.match(zombieSource, /useGLTFKTX2\(zombie\.glb\.riggedBase\.path\)/u)
  assert.doesNotMatch(zombieSource, /useGLTF\(zombie\.glb\.riggedBase\.path\)/u)
})

test('zombie debug scenes compose optimized rigs with animation-only clips', async () => {
  const runningSource = await readFile(
    resolve(componentRoot, 'zombie-running-debug-client.tsx'),
    'utf8',
  )
  const shootingSource = await readFile(
    resolve(componentRoot, 'zombie-shooting-debug-client.tsx'),
    'utf8',
  )
  const catalogSource = await readFile(
    resolve(componentRoot, '../../../../packages/landrush-zombie-gameplay/src/zombie-escape-zombie-catalog.ts'),
    'utf8',
  )

  assert.match(runningSource, /useGLTFKTX2\(zombie\.glb\.riggedBase\.path\)/u)
  assert.match(runningSource, /useGLTF\(zombie\.glb\.run\.path\)/u)
  assert.match(shootingSource, /useGLTFKTX2\(ZOMBIE\.glb\.riggedBase\.path\)/u)
  assert.match(shootingSource, /useGLTF\(ZOMBIE\.glb\.run\.path\)/u)
  assert.doesNotMatch(runningSource, /cloneSkeleton\(runGltf\.scene\)/u)
  assert.doesNotMatch(shootingSource, /cloneSkeleton\(runGltf\.scene\)/u)
  assert.doesNotMatch(catalogSource, /runtimePath|`\$\{directory\}\/(?:run|walk)\.glb`/u)
})

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

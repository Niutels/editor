import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createZombieGameWorldManifest } from '../landrush/scripts/zombie-game-world-source'

const outputDirectory = new URL('./dist/', import.meta.url)
await mkdir(outputDirectory, { recursive: true })
const manifest = createZombieGameWorldManifest()
await writeFile(new URL('zombie-game-world.json', outputDirectory), `${JSON.stringify(manifest)}\n`)
const result = await Bun.build({
  entrypoints: ['./zombie-game-server.ts', './zombie-game-world-worker.ts'].map((path) =>
    fileURLToPath(new URL(path, import.meta.url)),
  ),
  outdir: fileURLToPath(outputDirectory),
  naming: '[name].mjs',
  target: 'node',
  format: 'esm',
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exitCode = 1
} else console.log(`Built real Zombie game server for ${manifest.worldId} (${manifest.signature})`)

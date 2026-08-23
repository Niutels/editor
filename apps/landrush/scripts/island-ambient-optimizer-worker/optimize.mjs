import { randomUUID } from 'node:crypto'
import { rename, rm } from 'node:fs/promises'
import { Mode, toktx } from '@gltf-transform/cli'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import sharp from 'sharp'
import {
  ISLAND_AMBIENT_TEXTURE_OPTIMIZER,
  verifyPinnedTextureToolchain,
} from '../island-ambient-glb-optimizer.mjs'
import { withPinnedKtxEnvironment } from '../island-ambient-ktx-toolchain.mjs'
import { inspectGlb } from '../landrush-glb-audit.mjs'

const COLOR_TEXTURE_SLOTS = /(?:baseColor|emissive|metallicRoughness|occlusion)Texture/iu
const NORMAL_TEXTURE_SLOTS = /normalTexture/iu
const sourcePath = readArgument('--source')
const outputPath = readArgument('--output')
const resolution = Number(readArgument('--resolution'))
if (!Number.isInteger(resolution) || resolution < 4) {
  throw new Error('--resolution must be an integer of at least 4.')
}
if (sharp.versions.sharp !== ISLAND_AMBIENT_TEXTURE_OPTIMIZER.sharpVersion) {
  throw new Error(
    `Worker requires sharp ${ISLAND_AMBIENT_TEXTURE_OPTIMIZER.sharpVersion}; received ${sharp.versions.sharp}.`,
  )
}

const toolchain = await verifyPinnedTextureToolchain()
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const document = await io.read(sourcePath)
await withPinnedKtxEnvironment(toolchain, () =>
  document.transform(
    toktx({
      cleanup: true,
      encoder: sharp,
      jobs: 1,
      level: ISLAND_AMBIENT_TEXTURE_OPTIMIZER.uastc.level,
      mipmaps: true,
      mode: Mode.UASTC,
      rdo: ISLAND_AMBIENT_TEXTURE_OPTIMIZER.uastc.rdo,
      resize: [resolution, resolution],
      slots: NORMAL_TEXTURE_SLOTS,
      zstd: ISLAND_AMBIENT_TEXTURE_OPTIMIZER.uastc.zstd,
    }),
    toktx({
      cleanup: true,
      compression: ISLAND_AMBIENT_TEXTURE_OPTIMIZER.etc1s.compression,
      encoder: sharp,
      jobs: 1,
      mipmaps: true,
      mode: Mode.ETC1S,
      quality: ISLAND_AMBIENT_TEXTURE_OPTIMIZER.etc1s.quality,
      resize: [resolution, resolution],
      slots: COLOR_TEXTURE_SLOTS,
    }),
  ),
)

const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp.glb`
try {
  await io.write(temporaryPath, document)
  const inspection = await inspectGlb(temporaryPath)
  if (inspection.images.length === 0 || inspection.images.some((image) => image.mimeType !== 'image/ktx2')) {
    throw new Error(`${outputPath}: optimizer left a non-KTX2 runtime texture.`)
  }
  if (
    inspection.images.some(
      (image) => image.width !== resolution || image.height !== resolution || !image.hasFullMipChain,
    )
  ) {
    const invalidImages = inspection.images.map(
      ({ hasFullMipChain, height, index, levelCount, width }) => ({
        hasFullMipChain,
        height,
        index,
        levelCount,
        width,
      }),
    )
    throw new Error(
      `${outputPath}: optimizer did not produce the ${resolution}px full-mip policy: ${JSON.stringify(invalidImages)}.`,
    )
  }
  await rename(temporaryPath, outputPath)
} finally {
  await rm(temporaryPath, { force: true })
}

function readArgument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : null
  if (!value || value.startsWith('--')) throw new Error(`${name} is required.`)
  return value
}

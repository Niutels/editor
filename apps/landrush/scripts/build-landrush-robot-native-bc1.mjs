import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  pinnedKtxEnvironment,
  preparePinnedKtxSoftware,
  windowsPathToWsl,
} from './island-ambient-ktx-toolchain.mjs'

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '../../..')
const navigationRoot = resolve(import.meta.dirname, '../public/navigation')
const sourcePath = resolve(navigationRoot, 'proto_pascal_robot-ktx2-1112f038.glb')
const localTemporaryRoot = resolve(repositoryRoot, '.landrush-local/tooling/landrush-robot-bc1')
const GLB_JSON_CHUNK = 0x4e4f534a
const GLB_BINARY_CHUNK = 0x004e4942
const KTX2_IDENTIFIER = Buffer.from([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
])
const VK_FORMAT_BC1_SRGB_BLOCKS = new Set([132, 134])

await mkdir(localTemporaryRoot, { recursive: true })
const temporaryDirectory = await mkdtemp(resolve(localTemporaryRoot, 'build-'))
try {
  const source = parseGlb(await readFile(sourcePath))
  const image = source.json.images?.[0]
  const imageViewIndex = image?.bufferView
  const imageView = source.json.bufferViews?.[imageViewIndex]
  if (
    source.json.images?.length !== 1 ||
    image?.mimeType !== 'image/ktx2' ||
    !Number.isInteger(imageViewIndex) ||
    !imageView ||
    imageView.buffer !== 0
  ) {
    throw new Error('Robot source must contain exactly one embedded KTX2 image.')
  }

  const imageOffset = imageView.byteOffset ?? 0
  const imageEnd = imageOffset + imageView.byteLength
  if (imageEnd > source.binary.byteLength) throw new Error('Robot KTX2 buffer view is truncated.')
  if (source.binary.subarray(imageEnd).some((byte) => byte !== 0)) {
    throw new Error('Robot KTX2 image must be the final binary payload.')
  }

  const basisPath = resolve(temporaryDirectory, 'robot-basis.ktx2')
  const bc1Path = resolve(temporaryDirectory, 'robot-bc1.ktx2')
  await writeFile(basisPath, source.binary.subarray(imageOffset, imageEnd))
  const toolchain = await preparePinnedKtxSoftware()
  await transcodeBc1(toolchain, basisPath, bc1Path)
  const bc1 = await readFile(bc1Path)
  const bc1Metadata = inspectNativeBc1(bc1)

  const json = structuredClone(source.json)
  json.bufferViews[imageViewIndex].byteLength = bc1.byteLength
  const binary = padChunk(Buffer.concat([source.binary.subarray(0, imageOffset), bc1]), 0)
  json.buffers[0].byteLength = binary.byteLength
  const output = buildGlb(json, binary)
  const sha256 = hash(output)
  const outputName = `proto_pascal_robot-bc1-${sha256.slice(0, 8)}.glb`
  const outputPath = resolve(navigationRoot, outputName)
  await writeOutput(outputPath, output)
  console.log(
    JSON.stringify({
      bc1ByteLength: bc1.byteLength,
      bc1MipByteLength: bc1Metadata.mipByteLength,
      byteLength: output.byteLength,
      outputName,
      sha256,
      vkFormat: bc1Metadata.vkFormat,
    }),
  )
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true })
}

async function transcodeBc1(toolchain, inputPath, outputPath) {
  const arguments_ = ['transcode', '--testrun', '--target', 'bc1']
  let command = toolchain.executablePath
  let environment = process.env
  if (process.platform === 'win32') {
    command = 'wsl.exe'
    environment = process.env
    arguments_.unshift(
      '--exec',
      'env',
      `LD_LIBRARY_PATH=${toolchain.wslLibraryDirectory}`,
      toolchain.wslExecutablePath,
    )
    arguments_.push(windowsPathToWsl(inputPath), windowsPathToWsl(outputPath))
  } else {
    environment = pinnedKtxEnvironment(toolchain)
    arguments_.push(inputPath, outputPath)
  }
  await execFileAsync(command, arguments_, { env: environment, windowsHide: true })
}

function inspectNativeBc1(ktx2) {
  if (ktx2.byteLength < 80 || !ktx2.subarray(0, 12).equals(KTX2_IDENTIFIER)) {
    throw new Error('BC1 transcoder did not produce a KTX2 file.')
  }
  const vkFormat = ktx2.readUInt32LE(12)
  const width = ktx2.readUInt32LE(20)
  const height = ktx2.readUInt32LE(24)
  const levelCount = ktx2.readUInt32LE(40)
  const supercompressionScheme = ktx2.readUInt32LE(44)
  if (
    !VK_FORMAT_BC1_SRGB_BLOCKS.has(vkFormat) ||
    width !== 1024 ||
    height !== 1024 ||
    levelCount !== 11 ||
    supercompressionScheme !== 0
  ) {
    throw new Error(
      `Unexpected native BC1 metadata: ${JSON.stringify({ height, levelCount, supercompressionScheme, vkFormat, width })}`,
    )
  }
  let mipByteLength = 0
  for (let level = 0; level < levelCount; level += 1) {
    mipByteLength += Number(ktx2.readBigUInt64LE(80 + level * 24 + 8))
  }
  if (mipByteLength !== 699_064) {
    throw new Error(`Native BC1 mip chain should contain 699064 bytes; received ${mipByteLength}.`)
  }
  return { mipByteLength, vkFormat }
}

function parseGlb(file) {
  if (file.readUInt32LE(0) !== 0x46546c67 || file.readUInt32LE(4) !== 2) {
    throw new Error('Robot source is not a glTF 2.0 GLB.')
  }
  if (file.readUInt32LE(8) !== file.byteLength) throw new Error('Robot GLB length is invalid.')
  let binary = null
  let json = null
  for (let offset = 12; offset < file.byteLength; ) {
    const length = file.readUInt32LE(offset)
    const type = file.readUInt32LE(offset + 4)
    const body = file.subarray(offset + 8, offset + 8 + length)
    if (type === GLB_JSON_CHUNK) json = JSON.parse(body.toString('utf8').trim())
    if (type === GLB_BINARY_CHUNK) binary = body
    offset += 8 + length
  }
  if (!json || !binary) throw new Error('Robot GLB must contain JSON and binary chunks.')
  return { binary, json }
}

function buildGlb(json, binary) {
  const jsonChunk = padChunk(Buffer.from(JSON.stringify(json)), 0x20)
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + binary.byteLength
  const output = Buffer.alloc(totalLength)
  output.writeUInt32LE(0x46546c67, 0)
  output.writeUInt32LE(2, 4)
  output.writeUInt32LE(totalLength, 8)
  output.writeUInt32LE(jsonChunk.byteLength, 12)
  output.writeUInt32LE(GLB_JSON_CHUNK, 16)
  jsonChunk.copy(output, 20)
  const binaryHeader = 20 + jsonChunk.byteLength
  output.writeUInt32LE(binary.byteLength, binaryHeader)
  output.writeUInt32LE(GLB_BINARY_CHUNK, binaryHeader + 4)
  binary.copy(output, binaryHeader + 8)
  return output
}

function padChunk(value, fill) {
  const padding = (4 - (value.byteLength % 4)) % 4
  return padding === 0 ? value : Buffer.concat([value, Buffer.alloc(padding, fill)])
}

async function writeOutput(path, body) {
  try {
    const current = await readFile(path)
    if (current.equals(body)) return
    throw new Error(`${path} exists with different content.`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const temporaryPath = `${path}.${process.pid}.tmp`
  await writeFile(temporaryPath, body)
  await rename(temporaryPath, path)
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

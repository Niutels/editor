import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const JSON_CHUNK_TYPE = 0x4e4f534a
const BINARY_CHUNK_TYPE = 0x004e4942

export async function writeAnimationOnlyGlb(sourcePath, destinationPath) {
  const source = await readFile(sourcePath)
  const { binary, json } = parseGlb(source, sourcePath)
  const accessorIndices = new Set()
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers ?? []) {
      accessorIndices.add(sampler.input)
      accessorIndices.add(sampler.output)
    }
  }
  if (accessorIndices.size === 0) throw new Error(`${sourcePath} contains no animation accessors.`)

  const accessorMap = new Map()
  const bufferViewIndices = new Set()
  const accessors = [...accessorIndices]
    .sort((first, second) => first - second)
    .map((sourceIndex, destinationIndex) => {
      const accessor = json.accessors?.[sourceIndex]
      if (!accessor || accessor.bufferView === undefined || accessor.sparse) {
        throw new Error(`${sourcePath} animation accessor ${sourceIndex} is not densely embedded.`)
      }
      accessorMap.set(sourceIndex, destinationIndex)
      bufferViewIndices.add(accessor.bufferView)
      return { ...accessor }
    })

  const bufferViewMap = new Map()
  const binaryParts = []
  let binaryByteLength = 0
  const bufferViews = [...bufferViewIndices]
    .sort((first, second) => first - second)
    .map((sourceIndex, destinationIndex) => {
      const view = json.bufferViews?.[sourceIndex]
      if (!view || view.buffer !== 0) {
        throw new Error(`${sourcePath} animation buffer view ${sourceIndex} is not embedded.`)
      }
      const start = view.byteOffset ?? 0
      const end = start + view.byteLength
      const bytes = binary.subarray(start, end)
      const alignedOffset = align4(binaryByteLength)
      if (alignedOffset > binaryByteLength) {
        binaryParts.push(Buffer.alloc(alignedOffset - binaryByteLength))
        binaryByteLength = alignedOffset
      }
      bufferViewMap.set(sourceIndex, destinationIndex)
      binaryParts.push(bytes)
      const result = {
        buffer: 0,
        byteLength: bytes.byteLength,
        byteOffset: alignedOffset,
        ...(view.byteStride ? { byteStride: view.byteStride } : {}),
        ...(view.target ? { target: view.target } : {}),
      }
      binaryByteLength += bytes.byteLength
      return result
    })

  for (const accessor of accessors) accessor.bufferView = bufferViewMap.get(accessor.bufferView)
  const compactBinary = Buffer.concat(binaryParts)
  const animations = (json.animations ?? []).map((animation) => ({
    ...animation,
    samplers: animation.samplers.map((sampler) => ({
      ...sampler,
      input: accessorMap.get(sampler.input),
      output: accessorMap.get(sampler.output),
    })),
  }))
  const nodes = (json.nodes ?? []).map((node) => ({
    ...(node.children ? { children: node.children } : {}),
    ...(node.matrix ? { matrix: node.matrix } : {}),
    ...(node.name ? { name: node.name } : {}),
    ...(node.rotation ? { rotation: node.rotation } : {}),
    ...(node.scale ? { scale: node.scale } : {}),
    ...(node.translation ? { translation: node.translation } : {}),
  }))
  const outputJson = {
    accessors,
    animations,
    asset: json.asset,
    bufferViews,
    buffers: [{ byteLength: compactBinary.byteLength }],
    nodes,
    scene: json.scene,
    scenes: json.scenes,
  }
  await atomicWrite(destinationPath, encodeGlb(outputJson, compactBinary))
}

function parseGlb(file, path) {
  if (file.byteLength < 20 || file.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${path} is not a GLB file.`)
  }
  let binary = null
  let json = null
  let offset = 12
  while (offset < file.byteLength) {
    const length = file.readUInt32LE(offset)
    const type = file.readUInt32LE(offset + 4)
    const chunk = file.subarray(offset + 8, offset + 8 + length)
    if (type === JSON_CHUNK_TYPE) json = JSON.parse(chunk.toString('utf8').trimEnd())
    if (type === BINARY_CHUNK_TYPE) binary = chunk
    offset += 8 + length
  }
  if (!(json && binary)) throw new Error(`${path} is missing its JSON or binary chunk.`)
  return { binary, json }
}

function encodeGlb(json, binary) {
  const jsonBody = Buffer.from(JSON.stringify(json))
  const jsonPadding = Buffer.alloc(align4(jsonBody.byteLength) - jsonBody.byteLength, 0x20)
  const binaryPadding = Buffer.alloc(align4(binary.byteLength) - binary.byteLength)
  const jsonChunk = Buffer.concat([jsonBody, jsonPadding])
  const binaryChunk = Buffer.concat([binary, binaryPadding])
  const output = Buffer.alloc(12 + 8 + jsonChunk.byteLength + 8 + binaryChunk.byteLength)
  output.writeUInt32LE(0x46546c67, 0)
  output.writeUInt32LE(2, 4)
  output.writeUInt32LE(output.byteLength, 8)
  output.writeUInt32LE(jsonChunk.byteLength, 12)
  output.writeUInt32LE(JSON_CHUNK_TYPE, 16)
  jsonChunk.copy(output, 20)
  const binaryHeader = 20 + jsonChunk.byteLength
  output.writeUInt32LE(binaryChunk.byteLength, binaryHeader)
  output.writeUInt32LE(BINARY_CHUNK_TYPE, binaryHeader + 4)
  binaryChunk.copy(output, binaryHeader + 8)
  return output
}

async function atomicWrite(destination, value) {
  await mkdir(dirname(destination), { recursive: true })
  const temporaryPath = `${destination}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, value)
  try {
    await rename(temporaryPath, destination)
  } catch (error) {
    if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) throw error
    await copyFile(temporaryPath, destination)
    await rm(temporaryPath)
  }
}

function align4(value) {
  return Math.ceil(value / 4) * 4
}

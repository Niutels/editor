import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { inspectGlb } from './landrush-glb-audit.mjs'

const execFileAsync = promisify(execFile)
const SOURCE_TRIANGLE_COUNT = 3_059
const TARGET_TRIANGLE_COUNT = 1_200
const SIMPLIFY_RATIO = 0.12
const SIMPLIFY_ERROR = 0.008
const TEXTURE_RESOLUTION = 512
const sourcePath = resolve(
  import.meta.dirname,
  '../assets/zombie-escape-meshy-source/props/street-lightpost/model.glb',
)
const generationPath = resolve(dirname(sourcePath), 'meshy-generation.json')
const optimizationPath = resolve(dirname(sourcePath), 'runtime-optimization.json')
const runtimePath = resolve(
  import.meta.dirname,
  '../public/landrush-lab/zombie-escape/assets/props/street-lightpost.glb',
)
const gltfTransformPath = resolve(
  import.meta.dirname,
  '../node_modules/.bin',
  process.platform === 'win32' ? 'gltf-transform.exe' : 'gltf-transform',
)
const pythonTextureResize = String.raw`
from PIL import Image
import sys

source, destination, resolution, quality = sys.argv[1:]
with Image.open(source) as image:
    image = image.convert("RGB")
    image.thumbnail((int(resolution), int(resolution)), Image.Resampling.LANCZOS)
    image.save(
        destination,
        "JPEG",
        quality=int(quality),
        optimize=True,
        progressive=True,
        subsampling=0,
    )
`

await mkdir(dirname(runtimePath), { recursive: true })
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'landrush-street-lightpost-'))
const temporaryRoot = resolve(temporaryDirectory)
const allowedTemporaryRoot = `${resolve(tmpdir())}${sep}`
if (!temporaryRoot.startsWith(allowedTemporaryRoot)) {
  throw new Error(`Refusing to use an unexpected temporary directory: ${temporaryRoot}`)
}

try {
  const weldedPath = resolve(temporaryDirectory, 'welded.glb')
  const simplifiedPath = resolve(temporaryDirectory, 'simplified.glb')
  await runGltfTransform(['weld', sourcePath, weldedPath])
  await runGltfTransform([
    'simplify',
    weldedPath,
    simplifiedPath,
    '--ratio',
    String(SIMPLIFY_RATIO),
    '--error',
    String(SIMPLIFY_ERROR),
    '--lock-border',
    'false',
  ])

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const document = await io.read(simplifiedPath)
  const normalTextures = new Set(
    document
      .getRoot()
      .listMaterials()
      .map((material) => material.getNormalTexture())
      .filter(Boolean),
  )
  const textures = document.getRoot().listTextures()
  for (let index = 0; index < textures.length; index += 1) {
    const texture = textures[index]
    const image = texture.getImage()
    if (!image) throw new Error(`Texture ${index} has no image payload.`)
    const inputPath = resolve(temporaryDirectory, `texture-${index}.jpg`)
    const outputPath = resolve(temporaryDirectory, `texture-${index}-512.jpg`)
    await writeFile(inputPath, image)
    await execFileAsync('python', [
      '-c',
      pythonTextureResize,
      inputPath,
      outputPath,
      String(TEXTURE_RESOLUTION),
      normalTextures.has(texture) ? '94' : '88',
    ])
    texture.setImage(await readFile(outputPath))
    texture.setMimeType('image/jpeg')
  }

  const temporaryRuntimePath = `${runtimePath}.${process.pid}.${randomUUID()}.tmp.glb`
  try {
    await io.write(temporaryRuntimePath, document)
    const sourceInspection = await inspectGlb(sourcePath)
    const runtimeInspection = await inspectGlb(temporaryRuntimePath)
    validateRuntime(sourceInspection, runtimeInspection)
    await rename(temporaryRuntimePath, runtimePath)
    const generation = JSON.parse(await readFile(generationPath, 'utf8'))
    const sourceBody = await readFile(sourcePath)
    const runtimeBody = await readFile(runtimePath)
    await writeFile(
      optimizationPath,
      `${JSON.stringify(
        {
          generatedBy: basename(import.meta.filename),
          meshy: {
            generationFingerprint: generation.generationFingerprint,
            previewTaskId: generation.previewTaskId,
            refineTaskId: generation.refineTaskId,
          },
          runtime: {
            byteLength: runtimeBody.byteLength,
            contentHash: sha256(runtimeBody),
            path: 'public/landrush-lab/zombie-escape/assets/props/street-lightpost.glb',
            textureResolution: TEXTURE_RESOLUTION,
            triangleCount: runtimeInspection.triangleCount,
          },
          simplification: {
            error: SIMPLIFY_ERROR,
            lockBorder: false,
            ratio: SIMPLIFY_RATIO,
            targetTriangleCount: TARGET_TRIANGLE_COUNT,
            tool: 'gltf-transform 4.4.2 meshopt simplifier',
          },
          source: {
            byteLength: sourceBody.byteLength,
            contentHash: sha256(sourceBody),
            path: 'assets/zombie-escape-meshy-source/props/street-lightpost/model.glb',
            triangleCount: sourceInspection.triangleCount,
          },
        },
        null,
        2,
      )}\n`,
    )
    console.log(
      `Street lightpost runtime: ${sourceInspection.triangleCount} -> ${runtimeInspection.triangleCount} triangles; ${sourceBody.byteLength} -> ${runtimeBody.byteLength} bytes.`,
    )
  } finally {
    await rm(temporaryRuntimePath, { force: true })
  }
} finally {
  await rm(temporaryRoot, { force: true, recursive: true })
}

async function runGltfTransform(args) {
  const { stderr, stdout } = await execFileAsync(gltfTransformPath, args)
  if (stdout.trim()) console.log(stdout.trim())
  if (stderr.trim()) console.error(stderr.trim())
}

function validateRuntime(sourceInspection, runtimeInspection) {
  if (sourceInspection.triangleCount !== SOURCE_TRIANGLE_COUNT) {
    throw new Error(
      `Unexpected Meshy source triangle count: ${sourceInspection.triangleCount}; expected ${SOURCE_TRIANGLE_COUNT}.`,
    )
  }
  if (runtimeInspection.triangleCount > TARGET_TRIANGLE_COUNT) {
    throw new Error(
      `Runtime triangle count ${runtimeInspection.triangleCount} exceeds ${TARGET_TRIANGLE_COUNT}.`,
    )
  }
  if (runtimeInspection.nonTrianglePrimitiveCount !== 0) {
    throw new Error('Runtime lightpost contains non-triangle primitives.')
  }
  if (runtimeInspection.primitiveWithoutMaterialCount !== 0) {
    throw new Error('Runtime lightpost contains a primitive without a material.')
  }
  if (
    runtimeInspection.materialCount !== sourceInspection.materialCount ||
    runtimeInspection.textureCount !== sourceInspection.textureCount ||
    runtimeInspection.imageCount !== sourceInspection.imageCount
  ) {
    throw new Error('Runtime optimization changed the material or texture slot topology.')
  }
  if (
    runtimeInspection.images.some(
      (image) =>
        image.width !== TEXTURE_RESOLUTION ||
        image.height !== TEXTURE_RESOLUTION ||
        image.mimeType !== 'image/jpeg',
    )
  ) {
    throw new Error(`Runtime textures must be ${TEXTURE_RESOLUTION}px embedded JPEG images.`)
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

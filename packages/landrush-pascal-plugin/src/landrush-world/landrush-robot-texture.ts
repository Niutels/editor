import {
  DataTexture,
  LinearFilter,
  type Material,
  type MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  RGBAFormat,
  type Texture,
  UnsignedByteType,
} from 'three'

const LANDRUSH_ROBOT_STAGED_TEXTURE_UPLOAD = 'landrushRobotStagedTextureUpload'
export const LANDRUSH_ROBOT_STAGED_TEXTURE_EXPECTED = 'landrushRobotStagedTextureExpected'
const eagerRuntimeTextures = new WeakMap<Texture, Texture>()
const deferredRuntimeTextures = new WeakMap<Texture, Texture>()

export type LandrushRobotStagedTextureUpload = Readonly<{
  height: number
  pixels: Uint8Array
  texture: Texture
  width: number
}>

export type LandrushRobotRuntimeTextureApplication = Readonly<{
  ownedMaterials: readonly Material[]
}>

export function createLandrushRobotRuntimeTexture(
  source: Texture,
  { deferred = false }: Readonly<{ deferred?: boolean }> = {},
): Texture {
  if (deferred && readLandrushRobotStagedTextureUpload(source)) return source
  if (!deferred && (source as Texture & { isDataTexture?: boolean }).isDataTexture) return source

  const runtimeTextures = deferred ? deferredRuntimeTextures : eagerRuntimeTextures
  const cached = runtimeTextures.get(source)
  if (cached) return cached

  const image = readLandrushRobotRuntimeImage(source)
  if (!image) return source

  const runtime = new DataTexture(
    image.pixels,
    image.width,
    image.height,
    RGBAFormat,
    UnsignedByteType,
  )
  runtime.name = `${source.name || 'Landrush robot texture'} runtime`
  runtime.mapping = source.mapping
  runtime.channel = source.channel
  runtime.wrapS = source.wrapS
  runtime.wrapT = source.wrapT
  runtime.magFilter = source.magFilter
  runtime.minFilter = LinearFilter
  runtime.anisotropy = source.anisotropy
  runtime.internalFormat = source.internalFormat
  runtime.offset.copy(source.offset)
  runtime.repeat.copy(source.repeat)
  runtime.center.copy(source.center)
  runtime.rotation = source.rotation
  runtime.matrixAutoUpdate = source.matrixAutoUpdate
  runtime.matrix.copy(source.matrix)
  runtime.generateMipmaps = false
  runtime.premultiplyAlpha = source.premultiplyAlpha
  runtime.flipY = source.flipY
  runtime.unpackAlignment = source.unpackAlignment
  runtime.colorSpace = source.colorSpace
  runtime.userData = deferred
    ? { ...source.userData, [LANDRUSH_ROBOT_STAGED_TEXTURE_UPLOAD]: true }
    : { ...source.userData }
  runtime.needsUpdate = true
  if (deferred) runtime.source.dataReady = false
  runtimeTextures.set(source, runtime)
  runtimeTextures.set(runtime, runtime)
  return runtime
}

export function readLandrushRobotStagedTextureUpload(
  texture: Texture,
): LandrushRobotStagedTextureUpload | null {
  if (texture.userData[LANDRUSH_ROBOT_STAGED_TEXTURE_UPLOAD] !== true) return null
  const image = texture.image as Readonly<{
    data?: unknown
    height?: unknown
    width?: unknown
  }> | null
  if (
    !(image?.data instanceof Uint8Array) ||
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    Number(image.width) <= 0 ||
    Number(image.height) <= 0
  ) {
    return null
  }
  const width = Number(image.width)
  const height = Number(image.height)
  if (image.data.byteLength !== width * height * 4) return null
  return { height, pixels: image.data, texture, width }
}

export function applyLandrushRobotRuntimeTexture(
  root: Object3D,
  { deferred = false }: Readonly<{ deferred?: boolean }> = {},
): LandrushRobotRuntimeTextureApplication {
  const ownedMaterials = new Set<Material>()
  const deferredMaterials = new Map<Material, Material>()
  root.traverse((child) => {
    const materialOwner = child as Object3D & { material?: unknown }
    const material = materialOwner.material
    const materials = Array.isArray(material) ? material : [material]
    let changed = false
    const nextMaterials = materials.map((candidate) => {
      if (!candidate || typeof candidate !== 'object') return candidate
      const textured = candidate as Material & {
        emissiveMap?: Texture | null
        map?: Texture | null
        needsUpdate?: boolean
      }
      if (!textured.map || textured.map !== textured.emissiveMap) return candidate
      const runtime = createLandrushRobotRuntimeTexture(textured.map, { deferred })
      if (runtime === textured.map) return candidate

      const target = (
        deferred
          ? (deferredMaterials.get(textured) ?? createLandrushRobotDeferredMaterial(textured))
          : textured
      ) as typeof textured
      if (deferred) deferredMaterials.set(textured, target)
      target.map = runtime
      target.emissiveMap = runtime
      target.needsUpdate = true
      if (deferred) ownedMaterials.add(target)
      changed = true
      return target
    })

    if (!deferred || !changed) return
    materialOwner.material = Array.isArray(material) ? nextMaterials : nextMaterials[0]
  })
  return { ownedMaterials: Array.from(ownedMaterials) }
}

function createLandrushRobotDeferredMaterial(source: Material) {
  if (!isLandrushRobotStandardCompatiblePhysicalMaterial(source)) return source.clone()
  return new MeshStandardMaterial().copy(source)
}

function isLandrushRobotStandardCompatiblePhysicalMaterial(
  material: Material,
): material is MeshPhysicalMaterial {
  const physical = material as MeshPhysicalMaterial
  return (
    physical.isMeshPhysicalMaterial === true &&
    physical.metalness === 1 &&
    physical.metalnessMap === null &&
    physical.anisotropy === 0 &&
    physical.clearcoat === 0 &&
    physical.dispersion === 0 &&
    physical.iridescence === 0 &&
    physical.sheen === 0 &&
    physical.transmission === 0
  )
}

function readLandrushRobotRuntimeImage(
  source: Texture,
): Readonly<{ height: number; pixels: Uint8Array; width: number }> | null {
  const dataImage = source.image as Readonly<{
    data?: unknown
    height?: unknown
    width?: unknown
  }> | null
  if (
    dataImage?.data instanceof Uint8Array &&
    Number.isInteger(dataImage.width) &&
    Number.isInteger(dataImage.height) &&
    Number(dataImage.width) > 0 &&
    Number(dataImage.height) > 0
  ) {
    const width = Number(dataImage.width)
    const height = Number(dataImage.height)
    if (dataImage.data.byteLength === width * height * 4) {
      return { height, pixels: dataImage.data, width }
    }
  }

  const image = source.image as { height?: number; width?: number } | null
  const width = image?.width
  const height = image?.height
  if (
    typeof OffscreenCanvas === 'undefined' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    !width ||
    !height
  ) {
    return null
  }

  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(source.image as CanvasImageSource, 0, 0, width, height)
  const imageData = context.getImageData(0, 0, width, height)
  return {
    height,
    pixels: new Uint8Array(
      imageData.data.buffer,
      imageData.data.byteOffset,
      imageData.data.byteLength,
    ),
    width,
  }
}

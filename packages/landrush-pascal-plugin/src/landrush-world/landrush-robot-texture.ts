import {
  DataTexture,
  LinearFilter,
  type Object3D,
  RGBAFormat,
  type Texture,
  UnsignedByteType,
} from 'three'

const runtimeTextures = new WeakMap<Texture, Texture>()

export function createLandrushRobotRuntimeTexture(source: Texture): Texture {
  const cached = runtimeTextures.get(source)
  if (cached) return cached

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
    return source
  }

  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return source
  context.drawImage(source.image as CanvasImageSource, 0, 0, width, height)
  const imageData = context.getImageData(0, 0, width, height)
  const pixels = new Uint8Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    imageData.data.byteLength,
  )
  const runtime = new DataTexture(pixels, width, height, RGBAFormat, UnsignedByteType)
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
  runtime.userData = { ...source.userData }
  runtime.needsUpdate = true
  runtimeTextures.set(source, runtime)
  return runtime
}

export function applyLandrushRobotRuntimeTexture(root: Object3D) {
  root.traverse((child) => {
    const material = (child as Object3D & { material?: unknown }).material
    const materials = Array.isArray(material) ? material : [material]
    for (const candidate of materials) {
      if (!candidate || typeof candidate !== 'object') continue
      const textured = candidate as {
        emissiveMap?: Texture | null
        map?: Texture | null
        needsUpdate?: boolean
      }
      if (!textured.map || textured.map !== textured.emissiveMap) continue
      const runtime = createLandrushRobotRuntimeTexture(textured.map)
      if (runtime === textured.map) continue
      textured.map = runtime
      textured.emissiveMap = runtime
      textured.needsUpdate = true
    }
  })
}

import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
} from 'three'

export function createStylizedGroundTextureFromCanvas(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.flipY = true
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.generateMipmaps = true
  texture.userData.landrushGeneratedStylizedGrassGround = true
  texture.userData.landrushStylizedGroundReason = 'generated'
  texture.needsUpdate = true
  return texture
}

import {
  AdditiveBlending,
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  LinearFilter,
  MeshBasicMaterial,
  NoColorSpace,
  RGBAFormat,
} from 'three'

const LANDRUSH_ZOMBIE_NIGHT_GROUND_POOL_TEXTURE_SIZE = 64

export function createLandrushZombieNightGroundPoolResources() {
  const texture = createLandrushZombieNightGroundPoolTexture()
  const material = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: '#ffffff',
    depthWrite: false,
    map: texture,
    opacity: 0,
    side: DoubleSide,
    transparent: true,
  })
  material.toneMapped = false
  return { material, texture }
}

export function createLandrushZombieNightGroundPoolTexture() {
  const size = LANDRUSH_ZOMBIE_NIGHT_GROUND_POOL_TEXTURE_SIZE
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const normalizedX = ((x + 0.5) / size) * 2 - 1
      const normalizedY = ((y + 0.5) / size) * 2 - 1
      const alpha = resolveLandrushZombieNightGroundPoolAlpha(Math.hypot(normalizedX, normalizedY))
      const offset = (y * size + x) * 4
      data[offset] = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = Math.round(alpha * 255)
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.colorSpace = NoColorSpace
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.name = 'landrush-zombie-night-ground-pool'
  texture.needsUpdate = true
  return texture
}

export function resolveLandrushZombieNightGroundPoolAlpha(normalizedRadius: number) {
  const radius = Math.min(1, Math.max(0, Number.isFinite(normalizedRadius) ? normalizedRadius : 1))
  const remaining = 1 - radius
  return remaining * remaining * (3 - 2 * remaining)
}

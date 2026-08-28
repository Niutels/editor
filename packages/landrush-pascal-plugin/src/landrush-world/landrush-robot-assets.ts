export const LANDRUSH_ROBOT_ASSET_PATH = '/navigation/proto_pascal_robot-ktx2-1112f038.glb'

type LandrushRobotRendererCapabilities = {
  extensions?: { has(name: string): boolean }
  hasFeature?: (name: string) => boolean
  isWebGPURenderer?: boolean
}

export function supportsLandrushRobotS3tcTranscode(renderer: unknown) {
  const capabilities = renderer as LandrushRobotRendererCapabilities | null
  if (!capabilities) return false
  if (capabilities.isWebGPURenderer) {
    return capabilities.hasFeature?.('texture-compression-bc') === true
  }
  return Boolean(
    capabilities.extensions?.has('WEBGL_compressed_texture_s3tc') &&
      capabilities.extensions.has('WEBGL_compressed_texture_s3tc_srgb'),
  )
}

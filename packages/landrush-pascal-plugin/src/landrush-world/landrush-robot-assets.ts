export const LANDRUSH_ROBOT_ASSET_PATH = '/navigation/proto_pascal_robot-bc1-47d84fc6.glb'
export const LANDRUSH_ROBOT_FALLBACK_ASSET_PATH = '/navigation/proto_pascal_robot.glb'

type LandrushRobotRendererCapabilities = {
  extensions?: { has(name: string): boolean }
  hasFeature?: (name: string) => boolean
  isWebGPURenderer?: boolean
}

export function supportsLandrushRobotNativeBc1(renderer: unknown) {
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

export function resolveLandrushRobotAssetPath(renderer: unknown) {
  return supportsLandrushRobotNativeBc1(renderer)
    ? LANDRUSH_ROBOT_ASSET_PATH
    : LANDRUSH_ROBOT_FALLBACK_ASSET_PATH
}

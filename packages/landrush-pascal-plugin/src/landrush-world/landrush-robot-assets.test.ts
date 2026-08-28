import { describe, expect, test } from 'bun:test'
import {
  LANDRUSH_ROBOT_ASSET_PATH,
  LANDRUSH_ROBOT_FALLBACK_ASSET_PATH,
  resolveLandrushRobotAssetPath,
  supportsLandrushRobotNativeBc1,
} from './landrush-robot-assets'

describe('Landrush robot texture capability selection', () => {
  test('uses native BC1 only when WebGL exposes both S3TC and its sRGB extension', () => {
    const supported = new Set([
      'WEBGL_compressed_texture_s3tc',
      'WEBGL_compressed_texture_s3tc_srgb',
    ])
    const renderer = { extensions: { has: (name: string) => supported.has(name) } }
    expect(supportsLandrushRobotNativeBc1(renderer)).toBe(true)
    expect(resolveLandrushRobotAssetPath(renderer)).toBe(LANDRUSH_ROBOT_ASSET_PATH)

    supported.delete('WEBGL_compressed_texture_s3tc_srgb')
    expect(supportsLandrushRobotNativeBc1(renderer)).toBe(false)
    expect(resolveLandrushRobotAssetPath(renderer)).toBe(LANDRUSH_ROBOT_FALLBACK_ASSET_PATH)
  })

  test('uses native BC1 for WebGPU texture-compression-bc and falls back otherwise', () => {
    const renderer = {
      hasFeature: (name: string) => name === 'texture-compression-bc',
      isWebGPURenderer: true,
    }
    expect(supportsLandrushRobotNativeBc1(renderer)).toBe(true)
    expect(resolveLandrushRobotAssetPath(renderer)).toBe(LANDRUSH_ROBOT_ASSET_PATH)
    expect(resolveLandrushRobotAssetPath({ hasFeature: () => false, isWebGPURenderer: true })).toBe(
      LANDRUSH_ROBOT_FALLBACK_ASSET_PATH,
    )
    expect(resolveLandrushRobotAssetPath(null)).toBe(LANDRUSH_ROBOT_FALLBACK_ASSET_PATH)
  })
})

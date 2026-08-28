import { describe, expect, test } from 'bun:test'
import {
  LANDRUSH_ROBOT_ASSET_PATH,
  supportsLandrushRobotS3tcTranscode,
} from './landrush-robot-assets'

describe('Landrush robot texture capability selection', () => {
  test('uses BC1 transcode only when WebGL exposes both S3TC and its sRGB extension', () => {
    const supported = new Set([
      'WEBGL_compressed_texture_s3tc',
      'WEBGL_compressed_texture_s3tc_srgb',
    ])
    const renderer = { extensions: { has: (name: string) => supported.has(name) } }
    expect(supportsLandrushRobotS3tcTranscode(renderer)).toBe(true)

    supported.delete('WEBGL_compressed_texture_s3tc_srgb')
    expect(supportsLandrushRobotS3tcTranscode(renderer)).toBe(false)
  })

  test('uses BC1 transcode for WebGPU texture-compression-bc and falls back otherwise', () => {
    const renderer = {
      hasFeature: (name: string) => name === 'texture-compression-bc',
      isWebGPURenderer: true,
    }
    expect(supportsLandrushRobotS3tcTranscode(renderer)).toBe(true)
    expect(
      supportsLandrushRobotS3tcTranscode({ hasFeature: () => false, isWebGPURenderer: true }),
    ).toBe(false)
    expect(supportsLandrushRobotS3tcTranscode(null)).toBe(false)
    expect(LANDRUSH_ROBOT_ASSET_PATH).toBe('/navigation/proto_pascal_robot-ktx2-1112f038.glb')
  })
})

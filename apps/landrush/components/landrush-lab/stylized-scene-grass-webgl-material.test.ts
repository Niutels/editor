import { describe, expect, test } from 'bun:test'
import { MeshStandardMaterial, ShaderLib } from 'three'
import {
  configureStylizedGrassWebGlFadeMaterial,
  patchStylizedGrassWebGlFadeShader,
} from './stylized-scene-grass-webgl-material'

describe('stylized grass WebGL fade material', () => {
  test('uses both per-instance fade attributes for height and alpha', () => {
    const shader = patchStylizedGrassWebGlFadeShader({
      fragmentShader: ShaderLib.standard.fragmentShader,
      vertexShader: ShaderLib.standard.vertexShader,
    })

    expect(shader.vertexShader).toContain('attribute float aFade;')
    expect(shader.vertexShader).toContain('attribute float aStreamFade;')
    expect(shader.vertexShader).toContain('vLandrushGrassFade = clamp(aFade * aStreamFade')
    expect(shader.vertexShader).toContain('transformed.y *= vLandrushGrassFade;')
    expect(shader.fragmentShader).toContain('diffuseColor.a *= clamp(vLandrushGrassFade')
    expect(
      shader.fragmentShader.indexOf('diffuseColor.a *= clamp(vLandrushGrassFade'),
    ).toBeLessThan(shader.fragmentShader.indexOf('#include <alphahash_fragment>'))
  })

  test('installs a distinct cached WebGL program variant', () => {
    const material = new MeshStandardMaterial()
    configureStylizedGrassWebGlFadeMaterial(material)
    const shader = {
      fragmentShader: ShaderLib.standard.fragmentShader,
      uniforms: {},
      vertexShader: ShaderLib.standard.vertexShader,
    }

    material.onBeforeCompile(
      shader as Parameters<typeof material.onBeforeCompile>[0],
      null as unknown as Parameters<typeof material.onBeforeCompile>[1],
    )

    expect(shader.vertexShader).toContain('aFade * aStreamFade')
    expect(material.customProgramCacheKey()).toBe('landrush-stylized-grass-webgl-fade-v1')
  })
})

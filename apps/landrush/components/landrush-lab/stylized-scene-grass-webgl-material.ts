import type { MeshStandardMaterial } from 'three'

const STYLIZED_GRASS_WEBGL_FADE_PROGRAM_KEY = 'landrush-stylized-grass-webgl-fade-v1'

type StylizedGrassWebGlShaderSource = {
  fragmentShader: string
  vertexShader: string
}

export function configureStylizedGrassWebGlFadeMaterial(material: MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    const patched = patchStylizedGrassWebGlFadeShader(shader)
    shader.vertexShader = patched.vertexShader
    shader.fragmentShader = patched.fragmentShader
  }
  material.customProgramCacheKey = () => STYLIZED_GRASS_WEBGL_FADE_PROGRAM_KEY
}

export function patchStylizedGrassWebGlFadeShader({
  fragmentShader,
  vertexShader,
}: StylizedGrassWebGlShaderSource): StylizedGrassWebGlShaderSource {
  const patchedVertexShader = replaceShaderChunk(
    replaceShaderChunk(
      vertexShader,
      '#include <common>',
      `#include <common>
attribute float aFade;
attribute float aStreamFade;
varying float vLandrushGrassFade;`,
    ),
    '#include <project_vertex>',
    `vLandrushGrassFade = clamp(aFade * aStreamFade, 0.0, 1.0);
transformed.y *= vLandrushGrassFade;
#include <project_vertex>`,
  )
  const patchedFragmentShader = replaceShaderChunk(
    replaceShaderChunk(
      fragmentShader,
      '#include <common>',
      `#include <common>
varying float vLandrushGrassFade;`,
    ),
    '#include <alphamap_fragment>',
    `#include <alphamap_fragment>
diffuseColor.a *= clamp(vLandrushGrassFade, 0.0, 1.0);`,
  )
  return {
    fragmentShader: patchedFragmentShader,
    vertexShader: patchedVertexShader,
  }
}

function replaceShaderChunk(source: string, chunk: string, replacement: string) {
  if (!source.includes(chunk)) {
    throw new Error(`Stylized grass WebGL shader is missing ${chunk}`)
  }
  return source.replace(chunk, replacement)
}

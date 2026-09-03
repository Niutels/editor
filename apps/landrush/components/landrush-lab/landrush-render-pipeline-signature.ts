import type { Material, Object3D } from 'three'

const MATERIAL_PROTOTYPE_KEYS = new WeakMap<object, readonly string[]>()
const PIPELINE_COVERAGE_REPRESENTATIVES = new WeakMap<Object3D, Object3D>()

export function registerLandrushPipelineCoverageRepresentative(root: Object3D, coverage: Object3D) {
  PIPELINE_COVERAGE_REPRESENTATIVES.set(root, coverage)
}

export function resolveLandrushPipelineCoverageRepresentative(root: Object3D) {
  return PIPELINE_COVERAGE_REPRESENTATIVES.get(root) ?? root
}

export function readLandrushMaterialPipelineSignature(material: Material) {
  const candidate = material as Material & Record<string, unknown>
  const values = [
    String(material.customProgramCacheKey()),
    ...LANDRUSH_MATERIAL_RENDER_PIPELINE_STATE_KEYS.map(
      (property) => `${property}:${String(candidate[property])}`,
    ),
    `defines:${readLandrushMaterialDefinesSignature(candidate.defines)}`,
  ]
  for (const property of readMaterialKeys(material)) {
    if (/^(is[A-Z]|_)|^(visible|version|uuid|name|opacity|userData)$/.test(property)) continue
    const value = candidate[property]
    if (typeof value === 'number') {
      values.push(property === 'side' ? String(value) : value === 0 ? '0' : '1')
      continue
    }
    if (value && typeof value === 'object') {
      const texture = value as {
        isTexture?: boolean
        magFilter?: number
        mapping?: number
        minFilter?: number
        wrapR?: number
        wrapS?: number
        wrapT?: number
      }
      values.push(
        texture.isTexture
          ? `texture:${String(texture.mapping)}:${String(texture.magFilter)}:${String(
              texture.minFilter,
            )}:${String(texture.wrapS)}:${String(texture.wrapT)}:${String(texture.wrapR)}`
          : 'object',
      )
      continue
    }
    values.push(String(value))
  }
  values.push(`clipping-planes:${String(material.clippingPlanes?.length ?? 0)}`)
  return values.join(',')
}

const LANDRUSH_MATERIAL_RENDER_PIPELINE_STATE_KEYS = [
  'transparent',
  'blending',
  'premultipliedAlpha',
  'blendSrc',
  'blendDst',
  'blendEquation',
  'blendSrcAlpha',
  'blendDstAlpha',
  'blendEquationAlpha',
  'colorWrite',
  'depthWrite',
  'depthTest',
  'depthFunc',
  'stencilWrite',
  'stencilFunc',
  'stencilFail',
  'stencilZFail',
  'stencilZPass',
  'stencilFuncMask',
  'stencilWriteMask',
  'side',
  'alphaToCoverage',
  'polygonOffset',
  'polygonOffsetFactor',
  'polygonOffsetUnits',
] as const

function readLandrushMaterialDefinesSignature(value: unknown) {
  if (!(value && typeof value === 'object')) return String(value)
  return Object.entries(value as Record<string, unknown>)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, entry]) => `${key}:${String(entry)}`)
    .join('|')
}

function readMaterialKeys(material: Material) {
  let prototypeKeys = MATERIAL_PROTOTYPE_KEYS.get(material.constructor)
  if (!prototypeKeys) {
    const keys: string[] = []
    let prototype = Object.getPrototypeOf(material)
    while (prototype) {
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
        if (typeof descriptor.get === 'function') keys.push(key)
      }
      prototype = Object.getPrototypeOf(prototype)
    }
    prototypeKeys = keys
    MATERIAL_PROTOTYPE_KEYS.set(material.constructor, prototypeKeys)
  }
  return [...Object.keys(material), ...prototypeKeys]
}

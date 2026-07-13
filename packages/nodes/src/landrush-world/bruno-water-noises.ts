// @ts-nocheck -- Adapted from Bruno Simon folio-2025 TSL/WebGPU source; see BRUNO_SIMON_LICENSE.md.

import {
  ceil,
  dot,
  Fn,
  float,
  floor,
  fract,
  If,
  int,
  Loop,
  length,
  mix,
  mod,
  mul,
  sin,
  smoothstep,
  uv,
  vec2,
  vec3,
  vec4,
  viewportUV,
} from 'three/tsl'
import * as THREE from 'three/webgpu'

export const LANDRUSH_BRUNO_WATER_NOISE_RESOLUTION = 128

function roundLandrushWaterNoisePerf(value: number) {
  return Math.round(value * 1000) / 1000
}

function measureLandrushWaterNoiseStartup<T>(id: string, callback: () => T) {
  if (typeof performance === 'undefined') return callback()
  const profile = globalThis.__PASCAL_WATER_STARTUP_PROFILE__
  if (!profile) return callback()

  const startedAt = performance.now()
  try {
    return callback()
  } finally {
    profile.spans.push({
      durationMs: roundLandrushWaterNoisePerf(performance.now() - startedAt),
      id,
      startMs: roundLandrushWaterNoisePerf(startedAt - profile.startedAt),
    })
  }
}

type LandrushWaterDisposableGpuResource = {
  dispose: () => void
}

function disposeLandrushWaterGpuResourceLater(
  resource: LandrushWaterDisposableGpuResource | null | undefined,
) {
  if (!resource) return
  if (typeof requestAnimationFrame !== 'function') {
    resource.dispose()
    return
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => resource.dispose())
  })
}

const brunoHash = /*#__PURE__*/ Fn(([pImmutable]) => {
  const p = vec2(pImmutable).toVar()
  p.assign(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))))

  return fract(sin(p).mul(43758.5453123))
}).setLayout({
  name: 'landrushBrunoHash',
  type: 'vec2',
  inputs: [{ name: 'p', type: 'vec2' }],
})

const voronoiNode = /*#__PURE__*/ Fn(([uvImmutable, repeatImmutable]) => {
  const repeat = float(repeatImmutable).toVar()
  const sampledUv = vec2(uvImmutable).toVar()
  const cellId = vec2(0.0).toVar()
  sampledUv.mulAssign(repeat)
  const i = vec2(floor(sampledUv)).toVar()
  const f = vec2(fract(sampledUv)).toVar()
  const minDist = float(1.0).toVar()
  const minEdge = float(1.0).toVar()
  const bestId = vec2(0.0).toVar()

  Loop({ start: int(-1), end: int(1), name: 'y', condition: '<=' }, ({ y }) => {
    Loop({ start: int(-1), end: int(1), name: 'x', condition: '<=' }, ({ x }) => {
      const neighbor = vec2(x, y).toVar()
      const cell = vec2(mod(i.add(neighbor), repeat)).toVar()
      const point = vec2(brunoHash(cell)).toVar()
      const diff = vec2(neighbor.add(point.sub(f))).toVar()
      const dist = float(length(diff)).toVar()

      If(dist.lessThan(minDist), () => {
        minEdge.assign(minDist)
        minDist.assign(dist)
        bestId.assign(i.add(neighbor))
      }).ElseIf(dist.lessThan(minEdge), () => {
        minEdge.assign(dist)
      })
    })
  })

  cellId.assign(fract(bestId.div(repeat)))

  return vec3(minDist, minEdge.sub(minDist), brunoHash(cellId).x)
}).setLayout({
  name: 'landrushBrunoVoronoi',
  type: 'vec3',
  inputs: [
    { name: 'uv', type: 'vec2' },
    { name: 'repeat', type: 'float' },
  ],
})

const modulo = /*#__PURE__*/ Fn(([dividentImmutable, divisorImmutable]) => {
  const divisor = vec2(divisorImmutable).toVar()
  const divident = vec2(dividentImmutable).toVar()
  const positiveDivident = vec2(mod(divident, divisor).add(divisor)).toVar()

  return mod(positiveDivident, divisor)
}).setLayout({
  name: 'landrushBrunoModulo',
  type: 'vec2',
  inputs: [
    { name: 'divident', type: 'vec2' },
    { name: 'divisor', type: 'vec2' },
  ],
})

const random = /*#__PURE__*/ Fn(([valueImmutable]) => {
  const value = vec2(valueImmutable).toVar()
  value.assign(vec2(dot(value, vec2(127.1, 311.7)), dot(value, vec2(269.5, 183.3))))

  return float(-1.0).add(mul(2.0, fract(sin(value).mul(43758.5453123))))
}).setLayout({
  name: 'landrushBrunoRandom',
  type: 'vec2',
  inputs: [{ name: 'value', type: 'vec2' }],
})

const perlinNode = /*#__PURE__*/ Fn(([uvImmutable, cellAmountImmutable, periodImmutable]) => {
  const period = vec2(periodImmutable).toVar()
  const cellAmount = float(cellAmountImmutable).toVar()
  const sampledUv = vec2(uvImmutable).toVar()
  sampledUv.assign(sampledUv.mul(float(cellAmount)))
  const cellsMinimum = vec2(floor(sampledUv)).toVar()
  const cellsMaximum = vec2(ceil(sampledUv)).toVar()
  const uvFract = vec2(fract(sampledUv)).toVar()
  cellsMinimum.assign(modulo(cellsMinimum, period))
  cellsMaximum.assign(modulo(cellsMaximum, period))
  const blur = vec2(smoothstep(0.0, 1.0, uvFract)).toVar()
  const lowerLeftDirection = vec2(random(vec2(cellsMinimum.x, cellsMinimum.y))).toVar()
  const lowerRightDirection = vec2(random(vec2(cellsMaximum.x, cellsMinimum.y))).toVar()
  const upperLeftDirection = vec2(random(vec2(cellsMinimum.x, cellsMaximum.y))).toVar()
  const upperRightDirection = vec2(random(vec2(cellsMaximum.x, cellsMaximum.y))).toVar()
  const fraction = vec2(fract(sampledUv)).toVar()

  return mix(
    mix(
      dot(lowerLeftDirection, fraction.sub(vec2(int(0), int(0)))),
      dot(lowerRightDirection, fraction.sub(vec2(int(1), int(0)))),
      blur.x,
    ),
    mix(
      dot(upperLeftDirection, fraction.sub(vec2(int(0), int(1)))),
      dot(upperRightDirection, fraction.sub(vec2(int(1), int(1)))),
      blur.x,
    ),
    blur.y,
  )
    .mul(0.8)
    .add(0.5)
}).setLayout({
  name: 'landrushBrunoPerlinNode',
  type: 'float',
  inputs: [
    { name: 'uv', type: 'vec2' },
    { name: 'cell_amount', type: 'float' },
    { name: 'period', type: 'vec2' },
  ],
})

export class LandrushBrunoWaterNoises {
  readonly hash: THREE.Texture
  readonly perlin: THREE.Texture
  readonly voronoi: THREE.Texture

  private readonly quadMesh = new THREE.QuadMesh()
  private readonly renderTargets: THREE.RenderTarget[] = []
  private readonly renderer: THREE.WebGPURenderer
  private readonly resolution = LANDRUSH_BRUNO_WATER_NOISE_RESOLUTION

  constructor(renderer: THREE.WebGPURenderer) {
    measureLandrushWaterNoiseStartup('setup.landrush-water.noises.constructor', () => {
      this.renderer = renderer
      this.voronoi = this.renderVoronoi()
      this.perlin = this.renderPerlin()
      this.hash = this.renderHash()
    })
  }

  dispose() {
    for (const renderTarget of this.renderTargets) {
      disposeLandrushWaterGpuResourceLater(renderTarget)
    }
  }

  private renderVoronoi() {
    return measureLandrushWaterNoiseStartup('setup.landrush-water.noises.voronoi', () => {
      const renderTarget = new THREE.RenderTarget(this.resolution, this.resolution, {
        depthBuffer: false,
        type: THREE.HalfFloatType,
      })
      this.renderTargets.push(renderTarget)
      renderTarget.texture.wrapS = THREE.RepeatWrapping
      renderTarget.texture.wrapT = THREE.RepeatWrapping

      const material = new THREE.MeshBasicNodeMaterial({ color: 'red', wireframe: false })
      material.outputNode = vec4(voronoiNode(uv(), 8), 0)
      this.render(material, renderTarget, 'voronoi')
      return renderTarget.texture
    })
  }

  private renderPerlin() {
    return measureLandrushWaterNoiseStartup('setup.landrush-water.noises.perlin', () => {
      const renderTarget = new THREE.RenderTarget(this.resolution, this.resolution, {
        depthBuffer: false,
        format: THREE.RedFormat,
        type: THREE.HalfFloatType,
      })
      this.renderTargets.push(renderTarget)
      renderTarget.texture.wrapS = THREE.RepeatWrapping
      renderTarget.texture.wrapT = THREE.RepeatWrapping

      const material = new THREE.MeshBasicNodeMaterial()
      material.outputNode = vec4(
        perlinNode(uv(), 6.0, 6.0).remap(0.1, 0.9, 0.0, 1.0),
        brunoHash(uv().mul(128).floor().div(128)).x,
        0,
        0,
      )
      this.render(material, renderTarget, 'perlin')
      return renderTarget.texture
    })
  }

  private renderHash() {
    return measureLandrushWaterNoiseStartup('setup.landrush-water.noises.hash', () => {
      const renderTarget = new THREE.RenderTarget(this.resolution, this.resolution, {
        depthBuffer: false,
        format: THREE.RedFormat,
        type: THREE.HalfFloatType,
      })
      this.renderTargets.push(renderTarget)
      renderTarget.texture.wrapS = THREE.RepeatWrapping
      renderTarget.texture.wrapT = THREE.RepeatWrapping
      renderTarget.texture.minFilter = THREE.NearestFilter
      renderTarget.texture.magFilter = THREE.NearestFilter
      renderTarget.texture.generateMipmaps = false

      const material = new THREE.MeshBasicNodeMaterial()
      material.outputNode = vec4(brunoHash(viewportUV).x, 0, 0, 0)
      this.render(material, renderTarget, 'hash')
      return renderTarget.texture
    })
  }

  private render(
    material: THREE.MeshBasicNodeMaterial,
    renderTarget: THREE.RenderTarget,
    profileId: string,
  ) {
    measureLandrushWaterNoiseStartup(`setup.landrush-water.noises.${profileId}.render`, () => {
      this.quadMesh.material = material
      const rendererState = measureLandrushWaterNoiseStartup(
        `setup.landrush-water.noises.${profileId}.reset-renderer-state`,
        () => THREE.RendererUtils.resetRendererState(this.renderer),
      )

      this.renderer.setPixelRatio(1)
      this.renderer.setRenderTarget(renderTarget)
      measureLandrushWaterNoiseStartup(`setup.landrush-water.noises.${profileId}.quad-render`, () =>
        this.quadMesh.render(this.renderer),
      )
      this.renderer.setRenderTarget(null)

      measureLandrushWaterNoiseStartup(
        `setup.landrush-water.noises.${profileId}.restore-renderer-state`,
        () => THREE.RendererUtils.restoreRendererState(this.renderer, rendererState),
      )
      disposeLandrushWaterGpuResourceLater(material)
    })
  }
}

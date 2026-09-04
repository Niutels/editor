import { describe, expect, test } from 'bun:test'
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RenderTarget,
  Scene,
  SphereGeometry,
} from 'three'
import WebGPUUtils from 'three/src/renderers/webgpu/utils/WebGPUUtils.js'
import { viewportDepthTexture } from 'three/tsl'
import {
  beginLandrushPresentationPipelinePrewarmFrame,
  compileLandrushRenderRepresentative,
  type LandrushPresentationPipelinePrewarmState,
  registerLandrushPresentationPipelinePrewarm,
} from './landrush-render-readiness'
import {
  createDefaultStandaloneOceanParameters,
  createStandaloneOceanMaterials,
} from './standalone-ocean-material'
import {
  compileZombieEscapeRenderRepresentatives,
  type ZombieEscapePipelineRenderer,
} from './zombie-escape-render-readiness'

async function flushUntil(condition: () => boolean) {
  for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) await Promise.resolve()
  expect(condition()).toBe(true)
}

describe('framebuffer-dependent material preparation', () => {
  test('the ocean declares exact-draw preparation only when it reads scene depth', () => {
    const geometry = { cloudDetailOctaves: 1, detailRadius: 20, outerRadius: 40, vertexSpacing: 2 }
    const plain = createStandaloneOceanMaterials(
      createDefaultStandaloneOceanParameters(),
      'final',
      geometry,
    )
    const refracted = createStandaloneOceanMaterials(
      createDefaultStandaloneOceanParameters(),
      'final',
      geometry,
      null,
      true,
    )
    try {
      expect(plain.surface.userData.landrushFramebufferDrawPreparation).toBe(false)
      expect(refracted.surface.userData.landrushFramebufferDrawPreparation).toBe(true)
      expect(refracted.sky.userData.landrushFramebufferDrawPreparation).toBeUndefined()
    } finally {
      plain.dispose()
      refracted.dispose()
    }
  })

  test('keeps four-sample scene depth out of context-free compilation and gates readiness on both exact draws', async () => {
    const camera = new PerspectiveCamera()
    const scene = new Scene()
    const geometry = new SphereGeometry(1, 4, 3)
    const regularMaterial = new MeshBasicMaterial()
    const framebufferMaterial = new MeshBasicMaterial()
    framebufferMaterial.userData.landrushFramebufferDrawPreparation = true
    const regular = new Mesh(geometry, regularMaterial)
    const water = new Mesh(geometry, framebufferMaterial)
    const root = new Group()
    root.add(regular)
    scene.add(root, water)
    const presentation = new RenderTarget(64, 64, { samples: 4 })
    const direct = new RenderTarget(64, 64, { samples: 4 })
    const fullscreen = new RenderTarget(16, 16, { depthBuffer: false })
    let activeTarget: RenderTarget | null = null
    const depth = viewportDepthTexture()
    const sampleUtils = new WebGPUUtils({
      renderer: { getRenderTarget: () => activeTarget, currentSamples: 0 },
    })
    const shaderSamples: number[] = []
    const drawSamples: number[] = []
    const state: LandrushPresentationPipelinePrewarmState = {}
    let fenceResolve!: () => void
    let fenceRequested = false
    const fence = new Promise<void>((resolve) => {
      fenceResolve = resolve
    })
    const renderer: ZombieEscapePipelineRenderer = {
      isWebGPURenderer: true,
      backend: {
        device: {
          queue: {
            onSubmittedWorkDone: () => {
              fenceRequested = true
              return fence
            },
          },
        },
      },
      async compileAsync(aggregate) {
        aggregate.traverseVisible((object) => {
          const material = (object as Mesh).material
          if (material === regularMaterial) expect(regularMaterial.visible).toBe(true)
          if (material === framebufferMaterial && framebufferMaterial.visible) {
            shaderSamples.push(sampleUtils.getTextureSampleData(depth.value).primarySamples)
          }
        })
        await Promise.resolve()
        expect(framebufferMaterial.visible).toBe(true)
        activeTarget = fullscreen
        await Promise.resolve()
        activeTarget = null
      },
    }
    const unregister = registerLandrushPresentationPipelinePrewarm({
      invalidate: () => undefined,
      renderer,
      scene,
      state,
    })
    let ready = false
    const pending = compileZombieEscapeRenderRepresentatives({
      camera,
      renderer,
      targetScene: scene,
      representatives: [{ key: 'fixture', root }],
    }).then(() => {
      ready = true
    })
    try {
      await flushUntil(
        () => framebufferMaterial.visible && state.pipelinePrewarmRequestRevision === undefined,
      )
      for (const [index, target] of [presentation, direct].entries()) {
        await flushUntil(() => {
          beginLandrushPresentationPipelinePrewarmFrame(renderer)
          return state.pipelinePrewarmRequestRevision === index + 1
        })
        expect(ready).toBe(false)
        expect(state.pipelinePrewarmRenderPath).toBe(index === 0 ? 'presentation' : 'direct')
        const visibleFramebufferMeshes: Mesh[] = []
        scene.traverseVisible((object) => {
          if ((object as Mesh).material === framebufferMaterial && framebufferMaterial.visible)
            visibleFramebufferMeshes.push(object as Mesh)
        })
        expect(visibleFramebufferMeshes).toHaveLength(1)
        activeTarget = target
        depth.value = depth.getTextureForReference(target)
        const samples = sampleUtils.getTextureSampleData(depth.value).primarySamples
        shaderSamples.push(samples)
        drawSamples.push(samples)
        activeTarget = fullscreen
        expect(fullscreen.samples).toBe(0)
        activeTarget = null
        state.pipelinePrewarmCameraMatched = true
        state.pipelinePrewarmRenderedCamera = camera
        state.pipelinePrewarmOnRenderSettled?.(index + 1, 'rendered')
      }
      await flushUntil(() => fenceRequested)
      expect(ready).toBe(false)
      expect(shaderSamples).toEqual([4, 4])
      expect(drawSamples).toEqual([4, 4])
      expect(framebufferMaterial.visible).toBe(true)
      expect(water.visible).toBe(true)
      fenceResolve()
      await pending
      expect(ready).toBe(true)
    } finally {
      unregister()
      fenceResolve()
      geometry.dispose()
      regularMaterial.dispose()
      framebufferMaterial.dispose()
      presentation.dispose()
      direct.dispose()
      fullscreen.dispose()
    }
  })

  test('restores shared material visibility on a synchronous compilation failure', async () => {
    const material = new MeshBasicMaterial()
    material.userData.landrushFramebufferDrawPreparation = true
    const geometry = new SphereGeometry(1, 4, 3)
    const mesh = new Mesh(geometry, material)
    try {
      await expect(
        compileLandrushRenderRepresentative({
          camera: new PerspectiveCamera(),
          framebufferMaterialsPreparedByDraw: true,
          renderer: {
            compileAsync: () => {
              expect(material.visible).toBe(false)
              throw new Error('compile failed')
            },
          },
          representative: { key: 'fixture', root: mesh },
          targetScene: new Scene(),
        }),
      ).rejects.toThrow('compile failed')
      expect(material.visible).toBe(true)
    } finally {
      geometry.dispose()
      material.dispose()
    }
  })
})

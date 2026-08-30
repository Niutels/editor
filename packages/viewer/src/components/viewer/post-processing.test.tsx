import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { advance, createRoot, reconciler, unmountComponentAtNode } from '@react-three/fiber'
import { act, type ReactNode, StrictMode } from 'react'
import * as THREE from 'three'
import { PassNode, RenderPipeline } from 'three/webgpu'
import { edgeColorFor, edgeOpacityScaleFor } from '../../lib/edge-style'
import useViewer from '../../store/use-viewer'
import PostProcessingPasses, {
  advancePostProcessingBackgroundColor,
  resolvePostProcessingInkColor,
  resolvePostProcessingInkOpacityScale,
  SSGI_PARAMS,
  updatePostProcessingBackdropTargetsFromColor,
  type ViewerPresentationEffectRef,
} from './post-processing'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const previousGpu =
  typeof navigator === 'undefined' ? undefined : Object.getOwnPropertyDescriptor(navigator, 'gpu')

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  if (typeof navigator === 'undefined') {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { gpu: {}, language: 'en-US' },
    })
  } else {
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: {} })
  }
})

afterAll(() => {
  if (previousActEnvironment === undefined) delete actEnvironment.IS_REACT_ACT_ENVIRONMENT
  else actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  if (previousNavigator) {
    if (previousGpu) Object.defineProperty(navigator, 'gpu', previousGpu)
    else Reflect.deleteProperty(navigator, 'gpu')
    Object.defineProperty(globalThis, 'navigator', previousNavigator)
  } else {
    Reflect.deleteProperty(globalThis, 'navigator')
  }
})

type PipelineFrame = {
  cameras: THREE.Camera[]
  culled: boolean[]
  passes: PassNode[]
  pipeline: RenderPipeline
}

let passes: PassNode[]
let textureRequests: Array<{ name: string; pass: PassNode }>
let disposedPasses: PassNode[]
let disposedPipelines: RenderPipeline[]
let frames: PipelineFrame[]
let errors: unknown[][]
let failNextPipelineFrame: boolean
let observedScene: THREE.Scene | null
let restoreSpies: Array<() => void>
let previousViewerState: ReturnType<typeof useViewer.getState>
let previousSsgiEnabled: boolean

beforeEach(() => {
  passes = []
  textureRequests = []
  disposedPasses = []
  disposedPipelines = []
  frames = []
  errors = []
  failNextPipelineFrame = false
  observedScene = null
  restoreSpies = []
  previousViewerState = useViewer.getState()
  previousSsgiEnabled = SSGI_PARAMS.enabled

  const log = spyOn(console, 'log').mockImplementation(() => undefined)
  const warn = spyOn(console, 'warn').mockImplementation(() => undefined)
  const error = spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args)
  })
  restoreSpies.push(
    () => log.mockRestore(),
    () => warn.mockRestore(),
    () => error.mockRestore(),
  )

  const originalGetTextureNode = PassNode.prototype.getTextureNode
  const getTextureNode = spyOn(PassNode.prototype, 'getTextureNode').mockImplementation(function (
    this: PassNode,
    name = 'output',
  ) {
    if (!passes.includes(this)) passes.push(this)
    textureRequests.push({ name, pass: this })
    return originalGetTextureNode.call(this, name)
  })
  const originalPassDispose = PassNode.prototype.dispose
  const passDispose = spyOn(PassNode.prototype, 'dispose').mockImplementation(function (
    this: PassNode,
  ) {
    disposedPasses.push(this)
    originalPassDispose.call(this)
  })
  const originalPipelineDispose = RenderPipeline.prototype.dispose
  const pipelineDispose = spyOn(RenderPipeline.prototype, 'dispose').mockImplementation(function (
    this: RenderPipeline,
  ) {
    disposedPipelines.push(this)
    originalPipelineDispose.call(this)
  })
  const render = spyOn(RenderPipeline.prototype, 'render').mockImplementation(function (
    this: RenderPipeline,
  ) {
    const livePasses = passes.filter((pass) => !disposedPasses.includes(pass))
    const culled: boolean[] = []
    observedScene?.traverse((object) => {
      if (object instanceof THREE.Mesh) culled.push(object.frustumCulled)
    })
    frames.push({
      cameras: livePasses.map((pass) => pass.camera),
      culled,
      passes: [...livePasses],
      pipeline: this,
    })
    if (failNextPipelineFrame) {
      failNextPipelineFrame = false
      throw new Error('injected presentation render failure')
    }
  })
  restoreSpies.push(
    () => getTextureNode.mockRestore(),
    () => passDispose.mockRestore(),
    () => pipelineDispose.mockRestore(),
    () => render.mockRestore(),
  )
  useViewer.setState({
    edges: 'soft',
    outliner: { hoveredObjects: [], selectedObjects: [] },
    projectId: 'post-processing-lifecycle-test',
    shading: 'rendered',
    transparentBackground: false,
  })
  SSGI_PARAMS.enabled = true
})

afterEach(() => {
  try {
    useViewer.setState(previousViewerState, true)
    SSGI_PARAMS.enabled = previousSsgiEnabled
  } finally {
    for (const restore of restoreSpies.reverse()) restore()
  }
})

function presentationRef(amount = 0): ViewerPresentationEffectRef {
  return {
    current: { zoomBlurAmount: amount, zoomBlurDirection: 1, zoomBlurStrength: 1 },
  }
}

async function createPresentationRoot({ strict = false } = {}) {
  const canvas = new EventTarget() as unknown as HTMLCanvasElement
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  const alwaysUnculledMesh = new THREE.Mesh(mesh.geometry, mesh.material)
  alwaysUnculledMesh.frustumCulled = false
  scene.add(mesh, alwaysUnculledMesh)
  observedScene = scene
  const directDraws: Array<{ camera: THREE.Camera; culled: boolean[]; scene: THREE.Scene }> = []
  const boundTargets: unknown[] = []
  const clearColors: number[] = []
  const renderer = {
    render(drawnScene: THREE.Scene, drawnCamera: THREE.Camera) {
      const culled: boolean[] = []
      drawnScene.traverseVisible((object) => {
        if (object instanceof THREE.Mesh) culled.push(object.frustumCulled)
      })
      directDraws.push({ camera: drawnCamera, culled, scene: drawnScene })
    },
    setClearAlpha() {},
    setClearColor(color: THREE.Color) {
      clearColors.push(color.getHex())
    },
    setPixelRatio() {},
    setRenderTarget(target: unknown) {
      boundTargets.push(target)
    },
    setSize() {},
  }

  const createContainer = reconciler.createContainer
  // R3F hardcodes a non-strict root; a nested StrictMode does not replay initial effects.
  const strictContainer = strict
    ? spyOn(reconciler, 'createContainer').mockImplementation((...args) => {
        args[3] = true
        return createContainer.apply(reconciler, args)
      })
    : null
  let root: ReturnType<typeof createRoot>
  try {
    root = createRoot(canvas)
  } finally {
    strictContainer?.mockRestore()
  }
  await root.configure({
    camera,
    dpr: 1,
    frameloop: 'never',
    gl: renderer as unknown as THREE.WebGLRenderer,
    scene,
    size: { height: 64, left: 0, top: 0, width: 64 },
  })
  let store: ReturnType<typeof root.render> | undefined
  let timestamp = 0
  const state = () => {
    if (!store) throw new Error('The test root has not mounted')
    return store.getState()
  }
  return {
    alwaysUnculledMesh,
    boundTargets,
    camera,
    clearColors,
    directDraws,
    mesh,
    scene,
    state,
    frame() {
      timestamp += 1 / 60
      advance(timestamp, false, state())
    },
    async render(children: ReactNode) {
      await act(async () => {
        store = root.render(children)
      })
    },
    async setCamera(nextCamera: THREE.Camera) {
      await act(async () => {
        state().set({ camera: nextCamera })
      })
    },
    async setSize(width: number, height: number) {
      await act(async () => {
        state().setSize(width, height)
      })
    },
    async dispose() {
      let finish!: () => void
      const disposed = new Promise<void>((resolve) => {
        finish = resolve
      })
      await act(async () => {
        unmountComponentAtNode(canvas, finish)
      })
      await disposed
      mesh.geometry.dispose()
      mesh.material.dispose()
    },
  }
}

async function elapseRetryDelay() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 550))
  })
}

describe('post-processing background frame work', () => {
  test('updates preallocated backdrop colors from a live mutable scene color', () => {
    const live = new THREE.Color('#164a77')
    const background = new THREE.Color()
    const sky = new THREE.Color()
    const haze = new THREE.Color()
    const skyDeep = new THREE.Color()

    updatePostProcessingBackdropTargetsFromColor(live, background, sky, haze, skyDeep)
    const targets = [background, sky, haze, skyDeep]
    expect(background.equals(live)).toBe(true)
    expect(sky.equals(live)).toBe(true)
    const firstHaze = haze.getHex()
    const firstDeep = skyDeep.getHex()

    live.set('#020611')
    updatePostProcessingBackdropTargetsFromColor(live, background, sky, haze, skyDeep)
    expect([background, sky, haze, skyDeep]).toEqual(targets)
    expect(background.equals(live)).toBe(true)
    expect(haze.getHex()).not.toBe(firstHaze)
    expect(skyDeep.getHex()).not.toBe(firstDeep)
  })

  test('uses each in-place scene-background transition color for direct presentation frames', async () => {
    const host = await createPresentationRoot()
    const live = new THREE.Color('#164a77')
    host.scene.background = live
    try {
      await host.render(<PostProcessingPasses disablePostFx />)
      host.frame()
      expect(host.clearColors.at(-1)).toBe(live.getHex())

      live.set('#020611')
      host.frame()
      expect(host.clearColors.at(-1)).toBe(live.getHex())
    } finally {
      await host.dispose()
    }
  })

  test('preserves the authored ink style without allocating intermediate color strings', () => {
    for (const background of ['#f2eee5', '#53708c', '#07111f', '#000000', '#ffffff']) {
      const color = new THREE.Color(background)
      expect(resolvePostProcessingInkColor(color)).toBe(
        Number.parseInt(edgeColorFor(`#${color.getHexString()}`).slice(1), 16),
      )
      expect(resolvePostProcessingInkOpacityScale(color)).toBe(
        edgeOpacityScaleFor(`#${color.getHexString()}`),
      )
    }
  })

  test('does no color work after a background target converges', () => {
    const target = new THREE.Color('#07111f')
    const current = new THREE.Color('#f2eee5')
    let advancedFrames = 0
    for (let frame = 0; frame < 1_000; frame += 1) {
      if (advancePostProcessingBackgroundColor(current, target, 1 / 60)) advancedFrames += 1
    }
    expect(current.equals(target)).toBe(true)
    expect(advancedFrames).toBeLessThan(300)
    expect(advancePostProcessingBackgroundColor(current, target, 1 / 60)).toBe(false)
  })
})

describe('presentation-only post-processing camera lifecycle', () => {
  test('keeps the warmed presentation context active on a zero-amount transition boundary', async () => {
    const host = await createPresentationRoot()
    const effect = presentationRef()
    try {
      await host.render(<PostProcessingPasses disablePostFx presentationEffectRef={effect} />)
      for (let index = 0; index < 12; index += 1) host.frame()
      host.frame()
      expect(frames).toHaveLength(12)
      expect(host.directDraws).toHaveLength(1)

      effect.current.zoomBlurActive = true
      effect.current.zoomBlurAmount = 0
      host.frame()
      expect(frames).toHaveLength(13)
      expect(host.directDraws).toHaveLength(1)

      effect.current.zoomBlurActive = false
      host.frame()
      expect(frames).toHaveLength(13)
      expect(host.directDraws).toHaveLength(2)
      expect(errors).toEqual([])
    } finally {
      await host.dispose()
    }
  })

  test('keeps the warmed presentation context active for an externally armed camera handoff', async () => {
    const host = await createPresentationRoot()
    const effect = presentationRef()
    try {
      await host.render(<PostProcessingPasses disablePostFx presentationEffectRef={effect} />)
      for (let index = 0; index < 12; index += 1) host.frame()
      host.frame()
      expect(frames).toHaveLength(12)
      expect(host.directDraws).toHaveLength(1)

      effect.current.presentationPipelineActive = true
      host.frame()
      expect(frames).toHaveLength(13)
      expect(host.directDraws).toHaveLength(1)

      effect.current.presentationPipelineActive = false
      host.frame()
      expect(frames).toHaveLength(13)
      expect(host.directDraws).toHaveLength(2)
      expect(errors).toEqual([])
    } finally {
      await host.dispose()
    }
  })

  test('acknowledges a pending pipeline prewarm only after the real presentation pipeline renders', async () => {
    const host = await createPresentationRoot()
    const effect = presentationRef()
    const settlements: Array<readonly [number, 'failed' | 'rendered']> = []
    effect.current.pipelinePrewarmOnRenderSettled = (revision, outcome) => {
      settlements.push([revision, outcome])
    }
    try {
      await host.render(<PostProcessingPasses disablePostFx presentationEffectRef={effect} />)
      for (let index = 0; index < 12; index += 1) host.frame()
      host.frame()
      expect(host.directDraws).toHaveLength(1)

      effect.current.pipelinePrewarmRequestRevision = 7
      host.frame()
      expect(frames).toHaveLength(13)
      expect(effect.current.pipelinePrewarmRenderedRevision).toBe(7)
      expect(effect.current.pipelinePrewarmRenderedCamera).toBe(host.camera)
      expect(effect.current.pipelinePrewarmCameraMatched).toBe(true)
      expect(effect.current.pipelinePrewarmFailedRevision).toBeUndefined()
      expect(settlements).toEqual([[7, 'rendered']])
      expect(host.directDraws).toHaveLength(1)

      host.frame()
      expect(frames).toHaveLength(13)
      expect(host.directDraws).toHaveLength(2)
      expect(errors).toEqual([])
    } finally {
      await host.dispose()
    }
  })

  test('acknowledges an exact direct prewarm frame with the requested camera and unculled scene', async () => {
    const host = await createPresentationRoot()
    const effect = presentationRef()
    const zombieCamera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.5, 400)
    const settlements: Array<readonly [number, 'failed' | 'rendered']> = []
    effect.current.pipelinePrewarmOnRenderSettled = (revision, outcome) => {
      settlements.push([revision, outcome])
      effect.current.pipelinePrewarmCamera = undefined
      effect.current.pipelinePrewarmRenderPath = undefined
    }
    try {
      await host.render(<PostProcessingPasses disablePostFx presentationEffectRef={effect} />)
      for (let index = 0; index < 12; index += 1) host.frame()
      host.frame()
      expect(host.directDraws).toHaveLength(1)

      effect.current.pipelinePrewarmCamera = zombieCamera
      effect.current.pipelinePrewarmRenderPath = 'direct'
      effect.current.pipelinePrewarmRequestRevision = 11
      host.frame()

      expect(frames).toHaveLength(12)
      expect(host.directDraws).toHaveLength(2)
      expect(host.directDraws.at(-1)?.camera).toBe(zombieCamera)
      expect(host.directDraws.at(-1)?.culled).toEqual([false, false])
      expect(effect.current.pipelinePrewarmRenderedRevision).toBe(11)
      expect(effect.current.pipelinePrewarmRenderedCamera).toBe(zombieCamera)
      expect(effect.current.pipelinePrewarmCameraMatched).toBe(true)
      expect(settlements).toEqual([[11, 'rendered']])

      host.frame()
      expect(host.directDraws.at(-1)?.camera).toBe(host.camera)
      expect(host.directDraws.at(-1)?.culled).toEqual([true, false])
      expect(errors).toEqual([])
    } finally {
      await host.dispose()
    }
  })

  test('uses a pending prewarm camera only for the hidden render pass', async () => {
    const host = await createPresentationRoot()
    const effect = presentationRef()
    const zombieCamera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.5, 400)
    effect.current.pipelinePrewarmOnRenderSettled = () => {
      effect.current.pipelinePrewarmCamera = undefined
    }
    try {
      await host.render(<PostProcessingPasses disablePostFx presentationEffectRef={effect} />)
      for (let index = 0; index < 12; index += 1) host.frame()
      host.frame()
      expect(host.directDraws.at(-1)?.camera).toBe(host.camera)

      effect.current.pipelinePrewarmCamera = zombieCamera
      effect.current.pipelinePrewarmRequestRevision = 9
      host.frame()
      expect(frames.at(-1)?.cameras).toEqual([zombieCamera])
      expect(frames.at(-1)?.culled).toEqual([false, false])
      expect(effect.current.pipelinePrewarmRenderedCamera).toBe(zombieCamera)
      expect(effect.current.pipelinePrewarmCameraMatched).toBe(true)
      expect(host.state().camera).toBe(host.camera)
      expect(effect.current.pipelinePrewarmCamera).toBeUndefined()

      host.frame()
      expect(host.directDraws.at(-1)?.camera).toBe(host.camera)
      expect(host.directDraws.at(-1)?.culled).toEqual([true, false])
      expect(errors).toEqual([])
    } finally {
      await host.dispose()
    }
  })

  test('does not falsely acknowledge a failed pending pipeline prewarm render', async () => {
    const host = await createPresentationRoot()
    const effect = presentationRef()
    const settlements: Array<readonly [number, 'failed' | 'rendered']> = []
    effect.current.pipelinePrewarmOnRenderSettled = (revision, outcome) => {
      settlements.push([revision, outcome])
    }
    try {
      await host.render(<PostProcessingPasses disablePostFx presentationEffectRef={effect} />)
      for (let index = 0; index < 12; index += 1) host.frame()
      host.frame()
      effect.current.pipelinePrewarmRequestRevision = 8
      failNextPipelineFrame = true
      host.frame()

      expect(frames).toHaveLength(13)
      expect(effect.current.pipelinePrewarmRenderedRevision).toBeUndefined()
      expect(effect.current.pipelinePrewarmRenderedCamera).toBeUndefined()
      expect(effect.current.pipelinePrewarmCameraMatched).toBe(false)
      expect(effect.current.pipelinePrewarmFailedRevision).toBe(8)
      expect(settlements).toEqual([[8, 'failed']])
      expect(errors).toHaveLength(1)
      expect(disposedPipelines).toHaveLength(1)
    } finally {
      await host.dispose()
    }
  })

  test('retains the color graph across perspective/orthographic handoffs without rearming its twelve warmup frames', async () => {
    const host = await createPresentationRoot()
    const effect = presentationRef()
    try {
      await host.render(<PostProcessingPasses disablePostFx presentationEffectRef={effect} />)
      expect(passes).toHaveLength(1)
      const pass = passes[0]!
      expect(pass.camera).toBe(host.camera)
      expect(pass.renderTarget.depthBuffer).toBe(true)
      for (let index = 0; index < 12; index += 1) {
        host.frame()
        expect(host.mesh.frustumCulled).toBe(true)
        expect(host.alwaysUnculledMesh.frustumCulled).toBe(false)
      }
      expect(frames).toHaveLength(12)
      expect(frames.every((frame) => frame.culled.every((culled) => !culled))).toBe(true)
      const pipeline = frames[0]!.pipeline
      host.frame()
      expect(host.directDraws).toHaveLength(1)

      const orthographic = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.5, 400)
      const perspective = new THREE.PerspectiveCamera(48, 1, 0.3, 800)
      for (const camera of [orthographic, perspective]) {
        await host.setCamera(camera)
        host.frame()
        expect(frames).toHaveLength(12)
        expect(host.directDraws.at(-1)?.camera).toBe(camera)
        expect(passes).toEqual([pass])
        expect(disposedPasses).toEqual([])
        expect(disposedPipelines).toEqual([])
      }

      effect.current.zoomBlurAmount = 0.6
      for (const camera of [orthographic, perspective]) {
        await host.setCamera(camera)
        host.frame()
        expect(frames.at(-1)?.pipeline).toBe(pipeline)
        expect(frames.at(-1)?.passes).toEqual([pass])
        expect(frames.at(-1)?.cameras).toEqual([camera])
        expect(frames.at(-1)?.culled).toEqual([true, false])
      }
      expect(textureRequests.map(({ name }) => name)).toEqual(['output'])
      expect(errors).toEqual([])
    } finally {
      await host.dispose()
    }
    expect(disposedPasses).toEqual(passes)
    expect(disposedPipelines).toHaveLength(1)
  })

  test('visible scene growth never rearms zero-blur warmup, while real blur uses the new geometry', async () => {
    const host = await createPresentationRoot()
    const effect = presentationRef()
    const revealedMesh = new THREE.Mesh(host.mesh.geometry, host.mesh.material)
    revealedMesh.visible = false
    host.scene.add(revealedMesh)
    const newMesh = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial())
    let clock: ReturnType<typeof spyOn<typeof performance, 'now'>> | undefined
    try {
      await host.render(<PostProcessingPasses disablePostFx presentationEffectRef={effect} />)
      for (let index = 0; index < 12; index += 1) host.frame()
      expect(frames).toHaveLength(12)
      const pipeline = frames[0]!.pipeline
      const pass = passes[0]!
      let now = performance.now() + 1000
      clock = spyOn(performance, 'now').mockImplementation(() => now)

      revealedMesh.visible = true
      host.frame()
      expect(frames).toHaveLength(12)
      expect(host.directDraws.at(-1)?.culled).toEqual([true, false, true])
      host.scene.add(newMesh)
      now += 1000
      host.frame()
      expect(frames).toHaveLength(12)
      expect(host.directDraws.at(-1)?.culled).toEqual([true, false, true, true])
      expect(passes).toEqual([pass])
      expect(disposedPipelines).toEqual([])

      effect.current.zoomBlurAmount = 0.6
      host.frame()
      expect(frames).toHaveLength(13)
      expect(frames.at(-1)?.pipeline).toBe(pipeline)
      expect(frames.at(-1)?.passes).toEqual([pass])
      expect(frames.at(-1)?.culled).toEqual([true, false, true, true])
      expect(pass.scene).toBe(host.scene)
      expect(pass.scene.getObjectById(revealedMesh.id)).toBe(revealedMesh)
      expect(pass.scene.getObjectById(newMesh.id)).toBe(newMesh)

      effect.current.zoomBlurAmount = 0
      now += 1000
      host.frame()
      expect(frames).toHaveLength(13)
      expect(host.directDraws).toHaveLength(3)
      expect(host.directDraws.at(-1)?.culled).toEqual([true, false, true, true])
      expect(errors).toEqual([])
    } finally {
      clock?.mockRestore()
      await host.dispose()
      newMesh.geometry.dispose()
      newMesh.material.dispose()
    }
    expect(disposedPasses).toEqual(passes)
    expect(disposedPipelines).toHaveLength(1)
  })

  test('uses the frame-state camera even before React commits the camera-store update', async () => {
    const host = await createPresentationRoot()
    try {
      await host.render(
        <PostProcessingPasses disablePostFx presentationEffectRef={presentationRef(1)} />,
      )
      host.frame()
      const pipeline = frames[0]!.pipeline
      const orthographic = new THREE.OrthographicCamera(-2, 2, 2, -2, 2, 200)
      await act(async () => {
        host.state().set({ camera: orthographic })
        host.frame()
        expect(frames.at(-1)?.cameras).toEqual([orthographic])
      })
      expect(frames.at(-1)?.pipeline).toBe(pipeline)
      expect(passes).toHaveLength(1)
      expect(disposedPipelines).toEqual([])
      expect(errors).toEqual([])
    } finally {
      await host.dispose()
    }
  })

  test('still reconstructs the depth/AO/outline graph when its camera changes', async () => {
    const host = await createPresentationRoot()
    try {
      await host.render(<PostProcessingPasses />)
      host.frame()
      const firstPipeline = frames[0]!.pipeline
      const firstPassCount = passes.length
      expect(firstPassCount).toBeGreaterThanOrEqual(2)
      expect(textureRequests.map(({ name }) => name)).toContain('depth')
      expect(textureRequests.map(({ name }) => name)).toContain('diffuseColor')
      expect(disposedPipelines).toEqual([])

      const orthographic = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.2, 300)
      await host.setCamera(orthographic)
      expect(disposedPipelines).toEqual([firstPipeline])
      expect(passes.length).toBeGreaterThan(firstPassCount)
      expect(passes.slice(firstPassCount).every((pass) => pass.camera === orthographic)).toBe(true)
      host.frame()
      const secondPipeline = frames.at(-1)!.pipeline
      expect(secondPipeline).not.toBe(firstPipeline)
      expect(host.directDraws).toEqual([])
      await host.setCamera(host.camera)
      host.frame()
      expect(disposedPipelines).toEqual([firstPipeline, secondPipeline])
      expect(frames.at(-1)?.pipeline).not.toBe(secondPipeline)
      expect(errors).toEqual([])
    } finally {
      await host.dispose()
    }
    expect(disposedPipelines).toHaveLength(3)
  })

  test('rebuilds on resize and DPR changes, then rebuilds from the latest camera after a zero-size pause', async () => {
    const host = await createPresentationRoot()
    try {
      await host.render(
        <PostProcessingPasses disablePostFx presentationEffectRef={presentationRef()} />,
      )
      host.frame()
      const firstPass = passes[0]!
      const firstPipeline = frames[0]!.pipeline
      await host.setSize(128, 96)
      expect(disposedPasses).toEqual([firstPass])
      expect(disposedPipelines).toEqual([firstPipeline])
      host.frame()
      const resizedPass = passes[1]!
      expect(frames.at(-1)?.passes).toEqual([resizedPass])

      await act(async () => {
        host.state().setDpr(2)
      })
      host.frame()
      expect(disposedPasses).toEqual([firstPass, resizedPass])
      const highDprPass = passes[2]!
      const previousFrameCount = frames.length
      await host.setSize(0, 0)
      host.frame()
      expect(frames).toHaveLength(previousFrameCount)
      expect(disposedPasses).toEqual([firstPass, resizedPass, highDprPass])

      const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 40)
      await host.setCamera(orthographic)
      expect(passes).toHaveLength(3)
      await host.setSize(64, 64)
      expect(passes).toHaveLength(4)
      expect(passes[3]?.camera).toBe(orthographic)
      host.frame()
      expect(frames.at(-1)?.passes).toEqual([passes[3]!])
      expect(frames.at(-1)?.cameras).toEqual([orthographic])
      expect(firstPass.camera).toBe(host.camera)
      expect(errors).toEqual([])
    } finally {
      await host.dispose()
    }
    expect(disposedPasses).toEqual(passes)
    expect(disposedPipelines).toHaveLength(4)
  })

  test('retries a failed graph with the current camera and restores culling before falling back', async () => {
    const host = await createPresentationRoot()
    try {
      await host.render(
        <PostProcessingPasses disablePostFx presentationEffectRef={presentationRef()} />,
      )
      failNextPipelineFrame = true
      host.frame()
      const failedPipeline = frames[0]!.pipeline
      const failedPass = passes[0]!
      expect(disposedPipelines).toEqual([failedPipeline])
      expect(host.mesh.frustumCulled).toBe(true)
      expect(host.alwaysUnculledMesh.frustumCulled).toBe(false)
      expect(host.boundTargets).toEqual([null])

      const orthographic = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.4, 120)
      await host.setCamera(orthographic)
      host.frame()
      expect(host.directDraws.at(-1)?.camera).toBe(orthographic)
      expect(passes).toEqual([failedPass])
      await elapseRetryDelay()
      expect(disposedPasses).toEqual([failedPass])
      expect(passes).toHaveLength(2)
      expect(passes[1]?.camera).toBe(orthographic)
      host.frame()
      expect(frames.at(-1)?.pipeline).not.toBe(failedPipeline)
      expect(frames.at(-1)?.passes).toEqual([passes[1]!])
      expect(frames.at(-1)?.cameras).toEqual([orthographic])
      expect(failedPass.camera).toBe(host.camera)
      expect(errors).toHaveLength(1)
      expect(errors[0]?.[0]).toBe('[viewer/post-processing] Render pass failed.')
    } finally {
      await host.dispose()
    }
    expect(disposedPasses).toEqual(passes)
    expect(disposedPipelines).toHaveLength(2)
  })

  test('cancels a pending retry on unmount and cannot retarget a disposed pass after remount', async () => {
    const host = await createPresentationRoot()
    const effect = presentationRef()
    try {
      await host.render(<PostProcessingPasses disablePostFx presentationEffectRef={effect} />)
      failNextPipelineFrame = true
      host.frame()
      const failedPass = passes[0]!
      await host.render(null)
      expect(disposedPasses).toEqual([failedPass])
      const orthographic = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.6, 180)
      await host.setCamera(orthographic)
      await elapseRetryDelay()
      expect(passes).toEqual([failedPass])
      expect(frames).toHaveLength(1)
      await host.render(<PostProcessingPasses disablePostFx presentationEffectRef={effect} />)
      host.frame()
      expect(passes).toHaveLength(2)
      expect(frames.at(-1)?.passes).toEqual([passes[1]!])
      expect(frames.at(-1)?.cameras).toEqual([orthographic])
      expect(failedPass.camera).toBe(host.camera)
      expect(errors).toHaveLength(1)
    } finally {
      await host.dispose()
    }
    expect(disposedPasses).toEqual(passes)
    expect(disposedPipelines).toHaveLength(2)
  })

  test('real Strict Effects replay disposes the first graph and retains only the live pass through camera switches', async () => {
    const host = await createPresentationRoot({ strict: true })
    const effect = presentationRef(1)
    try {
      await host.render(
        <StrictMode>
          <PostProcessingPasses disablePostFx presentationEffectRef={effect} />
        </StrictMode>,
      )
      expect(passes).toHaveLength(2)
      expect(disposedPasses).toEqual([passes[0]!])
      expect(disposedPipelines).toHaveLength(1)
      host.frame()
      const livePipeline = frames[0]!.pipeline
      const orthographic = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.5, 240)
      await host.setCamera(orthographic)
      host.frame()
      expect(passes).toHaveLength(2)
      expect(frames.at(-1)?.pipeline).toBe(livePipeline)
      expect(frames.at(-1)?.passes).toEqual([passes[1]!])
      expect(frames.at(-1)?.cameras).toEqual([orthographic])
      expect(passes[0]?.camera).toBe(host.camera)
      expect(errors).toEqual([])
    } finally {
      await host.dispose()
    }
    expect(disposedPasses).toEqual(passes)
    expect(disposedPipelines).toHaveLength(2)
    expect(new Set(disposedPipelines).size).toBe(2)
  })
})

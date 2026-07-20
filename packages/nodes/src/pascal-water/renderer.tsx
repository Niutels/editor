'use client'

import { type PascalWaterNode, useRegistry } from '@pascal-app/core'
import { renderScheduler } from '@pascal-app/viewer'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type DataTexture,
  DoubleSide,
  type Group,
  LineBasicMaterial,
  type Material,
  MeshBasicMaterial,
  ShapeGeometry,
  Line as ThreeLine,
  Vector2,
} from 'three'
import { color, float, positionWorld, texture, uniform } from 'three/tsl'
import { MeshBasicNodeMaterial, type WebGPURenderer } from 'three/webgpu'
import {
  createLandrushWaterMaterial,
  LANDRUSH_WATER_SURFACE_ELEVATION,
  LANDRUSH_WATER_SURFACE_PARAMETERS,
  type LandrushWaterSurfaceMaterial,
  type LandrushWaterSurfaceParameters,
} from '../landrush-world/water-surface'
import { registerPascalWaterMaterialControls } from './material-controls'
import {
  createPascalWaterBounds,
  createPascalWaterCliffFootprintGeometry,
  createPascalWaterCliffRingGeometry,
  createPascalWaterCliffSandCoveragePerimeter,
  createPascalWaterLandSurface,
  lineLoopGeometryFromPoints,
  PASCAL_WATER_LOW_ELEVATION,
  PASCAL_WATER_SAND_ELEVATION,
  shapeFromPoints,
  waterShapeWithHole,
} from './surface-geometry'
import {
  createPascalWaterDepthReferencePerimeter,
  createPascalWaterFieldTexture,
  createPascalWaterFieldTextureData,
  createPascalWaterFieldTextureFromData,
  createPascalWaterSmoothedPerimeter,
  PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH,
  type PascalWaterFieldParameters,
  type PascalWaterFieldTextureData,
  type PascalWaterPoint2,
} from './water-field'

const PASCAL_WATER_FALLBACK_MATERIAL = new MeshBasicMaterial({
  color: '#39a8cb',
  opacity: 0.86,
  transparent: true,
})
PASCAL_WATER_FALLBACK_MATERIAL.userData.__pascalSkipMaterialHighlight = true

const PASCAL_WATER_DEBUG_FIELD_WORKER_MODE = 'cached-worker'
const PASCAL_WATER_FIELD_WORKER_URL =
  '/landrush-lab/pascal-water-field-worker.js?continuous-coastal-depth=1'
const PASCAL_WATER_COASTAL_FOAM_OVERLAY_REACH_METERS = 2.5

type PascalWaterStartupProfileLike = {
  spans: Array<{ durationMs: number; id: string; startMs: number }>
  startedAt: number
}

type PascalWaterFieldTextureRequest = {
  interiorDepthIsDeep?: boolean
  parameters: Partial<PascalWaterFieldParameters>
  perimeter: readonly PascalWaterPoint2[]
  planeSize: number
  resolution?: number
}

type PascalWaterFieldWorkerCompleteMessage = {
  bytes: ArrayBuffer
  height: number
  id: string
  type: 'complete'
  width: number
}

type PascalWaterFieldWorkerErrorMessage = {
  id: string
  message: string
  type: 'error'
}

const pascalWaterFieldDataCache = new Map<string, PascalWaterFieldTextureData>()
const pascalWaterFieldDataPending = new Map<string, Promise<PascalWaterFieldTextureData>>()

function roundPascalWaterRendererPerf(value: number) {
  return Math.round(value * 1000) / 1000
}

function pushPascalWaterRendererStartupSpan(id: string, startedAt: number) {
  if (typeof performance === 'undefined') return
  const profile = (
    globalThis as typeof globalThis & {
      __PASCAL_WATER_STARTUP_PROFILE__?: PascalWaterStartupProfileLike
    }
  ).__PASCAL_WATER_STARTUP_PROFILE__
  if (!profile) return

  profile.spans.push({
    durationMs: roundPascalWaterRendererPerf(performance.now() - startedAt),
    id,
    startMs: roundPascalWaterRendererPerf(startedAt - profile.startedAt),
  })
}

function measurePascalWaterRendererStartup<T>(id: string, callback: () => T) {
  if (typeof performance === 'undefined') return callback()
  const startedAt = performance.now()
  try {
    return callback()
  } finally {
    pushPascalWaterRendererStartupSpan(id, startedAt)
  }
}

type PascalWaterDisposableGpuResource = {
  dispose: () => void
}

type PascalWaterGpuQueue = {
  onSubmittedWorkDone?: () => Promise<void>
}

type PascalWaterPendingGpuDisposal = {
  cancelled: boolean
}

const pascalWaterGpuLifecycleGlobal = globalThis as typeof globalThis & {
  __PASCAL_WATER_PENDING_GPU_DISPOSALS__?: WeakMap<
    PascalWaterDisposableGpuResource,
    PascalWaterPendingGpuDisposal
  >
}
const pascalWaterPendingGpuDisposals =
  pascalWaterGpuLifecycleGlobal.__PASCAL_WATER_PENDING_GPU_DISPOSALS__ ??
  new WeakMap<PascalWaterDisposableGpuResource, PascalWaterPendingGpuDisposal>()
pascalWaterGpuLifecycleGlobal.__PASCAL_WATER_PENDING_GPU_DISPOSALS__ =
  pascalWaterPendingGpuDisposals

function usePascalWaterGpuResourceLifecycle(
  resource: PascalWaterDisposableGpuResource | null | undefined,
  renderer?: unknown,
) {
  useEffect(() => {
    if (!resource) return

    // Development effect replay retains memoized resources after invoking cleanup once.
    const pendingDisposal = pascalWaterPendingGpuDisposals.get(resource)
    if (pendingDisposal) {
      pendingDisposal.cancelled = true
      pascalWaterPendingGpuDisposals.delete(resource)
    }

    return () => disposePascalWaterGpuResourceLater(resource, renderer)
  }, [renderer, resource])
}

function disposePascalWaterGpuResourceLater(
  resource: PascalWaterDisposableGpuResource | null | undefined,
  renderer?: unknown,
) {
  if (!resource) return
  const pendingDisposal: PascalWaterPendingGpuDisposal = { cancelled: false }
  pascalWaterPendingGpuDisposals.set(resource, pendingDisposal)
  const dispose = () => {
    if (
      pendingDisposal.cancelled ||
      pascalWaterPendingGpuDisposals.get(resource) !== pendingDisposal
    ) {
      return
    }
    pascalWaterPendingGpuDisposals.delete(resource)
    resource.dispose()
  }
  const disposeAfterRender = () => {
    const queue = (
      renderer as { backend?: { device?: { queue?: PascalWaterGpuQueue } } } | null | undefined
    )?.backend?.device?.queue
    if (queue?.onSubmittedWorkDone) {
      void queue.onSubmittedWorkDone().then(dispose, dispose)
      return
    }
    dispose()
  }
  disposePascalWaterGpuResourceAfterFrames(disposeAfterRender)
}

function disposePascalWaterGpuResourceAfterFrames(dispose: () => void) {
  if (typeof requestAnimationFrame !== 'function') {
    dispose()
    return
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(dispose)
  })
}

function getPascalWaterFieldDebugMode(node: PascalWaterNode) {
  const metadata = node.metadata as { waterFieldDebugMode?: unknown } | undefined
  return metadata?.waterFieldDebugMode === PASCAL_WATER_DEBUG_FIELD_WORKER_MODE
    ? PASCAL_WATER_DEBUG_FIELD_WORKER_MODE
    : null
}

function usesPascalWaterPlainMaterial(node: PascalWaterNode) {
  const metadata = node.metadata as { profilePlainWaterMaterial?: unknown } | undefined
  return metadata?.profilePlainWaterMaterial === true
}

function createPascalWaterCoastalFoamOverlayMaterial(
  coastalFoamField: DataTexture,
  bounds: ReturnType<typeof createPascalWaterBounds>,
  parameters: LandrushWaterSurfaceParameters,
) {
  const boundsMin = uniform(new Vector2(bounds.minX, bounds.minZ))
  const boundsSize = uniform(new Vector2(bounds.width, bounds.depth))
  const inwardOffset = uniform(parameters.coastalFoamWashInwardOffset)
  const strength = uniform(parameters.coastalFoamStrength)
  const visibility = uniform(parameters.coastalFoamVisibility)
  const textureUv = positionWorld.xz.sub(boundsMin).div(boundsSize).clamp(0, 1)
  const shoreField = texture(coastalFoamField, textureUv).a
  const inwardRatio = inwardOffset
    .mul(10)
    .div(PASCAL_WATER_COASTAL_FOAM_OVERLAY_REACH_METERS)
    .clamp(0, 1)
  const inwardProfile = inwardRatio.mul(inwardRatio).mul(float(3).sub(inwardRatio.mul(2)))
  const alphaThreshold = float(1).sub(inwardProfile)
  const overlayAlpha = shoreField
    .smoothstep(alphaThreshold.sub(0.09), alphaThreshold.add(0.04))
    .mul(strength.clamp(0, 1))
    .mul(visibility.clamp(0, 1))
    .mul(0.96)
  const material = new MeshBasicNodeMaterial({
    colorNode: color('#f7f3df'),
    depthTest: true,
    depthWrite: false,
    opacityNode: overlayAlpha,
    side: DoubleSide,
    transparent: true,
  })
  material.userData.__pascalSkipMaterialHighlight = true
  material.userData.pascalCoastalFoamOverlay = {
    setParameters: (nextParameters: Partial<LandrushWaterSurfaceParameters>) => {
      if (typeof nextParameters.coastalFoamWashInwardOffset === 'number') {
        inwardOffset.value = nextParameters.coastalFoamWashInwardOffset
      }
      if (typeof nextParameters.coastalFoamStrength === 'number') {
        strength.value = nextParameters.coastalFoamStrength
      }
      if (typeof nextParameters.coastalFoamVisibility === 'number') {
        visibility.value = nextParameters.coastalFoamVisibility
      }
    },
  }
  return material
}

function isPascalWaterWebGpuRenderer(renderer: unknown) {
  const backend = (
    renderer as {
      backend?: {
        constructor?: { name?: string }
        device?: unknown
        isWebGPUBackend?: boolean
      }
    }
  ).backend
  return Boolean(
    backend?.device ||
      backend?.isWebGPUBackend === true ||
      backend?.constructor?.name === 'WebGPUBackend',
  )
}

function createPascalWaterFieldTextureRequestKey(request: PascalWaterFieldTextureRequest) {
  return JSON.stringify({
    interiorDepthIsDeep: request.interiorDepthIsDeep,
    parameters: request.parameters,
    perimeter: request.perimeter,
    planeSize: request.planeSize,
    resolution: request.resolution,
  })
}

function createPascalWaterFieldTextureFromCachedData(data: PascalWaterFieldTextureData) {
  return createPascalWaterFieldTextureFromData(new Uint8Array(data.data), data.width, data.height)
}

function createPascalWaterFieldTextureDataSync(
  cacheKey: string,
  request: PascalWaterFieldTextureRequest,
) {
  const data = measurePascalWaterRendererStartup(
    'setup.pascal-water.renderer.water-field-texture-debug-sync-fallback',
    () => createPascalWaterFieldTextureData(request),
  )
  pascalWaterFieldDataCache.set(cacheKey, data)
  return data
}

function loadPascalWaterDebugFieldTextureData(
  cacheKey: string,
  request: PascalWaterFieldTextureRequest,
) {
  const cached = pascalWaterFieldDataCache.get(cacheKey)
  if (cached) return Promise.resolve(cached)

  const pending = pascalWaterFieldDataPending.get(cacheKey)
  if (pending) return pending

  if (typeof Worker === 'undefined') {
    return Promise.resolve(createPascalWaterFieldTextureDataSync(cacheKey, request))
  }

  const startedAt = typeof performance !== 'undefined' ? performance.now() : 0
  const promise = new Promise<PascalWaterFieldTextureData>((resolve, reject) => {
    const worker = new Worker(PASCAL_WATER_FIELD_WORKER_URL)

    worker.onmessage = (
      event: MessageEvent<
        PascalWaterFieldWorkerCompleteMessage | PascalWaterFieldWorkerErrorMessage
      >,
    ) => {
      const message = event.data
      if (!message || message.id !== cacheKey) return

      worker.terminate()
      if (message.type === 'error') {
        reject(new Error(message.message))
        return
      }

      const data = {
        data: new Uint8Array(message.bytes),
        height: message.height,
        width: message.width,
      }
      pascalWaterFieldDataCache.set(cacheKey, data)
      pushPascalWaterRendererStartupSpan(
        'setup.pascal-water.renderer.water-field-texture-debug-worker',
        startedAt,
      )
      resolve(data)
    }

    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'Pascal water field worker failed.'))
    }

    worker.postMessage({
      id: cacheKey,
      interiorDepthIsDeep: request.interiorDepthIsDeep,
      parameters: request.parameters,
      perimeter: request.perimeter,
      planeSize: request.planeSize,
      resolution: request.resolution,
      type: 'generate',
    })
  })
    .catch((error) => {
      console.warn('[pascal-water] Falling back to synchronous debug water field.', error)
      return createPascalWaterFieldTextureDataSync(cacheKey, request)
    })
    .finally(() => {
      pascalWaterFieldDataPending.delete(cacheKey)
    })

  pascalWaterFieldDataPending.set(cacheKey, promise)
  return promise
}

function usePascalWaterDebugFieldTexture({
  enabled,
  interiorDepthIsDeep,
  parameters,
  perimeter,
  planeSize,
  resolution,
}: PascalWaterFieldTextureRequest & { enabled: boolean }) {
  const request = useMemo(
    () => ({ interiorDepthIsDeep, parameters, perimeter, planeSize, resolution }),
    [interiorDepthIsDeep, parameters, perimeter, planeSize, resolution],
  )
  const cacheKey = useMemo(() => createPascalWaterFieldTextureRequestKey(request), [request])
  const [texture, setTexture] = useState<DataTexture | null>(null)

  useEffect(() => {
    if (!enabled) {
      setTexture(null)
      return
    }

    const cached = pascalWaterFieldDataCache.get(cacheKey)
    if (cached) {
      setTexture(createPascalWaterFieldTextureFromCachedData(cached))
      return
    }

    let cancelled = false
    setTexture(null)
    loadPascalWaterDebugFieldTextureData(cacheKey, request).then((data) => {
      if (cancelled) return
      setTexture(createPascalWaterFieldTextureFromCachedData(data))
    })

    return () => {
      cancelled = true
    }
  }, [cacheKey, enabled, request])

  return texture
}

function PascalWaterRenderer({ node }: { node: PascalWaterNode }) {
  const ref = useRef<Group>(null!)
  const renderer = useThree((state) => state.gl)
  const [materialReady, setMaterialReady] = useState(false)
  const profiledWaterFramesRef = useRef(0)
  const plainWaterMaterial = usesPascalWaterPlainMaterial(node)

  useRegistry(node.id, 'pascal-water', ref)

  const shorelinePoints = useMemo(
    () => createPascalWaterSmoothedPerimeter(node.perimeter.points),
    [node.perimeter.points],
  )
  const depthReferencePoints = useMemo(
    () => createPascalWaterDepthReferencePerimeter(shorelinePoints, node.fieldParameters),
    [node.fieldParameters, shorelinePoints],
  )
  const landSurfaceElevationParameters = useMemo(
    () => ({
      contourNoiseFrequency: node.elevationParameters.contourNoiseFrequency,
      contourVariationMeters: node.elevationParameters.contourVariationMeters,
      edgeLiftMeters: node.elevationParameters.edgeLiftMeters,
      innerContourMeters: node.elevationParameters.innerContourMeters,
      outerContourMeters: node.elevationParameters.outerContourMeters,
    }),
    [
      node.elevationParameters.contourNoiseFrequency,
      node.elevationParameters.contourVariationMeters,
      node.elevationParameters.edgeLiftMeters,
      node.elevationParameters.innerContourMeters,
      node.elevationParameters.outerContourMeters,
    ],
  )
  const landSurface = useMemo(
    () =>
      createPascalWaterLandSurface({
        elevationParameters: landSurfaceElevationParameters,
        shorelinePoints,
        waterPlaneSize: node.planeSize,
      }),
    [landSurfaceElevationParameters, node.planeSize, shorelinePoints],
  )
  const cliffSandCoverageParameters = useMemo(
    () => ({
      cliffAverageSlope: node.elevationParameters.cliffAverageSlope,
      cliffLayer1ExtrusionAverageMeters: node.elevationParameters.cliffLayer1ExtrusionAverageMeters,
      cliffLayer1ExtrusionVariationMeters:
        node.elevationParameters.cliffLayer1ExtrusionVariationMeters,
      cliffLayer1ExtrusionVariationDistribution:
        node.elevationParameters.cliffLayer1ExtrusionVariationDistribution,
      cliffLayer2ExtrusionAverageMeters: node.elevationParameters.cliffLayer2ExtrusionAverageMeters,
      cliffLayer2ExtrusionVariationMeters:
        node.elevationParameters.cliffLayer2ExtrusionVariationMeters,
      cliffLayer2ExtrusionVariationDistribution:
        node.elevationParameters.cliffLayer2ExtrusionVariationDistribution,
      cliffLayer3ExtrusionAverageMeters: node.elevationParameters.cliffLayer3ExtrusionAverageMeters,
      cliffLayer3ExtrusionVariationMeters:
        node.elevationParameters.cliffLayer3ExtrusionVariationMeters,
      cliffLayer3ExtrusionVariationDistribution:
        node.elevationParameters.cliffLayer3ExtrusionVariationDistribution,
      cliffSlopeVariation: node.elevationParameters.cliffSlopeVariation,
    }),
    [
      node.elevationParameters.cliffAverageSlope,
      node.elevationParameters.cliffLayer1ExtrusionAverageMeters,
      node.elevationParameters.cliffLayer1ExtrusionVariationMeters,
      node.elevationParameters.cliffLayer1ExtrusionVariationDistribution,
      node.elevationParameters.cliffLayer2ExtrusionAverageMeters,
      node.elevationParameters.cliffLayer2ExtrusionVariationMeters,
      node.elevationParameters.cliffLayer2ExtrusionVariationDistribution,
      node.elevationParameters.cliffLayer3ExtrusionAverageMeters,
      node.elevationParameters.cliffLayer3ExtrusionVariationMeters,
      node.elevationParameters.cliffLayer3ExtrusionVariationDistribution,
      node.elevationParameters.cliffSlopeVariation,
    ],
  )
  const cliffSandCoveragePoints = useMemo(
    () =>
      createPascalWaterCliffSandCoveragePerimeter({
        innerElevation: landSurface.plateauElevation,
        outerElevation: PASCAL_WATER_LOW_ELEVATION,
        parameters: cliffSandCoverageParameters,
        plateauPoints: landSurface.plateauPoints,
        shorelinePoints,
        slopeStartPoints: landSurface.slopeStartPoints,
      }),
    [
      landSurface.plateauElevation,
      landSurface.plateauPoints,
      landSurface.slopeStartPoints,
      cliffSandCoverageParameters,
      shorelinePoints,
    ],
  )
  const waterMaskPerimeterPoints = landSurface.hasElevation
    ? cliffSandCoveragePoints
    : depthReferencePoints
  const waterFieldTextureParameters = useMemo(
    () => ({
      depthContourCollapseMeters: node.fieldParameters.depthContourCollapseMeters,
      depthContourCollapseScale: node.fieldParameters.depthContourCollapseScale,
      depthContourNoiseFrequency: node.fieldParameters.depthContourNoiseFrequency,
      depthContourOffsetMeters: node.fieldParameters.depthContourOffsetMeters,
      depthContourVariationMeters: node.fieldParameters.depthContourVariationMeters,
      shoreBandMeters: node.fieldParameters.shoreBandMeters,
      shoreFeatherMeters: node.fieldParameters.shoreFeatherMeters,
      shoreNoiseFrequency: node.fieldParameters.shoreNoiseFrequency,
      shoreVariationMeters: node.fieldParameters.shoreVariationMeters,
    }),
    [
      node.fieldParameters.depthContourCollapseMeters,
      node.fieldParameters.depthContourCollapseScale,
      node.fieldParameters.depthContourNoiseFrequency,
      node.fieldParameters.depthContourOffsetMeters,
      node.fieldParameters.depthContourVariationMeters,
      node.fieldParameters.shoreBandMeters,
      node.fieldParameters.shoreFeatherMeters,
      node.fieldParameters.shoreNoiseFrequency,
      node.fieldParameters.shoreVariationMeters,
    ],
  )
  const waterFieldDebugMode = getPascalWaterFieldDebugMode(node)
  const debugWaterField = usePascalWaterDebugFieldTexture({
    enabled: waterFieldDebugMode === PASCAL_WATER_DEBUG_FIELD_WORKER_MODE,
    parameters: waterFieldTextureParameters,
    perimeter: shorelinePoints,
    planeSize: node.planeSize,
    resolution: node.terrainFieldResolution,
  })
  const waterField = useMemo(() => {
    if (waterFieldDebugMode === PASCAL_WATER_DEBUG_FIELD_WORKER_MODE) return debugWaterField

    return measurePascalWaterRendererStartup(
      'setup.pascal-water.renderer.water-field-texture',
      () =>
        createPascalWaterFieldTexture({
          parameters: waterFieldTextureParameters,
          perimeter: shorelinePoints,
          planeSize: node.planeSize,
          resolution: node.terrainFieldResolution,
        }),
    )
  }, [
    debugWaterField,
    node.planeSize,
    node.terrainFieldResolution,
    shorelinePoints,
    waterFieldDebugMode,
    waterFieldTextureParameters,
  ])
  const coastalFoamFieldTextureParameters = useMemo(
    () => ({
      ...waterFieldTextureParameters,
      depthContourCollapseMeters: 0,
      depthContourOffsetMeters: 0,
      depthContourVariationMeters: 0,
      shoreBandMeters: 0,
      shoreFeatherMeters: PASCAL_WATER_COASTAL_FOAM_OVERLAY_REACH_METERS,
      shoreVariationMeters: 0,
    }),
    [waterFieldTextureParameters],
  )
  const debugCoastalFoamField = usePascalWaterDebugFieldTexture({
    enabled: waterFieldDebugMode === PASCAL_WATER_DEBUG_FIELD_WORKER_MODE,
    interiorDepthIsDeep: false,
    parameters: coastalFoamFieldTextureParameters,
    perimeter: waterMaskPerimeterPoints,
    planeSize: node.planeSize,
    resolution: node.terrainFieldResolution,
  })
  const coastalFoamField = useMemo(() => {
    if (waterFieldDebugMode === PASCAL_WATER_DEBUG_FIELD_WORKER_MODE) {
      return debugCoastalFoamField
    }

    return measurePascalWaterRendererStartup(
      'setup.pascal-water.renderer.coastal-foam-field-texture',
      () =>
        createPascalWaterFieldTexture({
          interiorDepthIsDeep: false,
          parameters: coastalFoamFieldTextureParameters,
          perimeter: waterMaskPerimeterPoints,
          planeSize: node.planeSize,
          resolution: node.terrainFieldResolution,
        }),
    )
  }, [
    coastalFoamFieldTextureParameters,
    debugCoastalFoamField,
    node.planeSize,
    node.terrainFieldResolution,
    waterFieldDebugMode,
    waterMaskPerimeterPoints,
  ])
  const waterBounds = useMemo(() => createPascalWaterBounds(node.planeSize), [node.planeSize])
  const materialParameters = useMemo(
    () =>
      ({
        ...LANDRUSH_WATER_SURFACE_PARAMETERS,
        ...node.materialParameters,
        depthExponent: node.fieldParameters.depthExponent,
        depthNoiseFrequency: node.fieldParameters.depthNoiseFrequency,
        depthNoiseStrength: node.fieldParameters.depthNoiseStrength,
        depthReach: node.fieldParameters.depthReach,
        depthReferenceReach: PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH,
        edgeFadeDistance: node.fieldParameters.edgeFadeDistance,
      }) as LandrushWaterSurfaceParameters,
    [node.fieldParameters, node.materialParameters],
  )
  const materialParametersRef = useRef(materialParameters)
  materialParametersRef.current = materialParameters
  const coastalFoamOverlayMaterial = useMemo(
    () =>
      coastalFoamField
        ? createPascalWaterCoastalFoamOverlayMaterial(
            coastalFoamField,
            waterBounds,
            materialParametersRef.current,
          )
        : null,
    [coastalFoamField, waterBounds],
  )
  const preservedWindTimeRef = useRef(0)
  const waterMaterial = useMemo<Material>(
    () =>
      measurePascalWaterRendererStartup('setup.pascal-water.renderer.water-material-memo', () => {
        const isWebGpu = isPascalWaterWebGpuRenderer(renderer)
        if (plainWaterMaterial || !isWebGpu || !materialReady || !waterField || !coastalFoamField) {
          return PASCAL_WATER_FALLBACK_MATERIAL
        }

        const material = measurePascalWaterRendererStartup(
          'setup.pascal-water.renderer.create-landrush-water-material',
          () =>
            createLandrushWaterMaterial(
              renderer as unknown as WebGPURenderer,
              waterField,
              waterBounds,
              materialParametersRef.current,
              coastalFoamField,
            ),
        )
        material.userData.__pascalSkipMaterialHighlight = true
        material.userData.landrushWater.wind.localTime.value = preservedWindTimeRef.current
        return material
      }),
    [coastalFoamField, materialReady, plainWaterMaterial, renderer, waterBounds, waterField],
  )
  const appliedMaterialRef = useRef<LandrushWaterSurfaceMaterial | null>(null)
  const appliedMaterialParametersRef = useRef<LandrushWaterSurfaceParameters | null>(null)

  const islandShape = useMemo(() => shapeFromPoints(shorelinePoints), [shorelinePoints])
  const beachShape = useMemo(() => shapeFromPoints(depthReferencePoints), [depthReferencePoints])
  const plateauShape = useMemo(
    () => shapeFromPoints(landSurface.plateauPoints),
    [landSurface.plateauPoints],
  )
  const beachGeometry = useMemo(() => new ShapeGeometry(beachShape), [beachShape])
  const islandGeometry = useMemo(() => new ShapeGeometry(islandShape), [islandShape])
  const plateauGeometry = useMemo(() => new ShapeGeometry(plateauShape), [plateauShape])
  const cliffGeometry = useMemo(
    () =>
      createPascalWaterCliffRingGeometry(
        landSurface.slopeStartPoints,
        landSurface.plateauPoints,
        PASCAL_WATER_LOW_ELEVATION,
        landSurface.plateauElevation,
        node.elevationParameters,
      ),
    [
      landSurface.plateauElevation,
      landSurface.plateauPoints,
      landSurface.slopeStartPoints,
      node.elevationParameters,
    ],
  )
  const cliffSandCoverageGeometry = useMemo(
    () => new ShapeGeometry(shapeFromPoints(cliffSandCoveragePoints)),
    [cliffSandCoveragePoints],
  )
  const maskedWaterShape = useMemo(
    () => waterShapeWithHole(waterMaskPerimeterPoints, node.planeSize),
    [node.planeSize, waterMaskPerimeterPoints],
  )
  const cliffSandFootprintGeometry = useMemo(
    () => createPascalWaterCliffFootprintGeometry(cliffGeometry),
    [cliffGeometry],
  )
  const useSmoothCliffMaterial =
    Math.max(
      node.elevationParameters.cliffBlockDepthMinMeters,
      node.elevationParameters.cliffBlockDepthMaxMeters,
    ) <= 0.001
  const depthReferenceGeometry = useMemo(
    () => lineLoopGeometryFromPoints(depthReferencePoints),
    [depthReferencePoints],
  )
  const depthReferenceMaterial = useMemo(
    () =>
      new LineBasicMaterial({
        color: '#ff4fd8',
        depthTest: false,
        opacity: 0.95,
        transparent: true,
      }),
    [],
  )
  const depthReferenceLine = useMemo(() => {
    const line = new ThreeLine(depthReferenceGeometry, depthReferenceMaterial)
    line.frustumCulled = false
    line.renderOrder = 30
    return line
  }, [depthReferenceGeometry, depthReferenceMaterial])

  usePascalWaterGpuResourceLifecycle(waterField, renderer)
  usePascalWaterGpuResourceLifecycle(coastalFoamField, renderer)
  usePascalWaterGpuResourceLifecycle(coastalFoamOverlayMaterial, renderer)
  usePascalWaterGpuResourceLifecycle(
    waterMaterial === PASCAL_WATER_FALLBACK_MATERIAL ? null : waterMaterial,
    renderer,
  )
  useEffect(() => {
    // TSL/WebGPU water binds generated noise render targets more reliably after mount.
    setMaterialReady(true)
    renderScheduler.requestFrame('geometry:changed')
  }, [])
  useEffect(() => {
    if (waterMaterial === PASCAL_WATER_FALLBACK_MATERIAL) return
    const waterControls = (waterMaterial as LandrushWaterSurfaceMaterial).userData?.landrushWater
    if (!waterControls) return

    const previousParameters = appliedMaterialParametersRef.current
    if (appliedMaterialRef.current !== waterMaterial || !previousParameters) {
      appliedMaterialRef.current = waterMaterial as LandrushWaterSurfaceMaterial
      appliedMaterialParametersRef.current = materialParameters
      return
    }

    const patch = diffPascalWaterMaterialParameters(previousParameters, materialParameters)
    if (Object.keys(patch).length > 0) {
      waterControls.setParameters(patch)
    }
    appliedMaterialRef.current = waterMaterial as LandrushWaterSurfaceMaterial
    appliedMaterialParametersRef.current = materialParameters
  }, [materialParameters, waterMaterial])
  useEffect(() => {
    const overlayControls = coastalFoamOverlayMaterial?.userData?.pascalCoastalFoamOverlay
    overlayControls?.setParameters(materialParameters)
  }, [coastalFoamOverlayMaterial, materialParameters])
  useEffect(() => {
    if (waterMaterial === PASCAL_WATER_FALLBACK_MATERIAL) return
    const waterControls = (waterMaterial as LandrushWaterSurfaceMaterial).userData?.landrushWater
    if (!waterControls) return
    const overlayControls = coastalFoamOverlayMaterial?.userData?.pascalCoastalFoamOverlay

    return registerPascalWaterMaterialControls(node.id, {
      setParameters: (parameters) => {
        waterControls.setParameters(parameters)
        overlayControls?.setParameters(parameters)
      },
    })
  }, [coastalFoamOverlayMaterial, node.id, waterMaterial])
  usePascalWaterGpuResourceLifecycle(beachGeometry, renderer)
  usePascalWaterGpuResourceLifecycle(islandGeometry, renderer)
  usePascalWaterGpuResourceLifecycle(plateauGeometry, renderer)
  usePascalWaterGpuResourceLifecycle(cliffGeometry, renderer)
  usePascalWaterGpuResourceLifecycle(cliffSandCoverageGeometry, renderer)
  usePascalWaterGpuResourceLifecycle(cliffSandFootprintGeometry, renderer)
  usePascalWaterGpuResourceLifecycle(depthReferenceGeometry, renderer)
  usePascalWaterGpuResourceLifecycle(depthReferenceMaterial, renderer)
  useEffect(() => {
    renderScheduler.requestFrame('geometry:changed')
  }, [])

  useFrame((_, delta) => {
    if (node.visible === false || document.visibilityState === 'hidden') return

    const water = (waterMaterial as LandrushWaterSurfaceMaterial).userData?.landrushWater
    const safeDelta = Math.min(Math.max(delta, 0), 0.08)
    if (!water) return

    if (profiledWaterFramesRef.current < 8) {
      const frameIndex = profiledWaterFramesRef.current
      profiledWaterFramesRef.current += 1
      measurePascalWaterRendererStartup(
        `setup.pascal-water.renderer.water-update-frame-${frameIndex}`,
        () => water.update(safeDelta),
      )
    } else {
      water.update(safeDelta)
    }
    preservedWindTimeRef.current = water.wind.localTime.value
  })

  return (
    <group position={node.position} ref={ref} visible={node.visible !== false}>
      {/* Three r184 retains stale vertex buffers when an existing mesh exchanges geometry. */}
      <mesh
        key={`water:${node.maskLandWater ? cliffSandCoverageGeometry.uuid : node.planeSize}`}
        material={waterMaterial}
        position={[0, LANDRUSH_WATER_SURFACE_ELEVATION, 0]}
        renderOrder={1}
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ __pascalSkipMaterialHighlight: true }}
      >
        {node.maskLandWater ? (
          <shapeGeometry args={[maskedWaterShape]} />
        ) : (
          <planeGeometry args={[node.planeSize, node.planeSize, 1, 1]} />
        )}
      </mesh>

      <mesh
        geometry={beachGeometry}
        key={`beach:${beachGeometry.uuid}`}
        position={[0, -0.12, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshBasicMaterial color="#d8cb90" name="pascal-water-beach" side={DoubleSide} />
      </mesh>

      <mesh
        geometry={islandGeometry}
        key={`island-sand:${islandGeometry.uuid}`}
        position={[0, PASCAL_WATER_SAND_ELEVATION, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshBasicMaterial color="#d8cb90" name="pascal-water-island" side={DoubleSide} />
      </mesh>

      {landSurface.hasElevation ? (
        <>
          <mesh
            geometry={cliffSandCoverageGeometry}
            key={`cliff-sand-coverage:${cliffSandCoverageGeometry.uuid}`}
            position={[0, PASCAL_WATER_SAND_ELEVATION + 0.002, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <meshBasicMaterial
              color="#d8cb90"
              name="pascal-water-cliff-sand-coverage"
              side={DoubleSide}
            />
          </mesh>
          {coastalFoamOverlayMaterial ? (
            <mesh
              geometry={cliffSandCoverageGeometry}
              key={`coastal-foam:${cliffSandCoverageGeometry.uuid}:${coastalFoamOverlayMaterial.uuid}`}
              material={coastalFoamOverlayMaterial}
              position={[0, PASCAL_WATER_SAND_ELEVATION + 0.003, 0]}
              renderOrder={3}
              rotation={[-Math.PI / 2, 0, 0]}
              userData={{ __pascalSkipMaterialHighlight: true }}
            />
          ) : null}
          <mesh
            geometry={cliffSandFootprintGeometry}
            key={`cliff-footprint:${cliffSandFootprintGeometry.uuid}`}
            position={[0, PASCAL_WATER_SAND_ELEVATION + 0.004, 0]}
          >
            <meshBasicMaterial
              color="#d8cb90"
              name="pascal-water-cliff-footprint"
              side={DoubleSide}
            />
          </mesh>
          <mesh geometry={cliffGeometry} key={`cliff:${cliffGeometry.uuid}`}>
            {useSmoothCliffMaterial ? (
              <meshBasicMaterial
                color="#8f8774"
                name="pascal-water-cliff-smooth"
                side={DoubleSide}
              />
            ) : (
              <meshBasicMaterial
                name="pascal-water-cliff-stylized"
                side={DoubleSide}
                toneMapped={false}
                vertexColors
              />
            )}
          </mesh>
          <mesh
            geometry={plateauGeometry}
            key={`plateau:${plateauGeometry.uuid}`}
            position={[0, landSurface.plateauElevation, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <meshStandardMaterial color="#6f9844" roughness={0.9} side={DoubleSide} />
          </mesh>
        </>
      ) : (
        <mesh
          geometry={islandGeometry}
          key={`island-grass:${islandGeometry.uuid}`}
          position={[0, PASCAL_WATER_LOW_ELEVATION, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <meshStandardMaterial color="#6f9844" roughness={0.9} side={DoubleSide} />
        </mesh>
      )}

      {node.showDepthReference ? <primitive object={depthReferenceLine} /> : null}
    </group>
  )
}

function diffPascalWaterMaterialParameters(
  previousParameters: LandrushWaterSurfaceParameters,
  nextParameters: LandrushWaterSurfaceParameters,
) {
  const patch: Partial<LandrushWaterSurfaceParameters> = {}
  const keys = Object.keys(nextParameters) as Array<keyof LandrushWaterSurfaceParameters>
  for (const key of keys) {
    if (previousParameters[key] !== nextParameters[key]) {
      patch[key] = nextParameters[key] as never
    }
  }
  return patch
}

export default PascalWaterRenderer

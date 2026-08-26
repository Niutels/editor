import type { PascalWaterLandSurface } from '@landrush/pascal-plugin'
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  Sphere,
  UnsignedByteType,
  Vector3,
} from 'three'
import type {
  ProceduralBeachControls,
  ProceduralRockCliffMetrics,
  ProceduralRockCliffPlan,
  ProceduralRockCliffQuality,
  ProceduralRockCliffWallControls,
  ProceduralRockOffshoreControls,
  ProceduralRockToneControls,
} from './procedural-rock-cliff-geometry'
import type { WaterlineInteractionField } from './waterline-interaction-field'

export type ProceduralRockCliffWorkerCompileInput = Readonly<{
  beachControls: ProceduralBeachControls
  cutCount: number
  includeWaterlineInteractionField: boolean
  offshoreControls: ProceduralRockOffshoreControls
  quality: ProceduralRockCliffQuality
  rockScale: number
  seed: number
  surface: PascalWaterLandSurface
  toneControls: ProceduralRockToneControls
  wallControls: ProceduralRockCliffWallControls
  waterSurfaceElevation: number | null
  waterlineElevationRangeMeters: number
  waterlineMaximumDistanceMeters: number
  waterlineResolution: number
}>

type SerializedVector3 = Readonly<{ x: number; y: number; z: number }>

export type SerializedProceduralRockCliffGeometry = Readonly<{
  boundingBox: Readonly<{ maximum: SerializedVector3; minimum: SerializedVector3 }>
  boundingSphere: Readonly<{ center: SerializedVector3; radius: number }>
  colors: Float32Array
  normals: Float32Array
  positions: Float32Array
  userData: Record<string, unknown>
}>

export type SerializedWaterlineInteractionField = Readonly<{
  bounds: WaterlineInteractionField['bounds']
  data: Uint8Array
  elevationMaximumMeters: number
  elevationMinimumMeters: number
  maximumDistanceMeters: number
  referenceElevationMeters: number
  resolution: number
  segmentCount: number
  sliceSegmentCounts: [number, number, number]
  terrainElevationMaximumMeters: number
  terrainElevationMinimumMeters: number
}>

export type SerializedProceduralRockCliffBundle = Readonly<{
  plan: Readonly<{
    coverageGeometry: SerializedProceduralRockCliffGeometry
    geometry: SerializedProceduralRockCliffGeometry
    metrics: ProceduralRockCliffMetrics
    variantGeometry: SerializedProceduralRockCliffGeometry
  }>
  waterlineInteractionField: SerializedWaterlineInteractionField | null
}>

export type ProceduralRockCliffWorkerRequest = Readonly<{
  input: ProceduralRockCliffWorkerCompileInput
  requestId: number
  signature: string
  type: 'compile'
}>

export type ProceduralRockCliffWorkerError = Readonly<{
  message: string
  name: string
  stack?: string
}>

export type ProceduralRockCliffWorkerResponse =
  | Readonly<{
      bundle: SerializedProceduralRockCliffBundle
      ok: true
      requestId: number
      signature: string
    }>
  | Readonly<{
      error: ProceduralRockCliffWorkerError
      ok: false
      requestId: number
      signature: string
    }>

export type ProceduralRockCliffWorkerStatus =
  | Readonly<{ type: 'ready' }>
  | Readonly<{
      requestId: number
      signature: string
      type: 'accepted'
    }>

export function createProceduralRockCliffWorkerSignature(
  input: ProceduralRockCliffWorkerCompileInput,
) {
  return `procedural-rock-cliffs:v1:${JSON.stringify(input)}`
}

export function serializeProceduralRockCliffBundle(
  plan: ProceduralRockCliffPlan,
  waterlineInteractionField: WaterlineInteractionField | null,
): SerializedProceduralRockCliffBundle {
  return {
    plan: {
      coverageGeometry: serializeProceduralRockCliffGeometry(plan.coverageGeometry),
      geometry: serializeProceduralRockCliffGeometry(plan.geometry),
      metrics: plan.metrics,
      variantGeometry: serializeProceduralRockCliffGeometry(plan.variantGeometry),
    },
    waterlineInteractionField: waterlineInteractionField
      ? serializeWaterlineInteractionField(waterlineInteractionField)
      : null,
  }
}

export function restoreProceduralRockCliffBundle(
  bundle: SerializedProceduralRockCliffBundle,
): Readonly<{
  plan: ProceduralRockCliffPlan
  waterlineInteractionField: WaterlineInteractionField | null
}> {
  return {
    plan: {
      coverageGeometry: restoreProceduralRockCliffGeometry(bundle.plan.coverageGeometry),
      geometry: restoreProceduralRockCliffGeometry(bundle.plan.geometry),
      metrics: bundle.plan.metrics,
      variantGeometry: restoreProceduralRockCliffGeometry(bundle.plan.variantGeometry),
    },
    waterlineInteractionField: bundle.waterlineInteractionField
      ? restoreWaterlineInteractionField(bundle.waterlineInteractionField)
      : null,
  }
}

export function resolveProceduralRockCliffWorkerRequest(
  request: ProceduralRockCliffWorkerRequest,
  compile: (input: ProceduralRockCliffWorkerCompileInput) => SerializedProceduralRockCliffBundle,
): ProceduralRockCliffWorkerResponse {
  try {
    const expectedSignature = createProceduralRockCliffWorkerSignature(request.input)
    if (request.signature !== expectedSignature) {
      throw new DOMException(
        'Procedural-rock worker request signature does not match its input.',
        'DataError',
      )
    }
    return {
      bundle: compile(request.input),
      ok: true,
      requestId: request.requestId,
      signature: request.signature,
    }
  } catch (error) {
    return {
      error: normalizeProceduralRockCliffWorkerError(error),
      ok: false,
      requestId: request.requestId,
      signature: request.signature,
    }
  }
}

export function collectProceduralRockCliffWorkerTransferables(
  bundle: SerializedProceduralRockCliffBundle,
) {
  const buffers = new Set<ArrayBuffer>()
  for (const geometry of [
    bundle.plan.coverageGeometry,
    bundle.plan.geometry,
    bundle.plan.variantGeometry,
  ]) {
    for (const array of [geometry.positions, geometry.normals, geometry.colors]) {
      if (array.buffer instanceof ArrayBuffer && array.buffer.byteLength > 0) {
        buffers.add(array.buffer)
      }
    }
  }
  const waterlineData = bundle.waterlineInteractionField?.data
  if (waterlineData?.buffer instanceof ArrayBuffer && waterlineData.buffer.byteLength > 0) {
    buffers.add(waterlineData.buffer)
  }
  return [...buffers]
}

export function normalizeProceduralRockCliffWorkerError(
  error: unknown,
): ProceduralRockCliffWorkerError {
  if (error instanceof Error || error instanceof DOMException) {
    return {
      message: error.message || 'Unknown procedural-rock worker error.',
      name: error.name || 'Error',
      ...(error.stack ? { stack: error.stack } : {}),
    }
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown; name?: unknown; stack?: unknown }
    return {
      message:
        typeof candidate.message === 'string' && candidate.message.length > 0
          ? candidate.message
          : 'Unknown procedural-rock worker error.',
      name:
        typeof candidate.name === 'string' && candidate.name.length > 0 ? candidate.name : 'Error',
      ...(typeof candidate.stack === 'string' && candidate.stack.length > 0
        ? { stack: candidate.stack }
        : {}),
    }
  }
  return {
    message: typeof error === 'string' && error.length > 0 ? error : String(error),
    name: 'Error',
  }
}

export function createProceduralRockCliffWorkerError(source: ProceduralRockCliffWorkerError) {
  const error = new Error(source.message)
  error.name = source.name
  if (source.stack) error.stack = source.stack
  return error
}

export function isProceduralRockCliffWorkerResponse(
  value: unknown,
): value is ProceduralRockCliffWorkerResponse {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ProceduralRockCliffWorkerResponse>
  if (
    typeof candidate.ok !== 'boolean' ||
    typeof candidate.requestId !== 'number' ||
    typeof candidate.signature !== 'string'
  ) {
    return false
  }
  return candidate.ok
    ? 'bundle' in candidate && typeof candidate.bundle === 'object' && candidate.bundle !== null
    : 'error' in candidate &&
        typeof candidate.error === 'object' &&
        candidate.error !== null &&
        typeof candidate.error.message === 'string' &&
        typeof candidate.error.name === 'string'
}

function serializeProceduralRockCliffGeometry(
  geometry: BufferGeometry,
): SerializedProceduralRockCliffGeometry {
  const positions = requireFloat32Attribute(geometry, 'position')
  const normals = requireFloat32Attribute(geometry, 'normal')
  const colors = requireFloat32Attribute(geometry, 'color')
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  if (!geometry.boundingSphere) geometry.computeBoundingSphere()
  if (!(geometry.boundingBox && geometry.boundingSphere)) {
    throw new Error('Procedural-rock geometry is missing compiled bounds.')
  }
  return {
    boundingBox: {
      maximum: vectorToRecord(geometry.boundingBox.max),
      minimum: vectorToRecord(geometry.boundingBox.min),
    },
    boundingSphere: {
      center: vectorToRecord(geometry.boundingSphere.center),
      radius: geometry.boundingSphere.radius,
    },
    colors,
    normals,
    positions,
    userData: geometry.userData,
  }
}

function restoreProceduralRockCliffGeometry(serialized: SerializedProceduralRockCliffGeometry) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(serialized.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(serialized.normals, 3))
  geometry.setAttribute('color', new BufferAttribute(serialized.colors, 3))
  geometry.boundingBox = new Box3(
    recordToVector(serialized.boundingBox.minimum),
    recordToVector(serialized.boundingBox.maximum),
  )
  geometry.boundingSphere = new Sphere(
    recordToVector(serialized.boundingSphere.center),
    serialized.boundingSphere.radius,
  )
  geometry.userData = serialized.userData
  return geometry
}

function serializeWaterlineInteractionField(
  field: WaterlineInteractionField,
): SerializedWaterlineInteractionField {
  const data = field.texture.image.data
  if (!(data instanceof Uint8Array)) {
    throw new TypeError('Procedural-rock waterline texture must use Uint8Array storage.')
  }
  return {
    bounds: field.bounds,
    data,
    elevationMaximumMeters: field.elevationMaximumMeters,
    elevationMinimumMeters: field.elevationMinimumMeters,
    maximumDistanceMeters: field.maximumDistanceMeters,
    referenceElevationMeters: field.referenceElevationMeters,
    resolution: field.resolution,
    segmentCount: field.segmentCount,
    sliceSegmentCounts: field.sliceSegmentCounts,
    terrainElevationMaximumMeters: field.terrainElevationMaximumMeters,
    terrainElevationMinimumMeters: field.terrainElevationMinimumMeters,
  }
}

function restoreWaterlineInteractionField(
  serialized: SerializedWaterlineInteractionField,
): WaterlineInteractionField {
  const texture = new DataTexture(
    serialized.data,
    serialized.resolution,
    serialized.resolution,
    RGBAFormat,
    UnsignedByteType,
  )
  texture.generateMipmaps = false
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.needsUpdate = true
  texture.name = 'compiled-rock-waterline-three-elevation-signed-distance-field'
  return {
    bounds: serialized.bounds,
    elevationMaximumMeters: serialized.elevationMaximumMeters,
    elevationMinimumMeters: serialized.elevationMinimumMeters,
    maximumDistanceMeters: serialized.maximumDistanceMeters,
    referenceElevationMeters: serialized.referenceElevationMeters,
    resolution: serialized.resolution,
    segmentCount: serialized.segmentCount,
    sliceSegmentCounts: serialized.sliceSegmentCounts,
    terrainElevationMaximumMeters: serialized.terrainElevationMaximumMeters,
    terrainElevationMinimumMeters: serialized.terrainElevationMinimumMeters,
    texture,
  }
}

function requireFloat32Attribute(geometry: BufferGeometry, name: string) {
  const attribute = geometry.getAttribute(name)
  if (!attribute || !(attribute.array instanceof Float32Array)) {
    throw new TypeError(`Procedural-rock geometry attribute ${name} must use Float32Array storage.`)
  }
  return attribute.array
}

function vectorToRecord(vector: Vector3): SerializedVector3 {
  return { x: vector.x, y: vector.y, z: vector.z }
}

function recordToVector(vector: SerializedVector3) {
  return new Vector3(vector.x, vector.y, vector.z)
}

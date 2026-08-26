import { LANDRUSH_WATER_SURFACE_ELEVATION } from '@landrush/pascal-plugin'
import { createProceduralRockCliffPlan } from './procedural-rock-cliff-geometry'
import {
  collectProceduralRockCliffWorkerTransferables,
  type ProceduralRockCliffWorkerCompileInput,
  type ProceduralRockCliffWorkerRequest,
  type ProceduralRockCliffWorkerResponse,
  type ProceduralRockCliffWorkerStatus,
  resolveProceduralRockCliffWorkerRequest,
  serializeProceduralRockCliffBundle,
} from './procedural-rock-cliff-worker-transport'
import { createWaterlineInteractionField } from './waterline-interaction-field'

type ProceduralRockCliffWorkerScope = {
  onmessage: ((event: MessageEvent<ProceduralRockCliffWorkerRequest>) => void) | null
  postMessage: (
    response: ProceduralRockCliffWorkerResponse | ProceduralRockCliffWorkerStatus,
    transfer: ArrayBuffer[],
  ) => void
}

const workerScope = self as unknown as ProceduralRockCliffWorkerScope

workerScope.postMessage({ type: 'ready' }, [])

workerScope.onmessage = (event) => {
  workerScope.postMessage(
    {
      requestId: event.data.requestId,
      signature: event.data.signature,
      type: 'accepted',
    },
    [],
  )
  const response = resolveProceduralRockCliffWorkerRequest(event.data, compileBundle)
  const transfer = response.ok ? collectProceduralRockCliffWorkerTransferables(response.bundle) : []
  workerScope.postMessage(response, transfer)
}

function compileBundle(input: ProceduralRockCliffWorkerCompileInput) {
  const waterSurfaceElevation = input.waterSurfaceElevation ?? LANDRUSH_WATER_SURFACE_ELEVATION
  const plan = createProceduralRockCliffPlan({
    beachControls: input.beachControls,
    cutCount: input.cutCount,
    offshoreControls: input.offshoreControls,
    quality: input.quality,
    rockScale: input.rockScale,
    seed: input.seed,
    surface: input.surface,
    toneControls: input.toneControls,
    wallControls: input.wallControls,
    waterSurfaceElevation,
  })
  const waterlineInteractionField = input.includeWaterlineInteractionField
    ? createWaterlineInteractionField(plan.geometry, waterSurfaceElevation, {
        elevationRangeMeters: input.waterlineElevationRangeMeters,
        maximumDistanceMeters: input.waterlineMaximumDistanceMeters,
        resolution: input.waterlineResolution,
      })
    : null
  return serializeProceduralRockCliffBundle(plan, waterlineInteractionField)
}

import { renderScheduler } from '@pascal-app/viewer'
import type {
  LandrushWaterSurfaceMaterial,
  LandrushWaterSurfaceParameters,
} from '../landrush-world/water-surface'

type PascalWaterMaterialControls = Pick<
  LandrushWaterSurfaceMaterial['userData']['landrushWater'],
  'setParameters'
>

const pascalWaterMaterialControls = new Map<string, PascalWaterMaterialControls>()
const pascalWaterMaterialParameterOverrides = new Map<
  string,
  Partial<LandrushWaterSurfaceParameters>
>()

export function setPascalWaterMaterialParameters(
  nodeId: string,
  parameters: Partial<LandrushWaterSurfaceParameters>,
) {
  pascalWaterMaterialParameterOverrides.set(nodeId, {
    ...pascalWaterMaterialParameterOverrides.get(nodeId),
    ...parameters,
  })
  const controls = pascalWaterMaterialControls.get(nodeId)
  controls?.setParameters(parameters)
  renderScheduler.requestFrame('debug')
  return Boolean(controls)
}

export function registerPascalWaterMaterialControls(
  nodeId: string,
  controls: PascalWaterMaterialControls,
) {
  pascalWaterMaterialControls.set(nodeId, controls)
  const overrides = pascalWaterMaterialParameterOverrides.get(nodeId)
  if (overrides) controls.setParameters(overrides)

  return () => {
    if (pascalWaterMaterialControls.get(nodeId) === controls) {
      pascalWaterMaterialControls.delete(nodeId)
    }
  }
}

export function clearPascalWaterMaterialParameterOverrides(nodeId: string) {
  pascalWaterMaterialParameterOverrides.delete(nodeId)
}

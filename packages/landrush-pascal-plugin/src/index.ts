import type { AnyNodeDefinition, Plugin } from '@pascal-app/core'
import { landrushLayoutDefinition } from './landrush-layout'
import { landrushWorldDefinition } from './landrush-world'
import { pascalWaterDefinition } from './pascal-water'

export const landrushPlugin: Plugin = {
  id: 'landrush:world',
  apiVersion: 1,
  nodes: [
    landrushLayoutDefinition as unknown as AnyNodeDefinition,
    landrushWorldDefinition as unknown as AnyNodeDefinition,
    pascalWaterDefinition as unknown as AnyNodeDefinition,
  ],
}

export { landrushLayoutDefinition, LandrushLayoutNode } from './landrush-layout'
export { landrushWorldDefinition, LandrushWorldNode } from './landrush-world'
export {
  createLandrushWaterBodyMaterial,
  LANDRUSH_WATER_BODY_SURFACE_PARAMETERS,
  type LandrushWaterBodySurfaceMaterial,
  type LandrushWaterBodySurfaceParameters,
} from './landrush-world/water-body-surface'
export {
  createLandrushIncomingWaterMaterial,
  createLandrushWaterMaterial,
  LANDRUSH_BRUNO_WATER_NOISE_RESOLUTION,
  LANDRUSH_INCOMING_WATER_SURFACE_PARAMETERS,
  LANDRUSH_WATER_SURFACE_ELEVATION,
  LANDRUSH_WATER_SURFACE_PARAMETERS,
  LANDRUSH_WATER_SURFACE_THICKNESS,
  type LandrushIncomingWaterSurfaceMaterial,
  type LandrushIncomingWaterSurfaceParameters,
  type LandrushWaterSurfaceMaterial,
  type LandrushWaterSurfaceParameters,
} from './landrush-world/water-surface'
export {
  clearPascalWaterMaterialParameterOverrides,
  pascalWaterDefinition,
  setPascalWaterMaterialParameters,
} from './pascal-water'
export { PascalWaterNode } from './pascal-water/schema'
export {
  createPascalWaterCliffRingGeometry,
  createPascalWaterLandSurface,
  PASCAL_WATER_LOW_ELEVATION,
  type PascalWaterLandSurface,
} from './pascal-water/surface-geometry'
export { createPascalWaterSmoothedPerimeter } from './pascal-water/water-field'

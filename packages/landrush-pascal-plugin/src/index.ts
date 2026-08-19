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

export { LandrushLayoutNode, landrushLayoutDefinition } from './landrush-layout'
export { LandrushWorldNode, landrushWorldDefinition } from './landrush-world'
export {
  blendStylizedGroundPathColor,
  byte255 as stylizedGroundByte255,
  createStylizedPathGrid,
  mixRgbBytes as mixStylizedGroundRgbBytes,
  STYLIZED_PATH_EDGE_FEATHER_METERS,
  STYLIZED_PATH_EDGE_NOISE_METERS,
  STYLIZED_PATH_SIDEWALK_SEAM_METERS,
  STYLIZED_PATH_SIDEWALK_WIDTH_METERS,
  STYLIZED_PATH_WIDTH_SCALE,
  type StylizedGroundPoint2,
  type StylizedGroundRgbByte,
  type StylizedGroundRoadSegment,
  type StylizedPathGrid,
  sampleMaskRgba as sampleStylizedGroundMaskRgba,
  stylizedPathOuterCurbShadowFromDistance,
  stylizedPathSignedDistance,
  stylizedPathWeightFromDistance,
  stylizedStonePathColor,
} from './landrush-world/stylized-ground-path'
export { createStylizedGroundTextureFromCanvas } from './landrush-world/stylized-ground-texture'
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
export {
  PASCAL_WATER_ELEVATION_PARAMETER_DEFAULTS,
  PascalWaterNode,
} from './pascal-water/schema'
export {
  createPascalWaterCliffRingGeometry,
  createPascalWaterLandSurface,
  PASCAL_WATER_LOW_ELEVATION,
  type PascalWaterElevationParameters,
  type PascalWaterLandSurface,
} from './pascal-water/surface-geometry'
export {
  createPascalWaterDepthReferencePerimeter,
  createPascalWaterFieldTexture,
  createPascalWaterFieldTextureData,
  createPascalWaterFieldTextureFromData,
  createPascalWaterSmoothedPerimeter,
  PASCAL_WATER_FIELD_DEFAULT_PARAMETERS,
  PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH,
  PASCAL_WATER_FIELD_RESOLUTION,
  type PascalWaterFieldParameters,
  type PascalWaterFieldTextureData,
  type PascalWaterPoint2,
} from './pascal-water/water-field'

import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

const PascalWaterPoint2 = z.object({
  x: z.number(),
  z: z.number(),
})

const PascalWaterVec3 = z.tuple([z.number(), z.number(), z.number()])

const PascalWaterBounds = z.object({
  minX: z.number(),
  maxX: z.number(),
  minZ: z.number(),
  maxZ: z.number(),
  width: z.number(),
  depth: z.number(),
})

const PascalWaterPerimeter = z.object({
  points: z.array(PascalWaterPoint2),
  bounds: PascalWaterBounds,
  closed: z.boolean().default(true),
})

const PascalWaterFieldParameters = z.object({
  depthContourCollapseMeters: z.number().default(10.3),
  depthContourCollapseScale: z.number().default(1.25),
  depthContourNoiseFrequency: z.number().default(0.1),
  depthContourOffsetMeters: z.number().default(2.6),
  depthContourVariationMeters: z.number().default(8.6),
  depthExponent: z.number().default(0.52),
  depthNoiseFrequency: z.number().default(0.03),
  depthNoiseStrength: z.number().default(0),
  depthReach: z.number().default(15),
  edgeFadeDistance: z.number().default(18),
  shoreBandMeters: z.number().default(0),
  shoreFeatherMeters: z.number().default(0.45),
  shoreNoiseFrequency: z.number().default(0.075),
  shoreVariationMeters: z.number().default(0.85),
})

const PASCAL_WATER_FIELD_PARAMETER_DEFAULTS = {
  depthContourCollapseMeters: 10.3,
  depthContourCollapseScale: 1.25,
  depthContourNoiseFrequency: 0.1,
  depthContourOffsetMeters: 2.6,
  depthContourVariationMeters: 8.6,
  depthExponent: 0.52,
  depthNoiseFrequency: 0.03,
  depthNoiseStrength: 0,
  depthReach: 15,
  edgeFadeDistance: 18,
  shoreBandMeters: 0,
  shoreFeatherMeters: 0.45,
  shoreNoiseFrequency: 0.075,
  shoreVariationMeters: 0.85,
}

const PascalWaterElevationParameters = z.object({
  cliffBandMergeThresholdMeters: z.number().default(3.6),
  cliffBlockDepthMaxMeters: z.number().default(2.1),
  cliffBlockDepthMinMeters: z.number().default(0.5),
  cliffColorAverageRatio: z.number().default(0.75),
  cliffContrast: z.number().default(0.41),
  cliffToneVariation: z.number().default(0.35),
  contourNoiseFrequency: z.number().default(0.08),
  contourVariationMeters: z.number().default(3.5),
  edgeLiftMeters: z.number().default(6),
  innerContourMeters: z.number().default(3.75),
  outerContourMeters: z.number().default(0),
})

const PASCAL_WATER_ELEVATION_PARAMETER_DEFAULTS = {
  cliffBandMergeThresholdMeters: 3.6,
  cliffBlockDepthMaxMeters: 2.1,
  cliffBlockDepthMinMeters: 0.5,
  cliffColorAverageRatio: 0.75,
  cliffContrast: 0.41,
  cliffToneVariation: 0.35,
  contourNoiseFrequency: 0.08,
  contourVariationMeters: 3.5,
  edgeLiftMeters: 6,
  innerContourMeters: 3.75,
  outerContourMeters: 0,
}

const PascalWaterMaterialValue = z.union([z.number(), z.boolean()])

export const PascalWaterNode = BaseNode.extend({
  id: objectId('pascal-water'),
  type: nodeType('pascal-water'),
  position: PascalWaterVec3.default([0, 0, 0]),
  planeSize: z.number().default(430),
  perimeter: PascalWaterPerimeter.default({
    points: [
      { x: -50, z: -50 },
      { x: 50, z: -50 },
      { x: 50, z: 50 },
      { x: -50, z: 50 },
      { x: -50, z: -50 },
    ],
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50, width: 100, depth: 100 },
    closed: true,
  }),
  fieldParameters: PascalWaterFieldParameters.default(PASCAL_WATER_FIELD_PARAMETER_DEFAULTS),
  elevationParameters: PascalWaterElevationParameters.default(
    PASCAL_WATER_ELEVATION_PARAMETER_DEFAULTS,
  ),
  materialParameters: z.record(z.string(), PascalWaterMaterialValue).default({}),
  terrainFieldResolution: z.number().int().min(64).max(2048).default(1024),
  showDepthReference: z.boolean().default(false),
  maskLandWater: z.boolean().default(false),
}).describe('Pascal-native Landrush water surface and island shoreline context')

export type PascalWaterNode = z.infer<typeof PascalWaterNode>

import { BaseNode, nodeType, objectId } from '@pascal-app/core'
import { z } from 'zod'
import {
  LANDRUSH_GENERATION_METADATA_DEFAULT,
  LandrushGenerationMetadata,
  LandrushLayoutFields,
  LandrushVec3,
} from '../landrush-layout/schema'

const LandrushRemotePlayer = z.object({
  id: z.string(),
  name: z.string().optional(),
  color: z.string().optional(),
  position: LandrushVec3,
  heading: z.number().default(0),
  moving: z.boolean().default(false),
  speed: z.number().default(0),
  updatedAt: z.number().optional(),
})

const LandrushRenderFlags = z.object({
  grassBlades: z.boolean().optional(),
  grassPatches: z.boolean().optional(),
  ground: z.boolean().optional(),
  parcels: z.boolean().optional(),
  parcelDetails: z.boolean().optional(),
  robot: z.boolean().optional(),
  roads: z.boolean().optional(),
  shoreDetails: z.boolean().optional(),
  trees: z.boolean().optional(),
  water: z.boolean().optional(),
})

export const LandrushWorldNode = BaseNode.extend({
  id: objectId('landrush-world'),
  type: nodeType('landrush-world'),
  ...LandrushLayoutFields.shape,
  playerPosition: LandrushVec3.default([0, 0, 0]),
  playerHeading: z.number().default(0),
  playerMoving: z.boolean().default(false),
  playerSpeed: z.number().default(0),
  remotePlayers: z.array(LandrushRemotePlayer).default([]),
  renderFlags: LandrushRenderFlags.default({}),
  focusParcelId: z.string().nullable().default(null),
  landrushMode: z.enum(['intro', 'walk', 'build']).default('intro'),
  metadata: LandrushGenerationMetadata.default(LANDRUSH_GENERATION_METADATA_DEFAULT),
})

export type LandrushWorldNode = z.infer<typeof LandrushWorldNode>

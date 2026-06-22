import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

const LandrushPoint2 = z.object({
  x: z.number(),
  z: z.number(),
})

const LandrushVec3 = z.tuple([z.number(), z.number(), z.number()])

const LandrushSize = z.object({
  width: z.number(),
  depth: z.number(),
})

const LandrushBounds = z.object({
  minX: z.number(),
  maxX: z.number(),
  minZ: z.number(),
  maxZ: z.number(),
  width: z.number(),
  depth: z.number(),
})

const LandrushPerimeter = z.object({
  id: z.string(),
  points: z.array(LandrushPoint2),
  bounds: LandrushBounds,
  closed: z.boolean(),
})

const LandrushOwner = z.object({
  id: z.string(),
  label: z.string(),
  accentColor: z.string(),
})

const LandrushParcelEdge = z.object({
  id: z.string(),
  start: LandrushPoint2,
  end: LandrushPoint2,
  control: LandrushPoint2,
  samples: z.array(LandrushPoint2),
})

const LandrushParcel = z.object({
  id: z.string(),
  index: z.number(),
  kind: z.enum(['owner', 'neighbor']),
  label: z.string(),
  center: LandrushPoint2,
  centroid: LandrushPoint2,
  radius: z.number(),
  owner: LandrushOwner,
  vertices: z.array(LandrushPoint2),
  outline: z.array(LandrushPoint2),
  edges: z.array(LandrushParcelEdge),
  entryPoint: LandrushPoint2,
  fillColor: z.string(),
})

const LandrushRoadNode = z.object({
  id: z.string(),
  kind: z.enum(['spine', 'parcel-entry']),
  position: LandrushPoint2,
  parcelId: z.string().optional(),
})

const LandrushRoadSegment = z.object({
  id: z.string(),
  kind: z.enum(['spine', 'driveway']),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  points: z.array(LandrushPoint2),
  width: z.number(),
  connectsParcelIds: z.array(z.string()),
})

const LandrushSidewalkSegment = z.object({
  id: z.string(),
  roadSegmentId: z.string(),
  side: z.enum(['left', 'right']),
  points: z.array(LandrushPoint2),
  width: z.number(),
  connectsParcelIds: z.array(z.string()),
})

const LandrushRoadNetwork = z.object({
  nodes: z.array(LandrushRoadNode),
  segments: z.array(LandrushRoadSegment),
  sidewalks: z.array(LandrushSidewalkSegment),
  adjacency: z.record(z.string(), z.array(z.string())),
  connected: z.boolean(),
  connectedParcelIds: z.array(z.string()),
})

const LandrushTree = z.object({
  id: z.string(),
  kind: z.enum(['canopy', 'pine', 'flowering']),
  band: z.enum(['perimeter', 'grass']),
  position: LandrushPoint2,
  rotation: z.number(),
  trunkHeight: z.number(),
  canopyRadius: z.number(),
})

const LandrushMetadataCheck = z.object({
  check: z.string(),
  pass: z.boolean(),
  value: z.union([z.string(), z.number(), z.boolean()]),
})

const LandrushGenerationMetadata = z.object({
  seed: z.string(),
  requestedSize: LandrushSize,
  actualBounds: LandrushBounds,
  ownerParcelId: z.string(),
  checks: z.array(LandrushMetadataCheck),
  counts: z.object({
    perimeterPoints: z.number(),
    parcels: z.number(),
    roadNodes: z.number(),
    roadSegments: z.number(),
    sidewalks: z.number(),
    trees: z.number(),
  }),
  roadGraph: z.object({
    connected: z.boolean(),
    reachableNodeCount: z.number(),
    totalNodeCount: z.number(),
    connectedParcelIds: z.array(z.string()),
  }),
  summary: z.string(),
  source: z.string().optional(),
  verificationSummary: z.string().optional(),
  generatedBuildingNodeIds: z.array(z.string()).optional(),
})

export const LandrushWorldNode = BaseNode.extend({
  id: objectId('landrush-world'),
  type: nodeType('landrush-world'),
  position: LandrushVec3.default([0, 0, 0]),
  seed: z.string().default('landrush-default'),
  size: LandrushSize.default({ width: 100, depth: 100 }),
  perimeter: LandrushPerimeter.default({
    id: 'island-perimeter',
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
  parcels: z.array(LandrushParcel).default([]),
  ownerParcelId: z.string().default(''),
  roads: LandrushRoadNetwork.default({
    nodes: [],
    segments: [],
    sidewalks: [],
    adjacency: {},
    connected: false,
    connectedParcelIds: [],
  }),
  trees: z.array(LandrushTree).default([]),
  playerStart: LandrushVec3.default([0, 0, 0]),
  playerPosition: LandrushVec3.default([0, 0, 0]),
  playerHeading: z.number().default(0),
  playerMoving: z.boolean().default(false),
  playerSpeed: z.number().default(0),
  focusParcelId: z.string().nullable().default(null),
  landrushMode: z.enum(['intro', 'walk', 'build']).default('intro'),
  metadata: LandrushGenerationMetadata.default({
    seed: 'landrush-default',
    requestedSize: { width: 100, depth: 100 },
    actualBounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50, width: 100, depth: 100 },
    ownerParcelId: '',
    checks: [],
    counts: {
      perimeterPoints: 5,
      parcels: 0,
      roadNodes: 0,
      roadSegments: 0,
      sidewalks: 0,
      trees: 0,
    },
    roadGraph: {
      connected: false,
      reachableNodeCount: 0,
      totalNodeCount: 0,
      connectedParcelIds: [],
    },
    summary: 'Landrush world not generated',
  }),
})

export type LandrushWorldNode = z.infer<typeof LandrushWorldNode>

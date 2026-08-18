import type {
  ParcelBuildNodesSnapshot,
  ParcelOwnership,
  TvMediaStateSnapshot,
} from './world-multiplayer-lab-client'

export const PASCAL_OPENWORLD_INTEGRATION_CELLS = ['pascal', 'world', 'combined'] as const

export type PascalOpenworldIntegrationCell = (typeof PASCAL_OPENWORLD_INTEGRATION_CELLS)[number]

export type PascalOpenworldIntegrationCamera = 'near' | 'design' | 'far'

export type PascalOpenworldIntegrationSummary = {
  buildCount: number
  buildNodeCount: number
  levelCount: number
  ownershipCount: number
  worldNodeCount: number
  floorAreaSquareMeters: number
}

export type PascalOpenworldIntegrationSnapshot = {
  buildNodeCount: number
  builds: ParcelBuildNodesSnapshot[]
  ownerships: ParcelOwnership[]
  savedAt: number | null
  schemaVersion: number
  tvMediaStates: TvMediaStateSnapshot[]
  worldId: string
}

export type PascalOpenworldIntegrationManifest = PascalOpenworldIntegrationSummary & {
  cell: PascalOpenworldIntegrationCell
  source: 'sidecar'
  networkEnabled: false
  persistenceNamespace: 'pascal-openworld-integration-lab-v1'
  rendererContract: 'one-pascal-viewer'
  seed: string
  constructionNodeCount: number
  houseCenter: [number, number, number]
}

export const PASCAL_OPENWORLD_INTEGRATION_SUMMARIES = {
  pascal: {
    buildCount: 1,
    buildNodeCount: 22,
    levelCount: 2,
    ownershipCount: 0,
    worldNodeCount: 0,
    floorAreaSquareMeters: 90,
  },
  world: {
    buildCount: 0,
    buildNodeCount: 0,
    levelCount: 1,
    ownershipCount: 0,
    worldNodeCount: 1,
    floorAreaSquareMeters: 0,
  },
  combined: {
    buildCount: 0,
    buildNodeCount: 0,
    levelCount: 0,
    ownershipCount: 0,
    worldNodeCount: 1,
    floorAreaSquareMeters: 0,
  },
} as const satisfies Record<PascalOpenworldIntegrationCell, PascalOpenworldIntegrationSummary>

export function summarizePascalOpenworldIntegrationCell(
  cell: PascalOpenworldIntegrationCell,
  snapshot: PascalOpenworldIntegrationSnapshot | null,
): PascalOpenworldIntegrationSummary {
  if (cell !== 'combined' || !snapshot) return PASCAL_OPENWORLD_INTEGRATION_SUMMARIES[cell]

  return {
    buildCount: snapshot.builds.length,
    buildNodeCount: snapshot.buildNodeCount,
    levelCount: countSnapshotLevels(snapshot),
    ownershipCount: snapshot.ownerships.length,
    worldNodeCount: 1,
    floorAreaSquareMeters: 0,
  }
}

export function isPascalOpenworldIntegrationCell(
  value: string | null,
): value is PascalOpenworldIntegrationCell {
  return PASCAL_OPENWORLD_INTEGRATION_CELLS.includes(value as PascalOpenworldIntegrationCell)
}

function countSnapshotLevels(snapshot: PascalOpenworldIntegrationSnapshot) {
  return snapshot.builds.reduce(
    (count, build) =>
      count +
      build.nodes.filter((node) => node && typeof node === 'object' && node.type === 'level')
        .length,
    0,
  )
}

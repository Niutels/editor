import type { ReactNode } from 'react'

export type LandrushMode = 'intro' | 'walk' | 'build'

export type LandrushVector2 = {
  x: number
  z: number
}

export type LandrushVector3 = {
  x: number
  y: number
  z: number
}

export type LandrushVector3Like = LandrushVector3 | readonly [number, number, number]

export type LandrushScreenPoint = {
  x: number
  y: number
}

export type LandrushPropertyGeometry =
  | {
      kind: 'circle'
      center: LandrushVector2
      radius: number
    }
  | {
      kind: 'rect'
      center: LandrushVector2
      size: LandrushVector2
    }
  | {
      kind: 'polygon'
      points: readonly LandrushVector2[]
    }
  | {
      kind: 'custom'
      contains: (point: LandrushVector2) => boolean
      distanceTo?: (point: LandrushVector2) => number
    }

export type LandrushBuildEligibilityReason =
  | 'inside-owner-property'
  | 'near-owner-property'
  | 'too-far-from-owner-property'

export type LandrushBuildEligibility = {
  allowed: boolean
  insideProperty: boolean
  distance: number
  reason: LandrushBuildEligibilityReason
}

export type LandrushCharacterState = {
  position: LandrushVector3
  velocity: LandrushVector3
  heading: number
  isMoving: boolean
}

export type LandrushResolvedCameraPose = {
  position: LandrushVector3
  target: LandrushVector3
  zoom?: number
  fov?: number
}

export type LandrushCameraPose = {
  position: LandrushVector3Like
  target: LandrushVector3Like
  zoom?: number
  fov?: number
}

export type LandrushCameraTransitionOptions = {
  durationMs: number
  mode: LandrushMode
}

export type LandrushCameraAdapter = {
  getPose?: () => LandrushCameraPose | LandrushResolvedCameraPose | null
  setPose?: (pose: LandrushResolvedCameraPose) => void
  transitionTo?: (
    pose: LandrushResolvedCameraPose,
    options: LandrushCameraTransitionOptions,
  ) => void
}

export type LandrushCameraStateInput = {
  mode: LandrushMode
  character: LandrushCharacterState
  ownerProperty: LandrushPropertyGeometry
}

export type LandrushCameraConfig = {
  intro?: LandrushCameraPose | ((state: LandrushCameraStateInput) => LandrushCameraPose)
  walk?: LandrushCameraPose | ((state: LandrushCameraStateInput) => LandrushCameraPose)
  build?: LandrushCameraPose | ((state: LandrushCameraStateInput) => LandrushCameraPose)
  transitionMs?: number
  adapter?: LandrushCameraAdapter
}

export type LandrushBuildTool = {
  id: string
  label: string
  icon?: ReactNode
  disabled?: boolean
}

export type LandrushModeSnapshot = {
  mode: LandrushMode
  ownerProperty: LandrushPropertyGeometry
  character: LandrushCharacterState
  buildEligibility: LandrushBuildEligibility
  cameraPose: LandrushResolvedCameraPose
  cameraTransitionProgress: number
  buildMenuOpacity: number
  islandFadeOpacity: number
  surroundingIslandOpacity: number
  isIntro: boolean
  isWalking: boolean
  isBuildMode: boolean
  canBuild: boolean
  join: () => void
  enterWalkMode: () => void
  enterBuildMode: () => boolean
  exitBuildMode: () => void
  toggleBuildMode: () => boolean
  setCharacterPosition: (position: LandrushVector3Like) => void
}

export type LandrushConstrainCharacterPosition = (
  nextPosition: LandrushVector3,
  context: {
    current: LandrushCharacterState
    mode: LandrushMode
    ownerProperty: LandrushPropertyGeometry
  },
) => LandrushVector3

export type LandrushModeControllerOptions = {
  ownerProperty: LandrushPropertyGeometry
  initialMode?: LandrushMode
  spawnPosition?: LandrushVector3Like
  walkSpeed?: number
  buildActivationDistance?: number
  camera?: LandrushCameraConfig
  disabled?: boolean
  constrainCharacterPosition?: LandrushConstrainCharacterPosition
  onModeChange?: (mode: LandrushMode, previousMode: LandrushMode) => void
  onCharacterMove?: (character: LandrushCharacterState) => void
  onBuildToggleDenied?: (eligibility: LandrushBuildEligibility) => void
}

export type LandrushRenderSlot = ReactNode | ((snapshot: LandrushModeSnapshot) => ReactNode)

export type LandrushModeControllerProps = LandrushModeControllerOptions & {
  className?: string
  children?: LandrushRenderSlot
  introPanel?: LandrushRenderSlot
  buildMenu?: LandrushRenderSlot
  renderCharacter?: (snapshot: LandrushModeSnapshot) => ReactNode
  renderIslandFade?: (snapshot: LandrushModeSnapshot) => ReactNode
  projectCharacterToScreen?: (position: LandrushVector3) => LandrushScreenPoint | null
  showDefaultCharacter?: boolean
  showModePill?: boolean
  buildTools?: readonly LandrushBuildTool[]
  activeBuildToolId?: string
  onBuildToolSelect?: (tool: LandrushBuildTool) => void
  introTitle?: string
  introSubtitle?: string
}

export type LandrushVec3 = readonly [number, number, number]

export interface LandrushPoint2 {
  readonly x: number
  readonly z: number
}

export interface LandrushSize {
  readonly width: number
  readonly depth: number
}

export interface LandrushBounds {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
  readonly width: number
  readonly depth: number
}

export interface LandrushGeneratorOptions {
  readonly seed?: string | number
  readonly size?: Partial<LandrushSize>
  readonly shape?: Partial<LandrushIslandShapeControls>
  readonly parcelCount?: number
  readonly ownerParcelIndex?: number
  readonly perimeterPointCount?: number
  readonly treeSpacing?: number
}

export interface LandrushIslandShapeControls {
  readonly asymmetry: number
  readonly coast: number
  readonly lobes: number
  readonly roughness: number
}

export interface LandrushPerimeter {
  readonly id: 'island-perimeter'
  readonly points: readonly LandrushPoint2[]
  readonly r3fPoints: readonly LandrushVec3[]
  readonly bounds: LandrushBounds
  readonly closed: boolean
}

export type LandrushParcelKind = 'owner' | 'neighbor'

export interface LandrushOwner {
  readonly id: string
  readonly label: string
  readonly accentColor: string
}

export interface LandrushParcelEdge {
  readonly id: string
  readonly start: LandrushPoint2
  readonly end: LandrushPoint2
  readonly control: LandrushPoint2
  readonly samples: readonly LandrushPoint2[]
  readonly r3fSamples: readonly LandrushVec3[]
}

export interface LandrushParcel {
  readonly id: string
  readonly index: number
  readonly kind: LandrushParcelKind
  readonly label: string
  readonly center: LandrushPoint2
  readonly centroid: LandrushPoint2
  readonly radius: number
  readonly owner: LandrushOwner
  readonly vertices: readonly LandrushPoint2[]
  readonly outline: readonly LandrushPoint2[]
  readonly r3fOutline: readonly LandrushVec3[]
  readonly edges: readonly LandrushParcelEdge[]
  readonly entryPoint: LandrushPoint2
  readonly r3fEntryPoint: LandrushVec3
  readonly fillColor: string
}

export type LandrushRoadNodeKind = 'spine' | 'parcel-entry'

export interface LandrushRoadNode {
  readonly id: string
  readonly kind: LandrushRoadNodeKind
  readonly position: LandrushPoint2
  readonly r3fPosition: LandrushVec3
  readonly parcelId?: string
}

export type LandrushRoadSegmentKind = 'spine' | 'driveway'

export interface LandrushRoadSegment {
  readonly id: string
  readonly kind: LandrushRoadSegmentKind
  readonly fromNodeId: string
  readonly toNodeId: string
  readonly points: readonly LandrushPoint2[]
  readonly r3fPoints: readonly LandrushVec3[]
  readonly width: number
  readonly connectsParcelIds: readonly string[]
}

export interface LandrushSidewalkSegment {
  readonly id: string
  readonly roadSegmentId: string
  readonly side: 'left' | 'right'
  readonly points: readonly LandrushPoint2[]
  readonly r3fPoints: readonly LandrushVec3[]
  readonly width: number
  readonly connectsParcelIds: readonly string[]
}

export interface LandrushRoadNetwork {
  readonly nodes: readonly LandrushRoadNode[]
  readonly segments: readonly LandrushRoadSegment[]
  readonly sidewalks: readonly LandrushSidewalkSegment[]
  readonly adjacency: Readonly<Record<string, readonly string[]>>
  readonly connected: boolean
  readonly connectedParcelIds: readonly string[]
}

export type LandrushTreeKind = 'canopy' | 'pine' | 'flowering'
export type LandrushTreeBand = 'perimeter' | 'grass'

export interface LandrushTree {
  readonly id: string
  readonly kind: LandrushTreeKind
  readonly band: LandrushTreeBand
  readonly position: LandrushPoint2
  readonly r3fPosition: LandrushVec3
  readonly rotation: number
  readonly trunkHeight: number
  readonly canopyRadius: number
}

export interface LandrushMetadataCheck {
  readonly check: string
  readonly pass: boolean
  readonly value: string | number | boolean
}

export interface LandrushGenerationMetadata {
  readonly seed: string
  readonly requestedSize: LandrushSize
  readonly actualBounds: LandrushBounds
  readonly ownerParcelId: string
  readonly checks: readonly LandrushMetadataCheck[]
  readonly counts: {
    readonly perimeterPoints: number
    readonly parcels: number
    readonly roadNodes: number
    readonly roadSegments: number
    readonly sidewalks: number
    readonly trees: number
  }
  readonly roadGraph: {
    readonly connected: boolean
    readonly reachableNodeCount: number
    readonly totalNodeCount: number
    readonly connectedParcelIds: readonly string[]
  }
  readonly summary: string
  readonly source?: string
  readonly verificationSummary?: string
}

export interface LandrushIsland {
  readonly id: string
  readonly seed: string
  readonly size: LandrushSize
  readonly perimeter: LandrushPerimeter
  readonly parcels: readonly LandrushParcel[]
  readonly ownerParcel: LandrushParcel
  readonly roads: LandrushRoadNetwork
  readonly trees: readonly LandrushTree[]
  readonly metadata: LandrushGenerationMetadata
}

export {
  type BVHEcctrlApi,
  type BVHEcctrlCollisionResponseMode,
  default as BVHEcctrl,
  type MovementInput,
} from './bvh-ecctrl'
export {
  buildFirstPersonColliderWorld,
  deriveFirstPersonSpawn,
  FIRST_PERSON_SPAWN_EYE_HEIGHT,
  type FirstPersonColliderWorld,
  type FirstPersonSpawn,
} from './first-person-collider-world'
export {
  getMaterialRendererBackend,
  LandrushMaterialRendererBackendBridge,
  type MaterialRendererBackend,
} from './material-renderer-backend'
export {
  frameIndependentResponseAmount,
  REMOTE_PRESENTATION_ANIMATION_SETTLE_SECONDS,
  REMOTE_PRESENTATION_HEADING_EPSILON_RADIANS,
  REMOTE_PRESENTATION_INTERPOLATION_DELAY_MS,
  REMOTE_PRESENTATION_MAX_EXTRAPOLATION_MS,
  REMOTE_PRESENTATION_MOVEMENT_FRESH_MS,
  REMOTE_PRESENTATION_POSITION_EPSILON_SQ,
  type RemotePresentationActivity,
  type RemotePresentationReconciliation,
  type RemotePresentationSnapshot,
  type RemotePresentationStore,
  type RemotePresentationTimeline,
  type RemotePresentationTimelineSample,
  reconcileRemotePresentationTimeline,
  resolveRemotePresentationSnapshot,
  shortestAngleDistance,
  shouldContinueRemotePresentation,
  viewAnglesFromDirection,
} from './multiplayer-presentation'
export {
  clamp01,
  closestPointOnClosedPolyline,
  distanceToClosedPolyline,
  distanceToOpenPolyline,
  distanceToSegment2,
  dot2,
  landrushIslandNavigationSegmentIntersectsPolygon,
  type LandrushNavigationPoint2,
  normalize2,
  openPointRing,
  pointInPolygon,
  pointInPolygonOrNearEdge,
  pointsAlmostEqual2,
  rectFootprint,
  rectFootprintFromAxes,
  rotateFootprintPoint,
  segmentFootprint,
  segmentsIntersect2,
} from './navigation-geometry'
export {
  LandrushRenderSchedulerBridge,
  type RenderProfile,
  type RenderReason,
  type RenderSchedulerSnapshot,
  renderScheduler,
} from './render-scheduler'
export {
  MULTIPLAYER_LATENCY_EVENT,
  type MultiplayerConnectionDetails,
  type MultiplayerRemotePlayerStore,
  type ParcelBuildNodesSnapshot,
  readLocalPlayerProfile,
  sanitizeRoomId,
  useLandrushWorldMultiplayer,
  writeOfflineParcelWorldState,
} from './world-multiplayer-client'
export {
  countWorldPolygonSurfaceTriangles,
  createWorldPolygonBoundaryWallsGeometry,
  createWorldPolygonSurfaceGeometry,
  type WorldPolygonArea,
  type WorldPolygonGeometryRole,
  type WorldPolygonRing,
} from './world-polygon-geometry'
export type EditorCameraInitialPose = {
  position: [number, number, number]
  target: [number, number, number]
}
export type ViewerPresentationEffectDebugMode = 'contribution' | 'final' | 'mask'
export type ViewerPresentationEffectState = {
  zoomBlurAmount: number
  zoomBlurCenter?: readonly [number, number]
  zoomBlurDebugMode?: ViewerPresentationEffectDebugMode
  zoomBlurDirection: number
  zoomBlurStrength: number
}

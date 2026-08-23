export const LANDRUSH_PASCAL_GRID_PLANE_EPSILON = 0.005

const ORIENTED_PLANE_NORMAL_Y_THRESHOLD = 0.95

export function resolveLandrushPascalCanonicalGridVisibility(
  ownedHorizontalGridPlaneY: number | null,
  publishedSurfaceY: number | null,
  publishedSurfaceNormalY: number | null,
  movingPlaneY: number | null,
  movingPlaneWallHosted: boolean,
  selectedLevelY: number,
  epsilon = LANDRUSH_PASCAL_GRID_PLANE_EPSILON,
) {
  if (ownedHorizontalGridPlaneY === null || !Number.isFinite(ownedHorizontalGridPlaneY)) {
    return true
  }

  let activePlaneY: number
  if (publishedSurfaceY !== null && publishedSurfaceNormalY !== null) {
    if (!(Number.isFinite(publishedSurfaceY) && Number.isFinite(publishedSurfaceNormalY))) {
      return true
    }
    if (Math.abs(publishedSurfaceNormalY) < ORIENTED_PLANE_NORMAL_Y_THRESHOLD) return true
    activePlaneY = publishedSurfaceY
  } else if (movingPlaneY !== null) {
    if (!Number.isFinite(movingPlaneY) || movingPlaneWallHosted) return true
    activePlaneY = movingPlaneY
  } else {
    if (!Number.isFinite(selectedLevelY)) return true
    activePlaneY = selectedLevelY
  }

  return Math.abs(activePlaneY - ownedHorizontalGridPlaneY) > Math.max(0, epsilon)
}

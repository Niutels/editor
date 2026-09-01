const ORIENTED_PLANE_NORMAL_Y_THRESHOLD = 0.95

export function resolveLandrushPascalCanonicalGridVisibility(
  ownedHorizontalGridPlaneY: number | null,
  publishedSurfaceY: number | null,
  publishedSurfaceNormalY: number | null,
  movingPlaneY: number | null,
  movingPlaneWallHosted: boolean,
  selectedLevelY: number,
) {
  if (ownedHorizontalGridPlaneY === null || !Number.isFinite(ownedHorizontalGridPlaneY)) {
    return true
  }

  if (publishedSurfaceY !== null && publishedSurfaceNormalY !== null) {
    if (!(Number.isFinite(publishedSurfaceY) && Number.isFinite(publishedSurfaceNormalY))) {
      return true
    }
    return Math.abs(publishedSurfaceNormalY) < ORIENTED_PLANE_NORMAL_Y_THRESHOLD
  }
  if (movingPlaneY !== null) {
    if (!Number.isFinite(movingPlaneY)) return true
    return movingPlaneWallHosted
  }

  if (!Number.isFinite(selectedLevelY)) return true
  return false
}

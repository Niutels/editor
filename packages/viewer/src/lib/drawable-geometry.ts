import type { BufferGeometry } from 'three'

/**
 * True when `geometry` has something visible to submit to the WebGPU renderer.
 *
 * A geometry whose `position` attribute has `count === 0` (or no `position` at
 * all) leaves WebGPU **vertex buffer slot 0 unbound**. The validator rejects the
 * draw with "Vertex buffer slot 0 … was not set", and — critically — that single
 * rejected draw **poisons the entire command encoder**: every other draw in the
 * frame (the whole scene + every editor overlay) is discarded on the next queue
 * submit ("Invalid CommandBuffer"). The visible result is the whole canvas
 * flickering/garbling, not just the offending mesh.
 *
 * Intentional placeholders are represented by one zero-area triangle. They are
 * also visually empty, and skipping them keeps their disposable secondary
 * attributes out of WebGPU pipelines during React Strict Mode effect replay.
 * Only single-triangle geometry pays the area check; normal scene meshes keep a
 * constant-time count check.
 */
export function hasDrawableGeometry(geometry: BufferGeometry | undefined | null): boolean {
  const position = geometry?.attributes?.position
  if (!position || position.count === 0) return false

  const index = geometry?.index
  const vertexCount = index?.count ?? position.count
  if (vertexCount === 0) return false
  if (vertexCount !== 3 || position.itemSize < 3) return true

  const a = index?.getX(0) ?? 0
  const b = index?.getX(1) ?? 1
  const c = index?.getX(2) ?? 2
  const abX = position.getX(b) - position.getX(a)
  const abY = position.getY(b) - position.getY(a)
  const abZ = position.getZ(b) - position.getZ(a)
  const acX = position.getX(c) - position.getX(a)
  const acY = position.getY(c) - position.getY(a)
  const acZ = position.getZ(c) - position.getZ(a)
  const crossX = abY * acZ - abZ * acY
  const crossY = abZ * acX - abX * acZ
  const crossZ = abX * acY - abY * acX
  const areaSquared = crossX * crossX + crossY * crossY + crossZ * crossZ

  return Number.isFinite(areaSquared) && areaSquared > 0
}

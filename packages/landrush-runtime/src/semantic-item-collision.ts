export const LANDRUSH_ITEM_LOW_PROFILE_MAXIMUM_HEIGHT_METERS = 0.1
export const LANDRUSH_ITEM_SUPPORT_SURFACE_THICKNESS_METERS = 0.08

export type LandrushSemanticItemCollisionInput = Readonly<{
  attachTo?: string | null
  dimensions: readonly [number, number, number]
  scale: readonly [number, number, number]
  surfaceHeight?: number | null
  tags?: readonly string[]
}>

export type LandrushSemanticItemCollisionProfile = Readonly<{
  depth: number
  maximumY: number
  minimumY: number
  shape: 'solid' | 'support-surface'
  width: number
}>

export function resolveLandrushSemanticItemCollisionProfile(
  item: LandrushSemanticItemCollisionInput,
): LandrushSemanticItemCollisionProfile | null {
  if (item.attachTo) return null

  const width = Math.abs(item.dimensions[0] * item.scale[0])
  const scaledHeight = Math.abs(item.dimensions[1] * item.scale[1])
  const depth = Math.abs(item.dimensions[2] * item.scale[2])
  const maximumY = Math.abs(
    item.surfaceHeight == null ? scaledHeight : item.surfaceHeight * item.scale[1],
  )
  if (
    ![width, maximumY, depth].every(Number.isFinite) ||
    width <= 0 ||
    maximumY <= LANDRUSH_ITEM_LOW_PROFILE_MAXIMUM_HEIGHT_METERS ||
    depth <= 0
  ) {
    return null
  }

  const tags = item.tags ?? []
  const isOpenSupportSurface = tags.includes('table') && !tags.includes('storage')
  return {
    depth,
    maximumY,
    minimumY: isOpenSupportSurface
      ? Math.max(0, maximumY - LANDRUSH_ITEM_SUPPORT_SURFACE_THICKNESS_METERS)
      : 0,
    shape: isOpenSupportSurface ? 'support-surface' : 'solid',
    width,
  }
}

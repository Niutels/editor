import type { Dpr } from '@react-three/fiber'

const COARSE_POINTER_VIEWER_DPR: Dpr = [1, 1.25]
const FINE_POINTER_VIEWER_DPR: Dpr = [1, 1.5]

export type ViewerRenderDpr = Dpr

export function resolveViewerRenderDpr(
  renderDpr: ViewerRenderDpr | undefined,
  coarsePointer: boolean,
) {
  return renderDpr ?? (coarsePointer ? COARSE_POINTER_VIEWER_DPR : FINE_POINTER_VIEWER_DPR)
}

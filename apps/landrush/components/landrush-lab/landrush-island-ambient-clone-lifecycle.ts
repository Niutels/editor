import type { Object3D, Skeleton } from 'three'

export function createLandrushIslandAmbientCloneSkeletonResource(root: Object3D) {
  const skeletons = new Set<Skeleton>()
  root.traverse((object) => {
    const candidate = object as Object3D & {
      isSkinnedMesh?: boolean
      skeleton?: Skeleton
    }
    if (candidate.isSkinnedMesh && candidate.skeleton) skeletons.add(candidate.skeleton)
  })
  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      for (const skeleton of skeletons) skeleton.dispose()
    },
  }
}

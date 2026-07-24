import type { Object3D } from 'three'

export function isLandrushRevealObjectOwnedByRoot(
  object: Object3D,
  root: Object3D,
  registeredNodeRoots: ReadonlySet<Object3D>,
) {
  let current: Object3D | null = object
  while (current) {
    if (current === root) return true
    if (registeredNodeRoots.has(current)) return false
    current = current.parent
  }
  return false
}

export function isLandrushRevealObjectWithinRoots(object: Object3D, roots: ReadonlySet<Object3D>) {
  let current: Object3D | null = object
  while (current) {
    if (roots.has(current)) return true
    current = current.parent
  }
  return false
}

import type { Mesh, Object3D } from 'three'

export function appendLandrushRevealOwnedMeshes<TContext>(
  root: Object3D,
  registeredNodeRoots: ReadonlySet<Object3D>,
  target: Set<Mesh>,
  context: TContext,
  append: (mesh: Mesh, context: TContext) => void,
) {
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    if (!isLandrushRevealObjectOwnedByRoot(object, root, registeredNodeRoots)) return
    append(mesh, context)
    target.add(mesh)
  })
  return target
}

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

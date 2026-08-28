import type { Object3D } from 'three'

export type LandrushRobotRevealVisualOwner = {
  dynamicBounds: boolean
  object: Object3D
  ownerId: string
}

export function collectLandrushRobotRevealVisualOwners({
  excludedRoots,
  roots,
  semanticRoots,
}: {
  excludedRoots: ReadonlySet<Object3D>
  roots: readonly Object3D[]
  semanticRoots: ReadonlySet<Object3D>
}) {
  const ownersById = new Map<string, LandrushRobotRevealVisualOwner>()
  for (const object of roots) {
    if (isLandrushRobotRevealObjectWithinRoots(object, excludedRoots)) continue
    if (isLandrushRobotRevealObjectWithinRoots(object, semanticRoots)) continue
    const explicitOwnerId = object.userData.landrushRobotRevealOwnerId
    const ownerId =
      typeof explicitOwnerId === 'string' && explicitOwnerId.length > 0
        ? `visual:${explicitOwnerId}`
        : `visual:${object.uuid}`
    ownersById.set(ownerId, {
      dynamicBounds: object.userData.landrushRobotOccluderPrecise === true,
      object,
      ownerId,
    })
  }
  return [...ownersById.values()]
}

function isLandrushRobotRevealObjectWithinRoots(object: Object3D, roots: ReadonlySet<Object3D>) {
  let current: Object3D | null = object
  while (current) {
    if (roots.has(current)) return true
    current = current.parent
  }
  return false
}

import type { Object3D } from 'three'

export type PascalSitePresentationVisibility = Map<Object3D, boolean>

export function suppressPascalSitePresentation(
  siteObject: Object3D,
  semanticChildObjects: readonly Object3D[],
  savedVisibility: PascalSitePresentationVisibility,
) {
  let changed = 0
  for (const directChild of siteObject.children) {
    const hostsSemanticChild = semanticChildObjects.some((object) =>
      objectIsWithin(object, directChild),
    )
    if (hostsSemanticChild) {
      const originalVisibility = savedVisibility.get(directChild)
      if (originalVisibility !== undefined) {
        directChild.visible = originalVisibility
        savedVisibility.delete(directChild)
      }
      continue
    }

    if (!savedVisibility.has(directChild)) {
      savedVisibility.set(directChild, directChild.visible)
    }
    if (directChild.visible) {
      directChild.visible = false
      changed += 1
    }
  }
  return changed
}

export function restorePascalSitePresentation(savedVisibility: PascalSitePresentationVisibility) {
  for (const [object, visible] of savedVisibility) object.visible = visible
  savedVisibility.clear()
}

function objectIsWithin(object: Object3D, ancestor: Object3D) {
  let current: Object3D | null = object
  while (current) {
    if (current === ancestor) return true
    current = current.parent
  }
  return false
}

import type { Group, Mesh } from 'three'

export function createLandrushIslandPalmPresentation(source: Group) {
  const model = source.clone(true)
  // Ambient palms have no scene-node registration, so reveal discovers their visual roots.
  model.userData.landrushRobotOccluder = true
  model.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = false
    mesh.receiveShadow = false
  })
  return model
}

import type { Object3D, Scene } from 'three'

type LandrushRobotRevealVisualRegistry = {
  roots: Map<Object3D, number>
}

const registries = new WeakMap<Scene, LandrushRobotRevealVisualRegistry>()

export function registerLandrushRobotRevealVisualRoot(scene: Scene, root: Object3D) {
  let registry = registries.get(scene)
  if (!registry) {
    registry = { roots: new Map() }
    registries.set(scene, registry)
  }
  registry.roots.set(root, (registry.roots.get(root) ?? 0) + 1)

  let registered = true
  return () => {
    if (!registered) return
    registered = false
    const currentRegistry = registries.get(scene)
    const count = currentRegistry?.roots.get(root)
    if (!currentRegistry || count === undefined) return
    if (count > 1) {
      currentRegistry.roots.set(root, count - 1)
      return
    }
    currentRegistry.roots.delete(root)
    if (currentRegistry.roots.size === 0) registries.delete(scene)
  }
}

export function collectLandrushRobotRevealVisualRoots(scene: Scene) {
  const registry = registries.get(scene)
  if (!registry) return []

  const roots: Object3D[] = []
  for (const root of registry.roots.keys()) {
    if (belongsToScene(root, scene)) {
      roots.push(root)
      continue
    }
    registry.roots.delete(root)
  }
  if (registry.roots.size === 0) registries.delete(scene)

  roots.sort((first, second) => compareScenePaths(scene, first, second))
  return roots
}

function belongsToScene(root: Object3D, scene: Scene) {
  let current: Object3D | null = root
  while (current) {
    if (current === scene) return true
    current = current.parent
  }
  return false
}

function compareScenePaths(scene: Scene, first: Object3D, second: Object3D) {
  const firstPath = createScenePath(scene, first)
  const secondPath = createScenePath(scene, second)
  const sharedLength = Math.min(firstPath.length, secondPath.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = (firstPath[index] ?? 0) - (secondPath[index] ?? 0)
    if (difference !== 0) return difference
  }
  return firstPath.length - secondPath.length
}

function createScenePath(scene: Scene, root: Object3D) {
  const path: number[] = []
  let current: Object3D = root
  while (current !== scene && current.parent) {
    path.push(current.parent.children.indexOf(current))
    current = current.parent
  }
  path.reverse()
  return path
}

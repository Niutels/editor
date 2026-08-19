import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'

const COLLIDER_MATERIAL = new THREE.MeshBasicMaterial()
const DOWN = new THREE.Vector3(0, -1, 0)
const UP = new THREE.Vector3(0, 1, 0)
const SPAWN_EYE_HEIGHT = 1.65
const RAYCAST_CLEARANCE = 25

export const FIRST_PERSON_SPAWN_EYE_HEIGHT = SPAWN_EYE_HEIGHT

export type FirstPersonColliderWorld = {
  bounds: THREE.Box3 | null
  dispose: () => void
  mesh: THREE.Mesh
}

export type FirstPersonSpawn = {
  position: [number, number, number]
  yaw: number
}

export function buildFirstPersonColliderWorld(
  geometries: readonly THREE.BufferGeometry[],
): FirstPersonColliderWorld | null {
  if (geometries.length === 0) return null

  const mergedGeometry = mergeGeometries([...geometries], false)
  for (const geometry of geometries) geometry.dispose()

  if (!mergedGeometry || mergedGeometry.getAttribute('position') == null) {
    mergedGeometry?.dispose()
    return null
  }

  const bvhGeometry = mergedGeometry as THREE.BufferGeometry & {
    computeBoundsTree?: typeof computeBoundsTree
    disposeBoundsTree?: typeof disposeBoundsTree
  }

  ;(bvhGeometry as any).computeBoundsTree = computeBoundsTree
  ;(bvhGeometry as any).disposeBoundsTree = disposeBoundsTree
  bvhGeometry.computeBoundsTree?.({
    maxLeafSize: 12,
    strategy: 0,
  } as never)
  bvhGeometry.computeBoundingBox()

  const mesh = new THREE.Mesh(bvhGeometry, COLLIDER_MATERIAL)
  mesh.raycast = acceleratedRaycast
  mesh.visible = true
  mesh.userData = {
    excludeCollisionCheck: false,
    excludeFloatHit: false,
    friction: 0.8,
    restitution: 0.05,
    type: 'STATIC',
  }
  mesh.updateMatrixWorld(true)

  return {
    bounds: bvhGeometry.boundingBox?.clone() ?? null,
    dispose: () => {
      bvhGeometry.disposeBoundsTree?.()
      bvhGeometry.dispose()
    },
    mesh,
  }
}

export function deriveFirstPersonSpawn(
  camera: THREE.Camera,
  world: FirstPersonColliderWorld,
): FirstPersonSpawn {
  const direction = new THREE.Vector3()
  camera.getWorldDirection(direction)
  direction.y = 0
  if (direction.lengthSq() < 1e-6) {
    direction.set(0, 0, -1)
  } else {
    direction.normalize()
  }

  const yaw = Math.atan2(-direction.x, -direction.z)
  const raycaster = new THREE.Raycaster()
  const candidates: Array<[number, number]> = [[camera.position.x, camera.position.z]]

  const boundsCenter = world.bounds?.getCenter(new THREE.Vector3())
  if (boundsCenter) candidates.push([boundsCenter.x, boundsCenter.z])

  for (const [x, z] of candidates) {
    const topY =
      Math.max(world.bounds?.max.y ?? camera.position.y, camera.position.y) + RAYCAST_CLEARANCE
    raycaster.set(new THREE.Vector3(x, topY, z), DOWN)
    const intersections = raycaster.intersectObject(world.mesh, false)
    const hit = intersections.find((intersection) => {
      if (!intersection.face) return true
      const normal = intersection.face.normal.clone().transformDirection(world.mesh.matrixWorld)
      return normal.dot(UP) > 0.2
    })

    if (hit) {
      return {
        position: [hit.point.x, hit.point.y + SPAWN_EYE_HEIGHT, hit.point.z],
        yaw,
      }
    }
  }

  return {
    position: [camera.position.x, Math.max(camera.position.y, SPAWN_EYE_HEIGHT), camera.position.z],
    yaw,
  }
}

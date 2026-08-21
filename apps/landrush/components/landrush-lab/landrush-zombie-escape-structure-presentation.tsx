'use client'

import { type AnyNode, type AnyNodeId, sceneRegistry } from '@pascal-app/core'
import { useFrame, useThree } from '@react-three/fiber'
import { type MutableRefObject, useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, type Object3D } from 'three'
import { isLandrushRevealObjectOwnedByRoot } from './robot-reveal-mesh-ownership'
import type { ZombieEscapeSimulation } from './zombie-escape-simulation'

const STRUCTURE_NODE_TYPES = new Set([
  'ceiling',
  'column',
  'door',
  'elevator',
  'fence',
  'roof',
  'roof-segment',
  'slab',
  'stair',
  'stair-segment',
  'wall',
  'window',
])

type StructureOverlayEntry = {
  nodeId: string
  overlay: Mesh
  source: Mesh
  sourceRoot: Object3D
}

export function collectLandrushZombieEscapeStructureNodeIds(nodes: Record<string, AnyNode>) {
  return Object.values(nodes)
    .filter((node) => {
      if (!STRUCTURE_NODE_TYPES.has(node.type) || node.visible === false) return false
      const metadata = node.metadata as { isTransient?: boolean } | undefined
      return metadata?.isTransient !== true && nodeBelongsToGroundFloor(node, nodes)
    })
    .map((node) => node.id as string)
    .sort((first, second) => first.localeCompare(second))
}

export function LandrushZombieEscapeStructurePresentation({
  active,
  nodes,
  simulationRef,
}: {
  active: boolean
  nodes: Record<string, AnyNode>
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const { scene } = useThree()
  const root = useMemo(() => {
    const group = new Group()
    group.name = 'landrush-zombie-escape-structure-xray'
    group.renderOrder = 90
    return group
  }, [])
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        blending: AdditiveBlending,
        color: '#5ee8ff',
        depthTest: false,
        depthWrite: false,
        opacity: 0.2,
        side: DoubleSide,
        toneMapped: false,
        transparent: true,
      }),
    [],
  )
  const entriesRef = useRef<StructureOverlayEntry[]>([])
  const hiddenRootsRef = useRef(new Map<Object3D, boolean>())
  const nodesRef = useRef(nodes)
  const refreshRequestedRef = useRef(true)
  const lastRefreshAtRef = useRef(Number.NEGATIVE_INFINITY)
  nodesRef.current = nodes

  useEffect(() => {
    scene.add(root)
    return () => {
      restoreHiddenStructureRoots(hiddenRootsRef.current)
      root.remove(...root.children)
      scene.remove(root)
      material.dispose()
    }
  }, [material, root, scene])

  useFrame(({ clock }) => {
    root.visible = active
    if (!active) {
      restoreHiddenStructureRoots(hiddenRootsRef.current)
      return
    }

    if (refreshRequestedRef.current || clock.elapsedTime - lastRefreshAtRef.current >= 0.25) {
      refreshRequestedRef.current = false
      lastRefreshAtRef.current = clock.elapsedTime
      entriesRef.current = rebuildStructureOverlays(root, material, nodesRef.current)
    }

    const destroyedObjectIds = simulationRef.current.destroyedObstacleIds
    syncDestroyedStructureRoots(destroyedObjectIds, hiddenRootsRef.current)
    for (const entry of entriesRef.current) {
      entry.overlay.visible =
        !destroyedObjectIds.has(entry.nodeId) &&
        isVisibleWithinSourceRoot(entry.source, entry.sourceRoot)
      if (!entry.overlay.visible) continue
      entry.source.updateWorldMatrix(true, false)
      entry.overlay.matrix.copy(entry.source.matrixWorld)
    }
  }, 0.88)

  return null
}

function rebuildStructureOverlays(
  root: Group,
  material: MeshBasicMaterial,
  nodes: Record<string, AnyNode>,
) {
  root.remove(...root.children)
  const entries: StructureOverlayEntry[] = []
  const registeredRoots = new Set(sceneRegistry.nodes.values())
  for (const nodeId of collectLandrushZombieEscapeStructureNodeIds(nodes)) {
    const sourceRoot = sceneRegistry.nodes.get(nodeId as AnyNodeId)
    if (!sourceRoot) continue
    sourceRoot.traverse((object) => {
      const source = object as Mesh
      if (!source.isMesh || !source.geometry) return
      if (!isLandrushRevealObjectOwnedByRoot(source, sourceRoot, registeredRoots)) return
      const overlay = new Mesh(source.geometry, material)
      overlay.frustumCulled = false
      overlay.matrixAutoUpdate = false
      overlay.name = `zombie-escape-xray:${nodeId}:${source.name}`
      overlay.renderOrder = 90
      root.add(overlay)
      entries.push({ nodeId, overlay, source, sourceRoot })
    })
  }
  return entries
}

function syncDestroyedStructureRoots(
  destroyedObjectIds: ReadonlySet<string>,
  hiddenRoots: Map<Object3D, boolean>,
) {
  const destroyedRoots = new Set<Object3D>()
  for (const objectId of destroyedObjectIds) {
    const root = sceneRegistry.nodes.get(objectId as AnyNodeId)
    if (root) destroyedRoots.add(root)
  }
  for (const [root, wasVisible] of hiddenRoots) {
    if (destroyedRoots.has(root)) continue
    root.visible = wasVisible
    hiddenRoots.delete(root)
  }
  for (const root of destroyedRoots) {
    if (!hiddenRoots.has(root)) hiddenRoots.set(root, root.visible)
    root.visible = false
  }
}

function restoreHiddenStructureRoots(hiddenRoots: Map<Object3D, boolean>) {
  for (const [root, wasVisible] of hiddenRoots) root.visible = wasVisible
  hiddenRoots.clear()
}

function isVisibleWithinSourceRoot(source: Object3D, sourceRoot: Object3D) {
  let current: Object3D | null = source
  while (current) {
    if (!current.visible) return false
    if (current === sourceRoot) return true
    current = current.parent
  }
  return false
}

function nodeBelongsToGroundFloor(node: AnyNode, nodes: Record<string, AnyNode>) {
  let current: AnyNode | undefined = node
  const visited = new Set<string>()
  while (current) {
    if (current.type === 'level') return current.level === 0
    const parentId = current.parentId as string | null
    if (!parentId || visited.has(parentId)) return false
    visited.add(parentId)
    current = nodes[parentId]
  }
  return false
}

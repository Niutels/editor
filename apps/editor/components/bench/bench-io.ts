// Scene digest, checkpoint capture/restore, camera pose, and world→screen
// projection for the bench bridge.
//
// The digest is id-NORMALIZED: node ids are minted fresh on every placement, so
// raw hashing would false-diverge on replay. We hash each node's structural
// content (kind, geometry, quantized transforms) with id-shaped keys stripped
// and keys sorted, over the id-sorted node list. Hierarchy via parent ids is
// intentionally excluded (ids are volatile); count + kinds + positions is
// discriminative enough for divergence detection, documented in
// tooling/bench/README.md.

import { useScene } from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import type { Camera, WebGLRenderer } from 'three'
import { Vector3 } from 'three'

type SceneGraphSnapshot = {
  nodes: Record<string, unknown>
  rootNodeIds: string[]
  collections?: unknown
  materials?: unknown
}

export type BenchCheckpoint = {
  capturedAt: number
  digest: string
  nodeCount: number
  graph: SceneGraphSnapshot
  camera: BenchCameraPose | null
  editor: {
    phase: unknown
    mode: unknown
    tool: unknown
    structureLayer: unknown
    gridSnapStep: unknown
    isFirstPersonMode: boolean
  }
}

export type BenchCameraPose = {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  /** CameraControls target when available (build mode). */
  target?: [number, number, number]
}

export type BenchDigest = { hash: string; nodeCount: number; kinds: Record<string, number> }

const ID_KEY_PATTERN = /(^id$|Id$|Ids$|^ids$|^uuid$)/

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 1e4) / 1e4 : 0
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (ID_KEY_PATTERN.test(key)) continue
      out[key] = sanitizeValue((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function computeSceneDigest(): BenchDigest {
  const { nodes } = useScene.getState()
  const nodeRecord = nodes as unknown as Record<string, unknown>
  const kinds: Record<string, number> = {}
  const parts: string[] = []
  for (const id of Object.keys(nodeRecord).sort()) {
    const node = nodeRecord[id] as Record<string, unknown> | undefined
    if (!node) continue
    const kind = String(node.type ?? node.kind ?? 'unknown')
    kinds[kind] = (kinds[kind] ?? 0) + 1
    parts.push(JSON.stringify(sanitizeValue(node)))
  }
  // Sort content strings so id-order (insertion-order) differences cannot leak
  // into the hash.
  parts.sort()
  let hash = 0x811c9dc5
  for (const part of parts) hash = (Math.imul(hash, 31) + fnv1a(part)) >>> 0
  return { hash: hash.toString(16).padStart(8, '0'), nodeCount: parts.length, kinds }
}

type CameraControlsLike = {
  getTarget?: (out: Vector3) => Vector3
  setLookAt?: (
    px: number,
    py: number,
    pz: number,
    tx: number,
    ty: number,
    tz: number,
    animate?: boolean,
  ) => unknown
}

export function getCameraPose(camera: Camera, controls: unknown): BenchCameraPose {
  const pose: BenchCameraPose = {
    position: [camera.position.x, camera.position.y, camera.position.z],
    quaternion: [
      camera.quaternion.x,
      camera.quaternion.y,
      camera.quaternion.z,
      camera.quaternion.w,
    ],
  }
  const cc = controls as CameraControlsLike | null
  if (cc?.getTarget) {
    try {
      const target = cc.getTarget(new Vector3())
      pose.target = [target.x, target.y, target.z]
    } catch {
      /* controls not ready */
    }
  }
  return pose
}

export function setCameraPose(camera: Camera, controls: unknown, pose: BenchCameraPose): boolean {
  const cc = controls as CameraControlsLike | null
  if (cc?.setLookAt && pose.target) {
    try {
      cc.setLookAt(
        pose.position[0],
        pose.position[1],
        pose.position[2],
        pose.target[0],
        pose.target[1],
        pose.target[2],
        false,
      )
      return true
    } catch {
      /* fall through to direct set */
    }
  }
  camera.position.set(pose.position[0], pose.position[1], pose.position[2])
  camera.quaternion.set(
    pose.quaternion[0],
    pose.quaternion[1],
    pose.quaternion[2],
    pose.quaternion[3],
  )
  camera.updateMatrixWorld(true)
  return true
}

/** World point → CSS pixel coordinates on the canvas (for CDP mouse targeting). */
export function projectWorldPoint(
  camera: Camera,
  renderer: Pick<WebGLRenderer, 'domElement'>,
  world: [number, number, number],
): { x: number; y: number; visible: boolean } {
  const v = new Vector3(world[0], world[1], world[2]).project(camera)
  const rect = renderer.domElement.getBoundingClientRect()
  const x = rect.left + ((v.x + 1) / 2) * rect.width
  const y = rect.top + ((1 - v.y) / 2) * rect.height
  const visible =
    v.z > -1 && v.z < 1 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  return { x, y, visible }
}

export function captureCheckpoint(camera: Camera | null, controls: unknown): BenchCheckpoint {
  const scene = useScene.getState()
  const editor = useEditor.getState() as Record<string, unknown>
  const digest = computeSceneDigest()
  return {
    capturedAt: performance.now(),
    digest: digest.hash,
    nodeCount: digest.nodeCount,
    graph: structuredClone({
      nodes: scene.nodes as Record<string, unknown>,
      rootNodeIds: [...scene.rootNodeIds],
      collections: (scene as unknown as Record<string, unknown>).collections,
      materials: (scene as unknown as Record<string, unknown>).materials,
    }),
    camera: camera ? getCameraPose(camera, controls) : null,
    editor: {
      phase: editor.phase,
      mode: editor.mode,
      tool: editor.tool,
      structureLayer: editor.structureLayer,
      gridSnapStep: editor.gridSnapStep,
      isFirstPersonMode: Boolean(editor.isFirstPersonMode),
    },
  }
}

export function restoreCheckpointState(
  checkpoint: BenchCheckpoint,
  camera: Camera | null,
  controls: unknown,
): void {
  const scene = useScene.getState() as unknown as {
    setScene: (
      nodes: Record<string, unknown>,
      rootNodeIds: string[],
      extra?: { collections?: unknown; materials?: unknown },
    ) => void
  }
  scene.setScene(structuredClone(checkpoint.graph.nodes), [...checkpoint.graph.rootNodeIds], {
    collections: structuredClone(checkpoint.graph.collections),
    materials: structuredClone(checkpoint.graph.materials),
  })

  const editor = useEditor.getState() as unknown as {
    setPhase?: (phase: never) => void
    setMode?: (mode: never) => void
    setTool?: (tool: never) => void
  }
  editor.setPhase?.(checkpoint.editor.phase as never)
  editor.setMode?.(checkpoint.editor.mode as never)
  editor.setTool?.(checkpoint.editor.tool as never)

  if (camera && checkpoint.camera) setCameraPose(camera, controls, checkpoint.camera)
}

'use client'

import { emitter } from '@pascal-app/core'
import { Editor, useEditor, useScene, useViewer } from '@pascal-app/editor'
import {
  LANDRUSH_BRUNO_WATER_NOISE_RESOLUTION,
  LANDRUSH_WATER_SURFACE_ELEVATION,
  LANDRUSH_WATER_SURFACE_PARAMETERS,
  LANDRUSH_WATER_SURFACE_THICKNESS,
  type LandrushWorldNode,
} from '@landrush/pascal-plugin'
import { renderScheduler } from '@pascal-app/viewer'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LandrushModeController } from './landrush-mode-controller'
import {
  createPascalLandrushScene,
  LANDRUSH_BUILDING_ID,
  LANDRUSH_LEVEL_ID,
  LANDRUSH_WORLD_ID,
  ownerPropertyFromWorld,
} from './pascal-landrush-scene'
import type { LandrushBuildTool, LandrushCharacterState, LandrushMode } from './types'

type CameraTuple = [number, number, number]

const LANDRUSH_CAMERA_FRAME_DELAYS_MS = [0, 120, 520, 1200, 2200, 3600, 5200, 6800] as const
const LANDRUSH_WATER_PROOF_CAMERA_FRAME_DELAYS_MS = [0, 180, 600] as const

function emitLandrushCameraPose(pose: { position: CameraTuple; target: CameraTuple }) {
  emitter.emit('camera:go-to-position', pose)
  renderScheduler.requestFrame('camera:start')
  renderScheduler.requestFrame('camera:move')
  window.setTimeout(() => renderScheduler.requestFrame('camera:end'), 80)
}

function getWalkCameraPose(character: LandrushCharacterState) {
  const heading = character.heading
  const forward = {
    x: Math.sin(heading),
    z: Math.cos(heading),
  }
  const side = {
    x: Math.cos(heading),
    z: -Math.sin(heading),
  }
  const speed = Math.hypot(character.velocity.x, character.velocity.z)
  const distance = 6.3 + Math.min(speed, 8) * 0.18
  const sideOffset = character.isMoving ? 0.72 : 0.92
  const targetHeight = 1.38
  const lookAhead = character.isMoving ? Math.min(1.7, 0.55 + speed * 0.16) : 0.35

  return {
    position: [
      character.position.x - forward.x * distance + side.x * sideOffset,
      3.25 + Math.min(speed, 8) * 0.045,
      character.position.z - forward.z * distance + side.z * sideOffset,
    ] as CameraTuple,
    target: [
      character.position.x + forward.x * lookAhead,
      targetHeight,
      character.position.z + forward.z * lookAhead,
    ] as CameraTuple,
  }
}

function frameLandrushCamera(world: LandrushWorldNode, mode: LandrushMode) {
  const owner = world.parcels.find((parcel) => parcel.id === world.ownerParcelId)
  const ownerCenter = owner?.centroid ?? { x: 0, z: 0 }
  const playerPosition = world.playerPosition

  const pose =
    mode === 'intro'
      ? {
          position: [58, 48, 58] as CameraTuple,
          target: [0, 0, 0] as CameraTuple,
        }
      : mode === 'build'
        ? {
            position: [ownerCenter.x + 9, 42, ownerCenter.z + 11] as CameraTuple,
            target: [ownerCenter.x, 0, ownerCenter.z] as CameraTuple,
          }
        : {
            position: [playerPosition[0] + 6.5, 4.8, playerPosition[2] + 8.5] as CameraTuple,
            target: [playerPosition[0], 1.2, playerPosition[2]] as CameraTuple,
          }

  for (const delayMs of LANDRUSH_CAMERA_FRAME_DELAYS_MS) {
    window.setTimeout(() => {
      const currentWorld = useScene.getState().nodes[LANDRUSH_WORLD_ID as never] as
        | LandrushWorldNode
        | undefined
      if (currentWorld?.landrushMode && currentWorld.landrushMode !== mode) return
      emitLandrushCameraPose(pose)
    }, delayMs)
  }
}

function frameLandrushWaterProofCamera(world: LandrushWorldNode) {
  const bounds = world.perimeter.bounds
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  }
  const span = Math.max(bounds.width, bounds.depth)
  const pose = {
    position: [center.x + span * 0.62, span * 0.56, center.z + span * 0.74] as CameraTuple,
    target: [center.x, 0, center.z] as CameraTuple,
  }

  for (const delayMs of LANDRUSH_WATER_PROOF_CAMERA_FRAME_DELAYS_MS) {
    window.setTimeout(() => emitLandrushCameraPose(pose), delayMs)
  }
}

export function LandrushPascalShell() {
  const scene = useMemo(() => createPascalLandrushScene(), [])
  const ownerProperty = useMemo(() => ownerPropertyFromWorld(scene.world), [scene.world])
  const routeSearchParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams()
    return new URLSearchParams(window.location.search)
  }, [])
  const debugLandrush = useMemo(() => {
    return routeSearchParams.get('debugLandrush') === '1'
  }, [routeSearchParams])
  const landrushWaterProof = useMemo(() => {
    return routeSearchParams.get('proof') === 'water'
  }, [routeSearchParams])
  const initialLandrushMode: LandrushMode = landrushWaterProof ? 'walk' : 'intro'
  const [activeToolId, setActiveToolId] = useState('place')
  const lastFollowCameraAtRef = useRef(0)
  const handleLoad = useCallback(async () => {
    if (!landrushWaterProof) return scene.graph

    return {
      ...scene.graph,
      nodes: {
        ...scene.graph.nodes,
        [LANDRUSH_WORLD_ID]: {
          ...scene.world,
          focusParcelId: null,
          landrushMode: 'walk',
        },
      },
    }
  }, [landrushWaterProof, scene.graph, scene.world])

  useEffect(() => {
    if (!debugLandrush) return

    const globals = globalThis as typeof globalThis & {
      __LANDRUSH_PASCAL__?: { getState: () => unknown }
      __pascalNodeRegistry?: {
        entries?: () => Iterable<[string, unknown]>
        has?: (kind: string) => boolean
        size?: number
      }
    }

    globals.__LANDRUSH_PASCAL__ = {
      getState: () => {
        const editor = useEditor.getState()
        const viewer = useViewer.getState()
        const sceneStore = useScene.getState()
        const world = sceneStore.nodes[LANDRUSH_WORLD_ID as never] as
          | {
              type?: string
              landrushMode?: string
              focusParcelId?: string | null
              ownerParcelId?: string
              playerHeading?: number
              playerMoving?: boolean
              playerPosition?: [number, number, number]
              playerSpeed?: number
              perimeter?: { closed?: boolean; bounds?: unknown }
              parcels?: Array<{ kind?: string; vertices?: unknown[] }>
              roads?: {
                connected?: boolean
                connectedParcelIds?: string[]
                segments?: Array<{ points?: unknown[] }>
                sidewalks?: Array<{ points?: unknown[] }>
              }
              trees?: unknown[]
              metadata?: { source?: string; verificationSummary?: string }
            }
          | undefined
        const registry = globals.__pascalNodeRegistry
        const registryKinds =
          typeof registry?.entries === 'function'
            ? Array.from(registry.entries(), ([kind]) => kind)
            : []

        return {
          activeToolId,
          editor: {
            mode: editor.mode,
            phase: editor.phase,
            tool: editor.tool,
            viewMode: editor.viewMode,
          },
          registry: {
            hasLandrushWorld:
              typeof registry?.has === 'function' ? registry.has('landrush-world') : false,
            kinds: registryKinds,
            size: registry?.size ?? 0,
          },
          proof: {
            mode: landrushWaterProof ? 'water' : null,
            route: landrushWaterProof,
            water: landrushWaterProof
              ? {
                  elevation: LANDRUSH_WATER_SURFACE_ELEVATION,
                  noiseTextureSize: LANDRUSH_BRUNO_WATER_NOISE_RESOLUTION,
                  parameterCount: Object.keys(LANDRUSH_WATER_SURFACE_PARAMETERS).length,
                  parameters: LANDRUSH_WATER_SURFACE_PARAMETERS,
                  surfaceThickness: LANDRUSH_WATER_SURFACE_THICKNESS,
                }
              : null,
          },
          viewer: {
            cameraMode: viewer.cameraMode,
            selection: viewer.selection,
            showGrid: viewer.showGrid,
          },
          world: world
            ? {
                connectedParcels: world.roads?.connectedParcelIds?.length ?? 0,
                focusParcelId: world.focusParcelId ?? null,
                landrushMode: world.landrushMode,
                ownerCount: world.parcels?.filter((parcel) => parcel.kind === 'owner').length ?? 0,
                ownerParcelId: world.ownerParcelId,
                playerHeading: world.playerHeading ?? 0,
                playerMoving: world.playerMoving ?? false,
                parcels: world.parcels?.length ?? 0,
                parcelVertexCounts: world.parcels?.map((parcel) => parcel.vertices?.length ?? 0),
                perimeterClosed: world.perimeter?.closed ?? false,
                perimeterBounds: world.perimeter?.bounds,
                playerPosition: world.playerPosition,
                playerSpeed: world.playerSpeed ?? 0,
                roadPointCounts: world.roads?.segments?.map(
                  (segment) => segment.points?.length ?? 0,
                ),
                roadsConnected: world.roads?.connected ?? false,
                sidewalkPointCounts: world.roads?.sidewalks?.map(
                  (sidewalk) => sidewalk.points?.length ?? 0,
                ),
                source: world.metadata?.source,
                trees: world.trees?.length ?? 0,
                type: world.type,
                verificationSummary: world.metadata?.verificationSummary,
              }
            : null,
        }
      },
    }

    return () => {
      delete globals.__LANDRUSH_PASCAL__
    }
  }, [activeToolId, debugLandrush, landrushWaterProof])

  useEffect(() => {
    const editor = useEditor.getState()
    const viewer = useViewer.getState()
    const sceneStore = useScene.getState()
    viewer.setSelection({
      buildingId: LANDRUSH_BUILDING_ID as never,
      levelId: LANDRUSH_LEVEL_ID as never,
      selectedIds: [],
      zoneId: null,
    })
    viewer.setCameraMode('perspective')
    viewer.setShowGrid(false)

    if (landrushWaterProof) {
      editor.setFirstPersonMode(false)
      editor.setPreviewMode(false)
      editor.setViewMode('3d')
      editor.setMode('select')
      editor.setTool(null)
      sceneStore.updateNode(
        LANDRUSH_WORLD_ID as never,
        {
          focusParcelId: null,
          landrushMode: 'walk',
        } as never,
      )
      frameLandrushWaterProofCamera(scene.world)
      return
    }

    frameLandrushCamera(scene.world, 'intro')
  }, [landrushWaterProof, scene.world])

  const syncMode = useCallback(
    (mode: LandrushMode) => {
      const editor = useEditor.getState()
      const viewer = useViewer.getState()
      const sceneStore = useScene.getState()

      sceneStore.updateNode(
        LANDRUSH_WORLD_ID as never,
        {
          landrushMode: mode,
          focusParcelId: mode === 'build' ? scene.world.ownerParcelId : null,
        } as never,
      )

      viewer.setSelection({
        buildingId: LANDRUSH_BUILDING_ID as never,
        levelId: LANDRUSH_LEVEL_ID as never,
        selectedIds: [],
        zoneId: null,
      })
      viewer.setCameraMode('perspective')
      viewer.setShowGrid(false)
      frameLandrushCamera(
        {
          ...scene.world,
          landrushMode: mode,
          playerPosition:
            (sceneStore.nodes[LANDRUSH_WORLD_ID as never] as LandrushWorldNode | undefined)
              ?.playerPosition ?? scene.world.playerPosition,
        },
        mode,
      )

      if (mode === 'build') {
        editor.setFirstPersonMode(false)
        editor.setViewMode('3d')
        editor.setPhase('structure')
        editor.setMode('build')
        editor.setTool('wall')
        return
      }

      editor.setViewMode('3d')
      editor.setMode('select')
    },
    [scene.world],
  )

  const syncCharacter = useCallback(
    (character: LandrushCharacterState) => {
      const sceneStore = useScene.getState()
      sceneStore.updateNode(
        LANDRUSH_WORLD_ID as never,
        {
          playerPosition: [character.position.x, character.position.y, character.position.z],
          playerHeading: character.heading,
          playerMoving: character.isMoving,
          playerSpeed: Math.hypot(character.velocity.x, character.velocity.z),
        } as never,
      )
      if (landrushWaterProof) return
      const world = sceneStore.nodes[LANDRUSH_WORLD_ID as never] as LandrushWorldNode | undefined
      if (world?.landrushMode !== 'walk') return

      const now = performance.now()
      if (now - lastFollowCameraAtRef.current < 34) return
      lastFollowCameraAtRef.current = now
      emitLandrushCameraPose(getWalkCameraPose(character))
    },
    [landrushWaterProof],
  )

  const selectBuildTool = useCallback((tool: LandrushBuildTool) => {
    setActiveToolId(tool.id)
    const editor = useEditor.getState()
    if (tool.id === 'paint') {
      editor.setMode('material-paint')
      return
    }
    if (tool.id === 'move') {
      editor.setMode('select')
      return
    }
    editor.setPhase('structure')
    editor.setMode('build')
    editor.setTool('wall')
  }, [])

  return (
    <LandrushModeController
      activeBuildToolId={activeToolId}
      buildActivationDistance={2.5}
      className="h-screen w-screen bg-sky-950"
      buildMenu={landrushWaterProof ? null : undefined}
      disabled={landrushWaterProof}
      initialMode={initialLandrushMode}
      introPanel={landrushWaterProof ? null : undefined}
      introSubtitle="Claim one procedural island parcel, then build through Pascal."
      onBuildToolSelect={selectBuildTool}
      onCharacterMove={syncCharacter}
      onModeChange={syncMode}
      ownerProperty={ownerProperty}
      renderCharacter={landrushWaterProof ? () => null : undefined}
      renderIslandFade={landrushWaterProof ? () => null : undefined}
      showDefaultCharacter={!landrushWaterProof}
      showModePill={!landrushWaterProof}
      spawnPosition={scene.world.playerStart}
    >
      <Editor
        layoutVersion="v2"
        onLoad={handleLoad}
        projectId="pascal-landrush"
        showEditorChrome={false}
        viewerPostProcessing={false}
        viewerRendererBackend="webgpu"
        viewerUseBvh={false}
      />
    </LandrushModeController>
  )
}

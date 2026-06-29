'use client'

import {
  type AnyNodeId,
  type CameraControlEvent,
  type CameraControlFitSceneEvent,
  emitter,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import { GRID_LAYER, renderScheduler, useViewer, ZONE_LAYER } from '@pascal-app/viewer'
import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Box3, Vector3 } from 'three'
import { EDITOR_LAYER } from '../../lib/constants'
import useEditor from '../../store/use-editor'

const currentTarget = new Vector3()
const tempBox = new Box3()
const tempCenter = new Vector3()
const tempDelta = new Vector3()
const tempPosition = new Vector3()
const tempSize = new Vector3()
const tempTarget = new Vector3()
const DEFAULT_MAX_POLAR_ANGLE = Math.PI / 2 - 0.1
const DEBUG_MAX_POLAR_ANGLE = Math.PI - 0.05
const PROGRAMMATIC_CAMERA_FRAME_DELAYS_MS = [0, 80, 180, 360, 720] as const

export type EditorCameraInitialPose = {
  position: [number, number, number]
  target: [number, number, number]
}

declare global {
  interface Window {
    __PASCAL_APPLY_VIEWER_BENCH_STATE__?:
      | ((state: {
          edges?: 'off' | 'soft' | 'strong'
          shading?: 'solid' | 'rendered'
          shadows?: boolean
          textures?: boolean
        }) => void)
      | null
    __PASCAL_CAMERA_CONTROLS__?: CameraControlsImpl | null
    __PASCAL_CAMERA_DRAGGING__?: boolean
    __PASCAL_GET_VIEWER_BENCH_STATE__?:
      | (() => {
          edges: string
          shading: string
          shadows: boolean
          textures: boolean
        })
      | null
    __PASCAL_RESET_VIEWER_INTERACTION__?: (() => void) | null
    __PASCAL_SET_CAMERA_DRAGGING__?: ((dragging: boolean) => void) | null
  }
}

export const CustomCameraControls = ({
  initialPose,
}: {
  initialPose?: EditorCameraInitialPose | null
}) => {
  const controls = useRef<CameraControlsImpl>(null!)
  const isPreviewMode = useEditor((s) => s.isPreviewMode)
  const isFirstPersonMode = useEditor((s) => s.isFirstPersonMode)
  const allowUndergroundCamera = useEditor((s) => s.allowUndergroundCamera)
  const selection = useViewer((s) => s.selection)
  const currentLevelId = selection.levelId
  const firstLoad = useRef(true)
  const initialPoseAppliedRef = useRef(false)
  const maxPolarAngle =
    !isPreviewMode && allowUndergroundCamera ? DEBUG_MAX_POLAR_ANGLE : DEFAULT_MAX_POLAR_ANGLE
  const isLandrushWaterProofRoute = useMemo(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    return params.get('proof') === 'water'
  }, [])

  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const raycaster = useThree((state) => state.raycaster)
  const setCameraDragging = useCallback((dragging: boolean) => {
    if (typeof window !== 'undefined') {
      window.__PASCAL_CAMERA_DRAGGING__ = dragging
    }
    useViewer.getState().setCameraDragging(dragging)
  }, [])
  const requestProgrammaticCameraFrames = useCallback(() => {
    renderScheduler.requestFrame('camera:start')
    for (const delayMs of PROGRAMMATIC_CAMERA_FRAME_DELAYS_MS) {
      window.setTimeout(() => renderScheduler.requestFrame('camera:move'), delayMs)
    }
    window.setTimeout(() => renderScheduler.requestFrame('camera:end'), 760)
  }, [])

  useEffect(() => {
    camera.layers.enable(EDITOR_LAYER)
    camera.layers.enable(GRID_LAYER)
    raycaster.layers.enable(EDITOR_LAYER)
    raycaster.layers.enable(ZONE_LAYER)
  }, [camera, raycaster])

  const applyInitialPose = useCallback(() => {
    if (!initialPose || !controls.current || initialPoseAppliedRef.current) return false
    initialPoseAppliedRef.current = true
    firstLoad.current = false
    requestProgrammaticCameraFrames()
    controls.current.setLookAt(
      initialPose.position[0],
      initialPose.position[1],
      initialPose.position[2],
      initialPose.target[0],
      initialPose.target[1],
      initialPose.target[2],
      false,
    )
    return true
  }, [initialPose, requestProgrammaticCameraFrames])

  useLayoutEffect(() => {
    if (!initialPose) return
    if (applyInitialPose()) return

    const frameId = requestAnimationFrame(() => {
      applyInitialPose()
    })
    return () => cancelAnimationFrame(frameId)
  }, [applyInitialPose])

  useEffect(() => {
    const params =
      typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)
    if (!(params?.has('perf') || params?.has('benchControls'))) {
      return
    }

    const publishControls = () => {
      const rect = gl.domElement.getBoundingClientRect()
      if (rect.width > 100 && rect.height > 100) {
        window.__PASCAL_CAMERA_CONTROLS__ = controls.current
        window.__PASCAL_APPLY_VIEWER_BENCH_STATE__ = (state) => {
          const viewer = useViewer.getState()
          if (state.edges && ['off', 'soft', 'strong'].includes(state.edges)) {
            viewer.setEdges(state.edges)
          }
          if (state.shading && ['solid', 'rendered'].includes(state.shading)) {
            viewer.setShading(state.shading)
          }
          if (typeof state.shadows === 'boolean') {
            viewer.setShadows(state.shadows)
          }
          if (typeof state.textures === 'boolean') {
            viewer.setTextures(state.textures)
          }
        }
        window.__PASCAL_GET_VIEWER_BENCH_STATE__ = () => {
          const viewer = useViewer.getState()
          return {
            edges: viewer.edges,
            shading: viewer.shading,
            shadows: viewer.shadows,
            textures: viewer.textures,
          }
        }
        window.__PASCAL_RESET_VIEWER_INTERACTION__ = () => {
          const viewer = useViewer.getState()
          viewer.resetSelection()
          viewer.setHoveredId(null)
          viewer.outliner.selectedObjects.length = 0
          viewer.outliner.hoveredObjects.length = 0
        }
        window.__PASCAL_SET_CAMERA_DRAGGING__ = setCameraDragging
      }
    }

    publishControls()
    const intervalId = window.setInterval(publishControls, 250)

    return () => {
      window.clearInterval(intervalId)
      if (window.__PASCAL_CAMERA_CONTROLS__ === controls.current) {
        window.__PASCAL_CAMERA_CONTROLS__ = null
      }
      window.__PASCAL_APPLY_VIEWER_BENCH_STATE__ = null
      window.__PASCAL_RESET_VIEWER_INTERACTION__ = null
      window.__PASCAL_GET_VIEWER_BENCH_STATE__ = null
      window.__PASCAL_SET_CAMERA_DRAGGING__ = null
      window.__PASCAL_CAMERA_DRAGGING__ = false
    }
  }, [gl, setCameraDragging])

  useEffect(() => {
    if (isPreviewMode) return // Preview mode uses auto-navigate instead
    let targetY = 0
    if (currentLevelId) {
      const levelMesh = sceneRegistry.nodes.get(currentLevelId)
      if (levelMesh) {
        targetY = levelMesh.position.y
      }
    }
    if (!controls.current) return
    if (initialPose) return
    if (firstLoad.current) {
      const selectedNode = currentLevelId ? useScene.getState().nodes[currentLevelId] : null
      if (!(currentLevelId || selectedNode?.camera)) return

      firstLoad.current = false
      if (selectedNode?.camera) {
        const { position, target } = selectedNode.camera
        requestProgrammaticCameraFrames()
        controls.current.setLookAt(
          position[0],
          position[1],
          position[2],
          target[0],
          target[1],
          target[2],
          true,
        )
      } else {
        requestProgrammaticCameraFrames()
        controls.current.setLookAt(20, 20, 20, 0, 0, 0, true)
      }
    }
    controls.current.getTarget(currentTarget)
    controls.current.moveTo(currentTarget.x, targetY, currentTarget.z, true)
  }, [currentLevelId, initialPose, isPreviewMode, requestProgrammaticCameraFrames])

  useEffect(() => {
    if (!controls.current) return

    controls.current.maxPolarAngle = maxPolarAngle
    controls.current.minPolarAngle = 0

    if (controls.current.polarAngle > maxPolarAngle) {
      controls.current.rotateTo(controls.current.azimuthAngle, maxPolarAngle, true)
    }
  }, [maxPolarAngle])

  const focusNode = useCallback(
    (nodeId: string) => {
      if (isPreviewMode || !controls.current) return

      const object3D = sceneRegistry.nodes.get(nodeId)
      if (!object3D) return

      tempBox.setFromObject(object3D)
      if (tempBox.isEmpty()) return

      tempBox.getCenter(tempCenter)
      controls.current.getPosition(tempPosition)
      controls.current.getTarget(tempTarget)
      tempDelta.copy(tempCenter).sub(tempTarget)

      requestProgrammaticCameraFrames()
      controls.current.setLookAt(
        tempPosition.x + tempDelta.x,
        tempPosition.y + tempDelta.y,
        tempPosition.z + tempDelta.z,
        tempCenter.x,
        tempCenter.y,
        tempCenter.z,
        true,
      )
    },
    [isPreviewMode, requestProgrammaticCameraFrames],
  )

  // Configure mouse buttons based on control mode and camera mode
  const cameraMode = useViewer((state) => state.cameraMode)
  const mouseButtons = useMemo(() => {
    // Use ZOOM for orthographic camera, DOLLY for perspective camera
    const wheelAction =
      cameraMode === 'orthographic'
        ? CameraControlsImpl.ACTION.ZOOM
        : CameraControlsImpl.ACTION.DOLLY

    return {
      left: isLandrushWaterProofRoute
        ? CameraControlsImpl.ACTION.ROTATE
        : isPreviewMode
          ? CameraControlsImpl.ACTION.SCREEN_PAN
          : CameraControlsImpl.ACTION.NONE,
      middle: CameraControlsImpl.ACTION.SCREEN_PAN,
      right: CameraControlsImpl.ACTION.ROTATE,
      wheel: wheelAction,
    }
  }, [cameraMode, isLandrushWaterProofRoute, isPreviewMode])

  // Touch gestures (mobile / trackpad).
  // - One finger drag    → rotate by default (much easier on a phone), but
  //                        falls back to NONE while the user is actively
  //                        placing/moving something OR in box-select mode,
  //                        so the editor's pointer handlers (place tool,
  //                        drag-to-move endpoint, marquee selection drag)
  //                        keep priority over the camera.
  //                        In preview mode it's TOUCH_TRUCK (pan), matching
  //                        preview's left = SCREEN_PAN.
  // - Two finger pinch   → zoom + pan together (TOUCH_DOLLY_TRUCK for
  //                        perspective, TOUCH_ZOOM_TRUCK for orthographic).
  // - Three finger drag  → rotate, so the camera is always orbitable even
  //                        when one-finger is suppressed by an active
  //                        editor action.
  const tool = useEditor((s) => s.tool)
  const mode = useEditor((s) => s.mode)
  const selectionTool = useEditor((s) => s.floorplanSelectionTool)
  const movingNode = useEditor((s) => s.movingNode)
  const movingWallEndpoint = useEditor((s) => s.movingWallEndpoint)
  const movingFenceEndpoint = useEditor((s) => s.movingFenceEndpoint)
  const activeHandleDrag = useEditor((s) => s.activeHandleDrag)
  const isBoxSelectActive = mode === 'select' && selectionTool === 'marquee'
  const isInteracting = Boolean(
    tool ||
      movingNode ||
      movingWallEndpoint ||
      movingFenceEndpoint ||
      activeHandleDrag ||
      isBoxSelectActive,
  )
  const touches = useMemo(() => {
    const twoFingerAction =
      cameraMode === 'orthographic'
        ? CameraControlsImpl.ACTION.TOUCH_ZOOM_TRUCK
        : CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK

    const oneFingerAction = isLandrushWaterProofRoute
      ? CameraControlsImpl.ACTION.TOUCH_ROTATE
      : isPreviewMode
        ? CameraControlsImpl.ACTION.TOUCH_TRUCK
        : isInteracting
          ? CameraControlsImpl.ACTION.NONE
          : CameraControlsImpl.ACTION.TOUCH_ROTATE

    return {
      one: oneFingerAction,
      two: twoFingerAction,
      three: CameraControlsImpl.ACTION.TOUCH_ROTATE,
    }
  }, [cameraMode, isLandrushWaterProofRoute, isPreviewMode, isInteracting])

  useEffect(() => {
    const keyState = {
      shiftRight: false,
      shiftLeft: false,
      controlRight: false,
      controlLeft: false,
      space: false,
    }

    const updateConfig = () => {
      if (!controls.current) return

      const shift = keyState.shiftRight || keyState.shiftLeft
      const control = keyState.controlRight || keyState.controlLeft
      const space = keyState.space

      const wheelAction =
        cameraMode === 'orthographic'
          ? CameraControlsImpl.ACTION.ZOOM
          : CameraControlsImpl.ACTION.DOLLY
      controls.current.mouseButtons.wheel = wheelAction
      controls.current.mouseButtons.middle = CameraControlsImpl.ACTION.SCREEN_PAN
      controls.current.mouseButtons.right = CameraControlsImpl.ACTION.ROTATE
      if (isLandrushWaterProofRoute) {
        controls.current.mouseButtons.left = CameraControlsImpl.ACTION.ROTATE
      } else if (isPreviewMode) {
        // In preview mode, left-click is always pan (viewer-style)
        controls.current.mouseButtons.left = CameraControlsImpl.ACTION.SCREEN_PAN
      } else if (space) {
        controls.current.mouseButtons.left = CameraControlsImpl.ACTION.SCREEN_PAN
      } else {
        controls.current.mouseButtons.left = CameraControlsImpl.ACTION.NONE
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        keyState.space = true
        document.body.style.cursor = 'grab'
      }
      if (event.code === 'ShiftRight') {
        keyState.shiftRight = true
      }
      if (event.code === 'ShiftLeft') {
        keyState.shiftLeft = true
      }
      if (event.code === 'ControlRight') {
        keyState.controlRight = true
      }
      if (event.code === 'ControlLeft') {
        keyState.controlLeft = true
      }
      updateConfig()
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        keyState.space = false
        document.body.style.cursor = ''
      }
      if (event.code === 'ShiftRight') {
        keyState.shiftRight = false
      }
      if (event.code === 'ShiftLeft') {
        keyState.shiftLeft = false
      }
      if (event.code === 'ControlRight') {
        keyState.controlRight = false
      }
      if (event.code === 'ControlLeft') {
        keyState.controlLeft = false
      }
      updateConfig()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    updateConfig()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [cameraMode, isLandrushWaterProofRoute, isPreviewMode])

  // Preview mode: auto-navigate camera to selected node (viewer behavior)
  const previewTargetNodeId = isPreviewMode
    ? (selection.zoneId ?? selection.levelId ?? selection.buildingId)
    : null

  useEffect(() => {
    if (!(isPreviewMode && controls.current)) return

    const nodes = useScene.getState().nodes
    let node = previewTargetNodeId ? nodes[previewTargetNodeId] : null

    if (!previewTargetNodeId) {
      const site = Object.values(nodes).find((n) => n.type === 'site')
      node = site || null
    }
    if (!node) return

    // Check if node has a saved camera
    if (node.camera) {
      const { position, target } = node.camera
      if (
        position &&
        target &&
        position.length >= 3 &&
        target.length >= 3 &&
        position.every((v) => v !== null && v !== undefined) &&
        target.every((v) => v !== null && v !== undefined)
      ) {
        requestAnimationFrame(() => {
          if (!controls.current) return
          requestProgrammaticCameraFrames()
          controls.current.setLookAt(
            position[0],
            position[1],
            position[2],
            target[0],
            target[1],
            target[2],
            true,
          )
        })
      }
      return
    }

    if (!previewTargetNodeId) return

    // Calculate camera position from bounding box
    const object3D = sceneRegistry.nodes.get(previewTargetNodeId)
    if (!object3D) return

    tempBox.setFromObject(object3D)
    tempBox.getCenter(tempCenter)
    tempBox.getSize(tempSize)

    const maxDim = Math.max(tempSize.x, tempSize.y, tempSize.z)
    const distance = Math.max(maxDim * 2, 15)

    requestProgrammaticCameraFrames()
    controls.current.setLookAt(
      tempCenter.x + distance * 0.7,
      tempCenter.y + distance * 0.5,
      tempCenter.z + distance * 0.7,
      tempCenter.x,
      tempCenter.y,
      tempCenter.z,
      true,
    )
  }, [isPreviewMode, previewTargetNodeId, requestProgrammaticCameraFrames])

  // Preset capture auto-framing — when `setCaptureMode({ mode: 'preset',
  // isolated })` fires, fly the camera to a pose that fits the union
  // bounds of the isolated subtree inside the locked square crop. The
  // user can still pan / orbit / zoom from there; we only set the
  // initial pose. On exit (`mode: 'idle'`), we restore the previous
  // pose so the user lands back exactly where they were before the
  // modal opened.
  const captureMode = useEditor((s) => s.captureMode)
  useEffect(() => {
    if (!controls.current) return
    if (captureMode.mode !== 'preset') return
    const ids = captureMode.isolated
    if (ids.length === 0) return

    // Stash the pre-capture pose so we can restore it on exit. Using
    // a ref keeps the value across the cleanup phase without
    // re-renders.
    const restorePos = new Vector3()
    const restoreTarget = new Vector3()
    controls.current.getPosition(restorePos)
    controls.current.getTarget(restoreTarget)

    // Union the bounds of every isolated subtree root. `setFromObject`
    // walks the Three.js descendants automatically, so this picks up
    // synthesized children (door/window cutouts under a wall, etc.).
    tempBox.makeEmpty()
    for (const id of ids) {
      const obj = sceneRegistry.nodes.get(id)
      if (!obj) continue
      const sub = new Box3().setFromObject(obj)
      if (!sub.isEmpty()) tempBox.union(sub)
    }
    if (tempBox.isEmpty()) return

    tempBox.getCenter(tempCenter)
    tempBox.getSize(tempSize)

    // Distance heuristic: fit the subject inside the 75%-of-shorter-
    // side square crop with comfortable padding. Multiplier 2.4 leaves
    // ~25-30% margin around the bounds so the user can frame without
    // immediately needing to zoom out, but isn't so far away that the
    // subject reads as small in the thumbnail.
    const maxDim = Math.max(tempSize.x, tempSize.y, tempSize.z)
    const distance = Math.max(maxDim * 2.4, 4)

    // Frame the subject from a 3/4 view of its front face. The node's
    // local +Z is its forward axis in this scene's authoring convention
    // (the face the user sets up to be photographed). When a single
    // subtree is isolated we read its yaw and rotate the camera around
    // the bounds center so the framing follows the user's authored
    // orientation; for multi-isolate sets we fall back to world +Z.
    // The 3/4 view offsets the camera by 35° to the right of dead-on
    // so both the front face and a side are visible — the "nice angle"
    // that reads as a product shot rather than a flat elevation. ~25°
    // elevation keeps the top visible without going isometric.
    const SIDE_OFFSET_RAD = (35 * Math.PI) / 180
    const ELEVATION_RAD = (25 * Math.PI) / 180
    let yaw = 0
    if (ids.length === 1) {
      const node = useScene.getState().nodes[ids[0] as AnyNodeId]
      if (node && 'rotation' in node) {
        const r = (node as { rotation?: unknown }).rotation
        if (typeof r === 'number') yaw = r
        else if (Array.isArray(r)) yaw = (r as [number, number, number])[1] ?? 0
      }
    }
    // World-space direction the camera should sit *along* relative to
    // bounds center: in front (object's local +Z under yaw) + a right
    // offset around Y for the 3/4 read.
    const viewAngle = yaw + SIDE_OFFSET_RAD
    const horizontal = distance * Math.cos(ELEVATION_RAD)
    const elevation = distance * Math.sin(ELEVATION_RAD)
    requestProgrammaticCameraFrames()
    controls.current.setLookAt(
      tempCenter.x + Math.sin(viewAngle) * horizontal,
      tempCenter.y + elevation,
      tempCenter.z + Math.cos(viewAngle) * horizontal,
      tempCenter.x,
      tempCenter.y,
      tempCenter.z,
      true,
    )

    return () => {
      // Cleanup runs on captureMode change *or* unmount. Restore the
      // pre-capture pose only if the controls are still around (during
      // unmount they might be torn down already).
      if (!controls.current) return
      requestProgrammaticCameraFrames()
      controls.current.setLookAt(
        restorePos.x,
        restorePos.y,
        restorePos.z,
        restoreTarget.x,
        restoreTarget.y,
        restoreTarget.z,
        true,
      )
    }
  }, [captureMode, requestProgrammaticCameraFrames])

  useEffect(() => {
    const handleNodeCapture = ({ nodeId }: CameraControlEvent) => {
      if (!controls.current) return

      const position = new Vector3()
      const target = new Vector3()
      controls.current.getPosition(position)
      controls.current.getTarget(target)

      const state = useScene.getState()

      state.updateNode(nodeId, {
        camera: {
          position: [position.x, position.y, position.z],
          target: [target.x, target.y, target.z],
          mode: useViewer.getState().cameraMode,
        },
      })
    }
    const handleNodeView = ({ nodeId }: CameraControlEvent) => {
      if (!controls.current) return

      const node = useScene.getState().nodes[nodeId]
      if (!node?.camera) return
      const { position, target } = node.camera

      requestProgrammaticCameraFrames()
      controls.current.setLookAt(
        position[0],
        position[1],
        position[2],
        target[0],
        target[1],
        target[2],
        true,
      )
    }

    const handleTopView = () => {
      if (!controls.current) return

      const currentPolarAngle = controls.current.polarAngle

      // Toggle: if already near top view (< 0.1 radians ≈ 5.7°), go back to 45°
      // Otherwise, go to top view (0°)
      const targetAngle = currentPolarAngle < 0.1 ? Math.PI / 4 : 0

      requestProgrammaticCameraFrames()
      controls.current.rotatePolarTo(targetAngle, true)
    }

    const handleOrbitCW = () => {
      if (!controls.current) return

      const currentAzimuth = controls.current.azimuthAngle
      const currentPolar = controls.current.polarAngle
      // Round to nearest 90° increment, then rotate 90° clockwise
      const rounded = Math.round(currentAzimuth / (Math.PI / 2)) * (Math.PI / 2)
      const target = rounded - Math.PI / 2

      requestProgrammaticCameraFrames()
      controls.current.rotateTo(target, currentPolar, true)
    }

    const handleOrbitCCW = () => {
      if (!controls.current) return

      const currentAzimuth = controls.current.azimuthAngle
      const currentPolar = controls.current.polarAngle
      // Round to nearest 90° increment, then rotate 90° counter-clockwise
      const rounded = Math.round(currentAzimuth / (Math.PI / 2)) * (Math.PI / 2)
      const target = rounded + Math.PI / 2

      requestProgrammaticCameraFrames()
      controls.current.rotateTo(target, currentPolar, true)
    }

    const handleNodeFocus = ({ nodeId }: CameraControlEvent) => {
      focusNode(nodeId)
    }

    const handleGoToPosition = ({
      position,
      target,
    }: {
      position: [number, number, number]
      target: [number, number, number]
    }) => {
      if (!controls.current || isPreviewMode) return
      requestProgrammaticCameraFrames()
      controls.current.setLookAt(
        position[0],
        position[1],
        position[2],
        target[0],
        target[1],
        target[2],
        true,
      )
    }

    const handleFitScene = ({ bounds }: CameraControlFitSceneEvent) => {
      if (!controls.current || isPreviewMode) return
      if (!bounds) {
        // Restore default framing pose when no bounds were computed.
        requestProgrammaticCameraFrames()
        controls.current.setLookAt(20, 20, 20, 0, 0, 0, true)
        return
      }
      const [cx, cz] = bounds.center
      const [w, d] = bounds.size
      // Use the longer horizontal extent to size the orbit radius so the whole
      // footprint sits in view regardless of aspect ratio.
      const maxExtent = Math.max(w, d)
      const distance = Math.max(maxExtent * 1.4, 15)
      const height = Math.max(maxExtent * 0.8, 10)
      requestProgrammaticCameraFrames()
      controls.current.setLookAt(cx + distance * 0.7, height, cz + distance * 0.7, cx, 0, cz, true)
    }

    emitter.on('camera-controls:capture', handleNodeCapture)
    emitter.on('camera-controls:focus', handleNodeFocus)
    emitter.on('camera-controls:view', handleNodeView)
    emitter.on('camera-controls:top-view', handleTopView)
    emitter.on('camera-controls:orbit-cw', handleOrbitCW)
    emitter.on('camera-controls:orbit-ccw', handleOrbitCCW)
    emitter.on('camera-controls:fit-scene', handleFitScene)
    emitter.on('camera:go-to-position', handleGoToPosition)

    return () => {
      emitter.off('camera-controls:capture', handleNodeCapture)
      emitter.off('camera-controls:focus', handleNodeFocus)
      emitter.off('camera-controls:view', handleNodeView)
      emitter.off('camera-controls:top-view', handleTopView)
      emitter.off('camera-controls:orbit-cw', handleOrbitCW)
      emitter.off('camera-controls:orbit-ccw', handleOrbitCCW)
      emitter.off('camera-controls:fit-scene', handleFitScene)
      emitter.off('camera:go-to-position', handleGoToPosition)
    }
  }, [focusNode, isPreviewMode, requestProgrammaticCameraFrames])

  const onTransitionStart = useCallback(() => {
    setCameraDragging(true)
    renderScheduler.requestFrame('camera:start')
  }, [setCameraDragging])

  const onChange = useCallback(() => {
    renderScheduler.requestFrame('camera:move')
  }, [])

  const onRest = useCallback(() => {
    setCameraDragging(false)
    renderScheduler.requestFrame('camera:end')
  }, [setCameraDragging])

  if (isFirstPersonMode) {
    return null
  }

  // Preset capture mode frames a single subtree (often a 0.3–2m preset),
  // so the default 10m minDistance prevents the user from getting close
  // enough to compose a good thumbnail. Relax the clamp to 0.5m while
  // capturing presets; reset on exit so general editing keeps the looser
  // navigation guardrails.
  const isPresetCapture = captureMode.mode === 'preset'
  const minDistance = isPresetCapture ? 0.5 : 10

  return (
    <CameraControls
      makeDefault
      maxDistance={500}
      maxPolarAngle={maxPolarAngle}
      minDistance={minDistance}
      minPolarAngle={0}
      mouseButtons={mouseButtons}
      onChange={onChange}
      onRest={onRest}
      onSleep={onRest}
      onTransitionStart={onTransitionStart}
      ref={controls}
      restThreshold={0.01}
      touches={touches}
    />
  )
}

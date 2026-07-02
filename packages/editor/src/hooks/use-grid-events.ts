import {
  type AnyNodeId,
  type EventSuffix,
  emitter,
  type GridEvent,
  sceneRegistry,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'

const TOUCH_TAP_MAX_DISTANCE_PX = 10
const TOUCH_NATIVE_CLICK_SUPPRESSION_MS = 700
const TOUCH_NATIVE_CLICK_SUPPRESSION_RADIUS_PX = 24

type TouchTapStart = {
  id: number
  x: number
  y: number
}

type SyntheticTouchClick = {
  at: number
  x: number
  y: number
}

function getGridEventTarget(canvas: HTMLCanvasElement, connected: unknown) {
  return connected instanceof HTMLElement ? connected : canvas
}

/**
 * Custom grid events hook that uses manual raycasting instead of mesh events.
 * This ensures grid events work even when other meshes block pointer events with stopPropagation.
 */
export function useGridEvents(gridY: number) {
  const { camera, events, gl } = useThree()
  const raycaster = useRef(new Raycaster())
  const pointer = useRef(new Vector2())
  const groundPlane = useRef(new Plane(new Vector3(0, 1, 0), 0))
  const intersectionPoint = useRef(new Vector3())
  const touchTapStart = useRef<TouchTapStart | null>(null)
  const syntheticTouchClick = useRef<SyntheticTouchClick | null>(null)

  // Update ground plane when grid Y changes
  useEffect(() => {
    groundPlane.current.constant = -gridY
  }, [gridY])

  useEffect(() => {
    const canvas = gl.domElement
    const eventTarget = getGridEventTarget(canvas, events.connected)

    const getIntersection = (nativeEvent: MouseEvent | PointerEvent): Vector3 | null => {
      // Convert mouse position to normalized device coordinates (-1 to +1)
      const rect = canvas.getBoundingClientRect()
      if (
        nativeEvent.clientX < rect.left ||
        nativeEvent.clientX > rect.right ||
        nativeEvent.clientY < rect.top ||
        nativeEvent.clientY > rect.bottom
      ) {
        return null
      }
      pointer.current.x = ((nativeEvent.clientX - rect.left) / rect.width) * 2 - 1
      pointer.current.y = -((nativeEvent.clientY - rect.top) / rect.height) * 2 + 1

      // Update raycaster
      raycaster.current.setFromCamera(pointer.current, camera)

      // Intersect with ground plane
      if (raycaster.current.ray.intersectPlane(groundPlane.current, intersectionPoint.current)) {
        return intersectionPoint.current.clone()
      }

      return null
    }

    const emit = (suffix: EventSuffix, nativeEvent: MouseEvent | PointerEvent) => {
      const point = getIntersection(nativeEvent)
      if (!point) return

      // Convert world-space point to building-local for tools that live inside a building.
      const buildingId = useViewer.getState().selection.buildingId
      const buildingMesh = buildingId ? sceneRegistry.nodes.get(buildingId as AnyNodeId) : null
      const localPoint = buildingMesh ? buildingMesh.worldToLocal(point.clone()) : point

      const eventKey = `grid:${suffix}` as `grid:${EventSuffix}`
      const payload: GridEvent = {
        position: [point.x, point.y, point.z],
        localPosition: [localPoint.x, localPoint.y, localPoint.z],
        nativeEvent: nativeEvent as any, // Type compatibility with ThreeEvent
      }

      emitter.emit(eventKey, payload)
    }

    const handlePointerDown = (e: PointerEvent) => {
      if (useViewer.getState().cameraDragging) return
      if (e.button !== 0) return
      if (e.pointerType === 'touch') {
        touchTapStart.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
        }
      }
      emit('pointerdown', e)
    }

    const handlePointerUp = (e: PointerEvent) => {
      if (useViewer.getState().cameraDragging) return
      if (e.button !== 0) return
      emit('pointerup', e)

      const tapStart = touchTapStart.current
      if (e.pointerType !== 'touch' || !tapStart || tapStart.id !== e.pointerId) return
      touchTapStart.current = null

      const dragDistance = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y)
      if (dragDistance > TOUCH_TAP_MAX_DISTANCE_PX) return

      emit('click', e)
      syntheticTouchClick.current = {
        at: performance.now(),
        x: e.clientX,
        y: e.clientY,
      }
    }

    const handleClick = (e: MouseEvent) => {
      if (useViewer.getState().cameraDragging) return
      if (e.button !== 0) return
      const synthetic = syntheticTouchClick.current
      if (synthetic) {
        const clickAge = performance.now() - synthetic.at
        const clickDistance = Math.hypot(e.clientX - synthetic.x, e.clientY - synthetic.y)
        if (
          clickAge <= TOUCH_NATIVE_CLICK_SUPPRESSION_MS &&
          clickDistance <= TOUCH_NATIVE_CLICK_SUPPRESSION_RADIUS_PX
        ) {
          return
        }
      }
      emit('click', e)
    }

    const handlePointerCancel = (e: PointerEvent) => {
      if (touchTapStart.current?.id === e.pointerId) touchTapStart.current = null
    }

    const handlePointerMove = (e: PointerEvent) => {
      // Emit move even if camera is dragging, so tools like PolygonEditor still work
      emit('move', e)
    }

    const handleDoubleClick = (e: MouseEvent) => {
      if (useViewer.getState().cameraDragging) return
      emit('double-click', e)
    }

    const handleContextMenu = (e: MouseEvent) => {
      if (useViewer.getState().cameraDragging) return
      emit('context-menu', e)
    }

    eventTarget.addEventListener('pointerdown', handlePointerDown)
    eventTarget.addEventListener('pointerup', handlePointerUp)
    eventTarget.addEventListener('pointercancel', handlePointerCancel)
    eventTarget.addEventListener('click', handleClick)
    eventTarget.addEventListener('pointermove', handlePointerMove)
    eventTarget.addEventListener('dblclick', handleDoubleClick)
    eventTarget.addEventListener('contextmenu', handleContextMenu)

    return () => {
      eventTarget.removeEventListener('pointerdown', handlePointerDown)
      eventTarget.removeEventListener('pointerup', handlePointerUp)
      eventTarget.removeEventListener('pointercancel', handlePointerCancel)
      eventTarget.removeEventListener('click', handleClick)
      eventTarget.removeEventListener('pointermove', handlePointerMove)
      eventTarget.removeEventListener('dblclick', handleDoubleClick)
      eventTarget.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [camera, events.connected, gl])
}

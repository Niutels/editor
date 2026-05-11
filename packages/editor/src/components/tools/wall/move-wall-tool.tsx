'use client'

import {
  type AnyNodeId,
  constrainWallMoveDeltaToAxis,
  emitter,
  getPerpendicularWallMoveAxis,
  type GridEvent,
  pauseSceneHistory,
  planWallMoveJunctions,
  resumeSceneHistory,
  useScene,
  type WallMoveBridgePlan,
  type WallMoveAxis,
  type WallMoveJunctionPlan,
  type WallNode,
  WallNode as WallSchema,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useCallback, useEffect, useRef, useState } from 'react'
import { markToolCancelConsumed } from '../../../hooks/use-keyboard'
import { sfxEmitter } from '../../../lib/sfx-bus'
import useEditor from '../../../store/use-editor'
import { CursorSphere } from '../shared/cursor-sphere'
import { getWallGridStep, isWallLongEnough, snapScalarToGrid } from './wall-drafting'

function rotateVector([x, z]: [number, number], angle: number): [number, number] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [x * cos - z * sin, x * sin + z * cos]
}

function samePoint(a: [number, number], b: [number, number]) {
  return a[0] === b[0] && a[1] === b[1]
}

function pointKey(point: [number, number]) {
  return `${point[0]}:${point[1]}`
}

function stripWallIsNewMetadata(meta: WallNode['metadata']): WallNode['metadata'] {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return meta
  }

  const nextMeta = { ...(meta as Record<string, unknown>) } as Record<string, unknown>
  delete nextMeta.isNew
  return nextMeta as WallNode['metadata']
}

type LinkedWallSnapshot = WallNode

function getLinkedWallSnapshots(args: {
  wallId: WallNode['id']
  wallParentId: string | null
  originalStart: [number, number]
  originalEnd: [number, number]
}) {
  const { wallId, wallParentId, originalStart, originalEnd } = args
  const { nodes } = useScene.getState()
  const walls = Object.values(nodes).filter(
    (node): node is WallNode =>
      node?.type === 'wall' && node.id !== wallId && (node.parentId ?? null) === wallParentId,
  )
  const directlyLinkedWalls = walls.filter(
    (wall) =>
      samePoint(wall.start, originalStart) ||
      samePoint(wall.start, originalEnd) ||
      samePoint(wall.end, originalStart) ||
      samePoint(wall.end, originalEnd),
  )
  const contextPoints = new Set([pointKey(originalStart), pointKey(originalEnd)])

  for (const wall of directlyLinkedWalls) {
    contextPoints.add(pointKey(wall.start))
    contextPoints.add(pointKey(wall.end))
  }

  const snapshots: LinkedWallSnapshot[] = []
  const seenWallIds = new Set<WallNode['id']>()

  for (const node of walls) {
    if (
      !contextPoints.has(pointKey(node.start)) &&
      !contextPoints.has(pointKey(node.end))
    ) {
      continue
    }

    if (seenWallIds.has(node.id)) {
      continue
    }
    seenWallIds.add(node.id)

    snapshots.push({
      ...node,
      start: [...node.start] as [number, number],
      end: [...node.end] as [number, number],
      children: [...(node.children ?? [])],
    })
  }

  return snapshots
}

function getLinkedWallUpdates(
  linkedWalls: Array<{
    wall: LinkedWallSnapshot
    matchPoint?: [number, number]
    targetPoint?: [number, number]
  }>,
  originalStart: [number, number],
  originalEnd: [number, number],
  nextStart: [number, number],
  nextEnd: [number, number],
) {
  return linkedWalls.map(({ wall, matchPoint, targetPoint }) => {
    if (matchPoint && targetPoint) {
      return {
        id: wall.id,
        start: samePoint(wall.start, matchPoint) ? targetPoint : wall.start,
        end: samePoint(wall.end, matchPoint) ? targetPoint : wall.end,
      }
    }

    const targetStart = targetPoint ?? nextStart
    const targetEnd = targetPoint ?? nextEnd

    return {
      id: wall.id,
      start: samePoint(wall.start, originalStart)
        ? targetStart
        : samePoint(wall.start, originalEnd)
          ? targetEnd
          : wall.start,
      end: samePoint(wall.end, originalStart)
        ? targetStart
        : samePoint(wall.end, originalEnd)
          ? targetEnd
          : wall.end,
    }
  })
}

function getPlannedLinkedWallUpdates(
  plan: WallMoveJunctionPlan<LinkedWallSnapshot>,
  originalStart: [number, number],
  originalEnd: [number, number],
  nextStart: [number, number],
  nextEnd: [number, number],
) {
  const movePlans = new Map<
    WallNode['id'],
    { wall: LinkedWallSnapshot; matchPoint?: [number, number]; targetPoint?: [number, number] }
  >()

  for (const wall of plan.linkedWallsToMove) {
    movePlans.set(wall.id, { wall })
  }

  for (const targetPlan of plan.linkedWallTargetPlans) {
    movePlans.set(targetPlan.wall.id, {
      wall: targetPlan.wall,
      matchPoint: targetPlan.originalPoint,
      targetPoint: targetPlan.targetPoint,
    })
  }

  return getLinkedWallUpdates(
    Array.from(movePlans.values()),
    originalStart,
    originalEnd,
    nextStart,
    nextEnd,
  )
}

function wallSegmentExists(walls: WallNode[], start: [number, number], end: [number, number]) {
  return walls.some(
    (wall) =>
      (samePoint(wall.start, start) && samePoint(wall.end, end)) ||
      (samePoint(wall.start, end) && samePoint(wall.end, start)),
  )
}

function getWallsAfterUpdates(
  nodes: ReturnType<typeof useScene.getState>['nodes'],
  updates: Array<{ id: AnyNodeId; data: Partial<WallNode> }>,
) {
  const updateById = new Map(updates.map((update) => [update.id, update.data]))

  return Object.values(nodes)
    .filter((node): node is WallNode => node?.type === 'wall')
    .map((wall) => {
      const update = updateById.get(wall.id as AnyNodeId)
      return update ? ({ ...wall, ...update } as WallNode) : wall
    })
}

function buildBridgeWallCreates(args: {
  bridgePlans: Array<WallMoveBridgePlan<LinkedWallSnapshot>>
  nextStart: [number, number]
  nextEnd: [number, number]
  existingWalls: WallNode[]
  wallCount: number
}): Array<{ node: WallNode; parentId?: AnyNodeId }> {
  const { bridgePlans, nextStart, nextEnd, existingWalls, wallCount } = args
  const wallsForDuplicateCheck = [...existingWalls]
  const creates: Array<{ node: WallNode; parentId?: AnyNodeId }> = []

  for (const plan of bridgePlans) {
    const nextPoint = plan.movedEndpoint === 'start' ? nextStart : nextEnd

    if (!isWallLongEnough(plan.originalPoint, nextPoint)) {
      continue
    }

    if (wallSegmentExists(wallsForDuplicateCheck, plan.originalPoint, nextPoint)) {
      continue
    }

    const { id: _id, parentId: _parentId, children: _children, ...sourceWall } = plan.wall
    const bridgeWall = WallSchema.parse({
      ...sourceWall,
      name: `Wall ${wallCount + creates.length + 1}`,
      start: plan.originalPoint,
      end: nextPoint,
      children: [],
      metadata: stripWallIsNewMetadata(plan.wall.metadata),
    })

    creates.push({
      node: bridgeWall,
      parentId: (plan.wall.parentId ?? undefined) as AnyNodeId | undefined,
    })
    wallsForDuplicateCheck.push(bridgeWall)
  }

  return creates
}

export const MoveWallTool: React.FC<{ node: WallNode }> = ({ node }) => {
  const meta =
    typeof node.metadata === 'object' && node.metadata !== null && !Array.isArray(node.metadata)
      ? (node.metadata as Record<string, unknown>)
      : {}
  const isNew = !!meta.isNew
  const activatedAtRef = useRef<number>(Date.now())
  const previousGridPosRef = useRef<[number, number] | null>(null)
  const originalStartRef = useRef<[number, number]>([...node.start] as [number, number])
  const originalEndRef = useRef<[number, number]>([...node.end] as [number, number])
  const originalCenterRef = useRef<[number, number]>([
    (node.start[0] + node.end[0]) / 2,
    (node.start[1] + node.end[1]) / 2,
  ])
  const originalHalfVectorRef = useRef<[number, number]>([
    (node.end[0] - node.start[0]) / 2,
    (node.end[1] - node.start[1]) / 2,
  ])
  const moveAxisRef = useRef<WallMoveAxis | null>(
    getPerpendicularWallMoveAxis(node.start, node.end),
  )
  const linkedOriginalsRef = useRef<LinkedWallSnapshot[]>(
    isNew
      ? []
      : getLinkedWallSnapshots({
          wallId: node.id,
          wallParentId: node.parentId ?? null,
          originalStart: node.start,
          originalEnd: node.end,
        }),
  )
  const dragAnchorRef = useRef<[number, number] | null>(null)
  const nodeIdRef = useRef(node.id)
  const previewRef = useRef<{ start: [number, number]; end: [number, number] } | null>(null)
  const pendingRotationRef = useRef(0)
  const shiftPressedRef = useRef(false)

  const [cursorLocalPos, setCursorLocalPos] = useState<[number, number, number]>(() => {
    const centerX = (node.start[0] + node.end[0]) / 2
    const centerZ = (node.start[1] + node.end[1]) / 2
    return [centerX, 0, centerZ]
  })

  const exitMoveMode = useCallback(() => {
    useEditor.getState().setMovingNode(null)
  }, [])

  useEffect(() => {
    const nodeId = nodeIdRef.current
    const originalStart = originalStartRef.current
    const originalEnd = originalEndRef.current
    const originalCenter = originalCenterRef.current
    const originalHalfVector = originalHalfVectorRef.current

    pauseSceneHistory(useScene)
    let wasCommitted = false

    const applyNodePreview = (
      updates: Array<{ id: WallNode['id']; start: [number, number]; end: [number, number] }>,
    ) => {
      useScene.getState().updateNodes(
        updates.map((entry) => ({
          id: entry.id as AnyNodeId,
          data: { start: entry.start, end: entry.end },
        })),
      )
      for (const entry of updates) {
        useScene.getState().markDirty(entry.id as AnyNodeId)
      }
    }

    const buildWallFromCenter = (center: [number, number]) => {
      const rotatedHalf = rotateVector(originalHalfVector, pendingRotationRef.current)
      const nextStart: [number, number] = [center[0] - rotatedHalf[0], center[1] - rotatedHalf[1]]
      const nextEnd: [number, number] = [center[0] + rotatedHalf[0], center[1] + rotatedHalf[1]]
      return { start: nextStart, end: nextEnd }
    }

    const getMovePlan = (nextStart: [number, number], nextEnd: [number, number]) =>
      planWallMoveJunctions(
        linkedOriginalsRef.current,
        originalStart,
        originalEnd,
        nextStart,
        nextEnd,
      )

    const getLinkedPreviewUpdates = (nextStart: [number, number], nextEnd: [number, number]) => {
      const plan = getMovePlan(nextStart, nextEnd)
      const movedUpdates = getPlannedLinkedWallUpdates(
        plan,
        originalStart,
        originalEnd,
        nextStart,
        nextEnd,
      )
      const movedById = new Map(movedUpdates.map((entry) => [entry.id, entry]))

      return linkedOriginalsRef.current.map(
        (wall) => movedById.get(wall.id) ?? { id: wall.id, start: wall.start, end: wall.end },
      )
    }

    const applyPreview = (nextStart: [number, number], nextEnd: [number, number]) => {
      previewRef.current = { start: nextStart, end: nextEnd }
      const centerX = (nextStart[0] + nextEnd[0]) / 2
      const centerZ = (nextStart[1] + nextEnd[1]) / 2
      setCursorLocalPos([centerX, 0, centerZ])
      applyNodePreview([
        { id: nodeId, start: nextStart, end: nextEnd },
        ...getLinkedPreviewUpdates(nextStart, nextEnd),
      ])
    }

    const restoreOriginal = () => {
      applyNodePreview([
        { id: nodeId, start: originalStart, end: originalEnd },
        ...linkedOriginalsRef.current,
      ])
    }

    const onGridMove = (event: GridEvent) => {
      const rawX = event.localPosition[0]
      const rawZ = event.localPosition[2]
      const snapStep = getWallGridStep()
      const localX = shiftPressedRef.current ? rawX : snapScalarToGrid(rawX, snapStep)
      const localZ = shiftPressedRef.current ? rawZ : snapScalarToGrid(rawZ, snapStep)

      const anchor = dragAnchorRef.current ?? [localX, localZ]
      dragAnchorRef.current = anchor

      const [deltaX, deltaZ] = constrainWallMoveDeltaToAxis(
        localX - anchor[0],
        localZ - anchor[1],
        moveAxisRef.current,
      )
      const constrainedGridPos: [number, number] = [anchor[0] + deltaX, anchor[1] + deltaZ]

      if (
        previousGridPosRef.current &&
        (constrainedGridPos[0] !== previousGridPosRef.current[0] ||
          constrainedGridPos[1] !== previousGridPosRef.current[1])
      ) {
        sfxEmitter.emit('sfx:grid-snap')
      }
      previousGridPosRef.current = constrainedGridPos

      const nextCenter: [number, number] = [originalCenter[0] + deltaX, originalCenter[1] + deltaZ]
      const nextWall = buildWallFromCenter(nextCenter)
      applyPreview(nextWall.start, nextWall.end)
    }

    const onGridClick = (event: GridEvent) => {
      if (Date.now() - activatedAtRef.current < 150) {
        event.nativeEvent?.stopPropagation?.()
        return
      }

      const preview = previewRef.current ?? { start: originalStart, end: originalEnd }

      wasCommitted = true

      // Restore original baseline while paused so the next resume+update
      // registers as a single tracked change (undo reverts to original).
      applyNodePreview([
        { id: nodeId, start: originalStart, end: originalEnd },
        ...linkedOriginalsRef.current,
      ])

      resumeSceneHistory(useScene)
      const commitPlan = getMovePlan(preview.start, preview.end)
      const linkedWallUpdates = getPlannedLinkedWallUpdates(
        commitPlan,
        originalStart,
        originalEnd,
        preview.start,
        preview.end,
      )
      const collapsedLinkedWallIds = new Set(
        [
          ...linkedWallUpdates
            .filter((entry) => !isWallLongEnough(entry.start, entry.end))
            .map((entry) => entry.id as AnyNodeId),
          ...commitPlan.wallsToDelete.map((wall) => wall.id as AnyNodeId),
        ],
      )

      const commitUpdates = [
        {
          id: nodeId as AnyNodeId,
          data: isNew
            ? {
                start: preview.start,
                end: preview.end,
                metadata: stripWallIsNewMetadata(node.metadata),
              }
            : { start: preview.start, end: preview.end },
        },
        ...linkedWallUpdates
          .filter((entry) => !collapsedLinkedWallIds.has(entry.id as AnyNodeId))
          .map((entry) => ({
            id: entry.id as AnyNodeId,
            data: { start: entry.start, end: entry.end },
          })),
      ]
      const sceneState = useScene.getState()
      const existingWalls = getWallsAfterUpdates(sceneState.nodes, commitUpdates).filter(
        (wall) => !collapsedLinkedWallIds.has(wall.id as AnyNodeId),
      )
      const bridgeCreates = buildBridgeWallCreates({
        bridgePlans: commitPlan.bridgePlans,
        nextStart: preview.start,
        nextEnd: preview.end,
        existingWalls,
        wallCount: Object.values(sceneState.nodes).filter((entry) => entry?.type === 'wall')
          .length,
      })
      sceneState.applyNodeChanges({
        update: commitUpdates,
        create: bridgeCreates,
        delete: Array.from(collapsedLinkedWallIds),
      })

      pauseSceneHistory(useScene)

      sfxEmitter.emit('sfx:item-place')
      useViewer.getState().setSelection({ selectedIds: [nodeId] })
      exitMoveMode()
      event.nativeEvent?.stopPropagation?.()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      if (event.key === 'Shift') {
        shiftPressedRef.current = true
        return
      }

      const ROTATION_STEP = Math.PI / 4
      let rotationDelta = 0
      if (event.key === 'r' || event.key === 'R') rotationDelta = ROTATION_STEP
      else if (event.key === 't' || event.key === 'T') rotationDelta = -ROTATION_STEP

      if (rotationDelta === 0) {
        return
      }

      event.preventDefault()
      pendingRotationRef.current += rotationDelta
      sfxEmitter.emit('sfx:item-rotate')

      const preview = previewRef.current ?? { start: originalStart, end: originalEnd }
      const currentCenter: [number, number] = [
        (preview.start[0] + preview.end[0]) / 2,
        (preview.start[1] + preview.end[1]) / 2,
      ]
      const nextWall = buildWallFromCenter(currentCenter)
      moveAxisRef.current = getPerpendicularWallMoveAxis(nextWall.start, nextWall.end)
      applyPreview(nextWall.start, nextWall.end)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        shiftPressedRef.current = false
      }
    }

    const onCancel = () => {
      restoreOriginal()
      useViewer.getState().setSelection({ selectedIds: [nodeId] })
      resumeSceneHistory(useScene)
      markToolCancelConsumed()
      exitMoveMode()
    }

    emitter.on('grid:move', onGridMove)
    emitter.on('grid:click', onGridClick)
    emitter.on('tool:cancel', onCancel)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      if (!wasCommitted) {
        restoreOriginal()
      }
      shiftPressedRef.current = false
      resumeSceneHistory(useScene)
      emitter.off('grid:move', onGridMove)
      emitter.off('grid:click', onGridClick)
      emitter.off('tool:cancel', onCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [exitMoveMode, isNew, node.metadata])

  return (
    <group>
      <CursorSphere position={cursorLocalPos} showTooltip={false} />
    </group>
  )
}

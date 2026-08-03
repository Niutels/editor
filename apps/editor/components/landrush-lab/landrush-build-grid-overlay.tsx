'use client'

import { useEditor } from '@pascal-app/editor'
import { GRID_LAYER } from '@pascal-app/viewer'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide, MathUtils } from 'three'
import { attribute, float, uniform } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import type { LandrushPoint2, LandrushRoadSegment } from '@/components/landrush/types'
import { createLandrushBuildGridGeometryData } from './landrush-build-grid-geometry'
import { NATURAL_ROAD_STYLE } from './natural-road-network-layer'
import type { ParcelAllocationParcel } from './parcel-allocation'

const LANDRUSH_BUILD_GRID_ELEVATION_OFFSET =
  NATURAL_ROAD_STYLE.carriageway.liftMeters + NATURAL_ROAD_STYLE.sidewalk.curbHeightMeters + 0.025
const LANDRUSH_BUILD_GRID_FADE_SECONDS = 1.375
// Opaque terrain renders first; transparent construction must composite over the grid.
const LANDRUSH_BUILD_GRID_RENDER_ORDER = -1
const LANDRUSH_BUILD_GRID_WARMUP_FRAMES = 2
const LANDRUSH_BUILD_GRID_WARMUP_OPACITY = 0.0008

export function LandrushIslandBuildGridOverlay({
  buildableBoundaryPoints,
  groundY,
  parcel,
  roadClearanceSegments,
  visible,
}: {
  buildableBoundaryPoints: readonly LandrushPoint2[]
  groundY: number
  parcel: ParcelAllocationParcel | null
  roadClearanceSegments: readonly LandrushRoadSegment[]
  visible: boolean
}) {
  const { camera, invalidate } = useThree()
  const gridSnapStep = useEditor((state) => state.gridSnapStep)
  const targetVisible = visible && Boolean(parcel)
  const [renderParcel, setRenderParcel] = useState(parcel)
  const [renderVisible, setRenderVisible] = useState(targetVisible)
  const [warmupVisible, setWarmupVisible] = useState(false)
  const fadeRef = useRef({
    from: targetVisible ? 1 : 0,
    opacity: targetVisible ? 1 : 0,
    startedAt: 0,
    to: targetVisible ? 1 : 0,
  })
  const geometry = useMemo(
    () =>
      createLandrushBuildGridGeometry(
        renderParcel,
        gridSnapStep,
        buildableBoundaryPoints,
        roadClearanceSegments,
      ),
    [buildableBoundaryPoints, gridSnapStep, renderParcel, roadClearanceSegments],
  )
  const materialState = useMemo(() => createLandrushBuildGridMaterial(fadeRef.current.opacity), [])

  useEffect(() => {
    const previousMask = camera.layers.mask
    camera.layers.enable(GRID_LAYER)
    invalidate()
    return () => {
      camera.layers.mask = previousMask
    }
  }, [camera, invalidate])

  useLayoutEffect(() => {
    if (parcel) setRenderParcel(parcel)
    materialState.visibility.value = fadeRef.current.opacity
    if (targetVisible) setRenderVisible(true)
    invalidate()
    fadeRef.current = {
      from: fadeRef.current.opacity,
      opacity: fadeRef.current.opacity,
      startedAt: performance.now(),
      to: targetVisible ? 1 : 0,
    }

    let animationFrame = 0
    const tick = () => {
      const now = performance.now()
      const fade = fadeRef.current
      const progress = clamp01((now - fade.startedAt) / (LANDRUSH_BUILD_GRID_FADE_SECONDS * 1000))
      const eased = progress * progress * (3 - 2 * progress)
      const opacity = MathUtils.lerp(fade.from, fade.to, eased)
      fade.opacity = opacity
      materialState.visibility.value = opacity
      invalidate()

      if (opacity <= 0.002 && fade.to === 0) setRenderVisible(false)
      if (progress < 1) animationFrame = window.requestAnimationFrame(tick)
    }
    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [invalidate, materialState, parcel, targetVisible])

  useEffect(() => {
    invalidate()
    return () => geometry.dispose()
  }, [geometry, invalidate])
  useEffect(() => () => materialState.material.dispose(), [materialState])
  useEffect(() => {
    if (targetVisible || !renderParcel || geometry.getAttribute('position').count === 0) return

    let animationFrame = 0
    let framesLeft = LANDRUSH_BUILD_GRID_WARMUP_FRAMES
    materialState.visibility.value = LANDRUSH_BUILD_GRID_WARMUP_OPACITY
    setWarmupVisible(true)
    invalidate()

    const tick = () => {
      if (framesLeft > 0) {
        framesLeft -= 1
        invalidate()
        animationFrame = window.requestAnimationFrame(tick)
        return
      }

      materialState.visibility.value = fadeRef.current.opacity
      setWarmupVisible(false)
      invalidate()
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      materialState.visibility.value = fadeRef.current.opacity
      setWarmupVisible(false)
    }
  }, [geometry, invalidate, materialState, renderParcel, targetVisible])

  return (
    <mesh
      frustumCulled={!warmupVisible}
      geometry={geometry}
      layers={GRID_LAYER}
      material={materialState.material}
      position={[0, groundY + LANDRUSH_BUILD_GRID_ELEVATION_OFFSET, 0]}
      renderOrder={LANDRUSH_BUILD_GRID_RENDER_ORDER}
      visible={(renderVisible || warmupVisible) && Boolean(renderParcel)}
    />
  )
}

function createLandrushBuildGridGeometry(
  parcel: ParcelAllocationParcel | null,
  gridStep: number,
  buildableBoundaryPoints: readonly LandrushPoint2[],
  roadClearanceSegments: readonly LandrushRoadSegment[],
) {
  const data = createLandrushBuildGridGeometryData(
    parcel,
    gridStep,
    buildableBoundaryPoints,
    roadClearanceSegments,
  )
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(data.positions), 3))
  geometry.setAttribute('landrushGridAlpha', new BufferAttribute(new Float32Array(data.alphas), 1))
  return geometry
}

function createLandrushBuildGridMaterial(initialVisibility: number) {
  const visibility = uniform(clamp01(initialVisibility))
  const material = new MeshBasicNodeMaterial({
    color: '#ffffff',
    depthTest: true,
    depthWrite: false,
    opacityNode: attribute<'float'>('landrushGridAlpha', 'float').mul(visibility).mul(float(0.72)),
    side: DoubleSide,
    transparent: true,
  })
  material.toneMapped = false
  return { material, visibility }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

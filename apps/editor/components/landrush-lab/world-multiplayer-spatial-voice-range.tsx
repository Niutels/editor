'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  type LineBasicMaterial,
  type LineSegments,
  type Vector3,
} from 'three'
import { SPATIAL_VOICE_MAX_DISTANCE } from './world-multiplayer-spatial-audio'

type SpatialVoiceRangeMotion = {
  position: Vector3
}

const SPATIAL_VOICE_RANGE_DASHES = 96
const SPATIAL_VOICE_RANGE_DASH_FILL = 0.58
const SPATIAL_VOICE_RANGE_GROUND_OFFSET = 0.06
const SPATIAL_VOICE_RANGE_RESPONSE = 12
const SPATIAL_VOICE_RANGE_VISUAL_RADIUS = SPATIAL_VOICE_MAX_DISTANCE / 5

export function SpatialVoiceRangeRing({
  color = '#7dd3fc',
  groundY,
  motionRef,
  visible,
}: {
  color?: string
  groundY: number
  motionRef: { current: SpatialVoiceRangeMotion | null }
  visible: boolean
}) {
  const lineRef = useRef<LineSegments | null>(null)
  const materialRef = useRef<LineBasicMaterial | null>(null)
  const colorValue = useMemo(() => new Color(color), [color])
  const geometry = useMemo(() => createSpatialVoiceRangeGeometry(), [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((_, delta) => {
    const line = lineRef.current
    const material = materialRef.current
    const motion = motionRef.current
    if (!line || !material) return

    const targetOpacity = visible && motion ? 0.72 : 0
    const alpha = 1 - Math.exp(-SPATIAL_VOICE_RANGE_RESPONSE * delta)
    material.opacity += (targetOpacity - material.opacity) * alpha
    material.color.copy(colorValue)
    line.visible = material.opacity > 0.01

    if (motion) {
      line.position.set(
        motion.position.x,
        groundY + SPATIAL_VOICE_RANGE_GROUND_OFFSET,
        motion.position.z,
      )
    }
  })

  return (
    <lineSegments ref={lineRef} geometry={geometry} renderOrder={74}>
      <lineBasicMaterial
        ref={materialRef}
        color={colorValue}
        depthWrite={false}
        opacity={0}
        transparent
      />
    </lineSegments>
  )
}

function createSpatialVoiceRangeGeometry() {
  const positions: number[] = []
  for (let index = 0; index < SPATIAL_VOICE_RANGE_DASHES; index += 1) {
    const startAngle = (index / SPATIAL_VOICE_RANGE_DASHES) * Math.PI * 2
    const endAngle =
      ((index + SPATIAL_VOICE_RANGE_DASH_FILL) / SPATIAL_VOICE_RANGE_DASHES) * Math.PI * 2
    positions.push(
      Math.cos(startAngle) * SPATIAL_VOICE_RANGE_VISUAL_RADIUS,
      0,
      Math.sin(startAngle) * SPATIAL_VOICE_RANGE_VISUAL_RADIUS,
      Math.cos(endAngle) * SPATIAL_VOICE_RANGE_VISUAL_RADIUS,
      0,
      Math.sin(endAngle) * SPATIAL_VOICE_RANGE_VISUAL_RADIUS,
    )
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

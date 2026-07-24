'use client'

import { Vector2 } from 'three'
import {
  float,
  length,
  max,
  mix,
  mul,
  positionView,
  screenUV,
  smoothstep,
  sub,
  uniform,
} from 'three/tsl'
import type { Node as TSLNode } from 'three/webgpu'

const REVEAL_DISABLED_CENTER_PX = -100000
const REVEAL_DEPTH_FEATHER_METERS = 0.04

const centerPx = new Vector2(REVEAL_DISABLED_CENTER_PX, REVEAL_DISABLED_CENTER_PX)
const viewportPx = new Vector2(1, 1)
const robotNearDepth = uniform(0)
const innerRadiusPx = uniform(0)
const outerRadiusPx = uniform(1)

export function createLandrushRobotScreenRevealOpacityNode(
  baseOpacity: TSLNode<'float'> = float(1),
  revealAmount: TSLNode<'float'> = float(1),
) {
  const distancePx = length(sub(mul(screenUV, uniform(viewportPx)), uniform(centerPx)))
  const radialOpacity = smoothstep(innerRadiusPx, outerRadiusPx, distancePx)
  const signedDepth = sub(positionView.z.negate(), robotNearDepth)
  const depthOpacity = smoothstep(
    -REVEAL_DEPTH_FEATHER_METERS / 2,
    REVEAL_DEPTH_FEATHER_METERS / 2,
    signedDepth,
  )
  return mul(baseOpacity, mix(float(1), max(radialOpacity, depthOpacity), revealAmount))
}

export function updateLandrushRobotScreenRevealMask({
  centerX,
  centerY,
  height,
  innerRadius,
  outerRadius,
  robotNearDepth: nextRobotNearDepth,
  width,
}: {
  centerX: number
  centerY: number
  height: number
  innerRadius: number
  outerRadius: number
  robotNearDepth: number
  width: number
}) {
  viewportPx.set(width, height)
  centerPx.set(centerX, centerY)
  robotNearDepth.value = Math.max(0, nextRobotNearDepth)
  innerRadiusPx.value = Math.max(0, innerRadius)
  outerRadiusPx.value = Math.max(innerRadiusPx.value + 1, outerRadius)
}

export function clearLandrushRobotScreenRevealMask() {
  centerPx.set(REVEAL_DISABLED_CENTER_PX, REVEAL_DISABLED_CENTER_PX)
  robotNearDepth.value = 0
  innerRadiusPx.value = 0
  outerRadiusPx.value = 1
}

export function readLandrushRobotScreenRevealMaskSnapshot() {
  return {
    centerPx: [Math.round(centerPx.x * 100) / 100, Math.round(centerPx.y * 100) / 100] as const,
    innerRadiusPx: Math.round(innerRadiusPx.value * 100) / 100,
    outerRadiusPx: Math.round(outerRadiusPx.value * 100) / 100,
    robotNearDepth: Math.round(robotNearDepth.value * 10000) / 10000,
    viewportPx: [Math.round(viewportPx.x), Math.round(viewportPx.y)] as const,
  }
}

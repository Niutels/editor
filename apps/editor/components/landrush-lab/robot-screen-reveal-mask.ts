'use client'

import { Vector2 } from 'three'
import { float, length, mul, screenUV, smoothstep, sub, uniform } from 'three/tsl'
import type { Node as TSLNode } from 'three/webgpu'

const REVEAL_DISABLED_CENTER_PX = -100000

const centerPx = new Vector2(REVEAL_DISABLED_CENTER_PX, REVEAL_DISABLED_CENTER_PX)
const viewportPx = new Vector2(1, 1)
const innerRadiusPx = uniform(0)
const outerRadiusPx = uniform(1)

export function createLandrushRobotScreenRevealOpacityNode(
  baseOpacity: TSLNode<'float'> = float(1),
) {
  const distancePx = length(sub(mul(screenUV, uniform(viewportPx)), uniform(centerPx)))
  return mul(baseOpacity, smoothstep(innerRadiusPx, outerRadiusPx, distancePx))
}

export function updateLandrushRobotScreenRevealMask({
  centerX,
  centerY,
  height,
  innerRadius,
  outerRadius,
  width,
}: {
  centerX: number
  centerY: number
  height: number
  innerRadius: number
  outerRadius: number
  width: number
}) {
  viewportPx.set(width, height)
  centerPx.set(centerX, height - centerY)
  innerRadiusPx.value = Math.max(0, innerRadius)
  outerRadiusPx.value = Math.max(innerRadiusPx.value + 1, outerRadius)
}

export function clearLandrushRobotScreenRevealMask() {
  centerPx.set(REVEAL_DISABLED_CENTER_PX, REVEAL_DISABLED_CENTER_PX)
  innerRadiusPx.value = 0
  outerRadiusPx.value = 1
}

export function readLandrushRobotScreenRevealMaskSnapshot() {
  return {
    centerPx: [Math.round(centerPx.x * 100) / 100, Math.round(centerPx.y * 100) / 100] as const,
    innerRadiusPx: Math.round(innerRadiusPx.value * 100) / 100,
    outerRadiusPx: Math.round(outerRadiusPx.value * 100) / 100,
    viewportPx: [Math.round(viewportPx.x), Math.round(viewportPx.y)] as const,
  }
}

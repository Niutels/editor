'use client'

import { Vector2 } from 'three'
import {
  float,
  length,
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
export const LANDRUSH_ROBOT_SCREEN_REVEAL_DEPTH_FEATHER_METERS = 0.04

export const LANDRUSH_ROBOT_SCREEN_REVEAL_OUTER_RADIUS_SCALE_DEFAULT = 2
export const LANDRUSH_ROBOT_SCREEN_REVEAL_OUTER_RADIUS_SCALE_MAX = 32
export const LANDRUSH_ROBOT_SCREEN_REVEAL_OUTER_RADIUS_SCALE_MIN = 0.3
export const LANDRUSH_ROBOT_SCREEN_REVEAL_RADIUS_SCALE_DEFAULT = 1
export const LANDRUSH_ROBOT_SCREEN_REVEAL_RADIUS_SCALE_MAX = 8
export const LANDRUSH_ROBOT_SCREEN_REVEAL_RADIUS_SCALE_MIN = 0.25
export const LANDRUSH_ROBOT_SCREEN_REVEAL_SMOOTHNESS_DEFAULT = 100
export const LANDRUSH_ROBOT_SCREEN_REVEAL_SMOOTHNESS_MAX = 100
export const LANDRUSH_ROBOT_SCREEN_REVEAL_SMOOTHNESS_MIN = 0

const centerPx = new Vector2(REVEAL_DISABLED_CENTER_PX, REVEAL_DISABLED_CENTER_PX)
const viewportPx = new Vector2(1, 1)
const robotNearDepth = uniform(0)
const innerRadiusPx = uniform(0)
const outerRadiusPx = uniform(1)
const radialTransitionSmoothness = uniform(LANDRUSH_ROBOT_SCREEN_REVEAL_SMOOTHNESS_DEFAULT)
let radialOuterRadiusScale = LANDRUSH_ROBOT_SCREEN_REVEAL_OUTER_RADIUS_SCALE_DEFAULT
let radialRadiusScale = LANDRUSH_ROBOT_SCREEN_REVEAL_RADIUS_SCALE_DEFAULT

export function createLandrushRobotScreenRevealOpacityNode(
  baseOpacity: TSLNode<'float'> = float(1),
  revealAmount: TSLNode<'float'> = float(1),
  effectiveLayerCount = 1,
) {
  const distancePx = createLandrushRobotScreenRevealDistanceNode()
  const transitionRatio = distancePx
    .sub(innerRadiusPx)
    .div(outerRadiusPx.sub(innerRadiusPx))
    .clamp(0, 1)
  const smoothness = radialTransitionSmoothness.div(100)
  const endpointSmoothFade = transitionRatio.pow(2).mul(float(3).sub(transitionRatio.mul(2)))
  const radialFade = mix(transitionRatio, endpointSmoothFade, smoothness)
  const combinedFade = float(1).sub(
    radialFade
      .oneMinus()
      .mul(
        smoothstep(
          -LANDRUSH_ROBOT_SCREEN_REVEAL_DEPTH_FEATHER_METERS / 2,
          LANDRUSH_ROBOT_SCREEN_REVEAL_DEPTH_FEATHER_METERS / 2,
          sub(positionView.z.negate(), robotNearDepth),
        ).oneMinus(),
      ),
  )
  const revealFade =
    effectiveLayerCount > 1
      ? float(1).sub(combinedFade.oneMinus().pow(1 / effectiveLayerCount))
      : combinedFade
  return mul(baseOpacity, mix(float(1), revealFade, revealAmount))
}

function createLandrushRobotScreenRevealDistanceNode() {
  return length(sub(mul(screenUV, uniform(viewportPx)), uniform(centerPx)))
}

export function readLandrushRobotScreenRevealOuterRadiusScale() {
  return radialOuterRadiusScale
}

export function updateLandrushRobotScreenRevealOuterRadiusScale(value: number) {
  const clampedValue = Number.isFinite(value)
    ? Math.min(
        LANDRUSH_ROBOT_SCREEN_REVEAL_OUTER_RADIUS_SCALE_MAX,
        Math.max(LANDRUSH_ROBOT_SCREEN_REVEAL_OUTER_RADIUS_SCALE_MIN, value),
      )
    : LANDRUSH_ROBOT_SCREEN_REVEAL_OUTER_RADIUS_SCALE_DEFAULT
  const nextValue = Math.round(clampedValue * 100) / 100
  radialOuterRadiusScale = nextValue
  return nextValue
}

export function readLandrushRobotScreenRevealRadiusScale() {
  return radialRadiusScale
}

export function updateLandrushRobotScreenRevealRadiusScale(value: number) {
  const clampedValue = Number.isFinite(value)
    ? Math.min(
        LANDRUSH_ROBOT_SCREEN_REVEAL_RADIUS_SCALE_MAX,
        Math.max(LANDRUSH_ROBOT_SCREEN_REVEAL_RADIUS_SCALE_MIN, value),
      )
    : LANDRUSH_ROBOT_SCREEN_REVEAL_RADIUS_SCALE_DEFAULT
  const nextValue = Math.round(clampedValue * 100) / 100
  radialRadiusScale = nextValue
  return nextValue
}

export function readLandrushRobotScreenRevealSmoothness() {
  return radialTransitionSmoothness.value
}

export function updateLandrushRobotScreenRevealSmoothness(value: number) {
  const clampedValue = Number.isFinite(value)
    ? Math.min(
        LANDRUSH_ROBOT_SCREEN_REVEAL_SMOOTHNESS_MAX,
        Math.max(LANDRUSH_ROBOT_SCREEN_REVEAL_SMOOTHNESS_MIN, value),
      )
    : LANDRUSH_ROBOT_SCREEN_REVEAL_SMOOTHNESS_DEFAULT
  const nextValue = Math.round(clampedValue * 100) / 100
  radialTransitionSmoothness.value = nextValue
  return nextValue
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
  robotNearDepth.value = Number.isFinite(nextRobotNearDepth) ? Math.max(0, nextRobotNearDepth) : 0
  innerRadiusPx.value = Math.max(0, innerRadius)
  outerRadiusPx.value = Math.max(innerRadiusPx.value + 1, outerRadius)
}

export function sampleLandrushRobotScreenRevealDepthAmount(
  fragmentViewDepth: number,
  nextRobotNearDepth: number,
) {
  if (
    !Number.isFinite(fragmentViewDepth) ||
    !Number.isFinite(nextRobotNearDepth) ||
    nextRobotNearDepth <= 0
  ) {
    return 0
  }
  const halfFeather = LANDRUSH_ROBOT_SCREEN_REVEAL_DEPTH_FEATHER_METERS / 2
  const amount = Math.max(
    0,
    Math.min(
      1,
      (fragmentViewDepth - nextRobotNearDepth + halfFeather) /
        LANDRUSH_ROBOT_SCREEN_REVEAL_DEPTH_FEATHER_METERS,
    ),
  )
  return 1 - amount * amount * (3 - 2 * amount)
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
    outerRadiusScale: Math.round(radialOuterRadiusScale * 100) / 100,
    outerRadiusPx: Math.round(outerRadiusPx.value * 100) / 100,
    radiusScale: Math.round(radialRadiusScale * 100) / 100,
    robotNearDepth: Math.round(robotNearDepth.value * 10000) / 10000,
    transitionSmoothness: Math.round(radialTransitionSmoothness.value * 100) / 100,
    viewportPx: [Math.round(viewportPx.x), Math.round(viewportPx.y)] as const,
  }
}

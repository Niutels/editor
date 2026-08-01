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
  step,
  sub,
  uniform,
} from 'three/tsl'
import type { Node as TSLNode } from 'three/webgpu'
import { LANDRUSH_ROBOT_SCREEN_REVEAL_CURVE_POWER_RANGE } from './robot-screen-reveal-curve'

const REVEAL_DISABLED_CENTER_PX = -100000
const REVEAL_DEPTH_FEATHER_METERS = 0.04

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
) {
  const distancePx = createLandrushRobotScreenRevealDistanceNode()
  const transitionRatio = distancePx
    .sub(innerRadiusPx)
    .div(outerRadiusPx.sub(innerRadiusPx))
    .clamp(0, 1)
  const smoothness = radialTransitionSmoothness.div(100)
  const curvePower = float(1).add(
    smoothness.oneMinus().pow(2).mul(LANDRUSH_ROBOT_SCREEN_REVEAL_CURVE_POWER_RANGE),
  )
  const opaqueWeight = transitionRatio.pow(curvePower)
  const clearWeight = transitionRatio.oneMinus().pow(curvePower)
  const radialFade = opaqueWeight.div(opaqueWeight.add(clearWeight))
  const signedDepth = sub(positionView.z.negate(), robotNearDepth)
  const depthOpacity = smoothstep(
    -REVEAL_DEPTH_FEATHER_METERS / 2,
    REVEAL_DEPTH_FEATHER_METERS / 2,
    signedDepth,
  )
  return mul(baseOpacity, mix(float(1), max(radialFade, depthOpacity), revealAmount))
}

export function createLandrushRobotScreenRevealHardThresholdOpacityNode(
  baseOpacity: TSLNode<'float'> = float(1),
) {
  return mul(baseOpacity, step(innerRadiusPx, createLandrushRobotScreenRevealDistanceNode()))
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
    outerRadiusScale: Math.round(radialOuterRadiusScale * 100) / 100,
    outerRadiusPx: Math.round(outerRadiusPx.value * 100) / 100,
    radiusScale: Math.round(radialRadiusScale * 100) / 100,
    robotNearDepth: Math.round(robotNearDepth.value * 10000) / 10000,
    transitionSmoothness: Math.round(radialTransitionSmoothness.value * 100) / 100,
    viewportPx: [Math.round(viewportPx.x), Math.round(viewportPx.y)] as const,
  }
}

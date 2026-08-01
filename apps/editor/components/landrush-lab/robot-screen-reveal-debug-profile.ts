import {
  resolveLandrushRobotScreenRevealCurvePower,
  sampleLandrushRobotScreenRevealRadialOpacity,
} from './robot-screen-reveal-curve'

export type RobotScreenRevealDebugMode = 'hard-threshold' | 'soft-mask'

export type RobotScreenRevealProfileControls = {
  innerRadiusPx: number
  mode: RobotScreenRevealDebugMode
  outerRadiusPx: number
  smoothnessPercent: number
}

export type RobotScreenRevealProfileSample = {
  deltaPerPixel: number
  distancePx: number
  opacity: number
  opacity8Bit: number
}

export type RobotScreenRevealProfileMeasurement = {
  continuous: boolean
  curvePower: number | null
  firstOpaqueRadiusPx: number
  firstVisibleRadiusPx: number
  largestJumpRadiusPx: number
  maxDeltaPerPixel: number
  maxQuantizedStep: number
  midpointOpacity: number
  monotonicityViolations: number
  opaqueInsetPx: number
  samples: RobotScreenRevealProfileSample[]
  slopeConcentration: number
  transitionWidthPx: number
  visibleOnsetOffsetPx: number
}

const PROFILE_SAMPLE_COUNT = 640
const EIGHT_BIT_VISIBLE_THRESHOLD = 1 / 255
const EIGHT_BIT_OPAQUE_THRESHOLD = 254 / 255

export function measureRobotScreenRevealProfile(
  controls: RobotScreenRevealProfileControls,
): RobotScreenRevealProfileMeasurement {
  const innerRadiusPx = Math.max(0, controls.innerRadiusPx)
  const outerRadiusPx = Math.max(innerRadiusPx + 1, controls.outerRadiusPx)
  const transitionWidthPx = outerRadiusPx - innerRadiusPx
  const curvePower =
    controls.mode === 'soft-mask'
      ? resolveLandrushRobotScreenRevealCurvePower(controls.smoothnessPercent)
      : null
  const evaluate = (distancePx: number) =>
    controls.mode === 'soft-mask'
      ? sampleLandrushRobotScreenRevealRadialOpacity({
          distancePx,
          innerRadiusPx,
          outerRadiusPx,
          smoothnessPercent: controls.smoothnessPercent,
        })
      : distancePx >= innerRadiusPx
        ? 1
        : 0

  let largestJumpRadiusPx = innerRadiusPx
  let maxDeltaPerPixel = 0
  let maxQuantizedStep = 0
  let monotonicityViolations = 0
  let previousOpacity = evaluate(Math.max(0, innerRadiusPx - 2))
  let previousQuantized = Math.round(previousOpacity * 255)
  for (
    let distancePx = Math.max(0, innerRadiusPx - 1);
    distancePx <= outerRadiusPx + 1;
    distancePx += 1
  ) {
    const opacity = evaluate(distancePx)
    const delta = opacity - previousOpacity
    const quantized = Math.round(opacity * 255)
    if (delta < -1e-9) monotonicityViolations += 1
    if (Math.abs(delta) > maxDeltaPerPixel) {
      maxDeltaPerPixel = Math.abs(delta)
      largestJumpRadiusPx = distancePx - 0.5
    }
    maxQuantizedStep = Math.max(maxQuantizedStep, Math.abs(quantized - previousQuantized))
    previousOpacity = opacity
    previousQuantized = quantized
  }

  const firstVisibleRatio =
    controls.mode === 'soft-mask' && curvePower
      ? invertSymmetricPowerCurve(EIGHT_BIT_VISIBLE_THRESHOLD, curvePower)
      : 0
  const firstOpaqueRatio =
    controls.mode === 'soft-mask' && curvePower
      ? invertSymmetricPowerCurve(EIGHT_BIT_OPAQUE_THRESHOLD, curvePower)
      : 0
  const firstVisibleRadiusPx = innerRadiusPx + firstVisibleRatio * transitionWidthPx
  const firstOpaqueRadiusPx = innerRadiusPx + firstOpaqueRatio * transitionWidthPx
  const averageDeltaPerPixel = 1 / transitionWidthPx
  const graphStartPx = Math.max(0, innerRadiusPx - transitionWidthPx * 0.12)
  const graphEndPx = outerRadiusPx + transitionWidthPx * 0.12
  const graphStepPx = (graphEndPx - graphStartPx) / PROFILE_SAMPLE_COUNT
  const samples: RobotScreenRevealProfileSample[] = []
  let previousGraphOpacity = evaluate(graphStartPx)
  for (let index = 0; index <= PROFILE_SAMPLE_COUNT; index += 1) {
    const distancePx = graphStartPx + graphStepPx * index
    const opacity = evaluate(distancePx)
    samples.push({
      deltaPerPixel: index === 0 ? 0 : Math.abs(opacity - previousGraphOpacity) / graphStepPx,
      distancePx,
      opacity,
      opacity8Bit: Math.round(opacity * 255),
    })
    previousGraphOpacity = opacity
  }

  return {
    continuous: controls.mode === 'soft-mask',
    curvePower,
    firstOpaqueRadiusPx,
    firstVisibleRadiusPx,
    largestJumpRadiusPx,
    maxDeltaPerPixel,
    maxQuantizedStep,
    midpointOpacity: evaluate((innerRadiusPx + outerRadiusPx) / 2),
    monotonicityViolations,
    opaqueInsetPx: outerRadiusPx - firstOpaqueRadiusPx,
    samples,
    slopeConcentration: maxDeltaPerPixel / averageDeltaPerPixel,
    transitionWidthPx,
    visibleOnsetOffsetPx: firstVisibleRadiusPx - innerRadiusPx,
  }
}

function invertSymmetricPowerCurve(opacity: number, curvePower: number) {
  const opaqueRoot = opacity ** (1 / curvePower)
  const clearRoot = (1 - opacity) ** (1 / curvePower)
  return opaqueRoot / (opaqueRoot + clearRoot)
}

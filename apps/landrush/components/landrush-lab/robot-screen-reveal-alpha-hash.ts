import {
  abs,
  add,
  ceil,
  clamp,
  dFdx,
  dFdy,
  exp2,
  Fn,
  float,
  floor,
  fract,
  length,
  log2,
  max,
  min,
  mul,
  positionLocal,
  sin,
  sub,
  vec2,
  vec3,
} from 'three/tsl'
import type { Node as TSLNode } from 'three/webgpu'

export const LANDRUSH_ROBOT_SCREEN_REVEAL_ALPHA_HASH_SCALE = 4

const landrushRobotScreenRevealAlphaHash2D = Fn(([value]: [TSLNode<'vec2'>]) =>
  fract(
    mul(1.0e4, sin(mul(17, value.x).add(mul(0.1, value.y)))).mul(
      add(0.1, abs(sin(mul(13, value.y).add(value.x)))),
    ),
  ),
)

const landrushRobotScreenRevealAlphaHash3D = Fn(([value]: [TSLNode<'vec3'>]) =>
  landrushRobotScreenRevealAlphaHash2D(
    vec2(landrushRobotScreenRevealAlphaHash2D(value.xy), value.z),
  ),
)

const landrushRobotScreenRevealAlphaHashThreshold = Fn(
  ([position, scale]: [TSLNode<'vec3'>, TSLNode<'float'>]) => {
    const maxDeriv = max(length(dFdx(position.xyz)), length(dFdy(position.xyz)))
    const pixScale = float(1).div(float(scale).mul(maxDeriv)).toVar('pixScale')
    const pixScales = vec2(exp2(floor(log2(pixScale))), exp2(ceil(log2(pixScale))))
    const alpha = vec2(
      landrushRobotScreenRevealAlphaHash3D(floor(pixScales.x.mul(position.xyz))),
      landrushRobotScreenRevealAlphaHash3D(floor(pixScales.y.mul(position.xyz))),
    )
    const lerpFactor = fract(log2(pixScale))
    const x = add(mul(lerpFactor.oneMinus(), alpha.x), mul(lerpFactor, alpha.y))
    const a = min(lerpFactor, lerpFactor.oneMinus())
    const cases = vec3(
      x.mul(x).div(mul(2, a).mul(sub(1, a))),
      x.sub(mul(0.5, a)).div(sub(1, a)),
      sub(
        1,
        sub(1, x)
          .mul(sub(1, x))
          .div(mul(2, a).mul(sub(1, a))),
      ),
    )
    const threshold = x
      .lessThan(a.oneMinus())
      .select(x.lessThan(a).select(cases.x, cases.y), cases.z)

    return clamp(threshold, 1.0e-6, 1)
  },
).setLayout({
  name: 'landrushRobotScreenRevealAlphaHashThreshold',
  type: 'float',
  inputs: [
    { name: 'position', type: 'vec3' },
    { name: 'scale', type: 'float' },
  ],
})

export function createLandrushRobotScreenRevealAlphaHashThresholdNode(
  authoredAlphaTestNode: TSLNode<'float'> | null,
) {
  const revealThreshold = landrushRobotScreenRevealAlphaHashThreshold(
    positionLocal,
    float(LANDRUSH_ROBOT_SCREEN_REVEAL_ALPHA_HASH_SCALE),
  ) as unknown as TSLNode<'float'>

  return authoredAlphaTestNode
    ? (max(float(authoredAlphaTestNode), revealThreshold) as unknown as TSLNode<'float'>)
    : revealThreshold
}

// @ts-nocheck -- Adapted from Bruno Simon folio-2025 TSL/WebGPU source; see BRUNO_SIMON_LICENSE.md.
import { Fn, texture, uniform, vec2 } from 'three/tsl'
import type { LandrushBrunoWaterNoises } from './bruno-water-noises'

export class LandrushBrunoWaterWind {
  readonly direction
  readonly localTime
  readonly offsetNode
  readonly positionFrequency
  readonly strength

  angle = Math.PI * 0.6
  timeFrequency = 0.1

  constructor(noises: LandrushBrunoWaterNoises) {
    this.direction = uniform(vec2(Math.sin(this.angle), Math.cos(this.angle)))
    this.positionFrequency = uniform(0.5)
    this.strength = uniform(0.5)
    this.localTime = uniform(0)

    this.offsetNode = Fn(([position]) => {
      const remapedPosition = position.mul(this.positionFrequency)

      const noiseUv1 = remapedPosition.xy.mul(0.2).add(this.direction.mul(this.localTime)).xy
      const noise1 = texture(noises.perlin, noiseUv1).r.sub(0.5)

      const noiseUv2 = remapedPosition.xy
        .mul(0.1)
        .add(this.direction.mul(this.localTime.mul(0.2))).xy
      const noise2 = texture(noises.perlin, noiseUv2).r.sub(0.5)

      const intensity = noise2.add(noise1)

      return vec2(this.direction.mul(intensity).mul(this.strength))
    })
  }

  update(deltaScaled: number) {
    this.localTime.value += deltaScaled * this.timeFrequency * this.strength.value
  }
}

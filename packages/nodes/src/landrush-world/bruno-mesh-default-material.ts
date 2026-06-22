// @ts-nocheck -- Adapted from Bruno Simon folio-2025 TSL/WebGPU source; see BRUNO_SIMON_LICENSE.md.
import * as THREE from 'three/webgpu'
import {
  color,
  float,
  Fn,
  frontFacing,
  If,
  max,
  mix,
  normalWorld,
  positionWorld,
  vec3,
  vec4,
} from 'three/tsl'

export class LandrushBrunoMeshDefaultMaterial extends THREE.MeshLambertNodeMaterial {
  static revealDiscardNodeBuilder = (context, outputColor) => {
    return Fn(([outputColor]) => {
      const distanceToCenter = positionWorld.xz.sub(context.reveal.position2Uniform).length()
      distanceToCenter.greaterThan(context.reveal.distance).discard()

      const revealMix = distanceToCenter.step(context.reveal.distance.sub(context.reveal.thickness))
      const revealColor = context.reveal.color.mul(context.reveal.intensity)
      return mix(outputColor.rgb, revealColor, revealMix)
    })(outputColor)
  }

  constructor(context, parameters = {}) {
    super()

    this.context = context

    this.depthWrite = parameters.depthWrite ?? true
    this.depthTest = parameters.depthTest ?? true
    this.side = parameters.side ?? THREE.FrontSide
    this.wireframe = parameters.wireframe ?? false
    this.transparent = parameters.transparent ?? false
    this.shadowSide = parameters.shadowSide ?? THREE.FrontSide

    this.hasCoreShadows = parameters.hasCoreShadows ?? true
    this.hasDropShadows = parameters.hasDropShadows ?? true
    this.hasLightBounce = parameters.hasLightBounce ?? true
    this.hasFog = parameters.hasFog ?? true
    this.hasWater = parameters.hasWater ?? true
    this.hasReveal = parameters.hasReveal ?? true

    this._colorNode = parameters.colorNode ?? color(0xffffff)
    this._normalNode = parameters.normalNode ?? normalWorld
    this._alphaNode = parameters.alphaNode ?? float(1)
    this._shadowNode = parameters.shadowNode ?? float(0)
    this.alphaTest = parameters.alphaTest ?? 0.1

    this.normalNode = this._normalNode

    const catchedShadow = float(1).toVar()

    if (this.hasDropShadows) {
      this.receivedShadowNode = Fn(([shadow]) => {
        catchedShadow.mulAssign(shadow.r)
        return float(1)
      })
    }

    this.outputNode = Fn(() => {
      const baseColor = this._colorNode.toVar()
      const outputColor = this._colorNode.toVar()

      const reorientedNormal = this._normalNode.toVar()
      if (this.side === THREE.DoubleSide || this.side === THREE.BackSide) {
        If(frontFacing.not(), () => {
          reorientedNormal.mulAssign(-1)
        })
      }

      if (this.hasLightBounce) {
        const bounceOrientation = reorientedNormal
          .dot(vec3(0, -1, 0))
          .smoothstep(context.lighting.lightBounceEdgeLow, context.lighting.lightBounceEdgeHigh)
        const bounceDistance = context.lighting.lightBounceDistance
          .sub(max(0, positionWorld.y))
          .div(context.lighting.lightBounceDistance)
          .max(0)
          .pow(2)
        const terrainData = context.terrain.terrainNode(positionWorld.xz)
        const bounceColor = context.terrain.colorNode(terrainData)
        outputColor.assign(
          mix(
            outputColor,
            bounceColor,
            bounceOrientation.mul(bounceDistance).mul(context.lighting.lightBounceMultiplier),
          ),
        )
      }

      if (this.hasWater) {
        const nearWaterSurface = positionWorld.y
          .sub(context.water.surfaceElevationUniform)
          .abs()
          .greaterThan(context.water.surfaceThicknessUniform)
        outputColor.assign(nearWaterSurface.select(outputColor, color('#ffffff')))
        baseColor.assign(nearWaterSurface.select(baseColor, color('#ffffff')))
      }

      outputColor.mulAssign(context.lighting.colorUniform.mul(context.lighting.intensityUniform))

      let coreShadowMix = float(0)
      if (this.hasCoreShadows) {
        coreShadowMix = reorientedNormal
          .dot(context.lighting.directionUniform)
          .smoothstep(context.lighting.coreShadowEdgeHigh, context.lighting.coreShadowEdgeLow)
      }

      let dropShadowMix = float(0)
      if (this.hasDropShadows) {
        dropShadowMix = catchedShadow.oneMinus()
      }

      if (this.hasCoreShadows || this.hasDropShadows) {
        const combinedShadowMix = max(coreShadowMix, dropShadowMix, this._shadowNode).clamp(0, 1)
        const shadowColor = baseColor.rgb.mul(context.lighting.shadowColor).rgb
        outputColor.assign(mix(outputColor, shadowColor, combinedShadowMix))
      }

      if (this.hasFog) {
        outputColor.assign(context.fog.strength.mix(outputColor, context.fog.color))
      }

      this._alphaNode.lessThan(this.alphaTest).discard()

      if (this.hasReveal) {
        outputColor.assign(
          LandrushBrunoMeshDefaultMaterial.revealDiscardNodeBuilder(context, outputColor),
        )
      }

      return vec4(outputColor, this._alphaNode)
    })()
  }
}

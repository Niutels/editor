'use client'

import { getMaterialRendererBackend } from '@landrush/runtime'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import {
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  PlaneGeometry,
  RenderTarget,
  type Texture,
} from 'three'
import {
  float,
  fwidth,
  mix,
  mx_noise_float,
  smoothstep,
  color as tslColor,
  texture as tslTexture,
  uv,
  vec2,
} from 'three/tsl'
import {
  MeshBasicNodeMaterial,
  QuadMesh,
  RendererUtils,
  type Node as TSLNode,
  type WebGPURenderer,
} from 'three/webgpu'
import { GRASS_FIELD_PLANE_SIZE } from './grass-field-texture'
import { ORGANIC_GRASS_PALETTE } from './organic-grass-pattern'

export type StylizedGrassGroundDebugMode = 'final' | 'footprint' | 'hierarchy' | 'macro'
export type StylizedGrassGroundMaterialMode = 'detailed' | 'zombie-bounded'
export type StylizedGrassGroundTextureReadyHandler = (ready: boolean, texture?: Texture) => void

const STYLIZED_GRASS_GROUND_BAKE_RESOLUTION = 1024
// Cut the island edge mid-ramp: near-zero thresholds trace the mask's outer
// texel corners and rasterize as a dark sawtooth along the cliff rim.
const STYLIZED_GRASS_GROUND_EDGE_ALPHA_TEST = 0.5

export function canUseProceduralStylizedGrassGround() {
  return getMaterialRendererBackend() !== 'webgl'
}

export function ProceduralStylizedGrassGround({
  color = '#ffffff',
  debugMode = 'final',
  elevation,
  maskTexture,
  materialMode = 'detailed',
  onReady,
  renderOrder,
}: {
  color?: string
  debugMode?: StylizedGrassGroundDebugMode
  elevation: number
  maskTexture: Texture
  materialMode?: StylizedGrassGroundMaterialMode
  onReady?: StylizedGrassGroundTextureReadyHandler
  renderOrder: number
}) {
  if (materialMode === 'zombie-bounded') {
    return (
      <BoundedStylizedGrassGround
        color={color}
        elevation={elevation}
        maskTexture={maskTexture}
        onReady={onReady}
        renderOrder={renderOrder}
      />
    )
  }

  return (
    <DetailedStylizedGrassGround
      color={color}
      debugMode={debugMode}
      elevation={elevation}
      maskTexture={maskTexture}
      onReady={onReady}
      renderOrder={renderOrder}
    />
  )
}

function BoundedStylizedGrassGround({
  color,
  elevation,
  maskTexture,
  onReady,
  renderOrder,
}: {
  color: string
  elevation: number
  maskTexture: Texture
  onReady?: StylizedGrassGroundTextureReadyHandler
  renderOrder: number
}) {
  const [material] = useState(() => createBoundedStylizedGrassGroundMaterial(color, maskTexture))

  useEffect(() => {
    updateBoundedStylizedGrassGroundMaterial(material, color, maskTexture)
  }, [color, maskTexture, material])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    onReady?.(true, maskTexture)
    return () => onReady?.(false)
  }, [maskTexture, onReady])

  return (
    <mesh
      position={[0, elevation + 0.018, 0]}
      renderOrder={renderOrder}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[GRASS_FIELD_PLANE_SIZE, GRASS_FIELD_PLANE_SIZE]} />
      <primitive attach="material" object={material} />
    </mesh>
  )
}

export function createBoundedStylizedGrassGroundMaterial(color: string, maskTexture: Texture) {
  const material = new MeshBasicMaterial({
    alphaTest: STYLIZED_GRASS_GROUND_EDGE_ALPHA_TEST,
    color,
    depthWrite: true,
    map: maskTexture,
    side: FrontSide,
    toneMapped: false,
    transparent: false,
  })
  material.name = 'zombie-bounded-stylized-grass-ground'
  material.userData.landrushProceduralStylizedGrass = {
    complexity: 'bounded-texture-mask',
    coordinateSpace: 'uv',
  }
  return material
}

export function updateBoundedStylizedGrassGroundMaterial(
  material: MeshBasicMaterial,
  color: string,
  maskTexture: Texture,
) {
  material.color.set(color)
  material.map = maskTexture
  return material
}

function DetailedStylizedGrassGround({
  color,
  debugMode,
  elevation,
  maskTexture,
  onReady,
  renderOrder,
}: {
  color: string
  debugMode: StylizedGrassGroundDebugMode
  elevation: number
  maskTexture: Texture
  onReady?: StylizedGrassGroundTextureReadyHandler
  renderOrder: number
}) {
  const renderer = useThree((state) => state.gl) as unknown as WebGPURenderer
  const invalidate = useThree((state) => state.invalidate)
  const geometry = useMemo(
    () => new PlaneGeometry(GRASS_FIELD_PLANE_SIZE, GRASS_FIELD_PLANE_SIZE),
    [],
  )
  const bake = useMemo(
    () => createProceduralStylizedGrassBake(maskTexture, debugMode),
    [debugMode, maskTexture],
  )
  const [baked, setBaked] = useState<{
    bake: ProceduralStylizedGrassBake
    texture: Texture
  } | null>(null)
  const bakedTexture = baked?.bake === bake ? baked.texture : null

  useEffect(() => {
    let active = true
    onReady?.(false)
    const frameId = requestAnimationFrame(() => {
      try {
        bake.render(renderer)
        if (!active) return
        setBaked({ bake, texture: bake.texture })
        onReady?.(true, bake.texture)
        invalidate()
      } catch (error) {
        console.warn('[landrush] Falling back to live procedural grass ground.', error)
        if (active) onReady?.(true)
      }
    })

    return () => {
      active = false
      cancelAnimationFrame(frameId)
      onReady?.(false)
      bake.dispose()
    }
  }, [bake, invalidate, onReady, renderer])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh
      geometry={geometry}
      position={[0, elevation + 0.018, 0]}
      renderOrder={renderOrder}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      {bakedTexture ? (
        <meshBasicMaterial
          alphaTest={STYLIZED_GRASS_GROUND_EDGE_ALPHA_TEST}
          color={color}
          depthWrite
          map={bakedTexture}
          side={FrontSide}
          toneMapped={false}
          transparent={false}
        />
      ) : (
        <primitive attach="material" object={bake.material} />
      )}
    </mesh>
  )
}

type ProceduralStylizedGrassBake = {
  dispose: () => void
  material: MeshBasicNodeMaterial
  render: (renderer: WebGPURenderer) => void
  texture: Texture
}

function createProceduralStylizedGrassBake(
  maskTexture: Texture,
  debugMode: StylizedGrassGroundDebugMode,
): ProceduralStylizedGrassBake {
  const material = createProceduralStylizedGrassMaterial(
    maskTexture,
    debugMode,
    STYLIZED_GRASS_GROUND_EDGE_ALPHA_TEST,
  )
  const target = new RenderTarget(
    STYLIZED_GRASS_GROUND_BAKE_RESOLUTION,
    STYLIZED_GRASS_GROUND_BAKE_RESOLUTION,
    { depthBuffer: false },
  )
  target.texture.generateMipmaps = true
  target.texture.magFilter = LinearFilter
  target.texture.minFilter = LinearMipmapLinearFilter
  target.texture.name = `procedural-stylized-grass-${debugMode}`
  const quad = new QuadMesh()
  quad.material = material

  return {
    dispose: () => {
      material.dispose()
      target.dispose()
    },
    material,
    render: (renderer) => {
      const rendererState = RendererUtils.resetRendererState(renderer, {} as never)
      try {
        renderer.setRenderTarget(target)
        // Clear to a grass tone: edge texels bilinear/mip-blend into the
        // discarded region, and a black clear draws a dark perimeter fringe.
        renderer.setClearColor(0x96924e, 0)
        renderer.clear()
        quad.render(renderer)
      } finally {
        renderer.setRenderTarget(null)
        RendererUtils.restoreRendererState(renderer, rendererState)
      }
    },
    texture: target.texture,
  }
}

function createProceduralStylizedGrassMaterial(
  maskTexture: Texture,
  debugMode: StylizedGrassGroundDebugMode,
  alphaTest: number,
) {
  const surfaceUv = uv()
  const world = vec2(surfaceUv.x.sub(0.5), float(0.5).sub(surfaceUv.y)).mul(GRASS_FIELD_PLANE_SIZE)
  const footprint = fwidth(world).length().max(0.0001)
  const warpCoordinates = world.mul(0.018)
  const warp = vec2(
    normalizedNoise(warpCoordinates.add(vec2(17.31, -8.47))),
    normalizedNoise(warpCoordinates.add(vec2(-11.73, 19.91))),
  )
    .sub(0.5)
    .mul(9)
  const warped = world.add(warp)
  const rotated = vec2(
    warped.x.mul(0.71).sub(warped.y.mul(0.7)),
    warped.x.mul(0.7).add(warped.y.mul(0.71)),
  )

  const macroEdgeVisibility = detailVisibility(footprint, 0.32)
  const macroAxisA = normalizedNoise(warped.mul(0.034).add(vec2(3.17, -7.43))).add(
    normalizedNoise(warped.mul(0.24).add(vec2(-18.7, 9.1)))
      .sub(0.5)
      .mul(0.2)
      .mul(macroEdgeVisibility),
  )
  const macroAxisB = normalizedNoise(rotated.mul(0.031).add(vec2(-5.37, 12.81))).add(
    normalizedNoise(rotated.mul(0.21).add(vec2(8.6, -14.2)))
      .sub(0.5)
      .mul(0.2)
      .mul(macroEdgeVisibility),
  )

  const largeVisibility = detailVisibility(footprint, 0.42)
  const largeField = normalizedNoise(warped.mul(0.082).add(vec2(21.7, -6.8)))
    .mul(0.8)
    .add(normalizedNoise(rotated.mul(0.39).add(vec2(-7.1, 31.9))).mul(0.2))
  const largeMask = antiAliasedStep(largeField, 0.625).mul(largeVisibility)

  const smallVisibility = detailVisibility(footprint, 0.82)
  const smallField = normalizedNoise(rotated.mul(0.19).add(vec2(-27.1, 14.3)))
    .mul(0.76)
    .add(normalizedNoise(warped.mul(0.78).add(vec2(11.8, -36.7))).mul(0.24))
  const smallMask = antiAliasedStep(smallField, 0.59).mul(smallVisibility)

  const microVisibility = detailVisibility(footprint, 1.1)
  const microField = normalizedNoise(warped.mul(0.53).add(vec2(43.7, 28.9)))
    .mul(0.7)
    .add(normalizedNoise(rotated.mul(1.72).add(vec2(-19.4, -47.2))).mul(0.3))
  const mesoCoverage = largeMask.add(smallMask).min(1)
  const microMask = antiAliasedStep(microField, 0.54)
    .mul(microVisibility)
    .mul(mesoCoverage.smoothstep(0.2, 0.72))

  const exposureDetailVisibility = detailVisibility(footprint, 0.95)
  const exposure = normalizedNoise(rotated.mul(0.067).add(vec2(31.2, 7.4)))
    .mul(0.74)
    .add(
      normalizedNoise(warped.mul(0.43).add(vec2(-24.6, -17.8)))
        .mul(0.26)
        .mul(exposureDetailVisibility),
    )

  const macroColor = grassFamilyColor(macroAxisA, macroAxisB, exposure)
  const largeColor = grassFamilyColor(macroAxisB, float(1).sub(macroAxisA), exposure)
  const smallColor = grassFamilyColor(float(1).sub(macroAxisB), macroAxisA, exposure)
  const microColor = grassFamilyColor(float(1).sub(macroAxisA), float(1).sub(macroAxisB), exposure)
  const finalColor = mix(
    mix(mix(macroColor, largeColor, largeMask), smallColor, smallMask),
    microColor,
    microMask,
  )

  const hierarchyColor = mix(
    mix(mix(tslColor('#26342a'), tslColor('#dda447'), largeMask), tslColor('#63a8d2'), smallMask),
    tslColor('#d25674'),
    microMask,
  )
  const footprintHeat = footprint.mul(8).clamp(0, 1)
  const debugColor =
    debugMode === 'macro'
      ? macroColor
      : debugMode === 'hierarchy'
        ? hierarchyColor
        : debugMode === 'footprint'
          ? mix(tslColor('#4fbd78'), tslColor('#df5b55'), footprintHeat)
          : finalColor
  const maskAlpha = tslTexture(maskTexture, surfaceUv).a
  const material = new MeshBasicNodeMaterial({
    alphaTest,
    depthWrite: true,
    side: FrontSide,
    transparent: false,
  })
  material.colorNode = debugColor
  material.opacityNode = maskAlpha.mul(0.96)
  material.toneMapped = false
  material.name = 'procedural-stylized-grass-ground'
  material.userData.landrushProceduralStylizedGrass = {
    coordinateSpace: 'world-xz',
    debugMode,
    seed: 'grass-field-v1',
  }
  return material
}

function normalizedNoise(coordinates: TSLNode<'vec2'>) {
  return mx_noise_float(coordinates).mul(0.5).add(0.5)
}

function detailVisibility(footprint: TSLNode<'float'>, frequency: number) {
  return float(1).sub(footprint.mul(frequency).smoothstep(0.12, 0.38))
}

function antiAliasedStep(value: TSLNode<'float'>, threshold: number) {
  const width = fwidth(value).mul(0.72).max(0.0004)
  return smoothstep(float(threshold).sub(width), float(threshold).add(width), value)
}

function grassFamilyColor(
  axisA: TSLNode<'float'>,
  axisB: TSLNode<'float'>,
  exposure: TSLNode<'float'>,
) {
  const familyA = antiAliasedStep(axisA, 0.5)
  const familyB = antiAliasedStep(axisB, 0.5)
  const family0 = grassExposureColor(0, exposure)
  const family1 = grassExposureColor(1, exposure)
  const family2 = grassExposureColor(2, exposure)
  const family3 = grassExposureColor(3, exposure)
  return mix(mix(family0, family1, familyA), mix(family2, family3, familyA), familyB)
}

function grassExposureColor(family: number, exposure: TSLNode<'float'>) {
  const shadeToDim = antiAliasedStep(exposure, 0.43)
  const dimToLight = antiAliasedStep(exposure, 0.61)
  const shaded = grassPaletteColor(family, 0)
  const dim = grassPaletteColor(family, 1)
  const light = grassPaletteColor(family, 2)
  return mix(mix(shaded, dim, shadeToDim), light, dimToLight)
}

function grassPaletteColor(family: number, exposure: number) {
  const swatch = ORGANIC_GRASS_PALETTE[family]?.[exposure] ?? [150, 146, 78]
  return tslColor((swatch[0] << 16) | (swatch[1] << 8) | swatch[2])
}

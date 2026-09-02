import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Group,
  InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  RGBAFormat,
  SpotLight,
  SRGBColorSpace,
  StaticDrawUsage,
  type Texture,
} from 'three'
import { mix, color as tslColor, uniform } from 'three/tsl'
import type { Node as TSLNode } from 'three/webgpu'
import { createLandrushZombieNightGroundPoolResources } from './landrush-zombie-night-ground-pool'
import {
  LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS,
  type LandrushZombieNightSurfaceRole,
  resolveLandrushZombieNightSurfaceRole,
} from './landrush-zombie-night-presentation-state'
import {
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_INTENSITY,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAMP_POSITION,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_ANGLE,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_DECAY,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_DISTANCE,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_PENUMBRA,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_TARGET_POSITION,
} from './landrush-zombie-night-street-lightpost'

const NIGHT_SURFACE_TINTS: Readonly<Record<LandrushZombieNightSurfaceRole, string>> = {
  curbside: '#788aa2',
  'grass-blades': '#667da4',
  'grass-ground': '#6c7f9e',
}
const GRASS_GROUND_SUNSET_TINT = '#efb99f'

const NIGHT_SURFACE_ROLE_KEY = 'landrushZombieNightSurfaceRole'
const NIGHT_SURFACE_DAY_COLOR_KEY = 'landrushZombieNightDayColor'
const NIGHT_SURFACE_MATERIAL_CHANGE_EVENT = 'landrushzombienightsurfacematerialchange'
const nightSurfaceAmountNode = uniform(0)
const nightSurfaceSunsetAmountNode = uniform(0)
const colorBindingByMaterial = new WeakMap<Material, NightColorBinding>()
const colorBindings = new Set<NightColorBinding>()
let nightSurfaceAmount = 0
let nightSurfaceSunsetAmount = 0

type NightColorMaterial = Material & {
  color: Color
  map?: Texture | null
}

type NightNodeMaterial = Material & {
  colorNode: TSLNode<'vec3'>
  isNodeMaterial: true
}

type NightColorBinding = {
  dayColor: Color
  material: NightColorMaterial
  nightColor: Color
  sunsetColor: Color | null
}

export type LandrushZombieNightBeaconRenderReadinessRepresentative = Readonly<{
  dispose: () => void
  root: Group
}>

export const LANDRUSH_ZOMBIE_NIGHT_RENDER_REPRESENTATIVE_KEY = 'island:material-presentation:night'
export const LANDRUSH_ZOMBIE_NIGHT_SPOT_LIGHT_COUNTS = Object.freeze([
  LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.low,
  LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.balanced,
  LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.high,
])

export function prepareLandrushZombieNightSurfaceMaterials(
  mesh: Mesh,
  materials: readonly Material[],
) {
  let prepared = 0
  for (const material of materials) {
    const materialRole = resolveLandrushZombieNightSurfaceMaterialRole(mesh, material)
    if (!materialRole) continue
    prepareLandrushZombieNightSurfaceMaterial(material, materialRole)
    prepared += 1
  }
  return prepared
}

export function prepareLandrushZombieNightSurfaceObject(root: Object3D) {
  let prepared = 0
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    prepared += prepareLandrushZombieNightSurfaceMaterials(mesh, materials)
  })
  return prepared
}

export function createLandrushZombieNightSurfaceRenderReadinessRepresentative(worldRoot: Object3D) {
  const root = new Group()
  const representedSignaturesByMaterial = new WeakMap<Material, Set<string>>()
  worldRoot.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    prepareLandrushZombieNightSurfaceMaterials(mesh, materials)
    const pipelineSignature = landrushZombieNightSurfacePipelineSignature(mesh)
    for (const material of materials) {
      if (!resolveLandrushZombieNightSurfaceMaterialRole(mesh, material)) continue
      let representedSignatures = representedSignaturesByMaterial.get(material)
      if (!representedSignatures) {
        representedSignatures = new Set()
        representedSignaturesByMaterial.set(material, representedSignatures)
      }
      if (representedSignatures.has(pipelineSignature)) continue
      representedSignatures.add(pipelineSignature)
      const representative = mesh.clone(false)
      representative.material = material
      root.add(representative)
    }
  })
  return root
}

export function observeLandrushZombieNightWorld(
  worldRoot: Object3D,
  onSurfaceGenerationChange: () => void,
) {
  const observed = new Set<Object3D>()
  let disposed = false
  const attach = (root: Object3D) => {
    root.traverse((object) => {
      if (observed.has(object)) return
      observed.add(object)
      const eventTarget = object as unknown as NightObject3DChildEventTarget
      eventTarget.addEventListener('childadded', handleChildAdded)
      eventTarget.addEventListener('childremoved', handleChildRemoved)
      eventTarget.addEventListener(NIGHT_SURFACE_MATERIAL_CHANGE_EVENT, handleMaterialChange)
    })
  }
  const detach = (root: Object3D) => {
    root.traverse((object) => {
      if (!observed.delete(object)) return
      const eventTarget = object as unknown as NightObject3DChildEventTarget
      eventTarget.removeEventListener('childadded', handleChildAdded)
      eventTarget.removeEventListener('childremoved', handleChildRemoved)
      eventTarget.removeEventListener(NIGHT_SURFACE_MATERIAL_CHANGE_EVENT, handleMaterialChange)
    })
  }
  function handleChildAdded({ child }: NightObject3DChildEvent) {
    const hasNightSurface = prepareLandrushZombieNightSurfaceObject(child) > 0
    attach(child)
    if (hasNightSurface) onSurfaceGenerationChange()
  }
  function handleChildRemoved({ child }: NightObject3DChildEvent) {
    const hasNightSurface = containsLandrushZombieNightSurfaceObject(child)
    detach(child)
    if (hasNightSurface) onSurfaceGenerationChange()
  }
  function handleMaterialChange(_: NightSurfaceMaterialChangeEvent) {
    onSurfaceGenerationChange()
  }

  prepareLandrushZombieNightSurfaceObject(worldRoot)
  attach(worldRoot)
  return () => {
    if (disposed) return
    disposed = true
    detach(worldRoot)
  }
}

export function notifyLandrushZombieNightSurfaceMaterialChange(mesh: Mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  if (prepareLandrushZombieNightSurfaceMaterials(mesh, materials) === 0) return false
  ;(mesh as unknown as NightObject3DChildEventTarget).dispatchEvent({
    mesh,
    type: NIGHT_SURFACE_MATERIAL_CHANGE_EVENT,
  })
  return true
}

export function prepareLandrushZombieNightSurfaceMaterial(
  material: Material,
  role: LandrushZombieNightSurfaceRole,
) {
  const preparedRole = readPreparedLandrushZombieNightSurfaceRole(material)
  if (preparedRole) {
    if (isNightColorMaterial(material)) registerNightColorMaterial(material, preparedRole)
    return false
  }

  if (isNightNodeMaterial(material)) {
    material.userData[NIGHT_SURFACE_ROLE_KEY] = role
    const dayTintNode =
      role === 'grass-ground'
        ? mix(tslColor('#ffffff'), tslColor(GRASS_GROUND_SUNSET_TINT), nightSurfaceSunsetAmountNode)
        : tslColor('#ffffff')
    const tintNode = mix(dayTintNode, tslColor(NIGHT_SURFACE_TINTS[role]), nightSurfaceAmountNode)
    material.colorNode = material.colorNode.mul(tintNode)
    material.needsUpdate = true
    return true
  }
  if (!isNightColorMaterial(material)) return false

  material.userData[NIGHT_SURFACE_ROLE_KEY] = role
  material.userData[NIGHT_SURFACE_DAY_COLOR_KEY] = `#${material.color.getHexString()}`
  registerNightColorMaterial(material, role)
  return true
}

export function inheritLandrushZombieNightSurfaceMaterial(source: Material, clone: Material) {
  const role = readPreparedLandrushZombieNightSurfaceRole(source)
  if (!role) return false
  clone.userData[NIGHT_SURFACE_ROLE_KEY] = role
  const dayColor = source.userData[NIGHT_SURFACE_DAY_COLOR_KEY]
  if (typeof dayColor === 'string') clone.userData[NIGHT_SURFACE_DAY_COLOR_KEY] = dayColor
  if (
    isNightNodeMaterial(source) &&
    isNightNodeMaterial(clone) &&
    clone.colorNode !== source.colorNode
  ) {
    clone.colorNode = source.colorNode
    clone.needsUpdate = true
  }
  if (isNightColorMaterial(clone)) registerNightColorMaterial(clone, role)
  return true
}

export function setLandrushZombieNightSurfaceAmount(amount: number) {
  setLandrushZombieNightSurfaceSunsetUniformAmount(0)
  setLandrushZombieNightSurfaceUniformAmount(amount)
  applyLandrushZombieNightSurfaceColorBindings()
}

export function setLandrushZombieNightSurfaceUniformAmount(amount: number) {
  nightSurfaceAmount = clamp01(amount)
  nightSurfaceAmountNode.value = nightSurfaceAmount
}

export function setLandrushZombieNightSurfaceSunsetUniformAmount(amount: number) {
  nightSurfaceSunsetAmount = clamp01(amount)
  nightSurfaceSunsetAmountNode.value = nightSurfaceSunsetAmount
}

export function applyLandrushZombieNightSurfaceColorBindings() {
  for (const binding of colorBindings) {
    if (binding.sunsetColor) {
      binding.material.color.lerpColors(
        binding.dayColor,
        binding.sunsetColor,
        nightSurfaceSunsetAmount,
      )
    } else {
      binding.material.color.copy(binding.dayColor)
    }
    binding.material.color.lerp(binding.nightColor, nightSurfaceAmount)
  }
}

export function createLandrushZombieNightBeaconRenderReadinessRepresentative(): LandrushZombieNightBeaconRenderReadinessRepresentative {
  const root = new Group()
  const baseColorMap = createLandrushZombieNightRepresentativeTexture([92, 82, 67, 255], true)
  const metallicRoughnessMap = createLandrushZombieNightRepresentativeTexture([0, 146, 212, 255])
  const normalMap = createLandrushZombieNightRepresentativeTexture([128, 128, 255, 255])
  const emissiveMap = createLandrushZombieNightRepresentativeTexture([255, 208, 116, 255], true)
  const groundPoolResources = createLandrushZombieNightGroundPoolResources()
  const textures = [
    baseColorMap,
    metallicRoughnessMap,
    normalMap,
    emissiveMap,
    groundPoolResources.texture,
  ]
  const geometries = [
    new CylinderGeometry(0.08, 0.12, 3.4, 8),
    new CircleGeometry(0.16, 16),
    new CircleGeometry(0.34, 16),
    new CircleGeometry(0.62, 16),
    new CircleGeometry(1, 16),
  ]
  const materials = [
    new MeshStandardMaterial({
      color: '#ffffff',
      depthWrite: true,
      emissive: '#ffc36e',
      emissiveIntensity: 0,
      emissiveMap,
      map: baseColorMap,
      metalness: 0.72,
      metalnessMap: metallicRoughnessMap,
      normalMap,
      opacity: 1,
      roughness: 0.58,
      roughnessMap: metallicRoughnessMap,
      transparent: false,
    }),
    new MeshBasicMaterial({
      color: '#ffc36e',
      depthWrite: false,
      opacity: 0,
      side: DoubleSide,
      toneMapped: false,
      transparent: true,
    }),
    new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: '#ffc36e',
      depthWrite: false,
      opacity: 0,
      side: DoubleSide,
      toneMapped: false,
      transparent: true,
    }),
    new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: '#ffc36e',
      depthWrite: false,
      opacity: 0,
      side: DoubleSide,
      toneMapped: false,
      transparent: true,
    }),
    groundPoolResources.material,
  ]
  for (let index = 0; index < geometries.length - 1; index += 1) {
    root.add(new Mesh(geometries[index]!, materials[index]!))
  }
  const groundPool = new InstancedMesh(geometries.at(-1)!, groundPoolResources.material, 1)
  groundPool.setColorAt(0, new Color('#ffc36e'))
  groundPool.instanceMatrix.setUsage(StaticDrawUsage)
  groundPool.instanceColor?.setUsage(StaticDrawUsage)
  root.add(groundPool)
  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      root.clear()
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      for (const texture of textures) texture.dispose()
    },
    root,
  }
}

export function createLandrushZombieNightLightTopology(
  spotLightCount = LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.balanced,
) {
  const root = new Group()
  root.visible = false
  const lights: SpotLight[] = []
  const count = Math.max(0, Math.floor(spotLightCount))
  for (let index = 0; index < count; index += 1) {
    const light = new SpotLight(
      index % 3 === 0 ? '#69ccff' : '#ffc36e',
      LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_INTENSITY,
      LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_DISTANCE,
      LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_ANGLE,
      LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_PENUMBRA,
      LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_SPOT_DECAY,
    )
    light.position.set(...LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAMP_POSITION)
    light.target.position.set(...LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_TARGET_POSITION)
    light.target.updateMatrixWorld(true)
    lights.push(light)
    root.add(light)
  }
  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      root.clear()
      for (const light of lights) light.dispose()
    },
    root,
  }
}

function createLandrushZombieNightRepresentativeTexture(
  rgba: readonly [number, number, number, number],
  srgb = false,
) {
  const texture = new DataTexture(new Uint8Array(rgba), 1, 1, RGBAFormat)
  if (srgb) texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

type NightObject3DChildEvent = Readonly<{ child: Object3D }>
type NightSurfaceMaterialChangeEvent = Readonly<{
  mesh: Mesh
  type: typeof NIGHT_SURFACE_MATERIAL_CHANGE_EVENT
}>

type NightObject3DChildEventTarget = {
  addEventListener(
    type: 'childadded' | 'childremoved',
    listener: (event: NightObject3DChildEvent) => void,
  ): void
  addEventListener(
    type: typeof NIGHT_SURFACE_MATERIAL_CHANGE_EVENT,
    listener: (event: NightSurfaceMaterialChangeEvent) => void,
  ): void
  dispatchEvent(event: NightSurfaceMaterialChangeEvent): void
  removeEventListener(
    type: 'childadded' | 'childremoved',
    listener: (event: NightObject3DChildEvent) => void,
  ): void
  removeEventListener(
    type: typeof NIGHT_SURFACE_MATERIAL_CHANGE_EVENT,
    listener: (event: NightSurfaceMaterialChangeEvent) => void,
  ): void
}

function containsLandrushZombieNightSurfaceObject(root: Object3D) {
  let surface = false
  root.traverse((object) => {
    if (surface) return
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    surface = materials.some(
      (material) =>
        readPreparedLandrushZombieNightSurfaceRole(material) !== null ||
        resolveLandrushZombieNightSurfaceMaterialRole(mesh, material) !== null,
    )
  })
  return surface
}

function resolveLandrushZombieNightSurfaceMaterialRole(mesh: Mesh, material: Material) {
  return (
    readPreparedLandrushZombieNightSurfaceRole(material) ??
    resolveLandrushZombieNightSurfaceRole({
      geometryAttributes: Object.keys(mesh.geometry.attributes),
      materialName: material.name,
      objectName: mesh.name,
      textureName: readMaterialTextureName(material),
    })
  )
}

function landrushZombieNightSurfacePipelineSignature(mesh: Mesh) {
  const geometry = mesh.geometry
  const candidate = mesh as Mesh & {
    instanceColor?: unknown
    isInstancedMesh?: boolean
    isSkinnedMesh?: boolean
    morphTargetInfluences?: readonly number[]
  }
  const morphSignature = Object.entries(geometry.morphAttributes)
    .map(([name, attributes]) => `${name}:${String(attributes.length)}`)
    .sort()
    .join(',')
  return [
    candidate.isInstancedMesh === true ? 'instanced' : 'mesh',
    candidate.instanceColor ? 'instance-color' : 'no-instance-color',
    candidate.isSkinnedMesh === true ? 'skinned' : 'static',
    geometry.index ? 'indexed' : 'non-indexed',
    Object.keys(geometry.attributes).sort().join(','),
    morphSignature,
    String(candidate.morphTargetInfluences?.length ?? 0),
  ].join('|')
}

export function readPreparedLandrushZombieNightSurfaceRole(
  material: Material,
): LandrushZombieNightSurfaceRole | null {
  const role = material.userData[NIGHT_SURFACE_ROLE_KEY]
  return role === 'curbside' || role === 'grass-blades' || role === 'grass-ground' ? role : null
}

function registerNightColorMaterial(
  material: NightColorMaterial,
  role: LandrushZombieNightSurfaceRole,
) {
  if (colorBindingByMaterial.has(material)) return
  const storedDayColor = material.userData[NIGHT_SURFACE_DAY_COLOR_KEY]
  const dayColor =
    typeof storedDayColor === 'string' ? new Color(storedDayColor) : material.color.clone()
  const binding = {
    dayColor,
    material,
    nightColor: dayColor.clone().multiply(new Color(NIGHT_SURFACE_TINTS[role])),
    sunsetColor:
      role === 'grass-ground'
        ? dayColor.clone().multiply(new Color(GRASS_GROUND_SUNSET_TINT))
        : null,
  }
  const release = () => {
    colorBindingByMaterial.delete(material)
    colorBindings.delete(binding)
    material.removeEventListener('dispose', release)
  }
  colorBindingByMaterial.set(material, binding)
  colorBindings.add(binding)
  material.addEventListener('dispose', release)
  if (binding.sunsetColor) {
    material.color.lerpColors(binding.dayColor, binding.sunsetColor, nightSurfaceSunsetAmount)
  } else {
    material.color.copy(binding.dayColor)
  }
  material.color.lerp(binding.nightColor, nightSurfaceAmount)
}

function readMaterialTextureName(material: Material | undefined) {
  const map = (material as (Material & { map?: Texture | null }) | undefined)?.map
  return map?.name ?? ''
}

function isNightColorMaterial(material: Material): material is NightColorMaterial {
  return (material as Material & { color?: unknown }).color instanceof Color
}

function isNightNodeMaterial(material: Material): material is NightNodeMaterial {
  const candidate = material as Material & {
    colorNode?: TSLNode<'vec3'> | null
    isNodeMaterial?: boolean
  }
  return (
    candidate.isNodeMaterial === true &&
    candidate.colorNode !== null &&
    candidate.colorNode !== undefined
  )
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

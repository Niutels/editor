const ASSET_ROOT = '/landrush-lab/island-ambient-assets'

export const LANDRUSH_ISLAND_AMBIENT_BOATS = [
  { id: 'tropical-fishing-skiff', lengthMeters: 4.5 },
  { id: 'island-rescue-speedboat', lengthMeters: 6 },
  { id: 'harbor-workboat', lengthMeters: 7 },
].map((entry) => ({
  ...entry,
  modelPath: `${ASSET_ROOT}/boats/${entry.id}/model.glb`,
}))

export const LANDRUSH_ISLAND_AMBIENT_PALM_DIMENSION_SCALE = 1.3

export const LANDRUSH_ISLAND_AMBIENT_PALMS = [
  { id: 'classic-coconut-palm', heightMeters: 9, trunkRadiusMeters: 0.24 },
  { id: 'short-fan-palm', heightMeters: 5, trunkRadiusMeters: 0.28 },
  { id: 'twin-trunk-date-palm', heightMeters: 7.5, trunkRadiusMeters: 0.38 },
].map((entry) => ({
  heightMeters: entry.heightMeters * LANDRUSH_ISLAND_AMBIENT_PALM_DIMENSION_SCALE,
  id: entry.id,
  modelPath: `${ASSET_ROOT}/palms/${entry.id}/model.glb`,
  trunkRadiusMeters: entry.trunkRadiusMeters * LANDRUSH_ISLAND_AMBIENT_PALM_DIMENSION_SCALE,
}))

export const LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT = 4
export const LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT = 24

export const LANDRUSH_ISLAND_AMBIENT_FISH = [
  {
    cruiseSpeedMetersPerSecond: 0.34,
    depthMaxMeters: 1.1,
    depthMinMeters: 0.45,
    id: 'tiny-blue-green-chromis',
    lengthMeters: 0.09,
    modelForwardAxis: '+z' as const,
    modelForwardYaw: 0,
    schoolSize: 48,
    shoreDistanceMaxMeters: 5,
    shoreDistanceMinMeters: 2.5,
  },
  {
    cruiseSpeedMetersPerSecond: 0.28,
    depthMaxMeters: 1.2,
    depthMinMeters: 0.5,
    id: 'small-clownfish',
    lengthMeters: 0.12,
    modelForwardAxis: '-x' as const,
    modelForwardYaw: Math.PI / 2,
    schoolSize: 38,
    shoreDistanceMaxMeters: 5.5,
    shoreDistanceMinMeters: 2.5,
  },
  {
    cruiseSpeedMetersPerSecond: 0.48,
    depthMaxMeters: 1.5,
    depthMinMeters: 0.6,
    id: 'small-yellow-tang',
    lengthMeters: 0.2,
    modelForwardAxis: '+x' as const,
    modelForwardYaw: -Math.PI / 2,
    schoolSize: 30,
    shoreDistanceMaxMeters: 7,
    shoreDistanceMinMeters: 3,
  },
  {
    cruiseSpeedMetersPerSecond: 0.22,
    depthMaxMeters: 2,
    depthMinMeters: 0.8,
    id: 'medium-lionfish',
    lengthMeters: 0.38,
    modelForwardAxis: '+z' as const,
    modelForwardYaw: 0,
    schoolSize: 20,
    shoreDistanceMaxMeters: 8.5,
    shoreDistanceMinMeters: 4,
  },
  {
    cruiseSpeedMetersPerSecond: 0.6,
    depthMaxMeters: 2.2,
    depthMinMeters: 0.9,
    id: 'medium-parrotfish',
    lengthMeters: 0.55,
    modelForwardAxis: '-x' as const,
    modelForwardYaw: Math.PI / 2,
    schoolSize: 20,
    shoreDistanceMaxMeters: 10,
    shoreDistanceMinMeters: 4.5,
  },
  {
    cruiseSpeedMetersPerSecond: 0.5,
    depthMaxMeters: 3,
    depthMinMeters: 1.2,
    id: 'large-grouper',
    lengthMeters: 1.4,
    modelForwardAxis: '-x' as const,
    modelForwardYaw: Math.PI / 2,
    schoolSize: 14,
    shoreDistanceMaxMeters: 14,
    shoreDistanceMinMeters: 7,
  },
  {
    cruiseSpeedMetersPerSecond: 1.35,
    depthMaxMeters: 3.2,
    depthMinMeters: 1.2,
    id: 'large-barracuda',
    lengthMeters: 1.8,
    modelForwardAxis: '-x' as const,
    modelForwardYaw: Math.PI / 2,
    schoolSize: 12,
    shoreDistanceMaxMeters: 22,
    shoreDistanceMinMeters: 12,
  },
  {
    cruiseSpeedMetersPerSecond: 0.8,
    depthMaxMeters: 4.5,
    depthMinMeters: 1.8,
    id: 'giant-manta-ray',
    lengthMeters: 4.5,
    modelForwardAxis: '+z' as const,
    modelForwardYaw: 0,
    schoolSize: 6,
    shoreDistanceMaxMeters: 32,
    shoreDistanceMinMeters: 18,
  },
  {
    cruiseSpeedMetersPerSecond: 1.25,
    depthMaxMeters: 4.5,
    depthMinMeters: 1.8,
    id: 'caribbean-reef-shark',
    lengthMeters: 2.4,
    modelForwardAxis: '+z' as const,
    modelForwardYaw: 0,
    schoolSize: 8,
    shoreDistanceMaxMeters: 36,
    shoreDistanceMinMeters: 20,
  },
  {
    cruiseSpeedMetersPerSecond: 1.4,
    depthMaxMeters: 5,
    depthMinMeters: 2,
    id: 'hammerhead-shark',
    lengthMeters: 3.4,
    modelForwardAxis: '+z' as const,
    modelForwardYaw: 0,
    schoolSize: 4,
    shoreDistanceMaxMeters: 42,
    shoreDistanceMinMeters: 24,
  },
].map((entry) => ({
  ...entry,
  modelPath: `${ASSET_ROOT}/fish/${entry.id}/model.glb`,
}))

export const LANDRUSH_ISLAND_AMBIENT_FISH_INSTANCE_COUNT = LANDRUSH_ISLAND_AMBIENT_FISH.reduce(
  (total, fish) => total + fish.schoolSize,
  0,
)

export const LANDRUSH_ISLAND_AMBIENT_NPCS = [
  { id: 'island-groundskeeper', heightMeters: 1.72 },
  { id: 'local-fisher', heightMeters: 1.78 },
  { id: 'dock-worker', heightMeters: 1.83 },
  { id: 'lifeguard', heightMeters: 1.76 },
  { id: 'backpacker-tourist', heightMeters: 1.7 },
  { id: 'market-food-vendor', heightMeters: 1.68 },
  { id: 'marine-biologist', heightMeters: 1.74 },
  { id: 'building-technician', heightMeters: 1.8 },
  { id: 'retired-holidaymaker', heightMeters: 1.69 },
  { id: 'resort-concierge', heightMeters: 1.75 },
].map((entry) => ({
  ...entry,
  glb: {
    idle: `${ASSET_ROOT}/npcs/${entry.id}/idle.anim.glb`,
    rigged: `${ASSET_ROOT}/npcs/${entry.id}/rigged.glb`,
    run: `${ASSET_ROOT}/npcs/${entry.id}/run.anim.glb`,
    walk: `${ASSET_ROOT}/npcs/${entry.id}/walk.anim.glb`,
  },
}))

export type LandrushIslandAmbientNpc = (typeof LANDRUSH_ISLAND_AMBIENT_NPCS)[number]
export type LandrushIslandAmbientFish = (typeof LANDRUSH_ISLAND_AMBIENT_FISH)[number]
export type LandrushIslandAmbientBoat = (typeof LANDRUSH_ISLAND_AMBIENT_BOATS)[number]

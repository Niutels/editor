import {
  LANDRUSH_ISLAND_AMBIENT_NPCS,
  type LandrushIslandAmbientNpc,
} from './landrush-island-ambient-catalog'

export type ZombieEscapeZombieLocomotionGlb = {
  expectedClipCount: 1
  expectedClipName: 'Armature|running|baselayer' | 'Armature|walking_man|baselayer'
  loop: true
  path: string
  rootMotion: 'in-place'
  skeleton: 'rigged-base'
}

export type ZombieEscapeZombieBodyClass = 'standard' | 'heavy' | 'brute'

export type ZombieEscapeZombieGameplayProfile = {
  healthMultiplier: 1 | 5 | 10
  nightSpawnProgress: number | null
  persistentPlayerTrail: boolean
  respawnsDuringNight: boolean
}

export type ZombieEscapeZombieCatalogEntry = {
  bodyClass: ZombieEscapeZombieBodyClass
  capsule: {
    radiusMeters: number
    segmentLengthMeters: number
  }
  characterHeightMeters: number
  glb: {
    riggedBase: {
      expectedClipCount: 1
      expectedClipName: 'Armature|clip0|baselayer'
      path: string
    }
    run: ZombieEscapeZombieLocomotionGlb
    walk: ZombieEscapeZombieLocomotionGlb
  }
  id: string
  label: string
  gameplay: ZombieEscapeZombieGameplayProfile
  meshy: {
    aiModel: 'meshy-t2'
    forwardAxis: '+Z'
    modelType: 'smart-topology'
    outputFormat: 'glb'
    poseMode: 'a-pose'
    prompt: string
    targetPolycount: 3000
    textured: true
    texturePrompt: string
    textureResolution: '2k'
    topology: 'triangle'
  }
  movement: {
    runMetersPerSecond: number
    walkMetersPerSecond: number
  }
  runtimeBody: 'ambient-npc' | 'dedicated-meshy'
  seed: number
  silhouette: string
  sourceNpcId: LandrushIslandAmbientNpc['id']
  triangleBudget: {
    maximum: 3600
    minimum: 2400
    target: 3000
  }
}

export const ZOMBIE_ESCAPE_ZOMBIE_TARGET_TRIANGLE_COUNT = 3_000
export const ZOMBIE_ESCAPE_ZOMBIE_MINIMUM_TRIANGLE_COUNT = 2_400
export const ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_TRIANGLE_COUNT = 3_600

export const ZOMBIE_ESCAPE_ZOMBIE_GAMEPLAY_BY_BODY_CLASS = {
  brute: {
    healthMultiplier: 10,
    nightSpawnProgress: 2 / 3,
    persistentPlayerTrail: true,
    respawnsDuringNight: false,
  },
  heavy: {
    healthMultiplier: 5,
    nightSpawnProgress: 0.5,
    persistentPlayerTrail: true,
    respawnsDuringNight: true,
  },
  standard: {
    healthMultiplier: 1,
    nightSpawnProgress: null,
    persistentPlayerTrail: false,
    respawnsDuringNight: false,
  },
} as const satisfies Record<ZombieEscapeZombieBodyClass, ZombieEscapeZombieGameplayProfile>

type ZombieDefinition = Omit<
  ZombieEscapeZombieCatalogEntry,
  'gameplay' | 'glb' | 'meshy' | 'triangleBudget'
> & {
  prompt: string
  texturePrompt: string
}

function defineZombie<const T extends ZombieDefinition>(zombie: T) {
  const sourceNpc = LANDRUSH_ISLAND_AMBIENT_NPCS.find((npc) => npc.id === zombie.sourceNpcId)
  if (!sourceNpc) throw new Error(`Missing island ambient NPC asset: ${zombie.sourceNpcId}`)
  const directory =
    zombie.runtimeBody === 'dedicated-meshy'
      ? `/landrush-lab/zombie-escape/assets/zombies/${zombie.id}`
      : sourceNpc.glb.rigged.slice(0, -'/rigged.glb'.length)
  return {
    bodyClass: zombie.bodyClass,
    capsule: zombie.capsule,
    characterHeightMeters: zombie.characterHeightMeters,
    glb: {
      riggedBase: {
        expectedClipCount: 1,
        expectedClipName: 'Armature|clip0|baselayer',
        path: `${directory}/rigged.glb`,
      },
      run: {
        expectedClipCount: 1,
        expectedClipName: 'Armature|running|baselayer',
        loop: true,
        path:
          zombie.runtimeBody === 'dedicated-meshy'
            ? `${directory}/run.anim.glb`
            : sourceNpc.glb.run,
        rootMotion: 'in-place',
        skeleton: 'rigged-base',
      },
      walk: {
        expectedClipCount: 1,
        expectedClipName: 'Armature|walking_man|baselayer',
        loop: true,
        path:
          zombie.runtimeBody === 'dedicated-meshy'
            ? `${directory}/walk.anim.glb`
            : sourceNpc.glb.walk,
        rootMotion: 'in-place',
        skeleton: 'rigged-base',
      },
    },
    gameplay: ZOMBIE_ESCAPE_ZOMBIE_GAMEPLAY_BY_BODY_CLASS[zombie.bodyClass],
    id: zombie.id,
    label: zombie.label,
    meshy: {
      aiModel: 'meshy-t2',
      forwardAxis: '+Z',
      modelType: 'smart-topology',
      outputFormat: 'glb',
      poseMode: 'a-pose',
      prompt: zombie.prompt,
      targetPolycount: 3000,
      textured: true,
      texturePrompt: zombie.texturePrompt,
      textureResolution: '2k',
      topology: 'triangle',
    },
    movement: zombie.movement,
    runtimeBody: zombie.runtimeBody,
    seed: zombie.seed,
    silhouette: zombie.silhouette,
    sourceNpcId: zombie.sourceNpcId,
    triangleBudget: {
      maximum: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_TRIANGLE_COUNT,
      minimum: ZOMBIE_ESCAPE_ZOMBIE_MINIMUM_TRIANGLE_COUNT,
      target: ZOMBIE_ESCAPE_ZOMBIE_TARGET_TRIANGLE_COUNT,
    },
  } as const satisfies ZombieEscapeZombieCatalogEntry
}

export const ZOMBIE_ESCAPE_ZOMBIE_CATALOG = [
  defineZombie({
    bodyClass: 'standard',
    capsule: { radiusMeters: 0.35, segmentLengthMeters: 1.1 },
    characterHeightMeters: 1.82,
    id: 'dockworker',
    label: 'Dockworker',
    movement: { runMetersPerSecond: 3.2, walkMetersPerSecond: 1.15 },
    prompt:
      'Single full-body cartoony undead dockworker in neutral A-pose, standard biped with clearly separated arms and legs, believable seven-head-tall adult proportions, broad shoulders, work vest fused close to body, boots, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no props, no base, no gore, no detached clothing, target 3000 faces, suitable for auto-rigging.',
    runtimeBody: 'ambient-npc',
    seed: 0x5a45_0001,
    silhouette: 'broad shoulders, work vest, heavy boots',
    sourceNpcId: 'dock-worker',
    texturePrompt:
      'Stylized hand-painted PBR: muted sea-green skin, orange work vest, navy trousers, brown boots, tired friendly-undead face, clean color blocks, no blood, no gore, no baked lighting.',
  }),
  defineZombie({
    bodyClass: 'standard',
    capsule: { radiusMeters: 0.32, segmentLengthMeters: 1.1 },
    characterHeightMeters: 1.76,
    id: 'lifeguard',
    label: 'Lifeguard',
    movement: { runMetersPerSecond: 3.65, walkMetersPerSecond: 1.35 },
    prompt:
      'Single full-body cartoony undead adult human lifeguard in neutral A-pose, ordinary human head with short hair and round ears, realistic anatomy exactly seven-and-a-half heads tall, normal hands, long athletic legs, clearly separated limbs, fitted shirt, shorts and intact sneakers, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no horns, antlers, animal or fantasy traits, props, base, or gore, target 3000 faces, suitable for auto-rigging.',
    runtimeBody: 'ambient-npc',
    seed: 0x5a45_0002,
    silhouette: 'athletic torso, shorts, exposed lower legs',
    sourceNpcId: 'lifeguard',
    texturePrompt:
      'Stylized hand-painted PBR: sun-faded red shirt, cream shorts, teal-gray skin, white shoes, slightly sunburned cartoon face, no logos, no blood, no baked lighting.',
  }),
  defineZombie({
    bodyClass: 'standard',
    capsule: { radiusMeters: 0.33, segmentLengthMeters: 1.04 },
    characterHeightMeters: 1.7,
    id: 'island-gardener',
    label: 'Island Gardener',
    movement: { runMetersPerSecond: 2.75, walkMetersPerSecond: 1.05 },
    prompt:
      'Single full-body cartoony undead adult island gardener in neutral A-pose, realistic human anatomy exactly seven-and-a-half heads tall, normal-size head and hands, arms ending at mid-thigh, legs half the body height, clearly separated limbs, fitted overalls, face and torso toward +Z, feet flat, one watertight game-ready mesh, no goggles, hat, tools, props, base, or gore, target 3000 faces, suitable for auto-rigging.',
    runtimeBody: 'ambient-npc',
    seed: 0x5a45_0003,
    silhouette: 'older posture, fitted overalls, work gloves',
    sourceNpcId: 'island-groundskeeper',
    texturePrompt:
      'Stylized hand-painted PBR: moss-green overalls, pale yellow shirt, lavender-gray skin, brown work shoes, soil smudges without gore, no baked lighting, crisp readable features.',
  }),
  defineZombie({
    bodyClass: 'standard',
    capsule: { radiusMeters: 0.34, segmentLengthMeters: 1.06 },
    characterHeightMeters: 1.74,
    id: 'tourist',
    label: 'Tourist',
    movement: { runMetersPerSecond: 2.9, walkMetersPerSecond: 1.1 },
    prompt:
      'Single full-body cartoony undead island tourist in neutral A-pose, standard biped with clearly separated arms and legs, believable seven-head-tall average adult proportions, short-sleeve tropical shirt and shorts fitted close to body, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no camera, no bag, no hat, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    runtimeBody: 'ambient-npc',
    seed: 0x5a45_0004,
    silhouette: 'average torso, tropical shirt, shorts',
    sourceNpcId: 'backpacker-tourist',
    texturePrompt:
      'Stylized hand-painted PBR: turquoise tropical shirt with simple coral leaf pattern, tan shorts, pale green-gray skin, canvas shoes, no text, no blood, no baked lighting.',
  }),
  defineZombie({
    bodyClass: 'brute',
    capsule: { radiusMeters: 0.37, segmentLengthMeters: 1.4 },
    characterHeightMeters: 2.14,
    id: 'marina-mechanic',
    label: 'Marina Mechanic',
    movement: { runMetersPerSecond: 2.3, walkMetersPerSecond: 1 },
    prompt:
      'Single full-body stylized cartoon Frankenstein-like zombie brute in neutral A-pose, hulking six-head-tall monster proportions, enormous rectangular torso, slab shoulders twice head width, thick neck, massive arms, oversized hands, thick thighs and calves, heavy boots, flat-topped head, clearly separated arms and legs with arms far from torso, patched coveralls fitted close, face and torso toward +Z, feet flat, symmetrical watertight game-ready mesh, no tools, props, base, detached parts, blood, or gore, target 3000 faces, suitable for auto-rigging.',
    runtimeBody: 'dedicated-meshy',
    seed: 0x5a45_0005,
    silhouette: 'towering squared head, slab shoulders, long heavy arms, massive boots',
    sourceNpcId: 'building-technician',
    texturePrompt:
      'Stylized hand-painted PBR: storm-gray green skin, dark navy patched coveralls, muted mustard undershirt, charcoal oversized boots, subtle purple stitched seams and small metal neck fasteners, clean readable color blocks, no blood, no text, no baked lighting.',
  }),
  defineZombie({
    bodyClass: 'standard',
    capsule: { radiusMeters: 0.31, segmentLengthMeters: 1.17 },
    characterHeightMeters: 1.79,
    id: 'beach-courier',
    label: 'Beach Courier',
    movement: { runMetersPerSecond: 3.8, walkMetersPerSecond: 1.4 },
    prompt:
      'Single full-body cartoony undead beach courier in neutral A-pose, standard biped with clearly separated limbs, believable seven-head-tall lean adult proportions, fitted windbreaker and cargo trousers, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no backpack, no parcel, no helmet, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    runtimeBody: 'ambient-npc',
    seed: 0x5a45_0006,
    silhouette: 'lean limbs, fitted windbreaker, cargo trousers',
    sourceNpcId: 'marine-biologist',
    texturePrompt:
      'Stylized hand-painted PBR: bright yellow windbreaker, violet cargo trousers, desaturated mint skin, dark trainers, subtle fabric wear, no blood, no logos, no baked lighting.',
  }),
  defineZombie({
    bodyClass: 'heavy',
    capsule: { radiusMeters: 0.37, segmentLengthMeters: 1.14 },
    characterHeightMeters: 1.88,
    id: 'boardwalk-chef',
    label: 'Boardwalk Chef',
    movement: { runMetersPerSecond: 2.45, walkMetersPerSecond: 1 },
    prompt:
      'Single full-body stylized cartoon zombie chef with an obese pear-shaped body in neutral A-pose, enormous spherical belly wider than shoulders and projecting forward and sideways, barrel chest, very thick waist and hips, thick arms and thighs, short sturdy legs, small head, clearly separated arms and legs with arms far from belly, double-breasted jacket and apron fitted close, face and torso toward +Z, feet flat, symmetrical watertight game-ready mesh, no hat, utensil, props, base, detached clothing, blood, or gore, target 3000 faces, suitable for auto-rigging.',
    runtimeBody: 'dedicated-meshy',
    seed: 0x5a45_0007,
    silhouette: 'wide round belly, thick chest and limbs, double-breasted jacket, apron',
    sourceNpcId: 'market-food-vendor',
    texturePrompt:
      'Stylized hand-painted PBR: cream cook jacket stretched over a large round belly, tomato-red apron, soft blue-gray skin, dark checked trousers, warm brown shoes, broad readable color blocks, harmless fabric wear, no blood, no text, no baked lighting.',
  }),
  defineZombie({
    bodyClass: 'standard',
    capsule: { radiusMeters: 0.33, segmentLengthMeters: 1.17 },
    characterHeightMeters: 1.83,
    id: 'island-ranger',
    label: 'Island Ranger',
    movement: { runMetersPerSecond: 3.55, walkMetersPerSecond: 1.3 },
    prompt:
      'Single full-body cartoony undead island ranger in neutral A-pose, standard biped with clearly separated limbs, believable seven-head-tall fit adult proportions, short-sleeve uniform and utility trousers fitted close to body, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no hat, no radio, no weapon, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    runtimeBody: 'ambient-npc',
    seed: 0x5a45_0008,
    silhouette: 'fit frame, short sleeves, utility trousers',
    sourceNpcId: 'local-fisher',
    texturePrompt:
      'Stylized hand-painted PBR: forest green uniform, sandy utility trousers, muted purple-gray skin, brown trail boots, no badge text, no blood, no baked lighting.',
  }),
  defineZombie({
    bodyClass: 'standard',
    capsule: { radiusMeters: 0.3, segmentLengthMeters: 1.12 },
    characterHeightMeters: 1.72,
    id: 'resort-clerk',
    label: 'Resort Clerk',
    movement: { runMetersPerSecond: 3.3, walkMetersPerSecond: 1.2 },
    prompt:
      'Single full-body cartoony undead adult resort clerk in neutral A-pose, realistic human anatomy exactly seven-and-a-half heads tall, normal-size head and hands, long legs half the body height, clearly separated limbs, neat fitted vest and rolled-sleeve shirt, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no bald oversized head, tray, tag, props, base, or gore, target 3000 faces, suitable for auto-rigging.',
    runtimeBody: 'ambient-npc',
    seed: 0x5a45_0009,
    silhouette: 'slim torso, neat vest, rolled sleeves',
    sourceNpcId: 'resort-concierge',
    texturePrompt:
      'Stylized hand-painted PBR: plum vest, pale aqua shirt, charcoal trousers, soft sage skin, polished dark shoes, no lettering, no blood, no baked lighting.',
  }),
  defineZombie({
    bodyClass: 'standard',
    capsule: { radiusMeters: 0.33, segmentLengthMeters: 1.07 },
    characterHeightMeters: 1.73,
    id: 'old-sailor',
    label: 'Old Sailor',
    movement: { runMetersPerSecond: 2.7, walkMetersPerSecond: 1.05 },
    prompt:
      'Single full-body cartoony undead old sailor in neutral A-pose, standard biped with clearly separated limbs, believable seven-head-tall older adult proportions, striped knit shirt and loose trousers kept close to body, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no hat, no pipe, no rope, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    runtimeBody: 'ambient-npc',
    seed: 0x5a45_000a,
    silhouette: 'older frame, knit shirt, loose trousers',
    sourceNpcId: 'retired-holidaymaker',
    texturePrompt:
      'Stylized hand-painted PBR: cream and navy striped shirt, weathered red trousers, desaturated teal-gray skin, brown deck shoes, no blood, no text, no baked lighting.',
  }),
] as const

export const ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_CAPSULE_RADIUS_METERS = Math.max(
  ...ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map(({ capsule }) => capsule.radiusMeters),
)

export const ZOMBIE_ESCAPE_STANDARD_ZOMBIE_VARIANTS: readonly number[] = Object.freeze(
  ZOMBIE_ESCAPE_ZOMBIE_CATALOG.flatMap((zombie, variant) =>
    zombie.bodyClass === 'standard' ? [variant] : [],
  ),
)

if (ZOMBIE_ESCAPE_STANDARD_ZOMBIE_VARIANTS.length === 0) {
  throw new Error('Zombie Escape requires at least one standard zombie variant')
}

function resolveSingleZombieEscapeVariant(bodyClass: 'heavy' | 'brute') {
  const variants = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.flatMap((zombie, variant) =>
    zombie.bodyClass === bodyClass ? [variant] : [],
  )
  if (variants.length !== 1) {
    throw new Error(`Zombie Escape requires exactly one ${bodyClass} zombie variant`)
  }
  return variants[0]!
}

export const ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT = resolveSingleZombieEscapeVariant('heavy')
export const ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT = resolveSingleZombieEscapeVariant('brute')

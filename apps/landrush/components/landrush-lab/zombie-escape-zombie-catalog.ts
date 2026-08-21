export type ZombieEscapeZombieLocomotionGlb = {
  expectedClipCount: 1
  expectedClipName: 'Armature|running|baselayer' | 'Armature|walking_man|baselayer'
  loop: true
  path: string
  rootMotion: 'in-place'
  skeleton: 'rigged-base'
}

export type ZombieEscapeZombieCatalogEntry = {
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
  seed: number
  silhouette: string
  triangleBudget: {
    maximum: 3600
    minimum: 2400
    target: 3000
  }
}

export const ZOMBIE_ESCAPE_ZOMBIE_TARGET_TRIANGLE_COUNT = 3_000
export const ZOMBIE_ESCAPE_ZOMBIE_MINIMUM_TRIANGLE_COUNT = 2_400
export const ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_TRIANGLE_COUNT = 3_600

type ZombieDefinition = Omit<ZombieEscapeZombieCatalogEntry, 'glb' | 'meshy' | 'triangleBudget'> & {
  prompt: string
  texturePrompt: string
}

function defineZombie<const T extends ZombieDefinition>(zombie: T) {
  const directory = `/landrush-lab/zombie-escape/assets/zombies/${zombie.id}`
  return {
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
        path: `${directory}/run.glb`,
        rootMotion: 'in-place',
        skeleton: 'rigged-base',
      },
      walk: {
        expectedClipCount: 1,
        expectedClipName: 'Armature|walking_man|baselayer',
        loop: true,
        path: `${directory}/walk.glb`,
        rootMotion: 'in-place',
        skeleton: 'rigged-base',
      },
    },
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
    seed: zombie.seed,
    silhouette: zombie.silhouette,
    triangleBudget: {
      maximum: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_TRIANGLE_COUNT,
      minimum: ZOMBIE_ESCAPE_ZOMBIE_MINIMUM_TRIANGLE_COUNT,
      target: ZOMBIE_ESCAPE_ZOMBIE_TARGET_TRIANGLE_COUNT,
    },
  } as const satisfies ZombieEscapeZombieCatalogEntry
}

export const ZOMBIE_ESCAPE_ZOMBIE_CATALOG = [
  defineZombie({
    capsule: { radiusMeters: 0.35, segmentLengthMeters: 1.1 },
    characterHeightMeters: 1.82,
    id: 'dockworker',
    label: 'Dockworker',
    movement: { runMetersPerSecond: 3.2, walkMetersPerSecond: 1.15 },
    prompt:
      'Single full-body cartoony undead dockworker in neutral A-pose, standard biped with clearly separated arms and legs, believable seven-head-tall adult proportions, broad shoulders, work vest fused close to body, boots, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no props, no base, no gore, no detached clothing, target 3000 faces, suitable for auto-rigging.',
    seed: 0x5a45_0001,
    silhouette: 'broad shoulders, work vest, heavy boots',
    texturePrompt:
      'Stylized hand-painted PBR: muted sea-green skin, orange work vest, navy trousers, brown boots, tired friendly-undead face, clean color blocks, no blood, no gore, no baked lighting.',
  }),
  defineZombie({
    capsule: { radiusMeters: 0.32, segmentLengthMeters: 1.1 },
    characterHeightMeters: 1.76,
    id: 'lifeguard',
    label: 'Lifeguard',
    movement: { runMetersPerSecond: 3.65, walkMetersPerSecond: 1.35 },
    prompt:
      'Single full-body cartoony undead adult human lifeguard in neutral A-pose, ordinary human head with short hair and round ears, realistic anatomy exactly seven-and-a-half heads tall, normal hands, long athletic legs, clearly separated limbs, fitted shirt, shorts and intact sneakers, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no horns, antlers, animal or fantasy traits, props, base, or gore, target 3000 faces, suitable for auto-rigging.',
    seed: 0x5a45_0002,
    silhouette: 'athletic torso, shorts, exposed lower legs',
    texturePrompt:
      'Stylized hand-painted PBR: sun-faded red shirt, cream shorts, teal-gray skin, white shoes, slightly sunburned cartoon face, no logos, no blood, no baked lighting.',
  }),
  defineZombie({
    capsule: { radiusMeters: 0.33, segmentLengthMeters: 1.04 },
    characterHeightMeters: 1.7,
    id: 'island-gardener',
    label: 'Island Gardener',
    movement: { runMetersPerSecond: 2.75, walkMetersPerSecond: 1.05 },
    prompt:
      'Single full-body cartoony undead adult island gardener in neutral A-pose, realistic human anatomy exactly seven-and-a-half heads tall, normal-size head and hands, arms ending at mid-thigh, legs half the body height, clearly separated limbs, fitted overalls, face and torso toward +Z, feet flat, one watertight game-ready mesh, no goggles, hat, tools, props, base, or gore, target 3000 faces, suitable for auto-rigging.',
    seed: 0x5a45_0003,
    silhouette: 'older posture, fitted overalls, work gloves',
    texturePrompt:
      'Stylized hand-painted PBR: moss-green overalls, pale yellow shirt, lavender-gray skin, brown work shoes, soil smudges without gore, no baked lighting, crisp readable features.',
  }),
  defineZombie({
    capsule: { radiusMeters: 0.34, segmentLengthMeters: 1.06 },
    characterHeightMeters: 1.74,
    id: 'tourist',
    label: 'Tourist',
    movement: { runMetersPerSecond: 2.9, walkMetersPerSecond: 1.1 },
    prompt:
      'Single full-body cartoony undead island tourist in neutral A-pose, standard biped with clearly separated arms and legs, believable seven-head-tall average adult proportions, short-sleeve tropical shirt and shorts fitted close to body, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no camera, no bag, no hat, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    seed: 0x5a45_0004,
    silhouette: 'average torso, tropical shirt, shorts',
    texturePrompt:
      'Stylized hand-painted PBR: turquoise tropical shirt with simple coral leaf pattern, tan shorts, pale green-gray skin, canvas shoes, no text, no blood, no baked lighting.',
  }),
  defineZombie({
    capsule: { radiusMeters: 0.37, segmentLengthMeters: 1.12 },
    characterHeightMeters: 1.86,
    id: 'marina-mechanic',
    label: 'Marina Mechanic',
    movement: { runMetersPerSecond: 3.05, walkMetersPerSecond: 1.15 },
    prompt:
      'Single full-body cartoony undead marina mechanic in neutral A-pose, standard biped with clearly separated limbs, believable seven-and-a-half-head-tall sturdy adult proportions, zipped coveralls close to body, heavy boots, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no wrench, no cap, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    seed: 0x5a45_0005,
    silhouette: 'sturdy torso, zipped coveralls, heavy boots',
    texturePrompt:
      'Stylized hand-painted PBR: dark blue coveralls, mustard undershirt, cool gray-green skin, black boots, harmless grease smudges, no blood, no text, no baked lighting.',
  }),
  defineZombie({
    capsule: { radiusMeters: 0.31, segmentLengthMeters: 1.17 },
    characterHeightMeters: 1.79,
    id: 'beach-courier',
    label: 'Beach Courier',
    movement: { runMetersPerSecond: 3.8, walkMetersPerSecond: 1.4 },
    prompt:
      'Single full-body cartoony undead beach courier in neutral A-pose, standard biped with clearly separated limbs, believable seven-head-tall lean adult proportions, fitted windbreaker and cargo trousers, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no backpack, no parcel, no helmet, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    seed: 0x5a45_0006,
    silhouette: 'lean limbs, fitted windbreaker, cargo trousers',
    texturePrompt:
      'Stylized hand-painted PBR: bright yellow windbreaker, violet cargo trousers, desaturated mint skin, dark trainers, subtle fabric wear, no blood, no logos, no baked lighting.',
  }),
  defineZombie({
    capsule: { radiusMeters: 0.36, segmentLengthMeters: 0.96 },
    characterHeightMeters: 1.68,
    id: 'boardwalk-chef',
    label: 'Boardwalk Chef',
    movement: { runMetersPerSecond: 2.6, walkMetersPerSecond: 1 },
    prompt:
      'Single full-body cartoony undead boardwalk chef in neutral A-pose, standard biped with clearly separated limbs, believable seven-head-tall stocky adult proportions, double-breasted jacket and apron fitted close to body, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no hat, no utensil, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    seed: 0x5a45_0007,
    silhouette: 'stocky torso, double-breasted jacket, apron',
    texturePrompt:
      'Stylized hand-painted PBR: cream chef jacket, tomato-red apron, soft blue-gray skin, dark checked trousers simplified for readability, no stains resembling blood, no text, no baked lighting.',
  }),
  defineZombie({
    capsule: { radiusMeters: 0.33, segmentLengthMeters: 1.17 },
    characterHeightMeters: 1.83,
    id: 'island-ranger',
    label: 'Island Ranger',
    movement: { runMetersPerSecond: 3.55, walkMetersPerSecond: 1.3 },
    prompt:
      'Single full-body cartoony undead island ranger in neutral A-pose, standard biped with clearly separated limbs, believable seven-head-tall fit adult proportions, short-sleeve uniform and utility trousers fitted close to body, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no hat, no radio, no weapon, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    seed: 0x5a45_0008,
    silhouette: 'fit frame, short sleeves, utility trousers',
    texturePrompt:
      'Stylized hand-painted PBR: forest green uniform, sandy utility trousers, muted purple-gray skin, brown trail boots, no badge text, no blood, no baked lighting.',
  }),
  defineZombie({
    capsule: { radiusMeters: 0.3, segmentLengthMeters: 1.12 },
    characterHeightMeters: 1.72,
    id: 'resort-clerk',
    label: 'Resort Clerk',
    movement: { runMetersPerSecond: 3.3, walkMetersPerSecond: 1.2 },
    prompt:
      'Single full-body cartoony undead adult resort clerk in neutral A-pose, realistic human anatomy exactly seven-and-a-half heads tall, normal-size head and hands, long legs half the body height, clearly separated limbs, neat fitted vest and rolled-sleeve shirt, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no bald oversized head, tray, tag, props, base, or gore, target 3000 faces, suitable for auto-rigging.',
    seed: 0x5a45_0009,
    silhouette: 'slim torso, neat vest, rolled sleeves',
    texturePrompt:
      'Stylized hand-painted PBR: plum vest, pale aqua shirt, charcoal trousers, soft sage skin, polished dark shoes, no lettering, no blood, no baked lighting.',
  }),
  defineZombie({
    capsule: { radiusMeters: 0.33, segmentLengthMeters: 1.07 },
    characterHeightMeters: 1.73,
    id: 'old-sailor',
    label: 'Old Sailor',
    movement: { runMetersPerSecond: 2.7, walkMetersPerSecond: 1.05 },
    prompt:
      'Single full-body cartoony undead old sailor in neutral A-pose, standard biped with clearly separated limbs, believable seven-head-tall older adult proportions, striped knit shirt and loose trousers kept close to body, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no hat, no pipe, no rope, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    seed: 0x5a45_000a,
    silhouette: 'older frame, knit shirt, loose trousers',
    texturePrompt:
      'Stylized hand-painted PBR: cream and navy striped shirt, weathered red trousers, desaturated teal-gray skin, brown deck shoes, no blood, no text, no baked lighting.',
  }),
] as const

export const ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_CAPSULE_RADIUS_METERS = Math.max(
  ...ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map(({ capsule }) => capsule.radiusMeters),
)

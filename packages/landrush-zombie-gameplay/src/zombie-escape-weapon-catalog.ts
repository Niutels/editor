export type ZombieEscapeWeaponVector3 = readonly [x: number, y: number, z: number]

export type ZombieEscapeWeaponDimensions = {
  heightY: number
  lengthZ: number
  widthX: number
}

export type ZombieEscapeWeaponHandFitPose = {
  anchor: 'primary' | 'secondary'
  hand: 'left' | 'right'
  palmOffsetMeters: ZombieEscapeWeaponVector3
  palmRotationEulerDegrees: ZombieEscapeWeaponVector3
}

export type ZombieEscapeWeaponSpecification = {
  assetPath: string
  canonicalDimensionsMeters: ZombieEscapeWeaponDimensions
  collisionBounds: {
    centerMeters: ZombieEscapeWeaponVector3
    halfExtentsMeters: ZombieEscapeWeaponVector3
    purpose: 'weapon-body'
    shape: 'box'
    space: 'asset-local-meters'
  }
  displayName: string
  grip: {
    anchorSemantics: 'palm-center'
    anchorSpace: 'asset-local-meters'
    axis: ZombieEscapeWeaponVector3
    axisSemantics: 'rear-to-muzzle'
    handleRadiusMeters: number
    primaryAnchorMeters: ZombieEscapeWeaponVector3
    secondaryAnchorMeters: ZombieEscapeWeaponVector3 | null
  }
  handFitDefaults: {
    poseSemantics: 'palm-pose-in-grip-local-space'
    primary: ZombieEscapeWeaponHandFitPose
    rotationOrder: 'XYZ'
    secondary: ZombieEscapeWeaponHandFitPose | null
  }
  id: string
  meshy: {
    aiModel: 'meshy-t2'
    modelType: 'smart-topology'
    prompt: string
    targetPolycount: 3000
    texturePrompt: string
    textureResolution: '2k'
    topology: 'triangle'
  }
  muzzle: {
    anchorMeters: ZombieEscapeWeaponVector3
    forwardAxis: ZombieEscapeWeaponVector3
    space: 'asset-local-meters'
  }
  triangleBudget: {
    maximumTriangles: 3600
    minimumTriangles: 2400
    targetTriangles: 3000
  }
  wield: 'one-hand' | 'two-hand'
}

export const ZOMBIE_ESCAPE_WEAPON_ASSET_FRAME = {
  longitudinalAxis: '+z',
  longitudinalSemantics: 'rear-to-muzzle',
  origin: 'canonical-bounds-center',
  rightAxis: '+x',
  units: 'meters',
  upAxis: '+y',
} as const

type WeaponDefinition = Omit<
  ZombieEscapeWeaponSpecification,
  'assetPath' | 'collisionBounds' | 'grip' | 'meshy' | 'muzzle' | 'triangleBudget'
> & {
  collisionBounds: Pick<
    ZombieEscapeWeaponSpecification['collisionBounds'],
    'centerMeters' | 'halfExtentsMeters'
  >
  grip: Pick<
    ZombieEscapeWeaponSpecification['grip'],
    'handleRadiusMeters' | 'primaryAnchorMeters' | 'secondaryAnchorMeters'
  >
  meshy: Pick<ZombieEscapeWeaponSpecification['meshy'], 'prompt' | 'texturePrompt'>
  muzzleAnchorMeters: ZombieEscapeWeaponVector3
}

function defineWeapon<const T extends WeaponDefinition>(weapon: T) {
  return {
    ...weapon,
    assetPath: `/landrush-lab/zombie-escape/assets/weapons/${weapon.id}.glb`,
    collisionBounds: {
      ...weapon.collisionBounds,
      purpose: 'weapon-body',
      shape: 'box',
      space: 'asset-local-meters',
    },
    grip: {
      ...weapon.grip,
      anchorSemantics: 'palm-center',
      anchorSpace: 'asset-local-meters',
      axis: [0, 0, 1],
      axisSemantics: 'rear-to-muzzle',
    },
    meshy: {
      ...weapon.meshy,
      aiModel: 'meshy-t2',
      modelType: 'smart-topology',
      targetPolycount: 3000,
      textureResolution: '2k',
      topology: 'triangle',
    },
    muzzle: {
      anchorMeters: weapon.muzzleAnchorMeters,
      forwardAxis: [0, 0, 1],
      space: 'asset-local-meters',
    },
    triangleBudget: {
      maximumTriangles: 3600,
      minimumTriangles: 2400,
      targetTriangles: 3000,
    },
  } as const satisfies ZombieEscapeWeaponSpecification
}

export const ZOMBIE_ESCAPE_WEAPON_CATALOG = [
  defineWeapon({
    canonicalDimensionsMeters: { heightY: 0.24, lengthZ: 0.34, widthX: 0.09 },
    collisionBounds: {
      centerMeters: [0, 0, 0],
      halfExtentsMeters: [0.045, 0.12, 0.17],
    },
    displayName: 'Sunflare Pistol',
    grip: {
      handleRadiusMeters: 0.025,
      primaryAnchorMeters: [0, -0.065, -0.07],
      secondaryAnchorMeters: null,
    },
    handFitDefaults: {
      poseSemantics: 'palm-pose-in-grip-local-space',
      primary: {
        anchor: 'primary',
        hand: 'right',
        palmOffsetMeters: [0, 0, 0],
        palmRotationEulerDegrees: [0, 0, -4],
      },
      rotationOrder: 'XYZ',
      secondary: null,
    },
    id: 'sunflare-pistol',
    meshy: {
      prompt:
        'Single compact cartoony solar-energy sidearm, chunky readable silhouette, short orange ceramic barrel shroud, teal grip, brass power cell, friendly island rescue technology, barrel pointing toward +Z and grip downward along -Y, centered as one watertight game-ready mesh, no hands, no character, no stand, no floating parts, clean bevels, target 3000 faces.',
      texturePrompt:
        'Stylized hand-painted PBR: warm orange ceramic, teal rubber grip, brushed brass accents, dark charcoal seams, subtle edge wear, no baked lighting, no labels, clean readable game asset.',
    },
    muzzleAnchorMeters: [0.00025, 0.05445, 0.17],
    wield: 'one-hand',
  }),
  defineWeapon({
    canonicalDimensionsMeters: { heightY: 0.3, lengthZ: 0.78, widthX: 0.13 },
    collisionBounds: {
      centerMeters: [0, 0, 0],
      halfExtentsMeters: [0.065, 0.15, 0.39],
    },
    displayName: 'Reef Carbine',
    grip: {
      handleRadiusMeters: 0.027,
      primaryAnchorMeters: [0, -0.08, -0.18],
      secondaryAnchorMeters: [0, -0.035, 0.08],
    },
    handFitDefaults: twoHandFit([2, 0, -4], [-5, 0, 5]),
    id: 'reef-carbine',
    meshy: {
      prompt:
        'Single cartoony compact energy carbine for a tropical island defender, strong two-handed silhouette, coral-red receiver, aqua barrel fins, dark stock, barrel pointing toward +Z, pistol grip downward along -Y, one watertight game-ready mesh, no hands, no character, no sling, no stand, no detached pieces, clean bevels, target 3000 faces.',
      texturePrompt:
        'Stylized hand-painted PBR: coral red receiver, aqua cooling fins, matte charcoal stock, pale ivory details, restrained scratches, no baked lighting, no text, crisp material separation.',
    },
    muzzleAnchorMeters: [-0.0001, 0.05018, 0.39],
    wield: 'two-hand',
  }),
  defineWeapon({
    canonicalDimensionsMeters: { heightY: 0.31, lengthZ: 0.82, widthX: 0.14 },
    collisionBounds: {
      centerMeters: [0, 0, 0],
      halfExtentsMeters: [0.07, 0.155, 0.41],
    },
    displayName: 'Driftwood Scattergun',
    grip: {
      handleRadiusMeters: 0.028,
      primaryAnchorMeters: [0, -0.085, -0.2],
      secondaryAnchorMeters: [0, -0.03, 0.1],
    },
    handFitDefaults: twoHandFit([4, 0, -5], [-7, 0, 6]),
    id: 'driftwood-scattergun',
    meshy: {
      prompt:
        'Single chunky cartoony short scattergun assembled from driftwood and marine steel, wide muzzle, readable pump and two-handed grip, barrel pointing toward +Z, grip downward along -Y, one watertight game-ready mesh, no hands, no character, no strap, no stand, no detached shells, clean simplified forms, target 3000 faces.',
      texturePrompt:
        'Stylized hand-painted PBR: honey driftwood stock and pump, desaturated marine steel, turquoise tape wraps, brass fasteners, mild salt wear, no baked lighting, no text.',
    },
    muzzleAnchorMeters: [-0.00305, 0.05746, 0.41],
    wield: 'two-hand',
  }),
  defineWeapon({
    canonicalDimensionsMeters: { heightY: 0.28, lengthZ: 0.7, widthX: 0.16 },
    collisionBounds: {
      centerMeters: [0, 0, 0],
      halfExtentsMeters: [0.08, 0.14, 0.35],
    },
    displayName: 'Storm-Coil Repeater',
    grip: {
      handleRadiusMeters: 0.027,
      primaryAnchorMeters: [0, -0.075, -0.16],
      secondaryAnchorMeters: [0, -0.02, 0.08],
    },
    handFitDefaults: twoHandFit([1, 0, -5], [-5, 0, 4]),
    id: 'storm-coil-repeater',
    meshy: {
      prompt:
        'Single cartoony rapid-fire storm coil repeater, compact two-handed sci-fi weapon, circular copper coils around a navy receiver, bright cyan energy channel, barrel pointing toward +Z, grip downward along -Y, one watertight game-ready mesh, no hands, no character, no cable, no stand, no floating parts, target 3000 faces.',
      texturePrompt:
        'Stylized hand-painted PBR: navy painted metal, copper coils, cyan emissive channel, matte black grip, subtle rain wear, no baked lighting, no lettering, clean bold color blocks.',
    },
    muzzleAnchorMeters: [-0.00068, 0.0931, 0.35],
    wield: 'two-hand',
  }),
  defineWeapon({
    canonicalDimensionsMeters: { heightY: 0.36, lengthZ: 0.94, widthX: 0.25 },
    collisionBounds: {
      centerMeters: [0, 0, 0],
      halfExtentsMeters: [0.125, 0.18, 0.47],
    },
    displayName: 'Tidebreak Launcher',
    grip: {
      handleRadiusMeters: 0.03,
      primaryAnchorMeters: [0, -0.1, -0.17],
      secondaryAnchorMeters: [0, -0.035, 0.12],
    },
    handFitDefaults: twoHandFit([4, 0, -5], [-6, 0, 6]),
    id: 'tidebreak-launcher',
    meshy: {
      prompt:
        'Single cartoony shoulder-mounted rescue projectile launcher, broad cylindrical barrel and compact rear brace, white and red coast-guard palette, barrel pointing toward +Z, grip downward along -Y, one watertight game-ready mesh, no hands, no character, no projectile, no strap, no stand, no detached parts, target 3000 faces.',
      texturePrompt:
        'Stylized hand-painted PBR: warm white shell, rescue red bands, navy rubber grips, brushed steel muzzle, tiny amber indicator glow, no baked lighting, no text, minimal wear.',
    },
    muzzleAnchorMeters: [-0.00046, 0.05835, 0.47],
    wield: 'two-hand',
  }),
] as const

export type ZombieEscapeWeaponId = (typeof ZOMBIE_ESCAPE_WEAPON_CATALOG)[number]['id']

function twoHandFit(
  primaryRotation: ZombieEscapeWeaponVector3,
  secondaryRotation: ZombieEscapeWeaponVector3,
): ZombieEscapeWeaponSpecification['handFitDefaults'] {
  return {
    poseSemantics: 'palm-pose-in-grip-local-space',
    primary: {
      anchor: 'primary',
      hand: 'right',
      palmOffsetMeters: [0, 0, 0],
      palmRotationEulerDegrees: primaryRotation,
    },
    rotationOrder: 'XYZ',
    secondary: {
      anchor: 'secondary',
      hand: 'left',
      palmOffsetMeters: [0, 0, 0],
      palmRotationEulerDegrees: secondaryRotation,
    },
  }
}

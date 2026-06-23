import { DoubleSide, ShaderMaterial, type Texture, Vector3 } from 'three'

export const BRUNO_TERRAIN_TEXTURE_PATH = '/landrush-lab/bruno-terrain.png'
export const BRUNO_FLOOR_SLABS_TEXTURE_PATH = '/landrush-lab/bruno-floor-slabs.png'
export const BRUNO_TERRAIN_WORLD_SIZE = 192
export const BRUNO_TERRAIN_RESOLUTION = 512
export const BRUNO_GRASS_VIEW_SIZE = 44
export const BRUNO_GRASS_VIEW_CENTER = { x: -3.05, z: -3.05 } as const

export type GrassBladeTuning = {
  brightness: number
  density: number
  foliageOpacity: number
  height: number
  opacity: number
  patchSize: number
  patchSoftness: number
  rootShadow: number
  width: number
  wind: number
}

export const DEFAULT_GRASS_BLADE_TUNING: GrassBladeTuning = {
  brightness: 1,
  density: 0.82,
  foliageOpacity: 1,
  height: 0.6,
  opacity: 1,
  patchSize: 24,
  patchSoftness: 0.18,
  rootShadow: 1,
  width: 0.1,
  wind: 0.5,
}

const BRUNO_TERRAIN_GLSL = `
  const float BRUNO_PI = 3.141592653589793;

  float brunoSaturate(float value) {
    return clamp(value, 0.0, 1.0);
  }

  vec2 brunoRotateUv(vec2 uv, float angle, vec2 center) {
    float s = sin(angle);
    float c = cos(angle);
    vec2 offset = uv - center;
    return vec2(offset.x * c - offset.y * s, offset.x * s + offset.y * c) + center;
  }

  vec2 brunoModulo(vec2 dividend, vec2 divisor) {
    return mod(mod(dividend, divisor) + divisor, divisor);
  }

  vec2 brunoRandom(vec2 value) {
    value = vec2(dot(value, vec2(127.1, 311.7)), dot(value, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(value) * 43758.5453123);
  }

  float brunoHash12(vec2 value) {
    vec3 p = fract(vec3(value.xyx) * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float brunoValueNoise(vec2 value) {
    vec2 cell = floor(value);
    vec2 local = fract(value);
    vec2 curve = local * local * (3.0 - 2.0 * local);
    float a = brunoHash12(cell);
    float b = brunoHash12(cell + vec2(1.0, 0.0));
    float c = brunoHash12(cell + vec2(0.0, 1.0));
    float d = brunoHash12(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
  }

  float brunoPerlinNode(vec2 uv, float cellAmount, vec2 period) {
    uv *= cellAmount;
    vec2 cellsMinimum = floor(uv);
    vec2 cellsMaximum = ceil(uv);
    vec2 uvFract = fract(uv);
    cellsMinimum = brunoModulo(cellsMinimum, period);
    cellsMaximum = brunoModulo(cellsMaximum, period);
    vec2 blur = smoothstep(vec2(0.0), vec2(1.0), uvFract);
    vec2 lowerLeftDirection = brunoRandom(vec2(cellsMinimum.x, cellsMinimum.y));
    vec2 lowerRightDirection = brunoRandom(vec2(cellsMaximum.x, cellsMinimum.y));
    vec2 upperLeftDirection = brunoRandom(vec2(cellsMinimum.x, cellsMaximum.y));
    vec2 upperRightDirection = brunoRandom(vec2(cellsMaximum.x, cellsMaximum.y));
    vec2 fraction = fract(uv);

    return mix(
      mix(
        dot(lowerLeftDirection, fraction - vec2(0.0, 0.0)),
        dot(lowerRightDirection, fraction - vec2(1.0, 0.0)),
        blur.x
      ),
      mix(
        dot(upperLeftDirection, fraction - vec2(0.0, 1.0)),
        dot(upperRightDirection, fraction - vec2(1.0, 1.0)),
        blur.x
      ),
      blur.y
    ) * 0.8 + 0.5;
  }

  float brunoPerlinTexture(vec2 uv) {
    return brunoSaturate((brunoPerlinNode(uv, 6.0, vec2(6.0)) - 0.1) / 0.8);
  }

  vec4 brunoTerrainData(sampler2D terrainTexture, vec2 worldXZ, float terrainSize) {
    vec2 textureUv = clamp(worldXZ / terrainSize + 0.5, 0.0, 1.0);
    return texture2D(terrainTexture, textureUv);
  }

  vec3 brunoGradientColor(float t) {
    vec3 orange = vec3(1.0, 169.0 / 255.0, 78.0 / 255.0);
    vec3 teal = vec3(91.0 / 255.0, 194.0 / 255.0, 185.0 / 255.0);
    vec3 deepBlue = vec3(19.0 / 255.0, 55.0 / 255.0, 95.0 / 255.0);

    if (t <= 0.1) return orange;
    if (t <= 0.3) return mix(orange, teal, (t - 0.1) / 0.2);
    if (t <= 0.9) return mix(teal, deepBlue, (t - 0.3) / 0.6);
    return deepBlue;
  }

  vec3 brunoTerrainColor(vec4 terrainData) {
    vec3 grassColor = vec3(184.0 / 255.0, 182.0 / 255.0, 46.0 / 255.0);
    vec3 baseColor = brunoGradientColor(1.0 - terrainData.b);
    return mix(baseColor, grassColor, terrainData.g);
  }

  vec3 brunoLitColor(vec3 baseColor) {
    vec3 lightColor = vec3(1.0, 210.0 / 255.0, 194.0 / 255.0);
    return baseColor * lightColor * 1.2;
  }

  vec3 brunoShadowColor(vec3 baseColor) {
    return baseColor * vec3(109.0 / 255.0, 63.0 / 255.0, 1.0);
  }

  vec2 brunoWindOffset(vec2 worldXZ, float time, float strength) {
    vec2 direction = vec2(sin(BRUNO_PI * 0.6), cos(BRUNO_PI * 0.6));
    float localTime = time * 0.1 * strength;
    vec2 remappedPosition = worldXZ * 0.5;
    float noise1 = brunoPerlinTexture(remappedPosition * 0.2 + direction * localTime) - 0.5;
    float noise2 = brunoPerlinTexture(remappedPosition * 0.1 + direction * localTime * 0.2) - 0.5;
    return direction * (noise1 + noise2) * strength;
  }
`

const GRASS_VERTEX_SHADER = `
  attribute float aCorner;
  attribute float aHeightRandomness;

  uniform vec3 uCameraPosition;
  uniform sampler2D uTerrainData;
  uniform float uTerrainSize;
  uniform float uTime;
  uniform float uBladeWidth;
  uniform float uBladeHeight;
  uniform float uBladeHeightRandomness;
  uniform float uWindStrength;

  varying vec3 vColor;
  varying float vGrass;
  varying float vProgress;
  varying float vVisibility;

  ${BRUNO_TERRAIN_GLSL}

  void main() {
    vec3 center = position;
    vec2 bladePosition = center.xz;
    vec4 terrainData = brunoTerrainData(uTerrainData, bladePosition, uTerrainSize);
    float grass = terrainData.g;
    float hidden = step(grass - 0.4, 0.1);
    float visibility = 1.0 - hidden;
    float progress = aCorner < 0.5 ? 1.0 : 0.0;
    float side = aCorner < 0.5 ? 0.0 : (aCorner < 1.5 ? 1.0 : -1.0);
    float heightVariation = brunoPerlinTexture(bladePosition * 0.0321) + 0.5;
    float randomHeight = uBladeHeightRandomness * aHeightRandomness + (1.0 - uBladeHeightRandomness);
    float height = uBladeHeight * randomHeight * heightVariation * grass;

    vColor = brunoTerrainColor(terrainData);
    vGrass = grass;
    vProgress = progress;
    vVisibility = visibility;

    vec3 vertexPosition = center + vec3(side * uBladeWidth * grass, progress * height, 0.0);
    float angleToCamera = atan(center.z - uCameraPosition.z, center.x - uCameraPosition.x) - BRUNO_PI * 0.5;
    vertexPosition.xz = brunoRotateUv(vertexPosition.xz, angleToCamera, center.xz);
    vertexPosition.xz += brunoWindOffset(center.xz, uTime, uWindStrength) * progress * height * 2.0;
    vertexPosition.y += hidden * 100.0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(vertexPosition, 1.0);
  }
`

const GRASS_FRAGMENT_SHADER = `
  precision highp float;

  uniform float uBladeBrightness;
  uniform float uBladeOpacity;
  uniform float uRootShadow;
  varying vec3 vColor;
  varying float vGrass;
  varying float vProgress;
  varying float vVisibility;

  ${BRUNO_TERRAIN_GLSL}

  void main() {
    float rootShadow = (1.0 - vProgress) * vGrass * uRootShadow;
    vec3 color = mix(brunoLitColor(vColor), brunoShadowColor(vColor), clamp(rootShadow, 0.0, 1.0));
    color *= uBladeBrightness;
    float alpha = vVisibility * uBladeOpacity;
    if (alpha < 0.1) discard;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
  }
`

const ISLAND_GRASS_VERTEX_SHADER = `
  attribute float aCorner;
  attribute float aHeightRandomness;

  uniform vec3 uCameraPosition;
  uniform sampler2D uGrassField;
  uniform float uFieldSize;
  uniform float uTime;
  uniform float uBladeWidth;
  uniform float uBladeHeight;
  uniform float uBladeHeightRandomness;
  uniform float uWindStrength;

  varying vec3 vColor;
  varying float vGrass;
  varying float vProgress;
  varying float vVisibility;

  ${BRUNO_TERRAIN_GLSL}

  void main() {
    vec3 center = position;
    vec2 fieldUv = clamp(vec2(center.x / uFieldSize + 0.5, 0.5 - center.z / uFieldSize), 0.0, 1.0);
    vec4 field = texture2D(uGrassField, fieldUv);
    float grass = field.a;
    float visibility = smoothstep(0.08, 0.5, grass);
    float hidden = 1.0 - step(0.03, visibility);
    float progress = aCorner < 0.5 ? 1.0 : 0.0;
    float side = aCorner < 0.5 ? 0.0 : (aCorner < 1.5 ? 1.0 : -1.0);
    float heightVariation = brunoPerlinTexture(center.xz * 0.0321) + 0.5;
    float randomHeight = uBladeHeightRandomness * aHeightRandomness + (1.0 - uBladeHeightRandomness);
    float height = uBladeHeight * randomHeight * heightVariation * grass * visibility;

    vColor = field.rgb;
    vGrass = grass * visibility;
    vProgress = progress;
    vVisibility = visibility;

    vec3 vertexPosition = center + vec3(side * uBladeWidth * visibility, progress * height, 0.0);
    float angleToCamera = atan(center.z - uCameraPosition.z, center.x - uCameraPosition.x) - BRUNO_PI * 0.5;
    vertexPosition.xz = brunoRotateUv(vertexPosition.xz, angleToCamera, center.xz);
    vertexPosition.xz += brunoWindOffset(center.xz, uTime, uWindStrength) * progress * height * 2.0;
    vertexPosition.y += hidden * 100.0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(vertexPosition, 1.0);
  }
`

const ISLAND_GRASS_FRAGMENT_SHADER = `
  precision highp float;

  uniform float uBladeBrightness;
  uniform float uBladeOpacity;
  uniform float uRootShadow;
  varying vec3 vColor;
  varying float vGrass;
  varying float vProgress;
  varying float vVisibility;

  ${BRUNO_TERRAIN_GLSL}

  void main() {
    float rootShadow = (1.0 - vProgress) * vGrass * uRootShadow;
    vec3 color = mix(brunoLitColor(vColor), brunoShadowColor(vColor), clamp(rootShadow, 0.0, 1.0));
    color *= uBladeBrightness;
    float alpha = vVisibility * uBladeOpacity;
    if (alpha < 0.1) discard;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
  }
`

const FLOOR_VERTEX_SHADER = `
  uniform sampler2D uTerrainData;
  uniform float uTerrainSize;

  varying vec2 vWorldXZ;
  varying vec4 vTerrainData;

  ${BRUNO_TERRAIN_GLSL}

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec3 transformed = position;
    vWorldXZ = worldPosition.xz;
    vTerrainData = brunoTerrainData(uTerrainData, vWorldXZ, uTerrainSize);

    float uvDim = min(min(uv.x, uv.y) * 20.0, 1.0);
    transformed.z += vTerrainData.b * -1.5 * uvDim;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`

const FLOOR_FRAGMENT_SHADER = `
  precision highp float;

  uniform sampler2D uFloorSlabs;

  varying vec2 vWorldXZ;
  varying vec4 vTerrainData;

  ${BRUNO_TERRAIN_GLSL}

  void main() {
    vec3 baseColor = brunoTerrainColor(vTerrainData);
    vec3 slabHighColor = vec3(1.0, 207.0 / 255.0, 139.0 / 255.0);
    vec3 slabLowColor = vec3(168.0 / 255.0, 119.0 / 255.0, 98.0 / 255.0);
    float slabNoise = brunoPerlinTexture(vWorldXZ * 0.03);
    float slabsTexture = texture2D(uFloorSlabs, vWorldXZ * 0.175).r;
    vec3 slabColor = mix(slabLowColor, slabHighColor, slabsTexture);
    vec3 color = mix(baseColor, slabColor, vTerrainData.r * slabNoise);
    color = mix(brunoLitColor(color), brunoShadowColor(color), clamp(vTerrainData.g, 0.0, 1.0));

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`

export function applyGrassBladeTuning(material: ShaderMaterial, tuning: GrassBladeTuning) {
  setUniform(material, 'uBladeBrightness', tuning.brightness)
  setUniform(material, 'uBladeHeight', tuning.height)
  setUniform(material, 'uBladeOpacity', tuning.opacity)
  setUniform(material, 'uBladeWidth', tuning.width)
  setUniform(material, 'uRootShadow', tuning.rootShadow)
  setUniform(material, 'uWindStrength', tuning.wind)
}

export function createGrassBladeMaterial(
  terrainData: Texture,
  terrainSize: number,
  tuning = DEFAULT_GRASS_BLADE_TUNING,
) {
  return new ShaderMaterial({
    depthWrite: true,
    fragmentShader: GRASS_FRAGMENT_SHADER,
    side: DoubleSide,
    transparent: true,
    uniforms: {
      uBladeBrightness: { value: tuning.brightness },
      uBladeHeight: { value: tuning.height },
      uBladeHeightRandomness: { value: 0.6 },
      uBladeOpacity: { value: tuning.opacity },
      uBladeWidth: { value: tuning.width },
      uCameraPosition: { value: new Vector3() },
      uRootShadow: { value: tuning.rootShadow },
      uTerrainData: { value: terrainData },
      uTerrainSize: { value: terrainSize },
      uTime: { value: 0 },
      uWindStrength: { value: tuning.wind },
    },
    vertexShader: GRASS_VERTEX_SHADER,
  })
}

export function createIslandGrassBladeMaterial(
  grassField: Texture,
  fieldSize: number,
  tuning = DEFAULT_GRASS_BLADE_TUNING,
) {
  return new ShaderMaterial({
    depthWrite: true,
    fragmentShader: ISLAND_GRASS_FRAGMENT_SHADER,
    side: DoubleSide,
    transparent: true,
    uniforms: {
      uBladeBrightness: { value: tuning.brightness },
      uBladeHeight: { value: tuning.height },
      uBladeHeightRandomness: { value: 0.6 },
      uBladeOpacity: { value: tuning.opacity },
      uBladeWidth: { value: tuning.width },
      uCameraPosition: { value: new Vector3() },
      uFieldSize: { value: fieldSize },
      uGrassField: { value: grassField },
      uRootShadow: { value: tuning.rootShadow },
      uTime: { value: 0 },
      uWindStrength: { value: tuning.wind },
    },
    vertexShader: ISLAND_GRASS_VERTEX_SHADER,
  })
}

export function createBrunoTerrainFloorMaterial(
  terrainData: Texture,
  floorSlabs: Texture,
  terrainSize: number,
) {
  return new ShaderMaterial({
    depthWrite: true,
    fragmentShader: FLOOR_FRAGMENT_SHADER,
    uniforms: {
      uFloorSlabs: { value: floorSlabs },
      uTerrainData: { value: terrainData },
      uTerrainSize: { value: terrainSize },
    },
    vertexShader: FLOOR_VERTEX_SHADER,
  })
}

function setUniform(material: ShaderMaterial, key: string, value: number) {
  const uniform = material.uniforms[key]
  if (uniform) uniform.value = value
}

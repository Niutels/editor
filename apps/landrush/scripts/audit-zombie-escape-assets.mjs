import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectGlb } from './landrush-glb-audit.mjs'
import { loadTypescriptModuleGraph } from './load-typescript-module-graph.mjs'
import {
  ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER,
  inspectZombieEscapeWeaponSemanticContract,
  zombieEscapeWeaponOptimizerFingerprint,
  zombieEscapeWeaponSourcePath,
  zombieEscapeWeaponSourceReference,
} from './zombie-escape-weapon-glb-optimizer.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const TARGET_TRIANGLES = 3_000
const MINIMUM_TRIANGLES = 2_400
const MAXIMUM_TRIANGLES = 3_600
const SOURCE_TEXTURE_SIZE = 2_048
const WEAPON_RUNTIME_TEXTURE_SIZE = ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.resolution
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const PUBLIC_ASSET_PREFIX = '/landrush-lab/zombie-escape/assets/'
const DEFAULT_ASSET_ROOT = resolve(
  scriptDirectory,
  '../public/landrush-lab/zombie-escape/assets',
)
const DEFAULT_AUDIT_PATH = resolve(DEFAULT_ASSET_ROOT, 'asset-audit.json')
const CATALOG_SOURCE_ROOT = resolve(scriptDirectory, '../components/landrush-lab')
const WEAPON_IDS = [
  'sunflare-pistol',
  'reef-carbine',
  'driftwood-scattergun',
  'storm-coil-repeater',
  'tidebreak-launcher',
]
const ZOMBIE_IDS = [
  'dockworker',
  'lifeguard',
  'island-gardener',
  'tourist',
  'marina-mechanic',
  'beach-courier',
  'boardwalk-chef',
  'island-ranger',
  'resort-clerk',
  'old-sailor',
]
const ZOMBIE_CLIPS = {
  rigged: 'Armature|clip0|baselayer',
  run: 'Armature|running|baselayer',
  walk: 'Armature|walking_man|baselayer',
}
const EXPECTED_ASSETS = [
  ...WEAPON_IDS.map((id) => ({
    canonicalOutputs: {
      model: `${PUBLIC_ASSET_PREFIX}weapons/${id}.glb`,
      preview: `${PUBLIC_ASSET_PREFIX}weapons/previews/${id}.png`,
    },
    glbOutputs: ['model'],
    id,
    kind: 'weapon',
  })),
  ...ZOMBIE_IDS.map((id) => ({
    canonicalOutputs: {
      ...Object.fromEntries(
        Object.keys(ZOMBIE_CLIPS).map((output) => [
          output,
          `${PUBLIC_ASSET_PREFIX}zombies/${id}/${output}.glb`,
        ]),
      ),
      preview: `${PUBLIC_ASSET_PREFIX}zombies/${id}/preview.png`,
    },
    glbOutputs: Object.keys(ZOMBIE_CLIPS),
    id,
    kind: 'zombie',
  })),
]

export async function auditZombieEscapeAssets({
  assetRoot = DEFAULT_ASSET_ROOT,
  generation: generationOverride,
  generationPath = resolve(assetRoot, 'meshy-generation.json'),
  weaponRuntimeBudgetBytes = ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.maxRuntimeBytes,
} = {}) {
  const generation =
    generationOverride ?? JSON.parse(await readFile(generationPath, 'utf8'))
  const failures = []
  const provenanceDifferences = []
  const auditedAssets = {}
  const fingerprints = new Map()
  const taskIds = new Map()
  const zombieOutputHashes = new Map()
  let weaponRuntimeBytes = 0
  const catalogs = await loadCatalogs(failures)

  expectEqual(failures, 'generation.schemaVersion', generation.schemaVersion, 2)
  expectEqual(
    failures,
    'generation.targetFaceCount',
    generation.targetFaceCount,
    TARGET_TRIANGLES,
  )
  expectEqual(failures, 'generation.textureResolution', generation.textureResolution, '2k')

  const expectedIds = EXPECTED_ASSETS.map(({ id }) => id)
  const stateIds = Object.keys(generation.assets ?? {})
  validateExactIds(failures, 'generation assets', stateIds, expectedIds)
  const runtimeCatalogChecks = validateCatalogs(failures, catalogs)

  for (const contract of EXPECTED_ASSETS) {
    const { id, kind } = contract
    const record = generation.assets?.[id]
    const catalog = catalogs[kind]?.get(id)
    if (!record) continue

    expectEqual(failures, `${id}: state id`, record.id, id)
    expectEqual(failures, `${id}: state kind`, record.kind, kind)
    expectEqual(
      failures,
      `${id}: state targetFaceCount`,
      record.targetFaceCount,
      TARGET_TRIANGLES,
    )
    if (typeof record.prompt !== 'string' || record.prompt.length === 0) {
      failures.push(`${id}: state prompt is missing`)
    }
    if (typeof record.texturePrompt !== 'string' || record.texturePrompt.length === 0) {
      failures.push(`${id}: state texture prompt is missing`)
    }
    validateTask(record, id, 'previewTaskId', taskIds, failures)
    validateTask(record, id, 'refineTaskId', taskIds, failures)
    if (kind === 'zombie') validateTask(record, id, 'rigTaskId', taskIds, failures)
    validateFingerprint(record, id, 'assetFingerprint', undefined, fingerprints, failures)

    if (catalog) {
      const differences = []
      if (record.prompt !== catalog.meshy.prompt) {
        differences.push('prompt')
        expectEqual(failures, `${id}: state/catalog prompt`, record.prompt, catalog.meshy.prompt)
      }
      if (record.texturePrompt !== catalog.meshy.texturePrompt) {
        differences.push('texturePrompt')
        expectEqual(
          failures,
          `${id}: state/catalog texturePrompt`,
          record.texturePrompt,
          catalog.meshy.texturePrompt,
        )
      }
      if (differences.length > 0) provenanceDifferences.push({ fields: differences, id })
      validateTaskFingerprints({
        catalog,
        failures,
        fingerprints,
        id,
        kind,
        record,
      })
    }

    validateExactIds(
      failures,
      `${id}: state output keys`,
      Object.keys(record.outputs ?? {}),
      Object.keys(contract.canonicalOutputs),
    )
    validateExactIds(
      failures,
      `${id}: state validation keys`,
      Object.keys(record.validation ?? {}),
      contract.glbOutputs,
    )
    validateRequiredAllowedIds(
      failures,
      `${id}: state artifact keys`,
      Object.keys(record.artifacts ?? {}),
      contract.glbOutputs,
      [...contract.glbOutputs, 'preview'],
    )
    for (const [output, canonicalPublicPath] of Object.entries(contract.canonicalOutputs)) {
      expectEqual(
        failures,
        `${id}/${output}: canonical state path`,
        record.outputs?.[output],
        canonicalPublicPath,
      )
    }

    const outputAudit = {}
    for (const output of contract.glbOutputs) {
      const canonicalPublicPath = contract.canonicalOutputs[output]
      if (catalog && kind === 'weapon') {
        expectEqual(
          failures,
          `${id}/${output}: canonical catalog path`,
          catalog.assetPath,
          canonicalPublicPath,
        )
      }

      let sourceInspection = null
      let sourceArtifactContract = null
      let sourceSemantic = null
      let sourceReference = null
      if (kind === 'weapon') {
        const sourcePath = zombieEscapeWeaponSourcePath(id)
        sourceReference = zombieEscapeWeaponSourceReference(sourcePath)
        try {
          sourceInspection = await inspectGlb(sourcePath)
          sourceSemantic = await inspectZombieEscapeWeaponSemanticContract(sourcePath)
          validateWeaponSourceInspection(failures, id, sourceInspection)
          compareStoredValidation(
            failures,
            id,
            output,
            record.validation?.[output],
            sourceInspection,
          )
          sourceArtifactContract = validateArtifactRecord({
            expectedPath: sourceReference,
            failures,
            id,
            inspection: sourceInspection,
            output,
            record,
            taskId: record.refineTaskId,
          })
        } catch (error) {
          failures.push(
            `${id}/${output}: pristine source: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      let inspection
      try {
        inspection = await inspectGlb(localPathFor(assetRoot, canonicalPublicPath))
      } catch (error) {
        failures.push(
          `${id}/${output}: ${error instanceof Error ? error.message : String(error)}`,
        )
        outputAudit[output] = {
          canonicalPath: canonicalPublicPath,
          error: error instanceof Error ? error.message : String(error),
        }
        continue
      }

      const textureContract = validateInspection({
        failures,
        id,
        inspection,
        kind,
        output,
        sourceInspection,
      })
      let runtimeSemantic = null
      if (kind === 'weapon') {
        weaponRuntimeBytes += inspection.byteLength
        try {
          runtimeSemantic = await inspectZombieEscapeWeaponSemanticContract(
            localPathFor(assetRoot, canonicalPublicPath),
          )
          expectEqual(
            failures,
            `${id}/${output}: source/runtime semantic contract`,
            runtimeSemantic.semanticHash,
            sourceSemantic?.semanticHash,
          )
        } catch (error) {
          failures.push(
            `${id}/${output}: runtime semantic contract: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
      if (kind === 'zombie') {
        validateZombieOutputHash(
          failures,
          zombieOutputHashes,
          id,
          output,
          inspection.contentHash,
        )
      }
      if (kind === 'zombie') {
        compareStoredValidation(
          failures,
          id,
          output,
          record.validation?.[output],
          inspection,
        )
      }
      const artifactContract =
        kind === 'weapon'
          ? combineWeaponArtifactContracts(
              sourceArtifactContract,
              validateWeaponRuntimeArtifact({
                canonicalPublicPath,
                failures,
                id,
                inspection,
                record,
                runtimeSemantic,
                sourceInspection,
                sourceReference,
              }),
            )
          : validateArtifactRecord({
              expectedPath: canonicalPublicPath,
              failures,
              id,
              inspection,
              output,
              record,
              taskId: record.rigTaskId,
            })
      outputAudit[output] = {
        artifactContract,
        canonicalPath: canonicalPublicPath,
        semanticContract:
          kind === 'weapon'
            ? {
                preserved:
                  runtimeSemantic?.semanticHash === sourceSemantic?.semanticHash,
                runtimeHash: runtimeSemantic?.semanticHash ?? null,
                sourceHash: sourceSemantic?.semanticHash ?? null,
              }
            : null,
        ...inspection,
        textureContract,
      }
    }

    const compatibility =
      kind === 'zombie'
        ? validateZombieCompatibility(failures, id, outputAudit)
        : null
    auditedAssets[id] = {
      canonicalOutputs: contract.canonicalOutputs,
      compatibility,
      kind,
      outputs: outputAudit,
      taskIds: {
        preview: record.previewTaskId,
        refine: record.refineTaskId,
        rig: record.rigTaskId ?? null,
      },
    }
  }

  if (weaponRuntimeBytes > weaponRuntimeBudgetBytes) {
    failures.push(
      `weapon runtime payload: ${weaponRuntimeBytes} bytes exceeds ${weaponRuntimeBudgetBytes} byte budget`,
    )
  }

  return {
    assets: auditedAssets,
    catalogChecks: {
      weapons: catalogs.weapon?.size ?? 0,
      zombies: catalogs.zombie?.size ?? 0,
    },
    contract: {
      rootMotion: {
        reason:
          'Clip identity and skeleton compatibility are audited; locomotion displacement semantics are not inferred from clip names or loop endpoints.',
        status: 'not-audited',
      },
      textures: {
        weapon: {
          maximumRuntimeBytes: weaponRuntimeBudgetBytes,
          profile: 'full-pbr-512-jpeg',
          requiredImageDimensions: [WEAPON_RUNTIME_TEXTURE_SIZE, WEAPON_RUNTIME_TEXTURE_SIZE],
          requiredMaterialTextureSlots: [
            'baseColor',
            'emissive',
            'metallicRoughness',
            'normal',
          ],
          sourceProfile: 'full-pbr-2048',
        },
        zombie: {
          profile: 'base-color-2048',
          requiredImageDimensions: [SOURCE_TEXTURE_SIZE, SOURCE_TEXTURE_SIZE],
          requiredMaterialTextureSlots: ['baseColor'],
        },
      },
      triangles: {
        maximum: MAXIMUM_TRIANGLES,
        minimum: MINIMUM_TRIANGLES,
        target: TARGET_TRIANGLES,
      },
    },
    expectedCounts: { weapons: WEAPON_IDS.length, zombies: ZOMBIE_IDS.length },
    failures,
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    provenance: {
      stateCatalogDifferences: provenanceDifferences,
    },
    runtimeCatalogChecks,
    targetFaceCount: generation.targetFaceCount,
    textureResolution: generation.textureResolution,
    weaponRuntimeBytes,
  }
}

function validateZombieOutputHash(failures, outputHashes, id, output, contentHash) {
  const previous = outputHashes.get(contentHash)
  if (previous) {
    failures.push(`${id}/${output}: duplicates zombie GLB bytes from ${previous}`)
    return
  }
  outputHashes.set(contentHash, `${id}/${output}`)
}

function validateTaskFingerprints({ catalog, failures, fingerprints, id, kind, record }) {
  const previewPayload = {
    ai_model: 'meshy-t2',
    alpha_thumbnail: true,
    mode: 'preview',
    model_type: 'smart-topology',
    pose_mode: kind === 'zombie' ? 'a-pose' : '',
    prompt: record.prompt,
    target_formats: ['glb'],
    target_polycount: TARGET_TRIANGLES,
    topology: 'triangle',
  }
  validateFingerprint(
    record,
    id,
    'previewTaskIdFingerprint',
    fingerprint({ endpoint: '/v2/text-to-3d', payload: previewPayload }),
    fingerprints,
    failures,
  )
  const refinePayload = {
    enable_pbr: true,
    mode: 'refine',
    preview_task_id: record.previewTaskId,
    target_formats: ['glb'],
    texture_prompt: record.texturePrompt,
    texture_resolution: '2k',
  }
  validateFingerprint(
    record,
    id,
    'refineTaskIdFingerprint',
    fingerprint({ endpoint: '/v2/text-to-3d', payload: refinePayload }),
    fingerprints,
    failures,
  )
  if (kind === 'zombie') {
    validateFingerprint(
      record,
      id,
      'rigTaskIdFingerprint',
      fingerprint({
        endpoint: '/v1/rigging',
        payload: {
          height_meters: catalog.characterHeightMeters,
          input_task_id: record.refineTaskId,
        },
      }),
      fingerprints,
      failures,
    )
  }
}

function validateFingerprint(record, id, key, expected, fingerprints, failures) {
  const value = record[key]
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    failures.push(`${id}: ${key} is not a lowercase SHA-256 digest`)
    return
  }
  if (fingerprints.has(value)) {
    failures.push(`${id}: ${key} duplicates ${fingerprints.get(value)}`)
  } else {
    fingerprints.set(value, `${id}.${key}`)
  }
  if (expected !== undefined) expectEqual(failures, `${id}: ${key}`, value, expected)
}

function validateArtifactRecord({
  expectedPath,
  failures,
  id,
  inspection,
  output,
  record,
  taskId,
}) {
  const artifact = record.artifacts?.[output]
  const label = `${id}/${output}: state artifact`
  if (!artifact) {
    failures.push(`${label} is missing`)
    return { accepted: false }
  }
  expectEqual(failures, `${label} path`, artifact.path, expectedPath)
  const sourcePathAccepted = expectedPath.startsWith('/') || artifact.sourcePath === expectedPath
  if (!expectedPath.startsWith('/')) {
    expectEqual(failures, `${label} sourcePath`, artifact.sourcePath, expectedPath)
  }
  expectEqual(failures, `${label} taskId`, artifact.taskId, taskId)
  expectEqual(failures, `${label} byteLength`, artifact.byteLength, inspection.byteLength)
  expectEqual(failures, `${label} sha256`, artifact.sha256, inspection.contentHash)
  if (typeof artifact.sha256 !== 'string' || !SHA256_PATTERN.test(artifact.sha256)) {
    failures.push(`${label} sha256 is not a lowercase SHA-256 digest`)
  }
  return {
    accepted:
      artifact.path === expectedPath &&
      artifact.taskId === taskId &&
      artifact.byteLength === inspection.byteLength &&
      artifact.sha256 === inspection.contentHash &&
      sourcePathAccepted &&
      SHA256_PATTERN.test(artifact.sha256 ?? ''),
    recordedByteLength: artifact.byteLength,
    recordedSha256: artifact.sha256,
  }
}

function validateWeaponRuntimeArtifact({
  canonicalPublicPath,
  failures,
  id,
  inspection,
  record,
  runtimeSemantic,
  sourceInspection,
  sourceReference,
}) {
  const artifact = record.runtimeArtifacts?.model
  const label = `${id}/model: runtime artifact`
  if (!artifact) {
    failures.push(`${label} is missing`)
    return { accepted: false }
  }
  const expected = {
    chromaSubsampling: ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.chromaSubsampling,
    format: ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.format,
    optimizerFingerprint: zombieEscapeWeaponOptimizerFingerprint(),
    path: canonicalPublicPath,
    quality: ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.quality,
    resolution: WEAPON_RUNTIME_TEXTURE_SIZE,
    runtimeByteLength: inspection.byteLength,
    runtimeSha256: inspection.contentHash,
    semanticHash: runtimeSemantic?.semanticHash,
    sourceByteLength: sourceInspection?.byteLength,
    sourcePath: sourceReference,
    sourceSha256: sourceInspection?.contentHash,
    taskId: record.refineTaskId,
    textureCount: inspection.imageCount,
  }
  for (const [field, value] of Object.entries(expected)) {
    expectEqual(failures, `${label} ${field}`, artifact[field], value)
  }
  if (typeof artifact.runtimeSha256 !== 'string' || !SHA256_PATTERN.test(artifact.runtimeSha256)) {
    failures.push(`${label} runtimeSha256 is not a lowercase SHA-256 digest`)
  }
  if (typeof artifact.semanticHash !== 'string' || !SHA256_PATTERN.test(artifact.semanticHash)) {
    failures.push(`${label} semanticHash is not a lowercase SHA-256 digest`)
  }
  return {
    accepted:
      Object.entries(expected).every(([field, value]) => artifact[field] === value) &&
      SHA256_PATTERN.test(artifact.runtimeSha256 ?? '') &&
      SHA256_PATTERN.test(artifact.semanticHash ?? ''),
    recordedByteLength: artifact.runtimeByteLength,
    recordedSha256: artifact.runtimeSha256,
  }
}

function combineWeaponArtifactContracts(source, runtime) {
  return {
    accepted: source?.accepted === true && runtime?.accepted === true,
    runtime,
    source,
  }
}

function validateInspection({ failures, id, inspection, kind, output, sourceInspection }) {
  const label = `${id}/${output}`
  if (
    kind === 'zombie' &&
    (inspection.triangleCount < MINIMUM_TRIANGLES ||
      inspection.triangleCount > MAXIMUM_TRIANGLES)
  ) {
    failures.push(
      `${label}: ${inspection.triangleCount} triangles is outside ${TARGET_TRIANGLES} ±20%`,
    )
  }
  if (kind === 'weapon') {
    expectEqual(
      failures,
      `${label}: runtime triangle count preserves source`,
      inspection.triangleCount,
      sourceInspection?.triangleCount,
    )
  }
  expectEqual(failures, `${label}: mesh count`, inspection.meshCount, 1)
  expectEqual(failures, `${label}: primitive count`, inspection.primitiveCount, 1)
  expectEqual(
    failures,
    `${label}: triangle primitive count`,
    inspection.trianglePrimitiveCount,
    1,
  )
  expectEqual(
    failures,
    `${label}: non-triangle primitive count`,
    inspection.nonTrianglePrimitiveCount,
    0,
  )
  expectEqual(
    failures,
    `${label}: primitive without material count`,
    inspection.primitiveWithoutMaterialCount,
    0,
  )
  expectEqual(failures, `${label}: material count`, inspection.materialCount, 1)

  const expectedSlots =
    kind === 'weapon'
      ? ['baseColor', 'emissive', 'metallicRoughness', 'normal']
      : ['baseColor']
  const expectedTextureSize =
    kind === 'weapon' ? WEAPON_RUNTIME_TEXTURE_SIZE : SOURCE_TEXTURE_SIZE
  const allImagesAtRequiredSize =
    inspection.images.length > 0 &&
    inspection.images.every(
      ({ embedded, height, mimeType, width }) =>
        embedded &&
        height === expectedTextureSize &&
        width === expectedTextureSize &&
        (kind !== 'weapon' || mimeType === 'image/jpeg'),
    )
  if (!allImagesAtRequiredSize) {
    failures.push(
      `${label}: every embedded texture image must be ${expectedTextureSize}x${expectedTextureSize}${kind === 'weapon' ? ' JPEG' : ''}`,
    )
  }

  const allMaterialsSatisfyRequiredSlots =
    inspection.materials.length > 0 &&
    inspection.materials.every(({ textureSlots }) =>
      expectedSlots.every((slot) => {
        const texture = textureSlots[slot]
        return (
          texture?.height === expectedTextureSize &&
          texture?.width === expectedTextureSize &&
          (kind !== 'weapon' || texture.mimeType === 'image/jpeg')
        )
      }),
    )
  if (!allMaterialsSatisfyRequiredSlots) {
    failures.push(
      `${label}: required material texture slots are missing or not ${expectedTextureSize}x${expectedTextureSize}`,
    )
  }

  const fullPbrSlotsPresent =
    inspection.materials.length > 0 &&
    inspection.materials.every(({ textureSlots }) =>
      ['baseColor', 'metallicRoughness', 'normal'].every((slot) => textureSlots[slot]),
    )
  let distinctRequiredImageSources = true
  if (kind === 'weapon') {
    distinctRequiredImageSources = inspection.materials.every(({ textureSlots }) => {
      const sources = expectedSlots.map((slot) => textureSlots[slot]?.imageIndex)
      return sources.every(Number.isInteger) && new Set(sources).size === sources.length
    })
    if (!distinctRequiredImageSources) {
      failures.push(`${label}: full PBR slots must reference distinct texture images`)
    }
  }

  if (kind === 'weapon') {
    expectEqual(failures, `${label}: skin count`, inspection.skinCount, 0)
    expectEqual(
      failures,
      `${label}: skinned mesh node count`,
      inspection.skinnedMeshNodeCount,
      0,
    )
    expectEqual(failures, `${label}: animation count`, inspection.animationCount, 0)
  } else {
    expectEqual(failures, `${label}: skin count`, inspection.skinCount, 1)
    expectEqual(
      failures,
      `${label}: skinned mesh node count`,
      inspection.skinnedMeshNodeCount,
      1,
    )
    expectEqual(
      failures,
      `${label}: skinned primitive count`,
      inspection.skinnedPrimitiveCount,
      1,
    )
    expectEqual(failures, `${label}: animation count`, inspection.animationCount, 1)
    expectEqual(
      failures,
      `${label}: animation names`,
      inspection.animationNames,
      [ZOMBIE_CLIPS[output]],
    )
    if (inspection.animations[0]?.channelCount < 1 || inspection.animations[0]?.samplerCount < 1) {
      failures.push(`${label}: animation clip has no channels or samplers`)
    }
    if (inspection.animations[0]?.jointChannelCount < 1) {
      failures.push(`${label}: animation clip does not animate any skin joint`)
    }
  }

  return {
    accepted:
      allImagesAtRequiredSize &&
      allMaterialsSatisfyRequiredSlots &&
      distinctRequiredImageSources,
    allImagesAtRequiredSize,
    allMaterialsSatisfyRequiredSlots,
    distinctRequiredImageSources,
    fullPbrSlotsPresent,
    profile: kind === 'weapon' ? 'full-pbr-512-jpeg' : 'base-color-2048',
    requiredMaterialTextureSlots: expectedSlots,
  }
}

function validateWeaponSourceInspection(failures, id, inspection) {
  const label = `${id}/model: pristine source`
  if (
    inspection.triangleCount < MINIMUM_TRIANGLES ||
    inspection.triangleCount > MAXIMUM_TRIANGLES
  ) {
    failures.push(
      `${label}: ${inspection.triangleCount} triangles is outside ${TARGET_TRIANGLES} ±20%`,
    )
  }
  expectEqual(failures, `${label}: mesh count`, inspection.meshCount, 1)
  expectEqual(failures, `${label}: primitive count`, inspection.primitiveCount, 1)
  expectEqual(failures, `${label}: material count`, inspection.materialCount, 1)
  expectEqual(failures, `${label}: skin count`, inspection.skinCount, 0)
  expectEqual(failures, `${label}: animation count`, inspection.animationCount, 0)
  const validImages =
    inspection.images.length === 4 &&
    inspection.images.every(
      ({ embedded, height, mimeType, width }) =>
        embedded &&
        height === SOURCE_TEXTURE_SIZE &&
        width === SOURCE_TEXTURE_SIZE &&
        mimeType === 'image/jpeg',
    )
  if (!validImages) failures.push(`${label}: expected four embedded 2048x2048 JPEG textures`)
  const validSlots = inspection.materials.every(({ textureSlots }) =>
    ['baseColor', 'emissive', 'metallicRoughness', 'normal'].every((slot) => {
      const texture = textureSlots[slot]
      return texture?.height === SOURCE_TEXTURE_SIZE && texture?.width === SOURCE_TEXTURE_SIZE
    }),
  )
  if (!validSlots) failures.push(`${label}: expected all four authored PBR texture slots`)
}

function validateZombieCompatibility(failures, id, outputs) {
  const inspections = Object.values(outputs).filter(({ contentHash }) => contentHash)
  if (inspections.length !== Object.keys(ZOMBIE_CLIPS).length) {
    return {
      byteDistinct: false,
      sameTriangleCount: false,
      skinTopologyCompatible: false,
    }
  }
  const byteDistinct =
    new Set(inspections.map(({ contentHash }) => contentHash)).size === inspections.length
  const skinTopologyCompatible =
    inspections.every(({ skinCompatibilityHash }) => skinCompatibilityHash) &&
    new Set(inspections.map(({ skinCompatibilityHash }) => skinCompatibilityHash)).size === 1
  const sameTriangleCount =
    new Set(inspections.map(({ triangleCount }) => triangleCount)).size === 1
  if (!byteDistinct) failures.push(`${id}: rigged, walk, and run GLBs must be byte-distinct`)
  if (!skinTopologyCompatible) {
    failures.push(`${id}: rigged, walk, and run GLBs do not have compatible skin topology`)
  }
  if (!sameTriangleCount) {
    failures.push(`${id}: rigged, walk, and run GLBs do not share the same mesh triangle count`)
  }
  return { byteDistinct, sameTriangleCount, skinTopologyCompatible }
}

function compareStoredValidation(failures, id, output, stored, inspection) {
  if (!stored) {
    failures.push(`${id}/${output}: state validation record is missing`)
    return
  }
  for (const field of [
    'animationCount',
    'byteLength',
    'imageCount',
    'materialCount',
    'meshCount',
    'primitiveCount',
    'skinCount',
    'textureCount',
    'triangleCount',
  ]) {
    if (stored[field] !== undefined) {
      expectEqual(failures, `${id}/${output}: stored ${field}`, stored[field], inspection[field])
    }
  }
  if (stored.animationNames !== undefined) {
    expectEqual(
      failures,
      `${id}/${output}: stored animationNames`,
      stored.animationNames,
      inspection.animationNames,
    )
  }
}

function validateTask(record, id, taskKey, taskIds, failures) {
  const taskId = record[taskKey]
  if (typeof taskId !== 'string' || taskId.length === 0) {
    failures.push(`${id}: ${taskKey} is missing`)
  } else if (taskIds.has(taskId)) {
    failures.push(`${id}: ${taskKey} duplicates ${taskIds.get(taskId)}`)
  } else {
    taskIds.set(taskId, `${id}.${taskKey}`)
  }
  expectEqual(failures, `${id}: ${taskKey} status`, record[`${taskKey}Status`], 'SUCCEEDED')
}

function validateCatalogs(failures, catalogs) {
  validateExactIds(
    failures,
    'weapon catalog',
    [...(catalogs.weapon?.keys() ?? [])],
    WEAPON_IDS,
  )
  validateExactIds(
    failures,
    'zombie catalog',
    [...(catalogs.zombie?.keys() ?? [])],
    ZOMBIE_IDS,
  )

  for (const id of WEAPON_IDS) {
    const entry = catalogs.weapon?.get(id)
    if (!entry) continue
    expectEqual(failures, `${id}: catalog modelType`, entry.meshy.modelType, 'smart-topology')
    expectEqual(failures, `${id}: catalog aiModel`, entry.meshy.aiModel, 'meshy-t2')
    expectEqual(failures, `${id}: catalog topology`, entry.meshy.topology, 'triangle')
    expectEqual(
      failures,
      `${id}: catalog targetPolycount`,
      entry.meshy.targetPolycount,
      TARGET_TRIANGLES,
    )
    expectEqual(failures, `${id}: catalog textureResolution`, entry.meshy.textureResolution, '2k')
    expectEqual(
      failures,
      `${id}: catalog triangle budget`,
      entry.triangleBudget,
      {
        maximumTriangles: MAXIMUM_TRIANGLES,
        minimumTriangles: MINIMUM_TRIANGLES,
        targetTriangles: TARGET_TRIANGLES,
      },
    )
  }

  for (const id of ZOMBIE_IDS) {
    const entry = catalogs.zombie?.get(id)
    if (!entry) continue
    expectEqual(failures, `${id}: catalog modelType`, entry.meshy.modelType, 'smart-topology')
    expectEqual(failures, `${id}: catalog aiModel`, entry.meshy.aiModel, 'meshy-t2')
    expectEqual(failures, `${id}: catalog topology`, entry.meshy.topology, 'triangle')
    expectEqual(
      failures,
      `${id}: catalog targetPolycount`,
      entry.meshy.targetPolycount,
      TARGET_TRIANGLES,
    )
    expectEqual(failures, `${id}: catalog textureResolution`, entry.meshy.textureResolution, '2k')
    expectEqual(failures, `${id}: catalog textured`, entry.meshy.textured, true)
    expectEqual(failures, `${id}: catalog outputFormat`, entry.meshy.outputFormat, 'glb')
    expectEqual(failures, `${id}: catalog poseMode`, entry.meshy.poseMode, 'a-pose')
    expectEqual(
      failures,
      `${id}: catalog triangle budget`,
      entry.triangleBudget,
      {
        maximum: MAXIMUM_TRIANGLES,
        minimum: MINIMUM_TRIANGLES,
        target: TARGET_TRIANGLES,
      },
    )
    for (const [output, expectedClipName] of Object.entries(ZOMBIE_CLIPS)) {
      const glb = entry.glb[output === 'rigged' ? 'riggedBase' : output]
      expectEqual(failures, `${id}/${output}: catalog clip count`, glb.expectedClipCount, 1)
      expectEqual(
        failures,
        `${id}/${output}: catalog clip name`,
        glb.expectedClipName,
        expectedClipName,
      )
    }
  }

  return validateZombieRuntimeCatalog(failures, catalogs)
}

async function loadCatalogs(failures) {
  const [weapon, zombie, ambientNpc] = await Promise.all([
    loadCatalog({
      exportName: 'ZOMBIE_ESCAPE_WEAPON_CATALOG',
      failures,
      label: 'weapon',
      path: resolve(CATALOG_SOURCE_ROOT, 'zombie-escape-weapon-catalog.ts'),
    }),
    loadCatalog({
      exportName: 'ZOMBIE_ESCAPE_ZOMBIE_CATALOG',
      failures,
      label: 'zombie',
      path: resolve(CATALOG_SOURCE_ROOT, 'zombie-escape-zombie-catalog.ts'),
    }),
    loadCatalog({
      exportName: 'LANDRUSH_ISLAND_AMBIENT_NPCS',
      failures,
      label: 'ambient NPC',
      path: resolve(CATALOG_SOURCE_ROOT, 'landrush-island-ambient-catalog.ts'),
    }),
  ])
  return { ambientNpc, weapon, zombie }
}

async function loadCatalog({ exportName, failures, label, path }) {
  try {
    const module = await loadTypescriptModuleGraph(path, {
      sourceRoot: CATALOG_SOURCE_ROOT,
    })
    const entries = module[exportName]
    if (!Array.isArray(entries)) throw new Error(`missing array export ${exportName}`)
    return indexCatalog(entries, label)
  } catch (error) {
    failures.push(`${label} catalog: ${error instanceof Error ? error.message : String(error)}`)
    return new Map()
  }
}

function validateZombieRuntimeCatalog(failures, catalogs) {
  const sourceNpcIds = []
  let mappedZombies = 0

  for (const zombie of catalogs.zombie.values()) {
    const sourceNpcId = zombie.sourceNpcId
    if (typeof sourceNpcId !== 'string' || sourceNpcId.length === 0) {
      failures.push(`${zombie.id}: runtime sourceNpcId is missing`)
      continue
    }
    sourceNpcIds.push(sourceNpcId)

    const sourceNpc = catalogs.ambientNpc.get(sourceNpcId)
    if (!sourceNpc) {
      failures.push(`${zombie.id}: runtime ambient NPC source ${sourceNpcId} is missing`)
      continue
    }
    mappedZombies += 1

    const riggedPath = sourceNpc.glb?.rigged
    if (typeof riggedPath !== 'string' || !riggedPath.endsWith('/rigged.glb')) {
      failures.push(`${zombie.id}: runtime ambient NPC rigged path is invalid`)
      continue
    }
    expectEqual(
      failures,
      `${zombie.id}: runtime rigged path`,
      zombie.glb?.riggedBase?.path,
      riggedPath,
    )
    expectEqual(
      failures,
      `${zombie.id}: runtime run animation path`,
      zombie.glb?.run?.path,
      sourceNpc.glb.run,
    )
    expectEqual(
      failures,
      `${zombie.id}: runtime walk animation path`,
      zombie.glb?.walk?.path,
      sourceNpc.glb.walk,
    )
  }

  const ambientNpcIds = [...catalogs.ambientNpc.keys()]
  if (catalogs.zombie.size > 0 && catalogs.ambientNpc.size > 0) {
    validateExactIds(failures, 'zombie runtime ambient NPC sources', sourceNpcIds, ambientNpcIds)
  }
  const uniqueSourceNpcIds = new Set(sourceNpcIds)
  const sourceNpcBijection =
    catalogs.zombie.size > 0 &&
    catalogs.ambientNpc.size > 0 &&
    sourceNpcIds.length === catalogs.zombie.size &&
    uniqueSourceNpcIds.size === sourceNpcIds.length &&
    uniqueSourceNpcIds.size === catalogs.ambientNpc.size &&
    ambientNpcIds.every((id) => uniqueSourceNpcIds.has(id))

  return {
    ambientNpcSources: catalogs.ambientNpc.size,
    mappedZombies,
    sourceNpcBijection,
    zombieEntries: catalogs.zombie.size,
  }
}

function indexCatalog(entries, label) {
  const map = new Map()
  for (const entry of entries ?? []) {
    if (map.has(entry.id)) throw new Error(`${label} catalog contains duplicate id ${entry.id}`)
    map.set(entry.id, entry)
  }
  return map
}

function validateExactIds(failures, label, actual, expected) {
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)
  for (const id of expectedSet) {
    if (!actualSet.has(id)) failures.push(`${label}: missing ${id}`)
  }
  for (const id of actualSet) {
    if (!expectedSet.has(id)) failures.push(`${label}: unexpected ${id}`)
  }
  if (actual.length !== actualSet.size) failures.push(`${label}: duplicate ids are present`)
}

function validateRequiredAllowedIds(failures, label, actual, required, allowed) {
  const actualSet = new Set(actual)
  const allowedSet = new Set(allowed)
  for (const id of required) {
    if (!actualSet.has(id)) failures.push(`${label}: missing ${id}`)
  }
  for (const id of actualSet) {
    if (!allowedSet.has(id)) failures.push(`${label}: unexpected ${id}`)
  }
  if (actual.length !== actualSet.size) failures.push(`${label}: duplicate ids are present`)
}

function fingerprint(value) {
  return createHash('sha256').update(stableSerialize(value)).digest('hex')
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function localPathFor(assetRoot, canonicalPublicPath) {
  if (!canonicalPublicPath.startsWith(PUBLIC_ASSET_PREFIX)) {
    throw new Error(`Non-canonical public path ${canonicalPublicPath}`)
  }
  const path = resolve(assetRoot, canonicalPublicPath.slice(PUBLIC_ASSET_PREFIX.length))
  const fromRoot = relative(assetRoot, path)
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error(`Canonical path escapes the asset root: ${canonicalPublicPath}`)
  }
  return path
}

function expectEqual(failures, label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${label}: expected ${formatValue(expected)}, got ${formatValue(actual)}`)
  }
}

function formatValue(value) {
  return value === undefined ? 'undefined' : JSON.stringify(value)
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const audit = await auditZombieEscapeAssets()
  if (!process.argv.includes('--no-write')) {
    await writeFile(DEFAULT_AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`)
  }
  if (process.argv.includes('--quiet')) {
    if (audit.pass) {
      console.log(
        `Zombie Escape asset audit passed (${audit.weaponRuntimeBytes} weapon runtime bytes).`,
      )
    } else {
      console.error(audit.failures.join('\n'))
    }
  } else {
    console.log(JSON.stringify(audit, null, 2))
  }
  if (!audit.pass) process.exitCode = 1
}

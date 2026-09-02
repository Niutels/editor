import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { auditZombieEscapeAssets } from './audit-zombie-escape-assets.mjs'
import { inspectGlb } from './landrush-glb-audit.mjs'
import {
  ZOMBIE_ESCAPE_WEAPON_IDS,
  inspectZombieEscapeWeaponSemanticContract,
  zombieEscapeWeaponSourcePath,
} from './zombie-escape-weapon-glb-optimizer.mjs'
import { zombieEscapeZombieSourcePath } from './zombie-escape-zombie-glb-optimizer.mjs'

const assetRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../public/landrush-lab/zombie-escape/assets',
)

test('inspects optimized weapons, ambient-backed zombies, and dedicated runtime bodies', async () => {
  const weapon = await inspectGlb(resolve(assetRoot, 'weapons/sunflare-pistol.glb'))
  assert.equal(weapon.meshCount, 1)
  assert.equal(weapon.primitiveCount, 1)
  assert.ok(
    ['baseColor', 'emissive', 'metallicRoughness', 'normal'].every(
      (slot) => weapon.materials[0].textureSlots[slot],
    ),
  )
  assert.ok(
    weapon.images.every(
      ({ height, mimeType, width }) =>
        height === 512 && mimeType === 'image/jpeg' && width === 512,
    ),
  )

  const weaponSource = await inspectGlb(zombieEscapeWeaponSourcePath('sunflare-pistol'))
  assert.equal(weapon.triangleCount, weaponSource.triangleCount)
  assert.ok(
    weaponSource.images.every(
      ({ height, mimeType, width }) =>
        height === 2048 && mimeType === 'image/jpeg' && width === 2048,
    ),
  )
  const semanticContracts = await Promise.all(
    ZOMBIE_ESCAPE_WEAPON_IDS.map(async (id) => ({
      runtime: await inspectZombieEscapeWeaponSemanticContract(
        resolve(assetRoot, `weapons/${id}.glb`),
      ),
      source: await inspectZombieEscapeWeaponSemanticContract(
        zombieEscapeWeaponSourcePath(id),
      ),
    })),
  )
  assert.ok(
    semanticContracts.every(
      ({ runtime, source }) => runtime.semanticHash === source.semanticHash,
    ),
  )

  const zombieOutputs = await Promise.all(
    ['rigged', 'walk', 'run'].map((output) =>
      inspectGlb(resolve(assetRoot, `zombies/dockworker/${output}.glb`)),
    ),
  )
  assert.equal(new Set(zombieOutputs.map(({ contentHash }) => contentHash)).size, 3)
  assert.equal(
    new Set(zombieOutputs.map(({ skinCompatibilityHash }) => skinCompatibilityHash)).size,
    1,
  )
  assert.ok(
    zombieOutputs.every(
      ({ images, materials }) =>
        images.every(({ height, width }) => height === 2048 && width === 2048) &&
        materials[0].textureSlots.baseColor,
    ),
  )

  const dedicatedSource = await inspectGlb(
    zombieEscapeZombieSourcePath('boardwalk-chef', 'rigged'),
  )
  const dedicatedRig = await inspectGlb(
    resolve(assetRoot, 'zombies/boardwalk-chef/rigged.glb'),
  )
  const dedicatedAnimations = await Promise.all(
    ['run', 'walk'].map((output) =>
      inspectGlb(resolve(assetRoot, `zombies/boardwalk-chef/${output}.anim.glb`)),
    ),
  )
  assert.equal(dedicatedRig.triangleCount, dedicatedSource.triangleCount)
  assert.equal(
    dedicatedRig.skinSemanticCompatibilityHash,
    dedicatedSource.skinSemanticCompatibilityHash,
  )
  assert.ok(
    dedicatedRig.images.every(
      ({ hasFullMipChain, height, mimeType, width }) =>
        hasFullMipChain && height === 768 && mimeType === 'image/ktx2' && width === 768,
    ),
  )
  assert.ok(
    dedicatedAnimations.every(
      ({ animationCount, imageCount, materialCount, meshCount, skinCount }) =>
        animationCount === 1 &&
        imageCount === 0 &&
        materialCount === 0 &&
        meshCount === 0 &&
        skinCount === 0,
    ),
  )
})

test('audits the checked-in asset contract without writing a report', async () => {
  const audit = await auditZombieEscapeAssets({ assetRoot })
  const provenanceFailureCount = audit.provenance.stateCatalogDifferences.reduce(
    (sum, { fields }) => sum + fields.length,
    0,
  )
  assert.equal(audit.failures.length, provenanceFailureCount, audit.failures.join('\n'))
  assert.equal(audit.pass, provenanceFailureCount === 0)
  assert.ok(audit.failures.every((failure) => failure.includes('state/catalog')))
  assert.deepEqual(audit.catalogChecks, { weapons: 5, zombies: 10 })
  assert.deepEqual(audit.runtimeCatalogChecks, {
    ambientRuntimeBodies: 8,
    ambientNpcSources: 10,
    dedicatedRuntimeBodies: 2,
    mappedZombies: 10,
    sourceNpcBijection: true,
    zombieEntries: 10,
  })
  assert.ok(
    audit.failures.every(
      (failure) =>
        !failure.startsWith('weapon catalog:') &&
        !failure.startsWith('zombie catalog:') &&
        !failure.startsWith('ambient NPC catalog:') &&
        !failure.includes(': runtime '),
    ),
  )
  assert.equal(Object.keys(audit.assets).length, 15)
  assert.equal(
    audit.assets.dockworker.canonicalOutputs.rigged,
    '/landrush-lab/zombie-escape/assets/zombies/dockworker/rigged.glb',
  )
  assert.equal(
    audit.assets['sunflare-pistol'].outputs.model.textureContract.profile,
    'full-pbr-512-jpeg',
  )
  assert.equal(
    audit.assets.dockworker.outputs.rigged.textureContract.profile,
    'base-color-2048',
  )
  assert.equal(
    audit.assets['boardwalk-chef'].outputs.rigged.textureContract.profile,
    'ktx2-768-mipmapped',
  )
  assert.equal(
    audit.assets['boardwalk-chef'].outputs.run.textureContract.profile,
    'animation-only',
  )
  assert.equal(audit.assets.dockworker.outputs.rigged.textureContract.fullPbrSlotsPresent, false)
  assert.equal(audit.assets.dockworker.compatibility.byteDistinct, true)
  assert.equal(audit.assets.dockworker.compatibility.skinTopologyCompatible, true)
  assert.equal(
    audit.assets['boardwalk-chef'].compatibility.runtimeAnimationsPreserveTargets,
    true,
  )
  assert.equal(audit.assets['boardwalk-chef'].compatibility.runtimeRigPreservesSkin, true)
  assert.ok(
    Object.values(audit.assets).every(({ outputs }) =>
      Object.values(outputs).every(
        ({ artifactContract, textureContract }) =>
          artifactContract.accepted && textureContract.accepted,
      ),
    ),
  )
  assert.equal(audit.contract.rootMotion.status, 'not-audited')
  assert.equal(audit.weaponRuntimeBytes, 2_038_548)
  assert.ok(
    ZOMBIE_ESCAPE_WEAPON_IDS.every(
      (id) => audit.assets[id].outputs.model.semanticContract.preserved,
    ),
  )
})

test('rejects corrupt state paths, task fingerprints, and artifact hashes', async () => {
  const generation = JSON.parse(
    await readFile(resolve(assetRoot, 'meshy-generation.json'), 'utf8'),
  )
  const corrupted = structuredClone(generation)
  const weapon = corrupted.assets['sunflare-pistol']
  weapon.outputs.model =
    '/landrush-lab/zombie-escape/assets/weapons/reef-carbine.glb'
  weapon.previewTaskIdFingerprint = 'f'.repeat(64)
  weapon.artifacts.model.sha256 = '0'.repeat(64)
  weapon.runtimeArtifacts.model.runtimeSha256 = '1'.repeat(64)
  weapon.runtimeArtifacts.model.semanticHash = '2'.repeat(64)

  const audit = await auditZombieEscapeAssets({
    assetRoot,
    generation: corrupted,
    weaponRuntimeBudgetBytes: 1,
  })
  assert.ok(
    audit.failures.some((failure) =>
      failure.startsWith('sunflare-pistol/model: canonical state path'),
    ),
  )
  assert.ok(
    audit.failures.some((failure) =>
      failure.startsWith('sunflare-pistol: previewTaskIdFingerprint'),
    ),
  )
  assert.ok(
    audit.failures.some((failure) =>
      failure.startsWith('sunflare-pistol/model: state artifact sha256'),
    ),
  )
  assert.ok(
    audit.failures.some((failure) =>
      failure.startsWith('sunflare-pistol/model: runtime artifact runtimeSha256'),
    ),
  )
  assert.ok(
    audit.failures.some((failure) =>
      failure.startsWith('sunflare-pistol/model: runtime artifact semanticHash'),
    ),
  )
  assert.ok(
    audit.failures.some((failure) => failure.startsWith('weapon runtime payload:')),
  )
})

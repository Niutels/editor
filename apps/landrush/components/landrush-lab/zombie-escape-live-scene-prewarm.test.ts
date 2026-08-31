import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
} from 'three'
import {
  beginLandrushPresentationPipelinePrewarmFrame,
  completeLandrushPresentationPipelinePrewarmFrame,
  type LandrushPipelineRenderer,
  type LandrushPresentationPipelinePrewarmState,
  registerLandrushPresentationPipelinePrewarm,
  requestLandrushPresentationPipelinePrewarm,
} from './landrush-render-readiness'
import {
  createZombieEscapeRenderReadinessRegistry,
  getZombieEscapeRenderRepresentativeKeys,
  ZOMBIE_ESCAPE_AIM_RETICLE_RENDER_REPRESENTATIVE_KEY,
  ZOMBIE_ESCAPE_SHOULDER_TORCH_RENDER_REPRESENTATIVE_KEY,
} from './zombie-escape-render-readiness'

describe('Zombie Escape live-scene presentation prewarm', () => {
  test('temporarily exposes registered renderables and restores exact flags', async () => {
    const renderer = {} as LandrushPipelineRenderer
    const scene = new Scene()
    const camera = new PerspectiveCamera()
    const hiddenRoot = new Group()
    const hiddenMesh = new Mesh(undefined, new MeshBasicMaterial())
    const emptyInstances = new InstancedMesh(undefined, new MeshBasicMaterial(), 2)
    const hiddenLight = new PointLight()
    hiddenRoot.visible = false
    hiddenMesh.visible = false
    hiddenMesh.frustumCulled = true
    emptyInstances.visible = false
    emptyInstances.frustumCulled = true
    emptyInstances.count = 0
    hiddenLight.visible = false
    hiddenRoot.add(hiddenMesh, emptyInstances, hiddenLight)
    scene.add(hiddenRoot)
    const state: LandrushPresentationPipelinePrewarmState = {}
    const cleanup = registerLandrushPresentationPipelinePrewarm({
      invalidate: () => undefined,
      renderer,
      scene,
      state,
    })
    const pending = requestLandrushPresentationPipelinePrewarm({
      camera,
      renderPath: 'direct',
      renderer,
      representatives: [{ key: 'zombie-pool', root: hiddenRoot }],
      targetScene: scene,
    })

    beginLandrushPresentationPipelinePrewarmFrame(renderer)
    expect(state.pipelinePrewarmRenderPath).toBe('direct')
    expect(hiddenRoot.visible).toBe(true)
    expect(hiddenMesh.visible).toBe(true)
    expect(hiddenMesh.frustumCulled).toBe(false)
    expect(emptyInstances.visible).toBe(true)
    expect(emptyInstances.frustumCulled).toBe(false)
    expect(emptyInstances.count).toBe(1)
    expect(hiddenLight.visible).toBe(true)

    state.pipelinePrewarmCameraMatched = true
    state.pipelinePrewarmRenderedCamera = camera
    state.pipelinePrewarmOnRenderSettled?.(state.pipelinePrewarmRequestRevision ?? 0, 'rendered')
    await pending
    expect(hiddenRoot.visible).toBe(false)
    expect(hiddenMesh.visible).toBe(false)
    expect(hiddenMesh.frustumCulled).toBe(true)
    expect(emptyInstances.visible).toBe(false)
    expect(emptyInstances.frustumCulled).toBe(true)
    expect(emptyInstances.count).toBe(0)
    expect(hiddenLight.visible).toBe(false)
    expect(state.pipelinePrewarmRenderPath).toBeUndefined()

    completeLandrushPresentationPipelinePrewarmFrame(renderer)
    cleanup()
    hiddenMesh.geometry.dispose()
    hiddenMesh.material.dispose()
    emptyInstances.geometry.dispose()
    emptyInstances.material.dispose()
    hiddenLight.dispose()
  })

  test('requires the live shoulder torch and wires its exact root into the registry', () => {
    const keys = getZombieEscapeRenderRepresentativeKeys('balanced')
    expect(keys).toContain(ZOMBIE_ESCAPE_SHOULDER_TORCH_RENDER_REPRESENTATIVE_KEY)
    expect(getZombieEscapeRenderRepresentativeKeys('performance')).toContain(
      ZOMBIE_ESCAPE_SHOULDER_TORCH_RENDER_REPRESENTATIVE_KEY,
    )
    const registry = createZombieEscapeRenderReadinessRegistry(keys)
    const root = new Group()
    const unregister = registry.register(
      ZOMBIE_ESCAPE_SHOULDER_TORCH_RENDER_REPRESENTATIVE_KEY,
      root,
    )
    expect(
      registry
        .getSnapshot()
        .representatives.some(
          (representative) =>
            representative.key === ZOMBIE_ESCAPE_SHOULDER_TORCH_RENDER_REPRESENTATIVE_KEY &&
            representative.root === root,
        ),
    ).toBe(true)
    unregister()

    const torchSource = readFileSync(
      new URL('./landrush-robot-shoulder-torch-rig.tsx', import.meta.url),
      'utf8',
    )
    const weaponRigSource = readFileSync(
      new URL('./landrush-robot-weapon-rig.tsx', import.meta.url),
      'utf8',
    )
    expect(torchSource).toContain(
      'useZombieEscapeRenderRepresentative(\n    renderReadinessRegistry,\n    ZOMBIE_ESCAPE_SHOULDER_TORCH_RENDER_REPRESENTATIVE_KEY,\n    rootRef,\n  )',
    )
    expect(weaponRigSource).toMatch(
      /<LandrushRobotShoulderTorchRig[\s\S]*?renderReadinessRegistry=\{renderReadinessRegistry\}[\s\S]*?\/>/,
    )

    const islandClientSource = readFileSync(
      new URL('./landrush-island-client.tsx', import.meta.url),
      'utf8',
    )
    expect(islandClientSource).toMatch(
      /viewerSceneReady=\{\s*viewerSceneReady\s*&&\s*ambientLoadReadiness\?\.ready\s*===\s*true\s*\}/,
    )
  })

  test('requires the live aim reticle and wires its exact root into the registry', () => {
    expect(getZombieEscapeRenderRepresentativeKeys('balanced')).toContain(
      ZOMBIE_ESCAPE_AIM_RETICLE_RENDER_REPRESENTATIVE_KEY,
    )
    expect(getZombieEscapeRenderRepresentativeKeys('performance')).toContain(
      ZOMBIE_ESCAPE_AIM_RETICLE_RENDER_REPRESENTATIVE_KEY,
    )

    const actorsSource = readFileSync(
      new URL('./zombie-escape-actors.tsx', import.meta.url),
      'utf8',
    )
    expect(actorsSource).toMatch(
      /<ZombieEscapeAimReticle[\s\S]*?renderReadinessRegistry=\{renderReadinessRegistry\}[\s\S]*?\/>/,
    )
    expect(actorsSource).toContain(
      'useZombieEscapeRenderRepresentative(\n    renderReadinessRegistry,\n    ZOMBIE_ESCAPE_AIM_RETICLE_RENDER_REPRESENTATIVE_KEY,\n    reticleRef,\n  )',
    )
  })

  test('keeps camera and robot bone-binding preparation resident before night activation', () => {
    const islandClientSource = readFileSync(
      new URL('./landrush-island-client.tsx', import.meta.url),
      'utf8',
    )
    const weaponRigSource = readFileSync(
      new URL('./landrush-robot-weapon-rig.tsx', import.meta.url),
      'utf8',
    )
    const torchRigSource = readFileSync(
      new URL('./landrush-robot-shoulder-torch-rig.tsx', import.meta.url),
      'utf8',
    )

    expect(islandClientSource).toMatch(
      /\{zombieEscapeEnabled \? \(\s*<LandrushZombieEscapeCamera\s+active=\{zombieEscapeCameraActive\}/,
    )
    expect(weaponRigSource).toMatch(
      /const bones = visualRoot[\s\S]*?findLandrushRobotArmBones\(visualRoot\)[\s\S]*?if \(!active\)/,
    )
    expect(torchRigSource).toMatch(
      /const bones = visualRoot[\s\S]*?findLandrushRobotShoulderBones\(visualRoot\)[\s\S]*?const preparedPoseReady/,
    )
    expect(torchRigSource).not.toContain('writeLandrushRobotShoulderTorchBeamUvRange')
  })

  test('uses one authoritative robot matrix sync and shares its shoulder pose with the torch', () => {
    const weaponRigSource = readFileSync(
      new URL('./landrush-robot-weapon-rig.tsx', import.meta.url),
      'utf8',
    )
    const torchRigSource = readFileSync(
      new URL('./landrush-robot-shoulder-torch-rig.tsx', import.meta.url),
      'utf8',
    )

    expect(weaponRigSource.match(/visualRoot\.updateWorldMatrix\(true, true\)/g)).toHaveLength(1)
    expect(weaponRigSource).not.toContain('upperArm.updateWorldMatrix(true, true)')
    expect(weaponRigSource).not.toContain('joint.updateWorldMatrix(true, true)')
    expect(weaponRigSource).toContain('joint.updateWorldMatrix(false, true)')
    expect(weaponRigSource).toContain('poseStateRef={shoulderTorchPoseRef}')
    expect(torchRigSource).toMatch(
      /if \(preparedPoseReady && poseState\)[\s\S]*?scratch\.robotOrigin\.copy\(poseState\.robotOrigin\)[\s\S]*?else if \(bones\) \{\s*visualRoot\.updateWorldMatrix\(true, true\)/,
    )
  })
})

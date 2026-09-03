import { describe, expect, test } from 'bun:test'
import {
  AdditiveBlending,
  DataTexture,
  DoubleSide,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from 'three'
import {
  compileZombieEscapeRenderRepresentatives,
  createZombieEscapeScenePipelineRepresentative,
  type ZombieEscapePipelineRenderer,
} from './zombie-escape-render-readiness'

describe('Zombie Escape scene pipeline coverage', () => {
  test('copies every unrepresented renderable onto the loading camera layer', () => {
    const scene = new Scene()
    const camera = new PerspectiveCamera()
    const geometry = new SphereGeometry(1, 4, 3)
    const meshMaterial = new MeshBasicMaterial()
    const lineMaterial = new LineBasicMaterial()
    const pointsMaterial = new PointsMaterial()
    const spriteMaterial = new SpriteMaterial()
    const representedRoot = new Group()
    const representedMesh = new Mesh(geometry, meshMaterial)
    const hiddenRoot = new Group()
    const mesh = new Mesh(geometry, meshMaterial)
    const duplicateMesh = new Mesh(geometry, meshMaterial)
    const equivalentMaterial = new MeshBasicMaterial()
    const equivalentMesh = new Mesh(geometry, equivalentMaterial)
    const positiveMesh = new Mesh(geometry, meshMaterial)
    const doubleSidedMaterial = new MeshBasicMaterial({ side: DoubleSide })
    const doubleSidedMesh = new Mesh(geometry, doubleSidedMaterial)
    const line = new Line(geometry, lineMaterial)
    const points = new Points(geometry, pointsMaterial)
    const sprite = new Sprite(spriteMaterial)
    const concealedRoot = new Group()
    const concealedMaterial = new MeshBasicMaterial({ blending: AdditiveBlending })
    const concealedMesh = new Mesh(geometry, concealedMaterial)
    const customDepthMaterial = new MeshBasicMaterial()
    const customDistanceMaterial = new MeshBasicMaterial()
    representedRoot.add(representedMesh)
    concealedRoot.visible = false
    concealedRoot.add(concealedMesh)
    mesh.customDepthMaterial = customDepthMaterial
    mesh.customDistanceMaterial = customDistanceMaterial
    duplicateMesh.customDepthMaterial = customDepthMaterial
    duplicateMesh.customDistanceMaterial = customDistanceMaterial
    equivalentMesh.customDepthMaterial = customDepthMaterial
    equivalentMesh.customDistanceMaterial = customDistanceMaterial
    positiveMesh.customDepthMaterial = customDepthMaterial
    positiveMesh.customDistanceMaterial = customDistanceMaterial
    positiveMesh.position.x = 100
    positiveMesh.updateMatrix()
    positiveMesh.updateMatrixWorld(true)
    positiveMesh.matrixAutoUpdate = false
    positiveMesh.matrixWorldAutoUpdate = false
    const plainInstancedMesh = new InstancedMesh(geometry, meshMaterial, 1)
    const morphedInstancedMesh = new InstancedMesh(geometry, meshMaterial, 1)
    plainInstancedMesh.position.x = 100
    morphedInstancedMesh.position.x = 100
    morphedInstancedMesh.morphTexture = new DataTexture(new Float32Array([0]), 1, 1)
    hiddenRoot.add(
      mesh,
      duplicateMesh,
      equivalentMesh,
      doubleSidedMesh,
      line,
      points,
      sprite,
      new PointLight(),
    )
    hiddenRoot.scale.x = -1
    hiddenRoot.position.x = 100
    scene.add(
      representedRoot,
      hiddenRoot,
      concealedRoot,
      positiveMesh,
      plainInstancedMesh,
      morphedInstancedMesh,
    )
    camera.layers.enable(3)

    const representative = createZombieEscapeScenePipelineRepresentative({
      camera,
      representatives: [{ key: 'represented', root: representedRoot }],
      targetScene: scene,
    })

    expect(representative.children).toHaveLength(9)
    expect(representative.children.map((child) => child.type)).toEqual([
      'Mesh',
      'Mesh',
      'Line',
      'Points',
      'Sprite',
      'Mesh',
      'Mesh',
      'Mesh',
      'Mesh',
    ])
    expect(representative.children).not.toContain(mesh)
    expect(representative.children).not.toContain(representedMesh)
    expect(representative.children).not.toContain(concealedMesh)
    expect(
      representative.children.some((child) => (child as Mesh).material === concealedMaterial),
    ).toBe(true)
    expect(representative.children.every((child) => child.layers.mask === camera.layers.mask)).toBe(
      true,
    )
    expect((representative.children[0] as Mesh).geometry).toBe(geometry)
    expect((representative.children[0] as Mesh).material).toBe(meshMaterial)
    expect((representative.children[0] as Mesh).customDepthMaterial).toBe(customDepthMaterial)
    expect((representative.children[0] as Mesh).customDistanceMaterial).toBe(customDistanceMaterial)
    expect(representative.children[0]?.matrix.determinant()).toBeLessThan(0)
    expect(
      representative.children.filter((child) => (child as Mesh).material === meshMaterial),
    ).toHaveLength(4)
    expect(representative.children.every((child) => child.matrixWorldAutoUpdate)).toBe(true)
    expect(representative.children.every((child) => child.matrixWorldNeedsUpdate)).toBe(true)
    expect(representative.position.y).toBe(-1_000_000)

    geometry.dispose()
    meshMaterial.dispose()
    lineMaterial.dispose()
    pointsMaterial.dispose()
    spriteMaterial.dispose()
    customDepthMaterial.dispose()
    customDistanceMaterial.dispose()
    equivalentMaterial.dispose()
    doubleSidedMaterial.dispose()
    concealedMaterial.dispose()
    morphedInstancedMesh.morphTexture.dispose()
  })

  test('prewarms detached scene coverage through both render paths and then clears it', async () => {
    const scene = new Scene()
    const camera = new PerspectiveCamera()
    const geometry = new SphereGeometry(1, 4, 3)
    const material = new MeshBasicMaterial()
    const liveMesh = new Mesh(geometry, material)
    liveMesh.position.x = 100
    const registeredRoot = new Group()
    scene.add(liveMesh)
    const prewarmedRoots: Group[] = []
    const prewarmedPaths: Array<'direct' | 'presentation' | undefined> = []
    const renderer: ZombieEscapePipelineRenderer = {
      backend: { device: { queue: { onSubmittedWorkDone: async () => undefined } } },
      compileAsync: async () => undefined,
      isWebGPURenderer: true,
    }

    await compileZombieEscapeRenderRepresentatives(
      {
        camera,
        renderer,
        representatives: [{ key: 'registered', root: registeredRoot }],
        targetScene: scene,
      },
      undefined,
      async ({ renderPath, representatives }) => {
        const coverage = representatives.find(({ key }) => key === 'scene:pipeline-coverage')
        expect(coverage).toBeDefined()
        expect(coverage?.root.children).toHaveLength(1)
        expect(coverage?.root.children[0]).not.toBe(liveMesh)
        expect((coverage?.root.children.at(0) as Mesh | undefined)?.geometry).toBe(geometry)
        prewarmedRoots.push(coverage?.root as Group)
        prewarmedPaths.push(renderPath)
      },
    )

    expect(prewarmedPaths).toEqual(['presentation', 'direct'])
    expect(prewarmedRoots[0]).toBe(prewarmedRoots[1])
    expect(prewarmedRoots[0]?.children).toHaveLength(0)
    expect(liveMesh.parent).toBe(scene)

    geometry.dispose()
    material.dispose()
  })

  test('retains each active material-group pipeline for equivalent multi-material meshes', () => {
    const scene = new Scene()
    const camera = new PerspectiveCamera()
    const firstGeometry = new SphereGeometry(1, 4, 3)
    const secondGeometry = firstGeometry.clone()
    const duplicateGeometry = firstGeometry.clone()
    firstGeometry.clearGroups()
    secondGeometry.clearGroups()
    duplicateGeometry.clearGroups()
    firstGeometry.addGroup(0, 3, 0)
    secondGeometry.addGroup(0, 3, 1)
    duplicateGeometry.addGroup(0, 3, 1)
    const materials = [new MeshBasicMaterial(), new MeshBasicMaterial()]
    const first = new Mesh(firstGeometry, materials)
    const second = new Mesh(secondGeometry, materials)
    const duplicate = new Mesh(duplicateGeometry, materials)
    first.position.x = 100
    second.position.x = 100
    duplicate.position.x = 100
    scene.add(first, second, duplicate)

    const representative = createZombieEscapeScenePipelineRepresentative({
      camera,
      representatives: [],
      targetScene: scene,
    })

    expect(representative.children).toHaveLength(2)
    expect((representative.children[0] as Mesh).geometry).toBe(firstGeometry)
    expect((representative.children[1] as Mesh).geometry).toBe(secondGeometry)

    firstGeometry.dispose()
    secondGeometry.dispose()
    duplicateGeometry.dispose()
    for (const material of materials) material.dispose()
  })

  test('reprewarms registered descendants and pipeline mutations without replacing the root', async () => {
    const scene = new Scene()
    const camera = new PerspectiveCamera()
    const root = new Group()
    const geometry = new SphereGeometry(1, 4, 3)
    const material = new MeshBasicMaterial()
    const initialMesh = new Mesh(geometry, material)
    root.add(initialMesh)
    let aggregateCount = 0
    let fenceCount = 0
    const prewarmedPaths: Array<'direct' | 'presentation' | undefined> = []
    const renderer: ZombieEscapePipelineRenderer = {
      backend: {
        device: {
          queue: {
            onSubmittedWorkDone: async () => {
              fenceCount += 1
            },
          },
        },
      },
      compileAsync: async () => {
        aggregateCount += 1
      },
      isWebGPURenderer: true,
    }
    const compile = () =>
      compileZombieEscapeRenderRepresentatives(
        {
          camera,
          renderer,
          representatives: [{ key: 'registered', root }],
          targetScene: scene,
        },
        undefined,
        async ({ renderPath }) => {
          prewarmedPaths.push(renderPath)
        },
      )

    await compile()
    await compile()
    const addedMaterial = new MeshBasicMaterial({ transparent: true })
    root.add(new Mesh(geometry, addedMaterial))
    await compile()
    addedMaterial.depthWrite = false
    await compile()
    await compile()

    expect(aggregateCount).toBe(3)
    expect(fenceCount).toBe(3)
    expect(prewarmedPaths).toEqual([
      'presentation',
      'direct',
      'presentation',
      'direct',
      'presentation',
      'direct',
    ])

    geometry.dispose()
    material.dispose()
    addedMaterial.dispose()
  })

  test('prewarms newly mounted and mutated scene pipelines without registered-root churn', async () => {
    const scene = new Scene()
    const camera = new PerspectiveCamera()
    const geometry = new SphereGeometry(1, 4, 3)
    const material = new MeshBasicMaterial()
    const liveMesh = new Mesh(geometry, material)
    liveMesh.position.x = 100
    const registeredRoot = new Group()
    scene.add(liveMesh)
    let aggregateCount = 0
    let fenceCount = 0
    const prewarmedPaths: Array<'direct' | 'presentation' | undefined> = []
    const renderer: ZombieEscapePipelineRenderer = {
      backend: {
        device: {
          queue: {
            onSubmittedWorkDone: async () => {
              fenceCount += 1
            },
          },
        },
      },
      compileAsync: async () => {
        aggregateCount += 1
      },
      isWebGPURenderer: true,
    }
    const compile = () =>
      compileZombieEscapeRenderRepresentatives(
        {
          camera,
          renderer,
          representatives: [{ key: 'registered', root: registeredRoot }],
          targetScene: scene,
        },
        undefined,
        async ({ renderPath }) => {
          prewarmedPaths.push(renderPath)
        },
      )

    await compile()
    const lineMaterial = new LineBasicMaterial()
    const line = new Line(geometry, lineMaterial)
    line.position.x = 100
    scene.add(line)
    await compile()
    material.depthWrite = false
    await compile()
    await compile()

    expect(aggregateCount).toBe(3)
    expect(fenceCount).toBe(3)
    expect(prewarmedPaths).toEqual([
      'presentation',
      'direct',
      'presentation',
      'direct',
      'presentation',
      'direct',
    ])

    geometry.dispose()
    material.dispose()
    lineMaterial.dispose()
  })
})

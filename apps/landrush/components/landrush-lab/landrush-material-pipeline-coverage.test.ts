import { describe, expect, test } from 'bun:test'
import {
  AdditiveBlending,
  DataTexture,
  DoubleSide,
  GreaterDepth,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three'
import { LandrushIslandMaterialPresentationOwner } from './landrush-island-material-presentation'
import {
  readLandrushMaterialPipelineSignature,
  resolveLandrushPipelineCoverageRepresentative,
} from './landrush-render-pipeline-signature'

describe('Landrush material pipeline coverage', () => {
  test('retains runtime variants while compiling equivalent GPU programs once', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const firstMaterial = new MeshBasicMaterial({ color: '#ff0000' })
    const equivalentMaterial = new MeshBasicMaterial({ color: '#00ff00' })
    const doubleSidedMaterial = new MeshBasicMaterial({ side: DoubleSide })
    const meshes = [firstMaterial, equivalentMaterial, doubleSidedMaterial].map(
      (material) => new Mesh(new PlaneGeometry(1, 1), material),
    )

    expect(readLandrushMaterialPipelineSignature(firstMaterial)).toBe(
      readLandrushMaterialPipelineSignature(equivalentMaterial),
    )
    expect(readLandrushMaterialPipelineSignature(firstMaterial)).not.toBe(
      readLandrushMaterialPipelineSignature(doubleSidedMaterial),
    )
    const additiveMaterial = firstMaterial.clone()
    additiveMaterial.blending = AdditiveBlending
    const greaterDepthMaterial = firstMaterial.clone()
    greaterDepthMaterial.depthFunc = GreaterDepth
    const firstDefinedMaterial = firstMaterial.clone()
    firstDefinedMaterial.defines = { PIPELINE_VARIANT: 1 }
    const secondDefinedMaterial = firstMaterial.clone()
    secondDefinedMaterial.defines = { PIPELINE_VARIANT: 2 }
    expect(readLandrushMaterialPipelineSignature(firstMaterial)).not.toBe(
      readLandrushMaterialPipelineSignature(additiveMaterial),
    )
    expect(readLandrushMaterialPipelineSignature(firstMaterial)).not.toBe(
      readLandrushMaterialPipelineSignature(greaterDepthMaterial),
    )
    expect(readLandrushMaterialPipelineSignature(firstDefinedMaterial)).not.toBe(
      readLandrushMaterialPipelineSignature(secondDefinedMaterial),
    )

    const runtimeRepresentatives = owner.createRenderReadinessRepresentative(
      meshes.map((mesh) => ({ floor: true, mesh, reveal: true })),
      { kind: 'soft' },
    )
    const pipelineCoverage = resolveLandrushPipelineCoverageRepresentative(runtimeRepresentatives)

    expect(runtimeRepresentatives.children).toHaveLength(15)
    expect(pipelineCoverage).not.toBe(runtimeRepresentatives)
    expect(pipelineCoverage.children).toHaveLength(6)
    expect(pipelineCoverage.position.y).toBe(-1_000_000)
    expect(meshes.map((mesh) => mesh.material)).toEqual([
      firstMaterial,
      equivalentMaterial,
      doubleSidedMaterial,
    ])

    owner.dispose()
    for (const mesh of meshes) mesh.geometry.dispose()
    firstMaterial.dispose()
    equivalentMaterial.dispose()
    doubleSidedMaterial.dispose()
    additiveMaterial.dispose()
    greaterDepthMaterial.dispose()
    firstDefinedMaterial.dispose()
    secondDefinedMaterial.dispose()
  })

  test('keeps opposite winding and instanced morph pipelines distinct', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const geometry = new PlaneGeometry(1, 1)
    const material = new MeshBasicMaterial()
    const positiveMesh = new Mesh(geometry, material)
    const negativeMesh = new Mesh(geometry, material)
    const negativeParent = new Group()
    negativeParent.scale.x = -1
    negativeParent.add(negativeMesh)
    const plainInstancedMesh = new InstancedMesh(geometry, material, 1)
    const morphedInstancedMesh = new InstancedMesh(geometry, material, 1)
    morphedInstancedMesh.morphTexture = new DataTexture(new Float32Array([0]), 1, 1)

    const runtimeRepresentatives = owner.createRenderReadinessRepresentative(
      [positiveMesh, negativeMesh, plainInstancedMesh, morphedInstancedMesh].map((mesh) => ({
        floor: false,
        mesh,
        reveal: true,
      })),
      { kind: 'soft' },
    )
    const pipelineCoverage = resolveLandrushPipelineCoverageRepresentative(runtimeRepresentatives)

    expect(pipelineCoverage.children).toHaveLength(4)

    owner.dispose()
    geometry.dispose()
    material.dispose()
    morphedInstancedMesh.morphTexture.dispose()
  })
})

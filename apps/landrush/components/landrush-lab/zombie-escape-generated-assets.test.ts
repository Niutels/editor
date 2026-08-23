import { describe, expect, test } from 'bun:test'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D, Vector3 } from 'three'
import {
  createZombieVisual,
  resolveZombieEscapeRenderPipelineSettlement,
} from './zombie-escape-generated-assets'
import { createZombieEscapeImpactVisualRegistry } from './zombie-escape-skinned-impact-attachment'

const MODEL_TRANSFORM = { offset: new Vector3(), scale: 1 }

describe('generated asset render-pipeline readiness', () => {
  test('maps timeout and compilation failure to content-ready diagnostics, not asset failures', () => {
    expect(
      resolveZombieEscapeRenderPipelineSettlement({
        message: 'prewarm timed out',
        state: 'degraded',
      }),
    ).toEqual({
      contentReady: true,
      diagnostic: { level: 'warning', message: 'prewarm timed out' },
    })
    expect(
      resolveZombieEscapeRenderPipelineSettlement({
        message: 'shader compile rejected',
        state: 'failed',
      }),
    ).toEqual({
      contentReady: true,
      diagnostic: { level: 'error', message: 'shader compile rejected' },
    })
    expect(resolveZombieEscapeRenderPipelineSettlement({ state: 'ready' })).toEqual({
      contentReady: true,
      diagnostic: null,
    })
  })
})

describe('generated zombie visual construction', () => {
  test('disposes materials cloned before a later material clone fails', () => {
    const group = new Group()
    const source = new Group()
    const firstGeometry = new BoxGeometry()
    const secondGeometry = new BoxGeometry()
    const firstMaterial = new MeshStandardMaterial()
    const secondMaterial = new MeshStandardMaterial()
    const cloneFirstMaterial = firstMaterial.clone.bind(firstMaterial)
    let disposedMaterials = 0
    firstMaterial.clone = () => {
      const clone = cloneFirstMaterial()
      clone.addEventListener('dispose', () => {
        disposedMaterials += 1
      })
      return clone
    }
    secondMaterial.clone = () => {
      throw new Error('material clone failed')
    }
    source.add(new Mesh(firstGeometry, firstMaterial), new Mesh(secondGeometry, secondMaterial))

    expect(() =>
      createZombieVisual({
        active: false,
        generation: 0,
        group,
        impactVisualRegistry: createZombieEscapeImpactVisualRegistry(),
        modelTransform: MODEL_TRANSFORM,
        runClip: null,
        slot: null,
        source,
        walkClip: null,
      }),
    ).toThrow('material clone failed')
    expect(group.children).toHaveLength(0)
    expect(disposedMaterials).toBe(1)

    firstGeometry.dispose()
    secondGeometry.dispose()
    firstMaterial.dispose()
    secondMaterial.dispose()
  })

  test('rolls back scene attachment, impact registration, and owned material after attach fails', () => {
    class ThrowAfterAttachGroup extends Group {
      override add(...objects: Object3D[]) {
        super.add(...objects)
        throw new Error('scene attachment failed')
      }
    }

    const group = new ThrowAfterAttachGroup()
    const source = new Group()
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial()
    const cloneMaterial = material.clone.bind(material)
    let disposedMaterials = 0
    material.clone = () => {
      const clone = cloneMaterial()
      clone.addEventListener('dispose', () => {
        disposedMaterials += 1
      })
      return clone
    }
    source.add(new Mesh(geometry, material))
    const impactVisualRegistry = createZombieEscapeImpactVisualRegistry()

    expect(() =>
      createZombieVisual({
        active: true,
        generation: 4,
        group,
        impactVisualRegistry,
        modelTransform: MODEL_TRANSFORM,
        runClip: null,
        slot: 3,
        source,
        walkClip: null,
      }),
    ).toThrow('scene attachment failed')
    expect(group.children).toHaveLength(0)
    expect(impactVisualRegistry.bindings.size).toBe(0)
    expect(disposedMaterials).toBe(1)

    geometry.dispose()
    material.dispose()
  })
})

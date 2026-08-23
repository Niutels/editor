import { describe, expect, test } from 'bun:test'
import { cloneMaterial } from '@pascal-app/viewer'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { disposeCabinetGhostResources, ownCabinetGhostResources } from './ghost-resources'

describe('disposeCabinetGhostResources', () => {
  test('clears pooled clones and disposes the shared owned geometry and tracked material once', () => {
    const geometry = new BoxGeometry()
    const material = cloneMaterial(new MeshBasicMaterial())
    const ghost = new Group()
    ghost.add(new Mesh(geometry, material))
    const pool = [ghost.clone(), ghost.clone()]
    let geometryDisposals = 0
    let materialDisposals = 0
    geometry.addEventListener('dispose', () => {
      geometryDisposals += 1
    })
    material.addEventListener('dispose', () => {
      materialDisposals += 1
    })

    disposeCabinetGhostResources(ghost, pool)

    expect(pool).toHaveLength(0)
    expect(geometryDisposals).toBe(1)
    expect(materialDisposals).toBe(1)
  })

  test('survives a StrictMode cleanup probe and disposes once on final unmount', () => {
    const createGeneration = () => {
      const geometry = new BoxGeometry()
      const material = cloneMaterial(new MeshBasicMaterial())
      const ghost = new Group()
      ghost.add(new Mesh(geometry, material))
      const resources = ownCabinetGhostResources(ghost)
      resources.pool.push(ghost.clone(), ghost.clone())
      let geometryDisposals = 0
      let materialDisposals = 0
      geometry.addEventListener('dispose', () => {
        geometryDisposals += 1
      })
      material.addEventListener('dispose', () => {
        materialDisposals += 1
      })
      return {
        geometryDisposals: () => geometryDisposals,
        materialDisposals: () => materialDisposals,
        resources,
      }
    }

    const probe = createGeneration()
    probe.resources.dispose()
    const mounted = createGeneration()

    expect(probe.resources.pool).toHaveLength(0)
    expect(probe.geometryDisposals()).toBe(1)
    expect(probe.materialDisposals()).toBe(1)
    expect(mounted.resources.pool).toHaveLength(2)
    expect(mounted.geometryDisposals()).toBe(0)
    expect(mounted.materialDisposals()).toBe(0)

    mounted.resources.dispose()
    mounted.resources.dispose()

    expect(mounted.resources.pool).toHaveLength(0)
    expect(mounted.geometryDisposals()).toBe(1)
    expect(mounted.materialDisposals()).toBe(1)
  })
})

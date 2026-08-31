import { describe, expect, test } from 'bun:test'
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three'
import { LandrushZombieEscapePlayerHitPresentation } from './landrush-zombie-escape-player-hit-presentation'

describe('Landrush Zombie Escape player hit presentation', () => {
  test('keeps one material binding while the same root toggles through inactive and active phases', () => {
    const source = new MeshStandardMaterial({
      color: '#4a86b8',
      emissive: '#102030',
      emissiveIntensity: 0.4,
    })
    const geometry = new BoxGeometry()
    const first = new Mesh(geometry, source)
    const second = new Mesh(geometry, source)
    const root = new Group()
    root.add(first, second)
    const presentation = new LandrushZombieEscapePlayerHitPresentation()
    const traverse = root.traverse.bind(root)
    let traversalCount = 0
    root.traverse = (callback) => {
      traversalCount += 1
      return traverse(callback)
    }

    presentation.sync(root, 0)
    const hitMaterial = first.material as MeshStandardMaterial
    let disposed = 0
    hitMaterial.addEventListener('dispose', () => {
      disposed += 1
    })
    expect(hitMaterial).not.toBe(source)
    expect(second.material).toBe(hitMaterial)
    expect(source.color.getHexString()).toBe('4a86b8')

    presentation.sync(root, 1)
    expect(first.material).toBe(hitMaterial)
    expect(hitMaterial.color.getHexString()).toBe(new Color('#ff1738').getHexString())
    expect(hitMaterial.emissive.getHexString()).toBe(new Color('#ff1738').getHexString())
    expect(hitMaterial.emissiveIntensity).toBe(3.6)

    presentation.sync(root, 0.8)
    expect(hitMaterial.color.getHexString()).toBe(new Color('#030104').getHexString())
    expect(hitMaterial.emissiveIntensity).toBe(0)

    presentation.sync(root, 0)
    expect(hitMaterial.color.getHexString()).toBe('4a86b8')
    expect(hitMaterial.emissive.getHexString()).toBe('102030')
    expect(hitMaterial.emissiveIntensity).toBe(0.4)
    presentation.sync(root, 1)
    presentation.sync(root, 0)
    expect(first.material).toBe(hitMaterial)
    expect(traversalCount).toBe(1)
    expect(disposed).toBe(0)

    presentation.dispose()
    expect(first.material).toBe(source)
    expect(second.material).toBe(source)
    expect(disposed).toBe(1)

    geometry.dispose()
    source.dispose()
  })

  test('releases and rebuilds material bindings only when the root identity changes', () => {
    const firstSource = new MeshStandardMaterial({ color: '#305070' })
    const secondSource = new MeshStandardMaterial({ color: '#709030' })
    const geometry = new BoxGeometry()
    const firstMesh = new Mesh(geometry, firstSource)
    const secondMesh = new Mesh(geometry, secondSource)
    const firstRoot = new Group()
    const secondRoot = new Group()
    firstRoot.add(firstMesh)
    secondRoot.add(secondMesh)
    const presentation = new LandrushZombieEscapePlayerHitPresentation()
    const firstTraverse = firstRoot.traverse.bind(firstRoot)
    const secondTraverse = secondRoot.traverse.bind(secondRoot)
    let firstTraversalCount = 0
    let secondTraversalCount = 0
    firstRoot.traverse = (callback) => {
      firstTraversalCount += 1
      return firstTraverse(callback)
    }
    secondRoot.traverse = (callback) => {
      secondTraversalCount += 1
      return secondTraverse(callback)
    }

    presentation.sync(firstRoot, 0)
    const firstHitMaterial = firstMesh.material as MeshStandardMaterial
    let firstDisposed = 0
    firstHitMaterial.addEventListener('dispose', () => {
      firstDisposed += 1
    })
    presentation.sync(firstRoot, 1)
    expect(firstMesh.material).toBe(firstHitMaterial)
    expect(firstTraversalCount).toBe(1)
    expect(firstDisposed).toBe(0)

    presentation.sync(secondRoot, 0)
    const secondHitMaterial = secondMesh.material as MeshStandardMaterial
    expect(firstMesh.material).toBe(firstSource)
    expect(firstDisposed).toBe(1)
    expect(firstTraversalCount).toBe(1)
    expect(secondTraversalCount).toBe(1)
    expect(secondHitMaterial).not.toBe(secondSource)

    presentation.sync(secondRoot, 1)
    expect(secondMesh.material).toBe(secondHitMaterial)
    expect(secondTraversalCount).toBe(1)

    presentation.dispose()
    expect(secondMesh.material).toBe(secondSource)

    geometry.dispose()
    firstSource.dispose()
    secondSource.dispose()
  })

  test('preserves material arrays and restores their exact source assignment', () => {
    const firstSource = new MeshStandardMaterial({ color: '#c0c0c0' })
    const secondSource = new MeshStandardMaterial({ color: '#204060' })
    const sourceAssignment = [firstSource, secondSource]
    const geometry = new BoxGeometry()
    const mesh = new Mesh(geometry, sourceAssignment)
    const root = new Group()
    root.add(mesh)
    const presentation = new LandrushZombieEscapePlayerHitPresentation()

    presentation.sync(root, 1)
    expect(Array.isArray(mesh.material)).toBe(true)
    const hitAssignment = mesh.material as MeshStandardMaterial[]
    expect(hitAssignment).toHaveLength(2)
    expect(hitAssignment[0]).not.toBe(firstSource)
    expect(hitAssignment[1]).not.toBe(secondSource)
    expect(firstSource.color.getHexString()).toBe('c0c0c0')
    expect(secondSource.color.getHexString()).toBe('204060')

    presentation.dispose()
    expect(mesh.material).toBe(sourceAssignment)

    geometry.dispose()
    firstSource.dispose()
    secondSource.dispose()
  })

  test('hands persistent hit materials through an active external hover owner', () => {
    const source = new MeshStandardMaterial({ color: '#507090' })
    const hover = new MeshStandardMaterial({ color: '#ffffff' })
    const geometry = new BoxGeometry()
    const mesh = new Mesh(geometry, hover)
    mesh.userData.landrushOriginalMaterial = source
    const root = new Group()
    root.add(mesh)
    const presentation = new LandrushZombieEscapePlayerHitPresentation()

    presentation.sync(root, 1)
    const hitMaterial = mesh.userData.landrushOriginalMaterial as MeshStandardMaterial
    let disposed = 0
    hitMaterial.addEventListener('dispose', () => {
      disposed += 1
    })
    expect(mesh.material).toBe(hover)
    expect(hitMaterial).not.toBe(source)
    expect(hitMaterial.color.getHexString()).toBe(new Color('#ff1738').getHexString())

    presentation.dispose()
    expect(mesh.material).toBe(hover)
    expect(mesh.userData.landrushOriginalMaterial).toBe(source)
    expect(disposed).toBe(1)

    mesh.material = mesh.userData.landrushOriginalMaterial
    delete mesh.userData.landrushOriginalMaterial
    expect(mesh.material).toBe(source)

    geometry.dispose()
    hover.dispose()
    source.dispose()
  })

  test('releases a hit material retained by hover after binding', () => {
    const source = new MeshStandardMaterial({ color: '#406080' })
    const hover = new MeshStandardMaterial({ color: '#ffffff' })
    const geometry = new BoxGeometry()
    const mesh = new Mesh(geometry, source)
    const root = new Group()
    root.add(mesh)
    const presentation = new LandrushZombieEscapePlayerHitPresentation()

    presentation.sync(root, 0)
    const hitMaterial = mesh.material
    mesh.userData.landrushOriginalMaterial = hitMaterial
    mesh.material = hover
    presentation.dispose()

    expect(mesh.material).toBe(hover)
    expect(mesh.userData.landrushOriginalMaterial).toBe(source)

    geometry.dispose()
    hover.dispose()
    source.dispose()
  })
})

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createZombieEscapeSimulation } from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { createZombieEscapeArena } from '@landrush/zombie-gameplay/zombie-escape-world'
import { createRoot, extend, unmountComponentAtNode } from '@react-three/fiber'
import { act, type ReactNode, StrictMode, use } from 'react'
import * as THREE from 'three'
import {
  ZOMBIE_ESCAPE_DEATH_DUST_VARIANTS,
  type ZombieEscapeDeathDustVariant,
} from './zombie-escape-death-dust'
import { ZombieEscapeEffectRenderBoundary, ZombieEscapeEffects } from './zombie-escape-effects'
import {
  createZombieEscapeRenderReadinessRegistry,
  getZombieEscapeRenderRepresentativeKeys,
  type ZombieEscapeRenderReadinessRegistry,
} from './zombie-escape-render-readiness'
import { createZombieEscapeImpactVisualRegistry } from './zombie-escape-skinned-impact-attachment'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  extend(THREE)
})

afterAll(() => {
  if (previousActEnvironment === undefined) delete actEnvironment.IS_REACT_ACT_ENVIRONMENT
  else actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

async function createEffectTestRoot() {
  const canvas = new EventTarget()
  const scene = new THREE.Scene()
  let drawCount = 0
  const root = createRoot(canvas)
  await root.configure({
    dpr: 1,
    frameloop: 'never',
    gl: {
      render() {
        drawCount += 1
      },
      setPixelRatio() {},
      setSize() {},
    },
    scene,
    size: { height: 64, left: 0, top: 0, width: 64 },
  })
  return {
    getDrawCount: () => drawCount,
    scene,
    async render(children: ReactNode) {
      await act(async () => {
        root.render(children)
      })
    },
    async dispose() {
      let finish!: () => void
      const disposed = new Promise<void>((resolve) => {
        finish = resolve
      })
      await act(async () => {
        unmountComponentAtNode(canvas, finish)
      })
      await disposed
    },
  }
}

function collectInstancedMeshes(root: THREE.Object3D) {
  const meshes: THREE.InstancedMesh[] = []
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) meshes.push(object)
  })
  return meshes
}

function readRepresentative(registry: ZombieEscapeRenderReadinessRegistry, key: string) {
  const representative = registry.getSnapshot().representatives.find((entry) => entry.key === key)
  if (!representative) throw new Error(`Missing mounted effect representative: ${key}`)
  return representative.root
}

function readSingleMaterial(mesh: THREE.InstancedMesh) {
  if (Array.isArray(mesh.material)) throw new Error('Expected one material per pooled effect mesh')
  return mesh.material as THREE.MeshBasicMaterial
}

function createDeferredTexture() {
  let resolve!: (texture: THREE.DataTexture) => void
  const promise = new Promise<THREE.DataTexture>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

function DeferredTexturePool({ texture }: { texture: Promise<THREE.DataTexture> }) {
  const map = use(texture)
  return (
    <instancedMesh args={[undefined, undefined, 2]} count={0}>
      <planeGeometry />
      <meshBasicMaterial map={map} />
    </instancedMesh>
  )
}

describe('mounted Zombie Escape effect readiness', () => {
  test('registers initialized real pools across registry replacement and Strict Mode remounts without adding unused variants', async () => {
    const host = await createEffectTestRoot()
    const keys = getZombieEscapeRenderRepresentativeKeys('balanced').filter((key) =>
      key.startsWith('effect:'),
    )
    const baseRegistry = createZombieEscapeRenderReadinessRegistry(keys)
    const registrations: Array<{
      counts: number[]
      hasInstanceColors: boolean[]
      key: string
      root: THREE.Object3D
    }> = []
    const registry: ZombieEscapeRenderReadinessRegistry = {
      ...baseRegistry,
      register(key, root) {
        const meshes = collectInstancedMeshes(root)
        registrations.push({
          counts: meshes.map((mesh) => mesh.count),
          hasInstanceColors: meshes.map((mesh) => mesh.instanceColor !== null),
          key,
          root,
        })
        return baseRegistry.register(key, root)
      },
    }
    const simulationRef = {
      current: createZombieEscapeSimulation(createZombieEscapeArena(72), 72, [], {
        zombieCapacity: 1,
      }),
    }
    const impactVisualRegistry = createZombieEscapeImpactVisualRegistry()
    const renderEffects = (variant: ZombieEscapeDeathDustVariant, readinessRegistry = registry) => (
      <StrictMode>
        <ZombieEscapeEffects
          deathDustVariant={variant}
          impactVisualRegistry={impactVisualRegistry}
          renderReadinessRegistry={readinessRegistry}
          simulationRef={simulationRef}
        />
      </StrictMode>
    )
    try {
      await host.render(renderEffects('alpha-hash-puffs'))
      expect(registry.getSnapshot().complete).toBe(true)
      expect(registry.getSnapshot().missingKeys).toEqual([])
      const mountedRoots = new Map(
        registry.getSnapshot().representatives.map(({ key, root }) => [key, root]),
      )
      const replacementRegistry = createZombieEscapeRenderReadinessRegistry(keys)
      await host.render(renderEffects('alpha-hash-puffs', replacementRegistry))
      expect(registry.getSnapshot().representatives).toEqual([])
      expect(replacementRegistry.getSnapshot().complete).toBe(true)
      for (const { key, root } of replacementRegistry.getSnapshot().representatives) {
        expect(root).toBe(mountedRoots.get(key))
      }
      await host.render(renderEffects('alpha-hash-puffs'))
      expect(replacementRegistry.getSnapshot().representatives).toEqual([])
      expect(registry.getSnapshot().complete).toBe(true)
      const geometryByKey = {
        'effect:carrier-accent': 'SphereGeometry',
        'effect:travel-detail': 'IcosahedronGeometry',
        'effect:travel-ribbon': 'BoxGeometry',
        'effect:muzzle-petals': 'ConeGeometry',
      }
      for (const [key, geometryType] of Object.entries(geometryByKey)) {
        const mesh = readRepresentative(registry, key) as THREE.InstancedMesh
        expect(mesh.isInstancedMesh).toBe(true)
        expect(mesh.geometry.type).toBe(geometryType)
        expect(mesh.count).toBe(0)
        expect(mesh.instanceColor).not.toBeNull()
        expect(host.scene.getObjectById(mesh.id)).toBe(mesh)
        const history = registrations.filter((entry) => entry.key === key)
        expect(history.length).toBeGreaterThanOrEqual(2)
        for (const entry of history) {
          expect(entry.root).toBe(mesh)
          expect(entry.counts).toEqual([0])
          expect(entry.hasInstanceColors).toEqual([true])
        }
      }
      let previousDustRoot: THREE.Object3D | undefined
      for (const variant of ZOMBIE_ESCAPE_DEATH_DUST_VARIANTS) {
        await host.render(renderEffects(variant))
        expect(registry.getSnapshot().complete).toBe(true)
        const dustRoot = readRepresentative(registry, 'effect:death-dust')
        expect(host.scene.getObjectById(dustRoot.id)).toBe(dustRoot)
        if (previousDustRoot) expect(dustRoot).not.toBe(previousDustRoot)
        previousDustRoot = dustRoot
        const meshes = collectInstancedMeshes(dustRoot)
        expect(meshes).toHaveLength(
          variant === 'toon-flipbook' ? 8 : variant === 'ground-clods' ? 2 : 1,
        )
        const maps = new Set<THREE.Texture>()
        for (const mesh of meshes) {
          expect(mesh.count).toBe(0)
          expect(mesh.instanceColor).toBeNull()
          const material = readSingleMaterial(mesh)
          const isTextured = variant === 'alpha-hash-puffs' || variant === 'toon-flipbook'
          expect(material.map !== null).toBe(isTextured)
          if (material.map) {
            expect(material.map).toBeInstanceOf(THREE.DataTexture)
            expect(material.map.image.data.byteLength).toBeGreaterThan(0)
            maps.add(material.map)
          }
        }
        expect(maps.size).toBe(
          variant === 'toon-flipbook' ? 8 : variant === 'alpha-hash-puffs' ? 1 : 0,
        )
      }
      expect(host.getDrawCount()).toBe(0)
      await host.render(null)
      expect(registry.getSnapshot().representatives).toEqual([])
      expect(registry.getSnapshot().missingKeys).toEqual(keys)
      await host.render(renderEffects('alpha-hash-puffs'))
      expect(registry.getSnapshot().complete).toBe(true)
      expect(readRepresentative(registry, 'effect:death-dust')).not.toBe(previousDustRoot)
      expect(host.getDrawCount()).toBe(0)
    } finally {
      await host.dispose()
    }
    expect(registry.getSnapshot().representatives).toEqual([])
  })

  test('does not register empty suspended roots and re-arms the retained root only after its replacement texture mounts', async () => {
    const host = await createEffectTestRoot()
    const registry = createZombieEscapeRenderReadinessRegistry(['effect:death-dust'])
    const first = createDeferredTexture()
    const second = createDeferredTexture()
    const firstTexture = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1)
    const secondTexture = new THREE.DataTexture(new Uint8Array([0, 255, 0, 255]), 1, 1)
    const renderDeferred = (texture: Promise<THREE.DataTexture>) => (
      <StrictMode>
        <ZombieEscapeEffectRenderBoundary registry={registry} representativeKey="effect:death-dust">
          <DeferredTexturePool texture={texture} />
        </ZombieEscapeEffectRenderBoundary>
      </StrictMode>
    )
    try {
      await host.render(renderDeferred(first.promise))
      expect(registry.getSnapshot().complete).toBe(false)
      expect(registry.getSnapshot().representatives).toEqual([])
      await act(async () => {
        first.resolve(firstTexture)
        await first.promise
      })
      expect(registry.getSnapshot().complete).toBe(true)
      const firstRoot = readRepresentative(registry, 'effect:death-dust')
      const firstMesh = collectInstancedMeshes(firstRoot)[0]!
      expect(readSingleMaterial(firstMesh).map).toBe(firstTexture)
      expect(firstMesh.count).toBe(0)
      expect(host.scene.getObjectById(firstMesh.id)).toBe(firstMesh)

      await host.render(renderDeferred(second.promise))
      expect(registry.getSnapshot().complete).toBe(false)
      expect(registry.getSnapshot().representatives).toEqual([])
      await act(async () => {
        second.resolve(secondTexture)
        await second.promise
      })
      expect(registry.getSnapshot().complete).toBe(true)
      const secondRoot = readRepresentative(registry, 'effect:death-dust')
      expect(secondRoot).toBe(firstRoot)
      const secondMesh = collectInstancedMeshes(secondRoot)[0]!
      expect(readSingleMaterial(secondMesh).map).toBe(secondTexture)
      expect(secondMesh.count).toBe(0)
      expect(host.getDrawCount()).toBe(0)
      await host.render(null)
      expect(registry.getSnapshot().representatives).toEqual([])
    } finally {
      await host.dispose()
      firstTexture.dispose()
      secondTexture.dispose()
    }
  })

  test('a texture resolving after unmount cannot publish stale effect readiness', async () => {
    const host = await createEffectTestRoot()
    const registry = createZombieEscapeRenderReadinessRegistry(['effect:death-dust'])
    const deferred = createDeferredTexture()
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    try {
      await host.render(
        <StrictMode>
          <ZombieEscapeEffectRenderBoundary
            registry={registry}
            representativeKey="effect:death-dust"
          >
            <DeferredTexturePool texture={deferred.promise} />
          </ZombieEscapeEffectRenderBoundary>
        </StrictMode>,
      )
      await host.render(null)
      const revision = registry.getSnapshot().revision
      await act(async () => {
        deferred.resolve(texture)
        await deferred.promise
      })
      expect(registry.getSnapshot().complete).toBe(false)
      expect(registry.getSnapshot().representatives).toEqual([])
      expect(registry.getSnapshot().revision).toBe(revision)
      expect(host.getDrawCount()).toBe(0)
    } finally {
      await host.dispose()
      texture.dispose()
    }
  })
})

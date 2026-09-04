import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createLandrushZombieEscapeIntegratedArenaFromPlayRadius } from './landrush-zombie-escape-arena'
import { createLandrushZombieEscapeCollisionWorldsFromCompilePayload } from './landrush-zombie-escape-collision-world-compiler'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  setZombieEscapeCollisionWorld,
  setZombieEscapeGamePhase,
  stepZombieEscapeSimulationPhysics,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'

describe('headless Zombie Escape gameplay package', () => {
  test('exports only explicit modules and keeps their dependency closure inside the pure package', () => {
    const directory = fileURLToPath(new URL('.', import.meta.url))
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    const modules = readdirSync(directory).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    )
    expect(manifest.exports['.']).toBeUndefined()
    expect(manifest.exports['./*']).toBeUndefined()
    expect(Object.keys(manifest.exports)).toHaveLength(modules.length)
    for (const name of modules) {
      const subpath = `./${name.slice(0, -3)}`
      expect(manifest.exports[subpath]).toEqual({
        types: `./src/${name}`,
        default: `./src/${name}`,
      })
      const source = readFileSync(new URL(name, import.meta.url), 'utf8')
      for (const [, specifier] of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
        if (!specifier) throw new Error(`Missing dependency specifier in ${name}`)
        if (specifier.startsWith('./')) {
          expect(modules).toContain(`${specifier.slice(2)}.ts`)
        } else {
          expect(['earcut', 'polygon-clipping']).toContain(specifier)
        }
      }
    }
  })

  test('runs the actual simulation deterministically without a browser or renderer', () => {
    const arena = createZombieEscapeArena(12345)
    const first = createZombieEscapeSimulation(arena, 9876)
    const second = createZombieEscapeSimulation(arena, 9876)
    const input = createZombieEscapeControlState()
    input.moveX = 0.6
    input.moveZ = -0.8
    input.moveStrength = 1
    input.aimX = -1
    input.aimZ = 0
    input.aimStrength = 1
    input.fire = true
    setZombieEscapeGamePhase(first, 'night')
    setZombieEscapeGamePhase(second, 'night')
    for (let tick = 0; tick < 120; tick += 1) {
      stepZombieEscapeSimulationPhysics(first, input, 1 / 60, arena)
      stepZombieEscapeSimulationPhysics(second, input, 1 / 60, arena)
    }
    expect(first.player).toEqual(second.player)
    expect(first.zombies.x).toEqual(second.zombies.x)
    expect(first.zombies.health).toEqual(second.zombies.health)
    expect(first.zombies.pool.generation).toEqual(second.zombies.pool.generation)
    expect(first.shotsFired).toBeGreaterThan(0)
    expect(first.shotsFired).toBe(second.shotsFired)
  })

  test('installs the real integrated navigation and combat compiler output', () => {
    const arena = createLandrushZombieEscapeIntegratedArenaFromPlayRadius(20)
    const state = createZombieEscapeSimulation(arena, 123, [], { requireSparseNavigation: true })
    const worlds = createLandrushZombieEscapeCollisionWorldsFromCompilePayload({
      agentRadius: 0.7,
      circles: [],
      combatBoxes: [],
      navigationBoxes: [],
      navigationConnectors: [],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'ground',
          polygon: [
            { x: -20, z: -20 },
            { x: 20, z: -20 },
            { x: 20, z: 20 },
            { x: -20, z: 20 },
          ],
        },
      ],
      objectSemantics: [],
      playRadius: 20,
      segments: [],
    })
    setZombieEscapeCollisionWorld(state, worlds.navigation, worlds.combat)
    expect(state.collisionSourceWorld).toBe(worlds.navigation)
    expect(state.combatCollisionSourceWorld).toBe(worlds.combat)
    expect(state.collisionWorld.navigationMode).toBe('sparse')
  })
})

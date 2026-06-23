import { beforeEach, describe, expect, test } from 'bun:test'
import { AnyNode, loadPlugin, nodeRegistry } from '@pascal-app/core'
import { builtinPlugin } from './index'

function getLiteralTypeValue(option: unknown): string {
  const typeSchema = (option as { shape: { type: unknown } }).shape.type as {
    def?: { innerType?: { value?: string; values?: Set<string> | string[] } }
    value?: string
    values?: Set<string> | string[]
  }
  const literalSchema = typeSchema.def?.innerType ?? typeSchema
  if (typeof literalSchema.value === 'string') return literalSchema.value
  const values = literalSchema.values
  if (values instanceof Set) return [...values][0] ?? ''
  if (Array.isArray(values)) return values[0] ?? ''
  return ''
}

describe('builtinPlugin', () => {
  beforeEach(() => {
    nodeRegistry._reset()
  })

  test('has the expected manifest shape', () => {
    expect(builtinPlugin.id).toBe('pascal:core')
    expect(builtinPlugin.apiVersion).toBe(1)
    expect(Array.isArray(builtinPlugin.nodes)).toBe(true)
  })

  test('loads the registered kinds without error', async () => {
    await loadPlugin(builtinPlugin)
    expect(nodeRegistry.has('shelf')).toBe(true)
    expect(nodeRegistry.size).toBeGreaterThanOrEqual(1)
  })

  test('every AnyNode discriminator is registered in builtinPlugin', async () => {
    // Phase 6 coverage check. The `AnyNode` discriminated union and the
    // `builtinPlugin.nodes` array are both hand-maintained today (full
    // codegen would have to run at module-load time, which loses the
    // static node typing TypeScript relies on). This test makes drift a
    // CI failure: every node `type` literal in the union must have a
    // matching `def.kind` in the plugin, and vice versa.
    //
    // When a kind is added: append it to both `core/src/schema/types.ts`
    // (the union) and `nodes/src/index.ts` (the plugin), and this test
    // will keep them honest.
    await loadPlugin(builtinPlugin)
    const unionKinds = new Set(AnyNode.options.map(getLiteralTypeValue).filter(Boolean))
    const registryKinds = new Set(Array.from(nodeRegistry.entries(), ([kind]) => kind))
    const missingFromRegistry = [...unionKinds].filter((k) => !registryKinds.has(k))
    const missingFromUnion = [...registryKinds].filter((k) => !unionKinds.has(k))
    expect(missingFromRegistry).toEqual([])
    expect(missingFromUnion).toEqual([])
  })
})

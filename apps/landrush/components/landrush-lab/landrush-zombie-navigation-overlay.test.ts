import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertZombieEscapeNavigationDebugColoredGeometryCardinality } from './zombie-escape-navigation-debug-data'

describe('Landrush Zombie Escape navigation overlay renderer contract', () => {
  test('keeps BufferGeometry lifetime under the declarative R3F owner across effect replay', () => {
    const source = readFileSync(
      join(import.meta.dir, 'landrush-zombie-navigation-overlay.tsx'),
      'utf8',
    )

    expect(source).toContain('<bufferGeometry')
    expect(source).not.toContain('.dispose(')
    expect(source).toContain('const [showFallbackRegions, setShowFallbackRegions] = useState(true)')
    expect(source).toContain('const [showFullGraph, setShowFullGraph] = useState(true)')
    expect(source).toContain('data-testid="landrush-zombie-navigation-full-graph-toggle"')
  })

  test('fails closed before a vertex-colored pipeline can receive an absent color buffer', () => {
    expect(() =>
      assertZombieEscapeNavigationDebugColoredGeometryCardinality(
        Float32Array.of(0, 0, 0, 1, 0, 0),
        Float32Array.of(1, 0, 0),
      ),
    ).toThrow('colored geometry is malformed')
    expect(() =>
      assertZombieEscapeNavigationDebugColoredGeometryCardinality(
        Float32Array.of(0, 0, 0, 1, 0, 0),
        Float32Array.of(1, 0, 0, 0, 1, 0),
      ),
    ).not.toThrow()
  })
})

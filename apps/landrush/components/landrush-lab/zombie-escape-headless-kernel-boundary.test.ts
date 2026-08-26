import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'

const KERNEL_ENTRIES = [
  'landrush-zombie-escape-collision-world-worker-transport.ts',
  'zombie-escape-navigation-scale-proof.ts',
] as const

const FORBIDDEN_RUNTIME_PACKAGES = [
  '@pascal-app',
  '@react-three',
  'next',
  'react',
  'react-dom',
  'three',
  'zustand',
] as const

describe('Zombie Escape headless kernel boundary', () => {
  test('has no browser, renderer, React, or Pascal runtime dependencies', () => {
    const root = import.meta.dir
    const closure = collectRuntimeImportClosure(KERNEL_ENTRIES.map((entry) => join(root, entry)))
    const forbidden = [...closure.packages]
      .filter((specifier) =>
        FORBIDDEN_RUNTIME_PACKAGES.some(
          (packageName) => specifier === packageName || specifier.startsWith(`${packageName}/`),
        ),
      )
      .sort()

    expect(closure.missing).toEqual([])
    expect(forbidden).toEqual([])
    expect([...closure.files]).toContain(join(root, 'zombie-escape-weapon-pickup-data.ts'))
    expect([...closure.files]).not.toContain(join(root, 'zombie-escape-weapon-placement.ts'))
    expect([...closure.packages].sort()).toEqual(['earcut', 'polygon-clipping'])
  })
})

function collectRuntimeImportClosure(entries: readonly string[]) {
  const files = new Set<string>()
  const missing: Array<Readonly<{ importer: string; specifier: string }>> = []
  const packages = new Set<string>()

  const visit = (filePath: string) => {
    if (files.has(filePath)) return
    files.add(filePath)
    const loader = filePath.endsWith('.tsx') ? 'tsx' : filePath.endsWith('.ts') ? 'ts' : 'js'
    const imports = new Bun.Transpiler({ loader }).scan(readFileSync(filePath, 'utf8')).imports
    for (const imported of imports) {
      if (!imported.path.startsWith('.')) {
        packages.add(imported.path)
        continue
      }
      const resolved = resolveLocalModule(filePath, imported.path)
      if (resolved) visit(resolved)
      else missing.push({ importer: filePath, specifier: imported.path })
    }
  }

  for (const entry of entries) visit(entry)
  return { files, missing, packages }
}

function resolveLocalModule(importer: string, specifier: string) {
  const basePath = resolve(dirname(importer), specifier)
  const candidates = extname(basePath)
    ? [basePath]
    : [
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.mjs`,
        `${basePath}.js`,
        join(basePath, 'index.ts'),
        join(basePath, 'index.tsx'),
      ]
  return candidates.find((candidate) => existsSync(candidate))
}

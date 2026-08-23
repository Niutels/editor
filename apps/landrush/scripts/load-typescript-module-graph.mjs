import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const {
  DiagnosticCategory,
  ModuleKind,
  ScriptTarget,
  SyntaxKind,
  createSourceFile,
  flattenDiagnosticMessageText,
  forEachChild,
  isCallExpression,
  isExportDeclaration,
  isImportDeclaration,
  isNamedExports,
  isNamedImports,
  isStringLiteralLike,
  transpileModule,
} = createRequire(resolve(scriptDirectory, '../../../package.json'))('typescript')

const TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts']

export async function loadTypescriptModuleGraph(entryPath, { sourceRoot } = {}) {
  const resolvedEntryPath = await realpath(entryPath)
  const resolvedSourceRoot = await realpath(sourceRoot ?? dirname(resolvedEntryPath))
  assertInsideSourceRoot(resolvedSourceRoot, resolvedEntryPath)

  const modules = await collectModuleGraph(resolvedEntryPath, resolvedSourceRoot)
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'landrush-typescript-module-'))

  try {
    const outputPaths = new Map(
      [...modules.keys()]
        .sort()
        .map((sourcePath, index) => [sourcePath, join(temporaryDirectory, `module-${index}.mjs`)]),
    )

    const emittedModules = [...modules.entries()].map(([sourcePath, moduleRecord]) => {
      const rewrittenSource = rewriteLocalModuleSpecifiers(
        moduleRecord,
        outputPaths.get(sourcePath),
        outputPaths,
      )
      const result = transpileModule(rewrittenSource, {
        compilerOptions: {
          module: ModuleKind.ESNext,
          target: ScriptTarget.ES2022,
        },
        fileName: sourcePath,
        reportDiagnostics: true,
      })
      const errors = (result.diagnostics ?? []).filter(
        ({ category }) => category === DiagnosticCategory.Error,
      )
      if (errors.length > 0) {
        throw new Error(
          `Failed to transpile ${sourcePath}:\n${errors
            .map((diagnostic) => formatDiagnostic(diagnostic))
            .join('\n')}`,
        )
      }
      return { outputPath: outputPaths.get(sourcePath), outputText: result.outputText }
    })

    for (const { outputPath, outputText } of emittedModules) {
      await writeFile(outputPath, outputText, 'utf8')
    }

    return await import(pathToFileURL(outputPaths.get(resolvedEntryPath)).href)
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}

async function collectModuleGraph(entryPath, sourceRoot) {
  const modules = new Map()

  async function collect(sourcePath) {
    if (modules.has(sourcePath)) return

    const source = await readFile(sourcePath, 'utf8')
    const references = collectModuleReferences(sourcePath, source)
    const moduleRecord = { references: [], source }
    modules.set(sourcePath, moduleRecord)

    for (const reference of references) {
      if (!isRelativeModuleSpecifier(reference.specifier)) {
        if (reference.runtime && !reference.specifier.startsWith('node:')) {
          throw new Error(
            `Unsupported non-local runtime import "${reference.specifier}" in ${sourcePath}`,
          )
        }
        continue
      }

      const dependencyPath = await resolveLocalTypescriptModule(
        sourcePath,
        reference.specifier,
        sourceRoot,
      )
      moduleRecord.references.push({ ...reference, dependencyPath })
      await collect(dependencyPath)
    }
  }

  await collect(entryPath)
  return modules
}

function collectModuleReferences(sourcePath, source) {
  const sourceFile = createSourceFile(sourcePath, source, ScriptTarget.Latest, true)
  const references = []

  const addReference = (literal, runtime) => {
    if (!isStringLiteralLike(literal)) return
    references.push({
      end: literal.getEnd(),
      runtime,
      specifier: literal.text,
      start: literal.getStart(sourceFile),
    })
  }

  const visit = (node) => {
    if (isImportDeclaration(node)) {
      addReference(node.moduleSpecifier, importDeclarationHasRuntimeValue(node))
      return
    }
    if (isExportDeclaration(node) && node.moduleSpecifier) {
      addReference(node.moduleSpecifier, exportDeclarationHasRuntimeValue(node))
      return
    }
    if (isCallExpression(node) && node.expression.kind === SyntaxKind.ImportKeyword) {
      throw new Error(`Dynamic imports are not supported in ${sourcePath}`)
    }
    forEachChild(node, visit)
  }

  visit(sourceFile)
  return references
}

function importDeclarationHasRuntimeValue(node) {
  const clause = node.importClause
  if (!clause) return true
  if (clause.isTypeOnly) return false
  if (clause.name) return true
  if (!clause.namedBindings || !isNamedImports(clause.namedBindings)) return true
  return clause.namedBindings.elements.some((element) => !element.isTypeOnly)
}

function exportDeclarationHasRuntimeValue(node) {
  if (node.isTypeOnly) return false
  if (!node.exportClause || !isNamedExports(node.exportClause)) return true
  return node.exportClause.elements.some((element) => !element.isTypeOnly)
}

async function resolveLocalTypescriptModule(containingPath, specifier, sourceRoot) {
  const unresolvedPath = resolve(dirname(containingPath), specifier)
  for (const candidatePath of moduleCandidates(unresolvedPath)) {
    try {
      const resolvedPath = await realpath(candidatePath)
      if (!(await stat(resolvedPath)).isFile()) continue
      assertInsideSourceRoot(sourceRoot, resolvedPath)
      return resolvedPath
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') continue
      throw error
    }
  }
  throw new Error(`Cannot resolve local TypeScript import "${specifier}" from ${containingPath}`)
}

function moduleCandidates(unresolvedPath) {
  const extension = extname(unresolvedPath)
  if (!extension) {
    return [
      ...TYPESCRIPT_EXTENSIONS.map(
        (candidateExtension) => `${unresolvedPath}${candidateExtension}`,
      ),
      ...TYPESCRIPT_EXTENSIONS.map((candidateExtension) =>
        join(unresolvedPath, `index${candidateExtension}`),
      ),
    ]
  }
  if (extension === '.js') return [`${unresolvedPath.slice(0, -3)}.ts`, unresolvedPath]
  if (extension === '.mjs') return [`${unresolvedPath.slice(0, -4)}.mts`, unresolvedPath]
  if (extension === '.cjs') return [`${unresolvedPath.slice(0, -4)}.cts`, unresolvedPath]
  return [unresolvedPath]
}

function rewriteLocalModuleSpecifiers(moduleRecord, outputPath, outputPaths) {
  let source = moduleRecord.source
  const edits = moduleRecord.references
    .map(({ dependencyPath, end, start }) => ({
      end,
      replacement: JSON.stringify(
        relativeModuleSpecifier(outputPath, outputPaths.get(dependencyPath)),
      ),
      start,
    }))
    .sort((left, right) => right.start - left.start)

  for (const { end, replacement, start } of edits) {
    source = `${source.slice(0, start)}${replacement}${source.slice(end)}`
  }
  return source
}

function relativeModuleSpecifier(fromPath, toPath) {
  const path = relative(dirname(fromPath), toPath).replaceAll('\\', '/')
  return path.startsWith('.') ? path : `./${path}`
}

function assertInsideSourceRoot(sourceRoot, path) {
  const fromRoot = relative(sourceRoot, path)
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`TypeScript module ${path} is outside source root ${sourceRoot}`)
  }
}

function isRelativeModuleSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../')
}

function formatDiagnostic(diagnostic) {
  const message = flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  if (!diagnostic.file || diagnostic.start === undefined) return message
  const { character, line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
  return `${diagnostic.file.fileName}:${line + 1}:${character + 1}: ${message}`
}

import { copyFile, link, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const editorRoot = resolve(appRoot, '..', 'editor')
const manifestPath = join(appRoot, '.generated', 'pascal-assets.json')
const mirrors = [
  {
    destination: join(appRoot, 'public'),
    id: 'public',
    source: join(editorRoot, 'public'),
  },
  {
    destination: join(appRoot, 'app', 'fonts'),
    id: 'fonts',
    source: join(editorRoot, 'app', 'fonts'),
  },
]

const previousManifest = await readManifest()
const nextManifest = { version: 1, mirrors: {} }

for (const mirror of mirrors) {
  const sourceFiles = await listFiles(mirror.source)
  const relativeFiles = sourceFiles.map((path) => relative(mirror.source, path))
  const previousFiles = previousManifest.mirrors[mirror.id] ?? []

  for (const staleRelativePath of previousFiles.filter(
    (path) => !relativeFiles.includes(path),
  )) {
    await rm(join(mirror.destination, staleRelativePath), { force: true })
  }

  for (const sourcePath of sourceFiles) {
    const relativePath = relative(mirror.source, sourcePath)
    const destinationPath = join(mirror.destination, relativePath)
    await mirrorFile(sourcePath, destinationPath, previousFiles.includes(relativePath))
  }

  nextManifest.mirrors[mirror.id] = relativeFiles
}

await mirrorFile(
  join(editorRoot, 'app', 'favicon.ico'),
  join(appRoot, 'app', 'favicon.ico'),
  previousManifest.favicon === true,
)
nextManifest.favicon = true

await mkdir(dirname(manifestPath), { recursive: true })
await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`)
console.log(
  `Mirrored ${Object.values(nextManifest.mirrors).flat().length + 1} Pascal assets into Landrush`,
)

async function mirrorFile(sourcePath, destinationPath, previouslyGenerated) {
  await mkdir(dirname(destinationPath), { recursive: true })
  try {
    const destination = await readFile(destinationPath)
    const source = await readFile(sourcePath)
    if (!previouslyGenerated && !destination.equals(source)) {
      throw new Error(
        `Landrush asset conflicts with Pascal owner: ${relative(appRoot, destinationPath)}`,
      )
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  await rm(destinationPath, { force: true })
  try {
    await link(sourcePath, destinationPath)
  } catch (error) {
    if (!['EACCES', 'EPERM', 'EXDEV', 'ENOSYS'].includes(error?.code)) throw error
    await copyFile(sourcePath, destinationPath)
  }
}

async function listFiles(root) {
  const files = []
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(path)))
    else if (entry.isFile()) files.push(path)
  }
  return files.sort()
}

async function readManifest() {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (parsed?.version === 1 && parsed.mirrors && typeof parsed.mirrors === 'object') {
      return parsed
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn(`Ignoring invalid Pascal asset manifest: ${error}`)
  }
  return { version: 1, mirrors: {} }
}

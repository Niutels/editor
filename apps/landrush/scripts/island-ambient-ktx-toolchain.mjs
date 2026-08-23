import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { delimiter, dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const REPOSITORY_ROOT = resolve(import.meta.dirname, '../../..')
const MAX_TOOL_OUTPUT_BYTES = 64 * 1024 * 1024

export const PINNED_KTX_SOFTWARE = Object.freeze({
  archiveFileName: 'KTX-Software-4.4.2-Linux-x86_64.tar.bz2',
  archiveSha256: 'a8781bad05f9624edbf910b7f258cd0a4ba7d3e63b49ecc0a0ab440bf6a0a245',
  archiveUrl:
    'https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Linux-x86_64.tar.bz2',
  executable: Object.freeze({
    archiveMember: 'KTX-Software-4.4.2-Linux-x86_64/bin/ktx',
    sha256: '2028e023a18e827e66362a9e184052f40192566b10f92655a337e2eb8ea0829b',
  }),
  library: Object.freeze({
    archiveMember: 'KTX-Software-4.4.2-Linux-x86_64/lib/libktx.so.4.4.2',
    sha256: '0792dd32ce7d2a101d614a3d1dc1f2b4297869d9cab5d7f0bb4fee304c4c9bcc',
  }),
  version: '4.4.2',
})

let preparedToolchainPromise

export function pinnedKtxCachePaths(
  cacheRoot = resolve(
    REPOSITORY_ROOT,
    '.landrush-local/tooling/ktx-software',
    PINNED_KTX_SOFTWARE.version,
    'linux-x64',
  ),
) {
  return {
    archivePath: resolve(cacheRoot, PINNED_KTX_SOFTWARE.archiveFileName),
    binDirectory: resolve(cacheRoot, 'bin'),
    cacheRoot,
    executablePath: resolve(cacheRoot, 'bin/ktx'),
    libraryDirectory: resolve(cacheRoot, 'lib'),
    libraryPath: resolve(cacheRoot, 'lib/libktx.so.4'),
  }
}

export async function preparePinnedKtxSoftware({ cacheRoot, repair = true } = {}) {
  if (!cacheRoot && repair) {
    preparedToolchainPromise ??= preparePinnedKtxSoftwareOnce({ repair })
    return preparedToolchainPromise
  }
  return preparePinnedKtxSoftwareOnce({ cacheRoot, repair })
}

async function preparePinnedKtxSoftwareOnce({ cacheRoot, repair }) {
  assertSupportedHost()
  const paths = pinnedKtxCachePaths(cacheRoot)
  await mkdir(paths.cacheRoot, { recursive: true })
  await ensurePinnedArchive(paths.archivePath, repair)

  const executableCurrent = await fileMatchesSha256(
    paths.executablePath,
    PINNED_KTX_SOFTWARE.executable.sha256,
  )
  const libraryCurrent = await fileMatchesSha256(
    paths.libraryPath,
    PINNED_KTX_SOFTWARE.library.sha256,
  )
  if (!(executableCurrent && libraryCurrent)) {
    if (!repair) {
      throw new Error('Pinned KTX-Software cache is incomplete or has been modified.')
    }
    const [executable, library] = await Promise.all([
      extractArchiveMember(paths.archivePath, PINNED_KTX_SOFTWARE.executable.archiveMember),
      extractArchiveMember(paths.archivePath, PINNED_KTX_SOFTWARE.library.archiveMember),
    ])
    assertSha256(
      'KTX executable extracted from the pinned archive',
      executable,
      PINNED_KTX_SOFTWARE.executable.sha256,
    )
    assertSha256(
      'KTX shared library extracted from the pinned archive',
      library,
      PINNED_KTX_SOFTWARE.library.sha256,
    )
    await Promise.all([
      atomicWrite(paths.executablePath, executable),
      atomicWrite(paths.libraryPath, library),
    ])
  }
  if (process.platform === 'linux') await chmod(paths.executablePath, 0o755)

  const toolchain = {
    ...paths,
    executableSha256: PINNED_KTX_SOFTWARE.executable.sha256,
    librarySha256: PINNED_KTX_SOFTWARE.library.sha256,
    version: PINNED_KTX_SOFTWARE.version,
    wslExecutablePath: process.platform === 'win32' ? windowsPathToWsl(paths.executablePath) : null,
    wslLibraryDirectory:
      process.platform === 'win32' ? windowsPathToWsl(paths.libraryDirectory) : null,
  }
  const version = await readPinnedKtxVersion(toolchain)
  if (version !== PINNED_KTX_SOFTWARE.version) {
    throw new Error(
      `Pinned KTX-Software archive should provide ${PINNED_KTX_SOFTWARE.version}; received ${version ?? 'unknown'}.`,
    )
  }
  return toolchain
}

export function pinnedKtxEnvironment(toolchain, baseEnvironment = process.env) {
  if (process.platform !== 'linux') {
    throw new Error('The KTX encoder environment is only entered in the native Linux worker.')
  }
  return {
    ...baseEnvironment,
    LD_LIBRARY_PATH: [toolchain.libraryDirectory, baseEnvironment.LD_LIBRARY_PATH]
      .filter(Boolean)
      .join(delimiter),
    PATH: [toolchain.binDirectory, baseEnvironment.PATH].filter(Boolean).join(delimiter),
  }
}

export async function withPinnedKtxEnvironment(toolchain, operation) {
  const previousPath = process.env.PATH
  const previousLibraryPath = process.env.LD_LIBRARY_PATH
  const environment = pinnedKtxEnvironment(toolchain)
  process.env.PATH = environment.PATH
  process.env.LD_LIBRARY_PATH = environment.LD_LIBRARY_PATH
  try {
    return await operation()
  } finally {
    restoreEnvironmentVariable('PATH', previousPath)
    restoreEnvironmentVariable('LD_LIBRARY_PATH', previousLibraryPath)
  }
}

export function assertSha256(label, body, expectedSha256) {
  const actualSha256 = sha256(body)
  if (actualSha256 !== expectedSha256) {
    throw new Error(`${label} SHA-256 mismatch: expected ${expectedSha256}, received ${actualSha256}.`)
  }
  return actualSha256
}

export function windowsPathToWsl(path) {
  const match = /^([a-z]):[\\/](.*)$/iu.exec(path)
  if (!match) {
    throw new Error(`Cannot map non-drive Windows path into WSL: ${path}`)
  }
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`
}

async function ensurePinnedArchive(archivePath, repair) {
  try {
    const body = await readFile(archivePath)
    assertSha256('Cached KTX-Software archive', body, PINNED_KTX_SOFTWARE.archiveSha256)
    return
  } catch (error) {
    if (error?.code !== 'ENOENT' && !repair) throw error
    if (!repair) throw new Error(`Pinned KTX-Software archive is missing: ${archivePath}.`)
  }

  const response = await fetch(PINNED_KTX_SOFTWARE.archiveUrl)
  if (!response.ok) {
    throw new Error(
      `Could not download pinned KTX-Software ${PINNED_KTX_SOFTWARE.version}: HTTP ${response.status}.`,
    )
  }
  const body = Buffer.from(await response.arrayBuffer())
  assertSha256('Downloaded KTX-Software archive', body, PINNED_KTX_SOFTWARE.archiveSha256)
  await atomicWrite(archivePath, body)
}

async function extractArchiveMember(archivePath, member) {
  const command = process.platform === 'win32' ? 'wsl.exe' : 'tar'
  const arguments_ =
    process.platform === 'win32'
      ? ['--exec', 'tar', '-xOjf', windowsPathToWsl(archivePath), member]
      : ['-xOjf', archivePath, member]
  try {
    const { stdout } = await execFileAsync(command, arguments_, {
      encoding: 'buffer',
      maxBuffer: MAX_TOOL_OUTPUT_BYTES,
      windowsHide: true,
    })
    return Buffer.from(stdout)
  } catch (error) {
    throw new Error(`Could not extract ${member} from the pinned KTX-Software archive.`, {
      cause: error,
    })
  }
}

async function readPinnedKtxVersion(toolchain) {
  const command = process.platform === 'win32' ? 'wsl.exe' : toolchain.executablePath
  const arguments_ =
    process.platform === 'win32'
      ? [
          '--exec',
          'env',
          `LD_LIBRARY_PATH=${toolchain.wslLibraryDirectory}`,
          toolchain.wslExecutablePath,
          '--version',
        ]
      : ['--version']
  const environment =
    process.platform === 'linux' ? pinnedKtxEnvironment(toolchain) : process.env
  try {
    const { stderr, stdout } = await execFileAsync(command, arguments_, {
      env: environment,
      windowsHide: true,
    })
    return `${stdout ?? ''}${stderr ?? ''}`.match(/v?(\d+\.\d+\.\d+)/u)?.[1] ?? null
  } catch (error) {
    throw new Error('The executable extracted from the pinned KTX-Software archive did not run.', {
      cause: error,
    })
  }
}

async function fileMatchesSha256(path, expectedSha256) {
  try {
    return sha256(await readFile(path)) === expectedSha256
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function atomicWrite(destination, body) {
  await mkdir(dirname(destination), { recursive: true })
  const temporaryPath = `${destination}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, body)
  try {
    await rename(temporaryPath, destination)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

function assertSupportedHost() {
  const nodeMajorVersion = Number.parseInt(process.versions.node.split('.')[0], 10)
  if (nodeMajorVersion < 20) throw new Error('Island ambient optimization requires Node.js 20 or newer.')
  if (process.arch !== 'x64' || !['linux', 'win32'].includes(process.platform)) {
    throw new Error(
      `Pinned KTX-Software is available for Linux x64 and Windows x64 with WSL; received ${process.platform} ${process.arch}.`,
    )
  }
}

function restoreEnvironmentVariable(name, value) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

#!/usr/bin/env node

import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractColdEntryBuildId } from './landrush-cold-entry.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const flags = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index]
  const value = process.argv[index + 1]
  if (!['--bundle', '--port', '--expected-build-id'].includes(name) || !value) {
    throw new Error('Expected --bundle <exported static directory> --port <port> --expected-build-id <id>')
  }
  flags.set(name, value)
}
const bundle = path.resolve(flags.get('--bundle') ?? '')
const port = Number(flags.get('--port'))
if (!flags.has('--bundle') || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('An explicit bundle directory and valid unprivileged port are required')
}
const route = 'landrush-lab/pascal-multiplayer-island/index.html'
const buildId = extractColdEntryBuildId(await readFile(path.join(bundle, route), 'utf8'))
if (buildId !== flags.get('--expected-build-id')) throw new Error('Published bundle build ID mismatch')
const publicRoot = path.join(repo, 'apps/landrush/public')
const types = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.ktx2': 'image/ktx2',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
}))

const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405).end()
      return
    }
    const url = new URL(request.url, `http://localhost:${port}`)
    if (url.pathname === '/api/health') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ app: 'landrush', mode: 'production', serving: 'production-static-artifact', buildId }))
      return
    }
    const pathname = decodeURIComponent(url.pathname)
    if (pathname.includes('\\') || pathname.includes('\0')) throw new Error('Invalid asset path')
    let relative = pathname.replace(/^\/+/, '')
    if (relative === 'landrush-lab/pascal-multiplayer-island' || relative === 'landrush-lab/pascal-multiplayer-island/') relative = route
    const root = relative.startsWith('_next/') || relative === route ? bundle : publicRoot
    const file = path.resolve(root, relative)
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Asset path outside its root')
    const info = await stat(file)
    if (!info.isFile()) throw new Error('Not a file')
    response.writeHead(200, { 'Content-Type': types.get(path.extname(file)) ?? 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' })
    if (request.method === 'HEAD') response.end()
    else createReadStream(file).on('error', () => response.destroy()).pipe(response)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
  }
})
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ pid: process.pid, port, buildId, serving: 'production-static-artifact' }) + '\n')
})
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)))

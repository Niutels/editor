import { networkInterfaces } from 'node:os'
import type { NextConfig } from 'next'

const lanDevOrigins = Array.from(
  new Set(
    Object.values(networkInterfaces())
      .flatMap((interfaces) => interfaces ?? [])
      .filter(
        (networkInterface) => networkInterface.family === 'IPv4' && !networkInterface.internal,
      )
      .map((networkInterface) => networkInterface.address),
  ),
)

const landrushWorldMultiplayerWebSocketUrl =
  process.env.NEXT_PUBLIC_LANDRUSH_WORLD_MULTIPLAYER_WS_URL ??
  'wss://landrush.157-230-223-22.sslip.io/api/landrush-lab/world-multiplayer/ws'
const landrushNextDistDir = process.env.LANDRUSH_NEXT_DIST_DIR?.trim() || '.next'

const nextConfig: NextConfig = {
  allowedDevOrigins: lanDevOrigins,
  distDir: landrushNextDistDir,
  env: {
    NEXT_PUBLIC_LANDRUSH_WORLD_MULTIPLAYER_WS_URL: landrushWorldMultiplayerWebSocketUrl,
  },
  logging: {
    browserToTerminal: true,
  },
  transpilePackages: [
    'three',
    '@landrush/pascal-host',
    '@landrush/pascal-plugin',
    '@landrush/protocol',
    '@landrush/runtime',
    '@pascal-app/viewer',
    '@pascal-app/core',
    '@pascal-app/editor',
    '@pascal-app/mcp',
    '@pascal-app/plugin-trees',
    '@dgreenheck/ez-tree',
  ],
  turbopack: {
    resolveAlias: {
      react: './node_modules/react',
      three: './node_modules/three',
      '@react-three/fiber': './node_modules/@react-three/fiber',
      '@react-three/drei': './node_modules/@react-three/drei',
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  images: {
    unoptimized: process.env.NEXT_PUBLIC_ASSETS_CDN_URL?.startsWith('http://localhost') ?? false,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
}

export default nextConfig

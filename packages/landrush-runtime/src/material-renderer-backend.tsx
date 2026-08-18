'use client'

import { useThree } from '@react-three/fiber'

export type MaterialRendererBackend = 'webgl' | 'webgpu'

let materialRendererBackend: MaterialRendererBackend = 'webgpu'

export function getMaterialRendererBackend(): MaterialRendererBackend {
  return materialRendererBackend
}

export function LandrushMaterialRendererBackendBridge() {
  const renderer = useThree((state) => state.gl)
  const backend = (renderer as unknown as { backend?: { constructor?: { name?: string } } }).backend
  materialRendererBackend = backend?.constructor?.name?.toLowerCase().includes('webgl')
    ? 'webgl'
    : 'webgpu'
  return null
}

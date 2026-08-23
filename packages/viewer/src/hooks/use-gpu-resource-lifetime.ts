import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import {
  type DisposableGpuResource,
  type GpuResourceRenderer,
  gpuResourceLifetimeManager,
} from '../lib/gpu-resource-lifetime'

export function useGpuResourceLifetime(resource: DisposableGpuResource | null | undefined): void {
  const renderer = useThree((state) => state.gl) as unknown as GpuResourceRenderer

  useEffect(() => gpuResourceLifetimeManager.retain(resource, renderer), [renderer, resource])
}

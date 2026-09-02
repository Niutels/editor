import { ZombieShoulderTorchDebugClient } from '@/components/landrush-lab/zombie-shoulder-torch-debug-client'
import { parseZombieShoulderTorchDebugQuery } from '@/components/landrush-lab/zombie-shoulder-torch-debug-state'

export const metadata = {
  title: 'Zombie Shoulder Torch Debug · Landrush Lab',
}

export default async function ZombieShoulderTorchDebugPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const parameters = await searchParams
  const initialState = parseZombieShoulderTorchDebugQuery(parameters)
  return (
    <ZombieShoulderTorchDebugClient
      initialAngle={initialState.angle}
      initialCameraDistance={initialState.cameraDistance}
      initialMode={initialState.mode}
    />
  )
}

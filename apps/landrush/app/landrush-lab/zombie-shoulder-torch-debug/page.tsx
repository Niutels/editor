import {
  ZombieShoulderTorchDebugClient,
  type ZombieShoulderTorchDebugMode,
  type ZombieShoulderTorchDebugView,
} from '@/components/landrush-lab/zombie-shoulder-torch-debug-client'

export const metadata = {
  title: 'Zombie Shoulder Torch Debug · Landrush Lab',
}

export default async function ZombieShoulderTorchDebugPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const parameters = await searchParams
  return (
    <ZombieShoulderTorchDebugClient
      mode={resolveDebugMode(parameters.mode)}
      view={resolveDebugView(parameters.view)}
    />
  )
}

function resolveDebugView(value: string | string[] | undefined): ZombieShoulderTorchDebugView {
  const requested = Array.isArray(value) ? value[0] : value
  if (
    requested === 'mounted' ||
    requested === 'beam' ||
    requested === 'origin-front' ||
    requested === 'origin-right' ||
    requested === 'origin-rear' ||
    requested === 'origin-top'
  ) {
    return requested
  }
  return 'designs'
}

function resolveDebugMode(value: string | string[] | undefined): ZombieShoulderTorchDebugMode {
  const requested = Array.isArray(value) ? value[0] : value
  if (requested === 'fixture-only' || requested === 'light-only') return requested
  return 'final'
}

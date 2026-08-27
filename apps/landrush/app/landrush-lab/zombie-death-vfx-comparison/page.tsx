import {
  ZombieDeathVfxComparisonClient,
  type ZombieDeathVfxComparisonMotion,
} from '@/components/landrush-lab/zombie-death-vfx-comparison-client'
import { resolveZombieEscapeDeathDustVariant } from '@/components/landrush-lab/zombie-escape-death-dust'

export const metadata = {
  title: 'Zombie Death VFX Comparison · Landrush Lab',
}

export default async function ZombieDeathVfxComparisonPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const parameters = await searchParams
  return (
    <ZombieDeathVfxComparisonClient
      motion={resolveComparisonMotion(parameters.motion)}
      variant={resolveZombieEscapeDeathDustVariant(parameters.variant)}
    />
  )
}

function resolveComparisonMotion(
  value: string | string[] | undefined,
): ZombieDeathVfxComparisonMotion {
  const requestedMotion = Array.isArray(value) ? value[0] : value
  return requestedMotion === 'attack-walk' ? 'attack-walk' : 'death'
}

import { ZombieRenderScaleClient } from '@/components/landrush-lab/zombie-render-scale-client'

export const metadata = {
  title: 'Zombie Render Scale · Landrush Lab',
}

function resolveZombieCount(value: string | string[] | undefined) {
  const parsed = Number(Array.isArray(value) ? value[0] : value)
  if (!Number.isFinite(parsed)) return 16
  return Math.min(100, Math.max(0, Math.trunc(parsed)))
}

function resolvePresentation(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) === 'authored-instanced'
    ? ('authored-instanced' as const)
    : ('exact' as const)
}

export default async function ZombieRenderScalePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const parameters = await searchParams
  return (
    <ZombieRenderScaleClient
      count={resolveZombieCount(parameters.zombieCount)}
      presentation={resolvePresentation(parameters.presentation)}
    />
  )
}

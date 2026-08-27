import { ZombieShootingDebugClient } from '@/components/landrush-lab/zombie-shooting-debug-client'
import { ZombieWeaponMechanicsDebugClient } from '@/components/landrush-lab/zombie-weapon-mechanics-debug-client'

export const metadata = {
  title: 'All-Weapon Zombie Hit Debug · Landrush Lab',
}

export default async function ZombieShootingDebugPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const parameters = (await searchParams) ?? {}
  if (parameters.mechanics === '1') return <ZombieWeaponMechanicsDebugClient />
  return <ZombieShootingDebugClient />
}

import { Suspense } from 'react'
import { ZombieWeaponRecoilDebugClient } from '@/components/landrush-lab/zombie-weapon-recoil-debug-client'

export const metadata = {
  title: 'Held-Trigger Weapon Recoil Debug · Landrush Lab',
}

export default function ZombieWeaponRecoilDebugPage() {
  return (
    <Suspense fallback={<ZombieWeaponRecoilDebugFallback />}>
      <ZombieWeaponRecoilDebugClient />
    </Suspense>
  )
}

function ZombieWeaponRecoilDebugFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#07101b] text-slate-100">
      <p className="text-sm text-slate-400">Preparing held-trigger recoil proof…</p>
    </main>
  )
}

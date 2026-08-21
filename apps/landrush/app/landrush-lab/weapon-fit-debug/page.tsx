import { Suspense } from 'react'
import { WeaponFitDebugClient } from '@/components/landrush-lab/weapon-fit-debug-client'

export const metadata = {
  title: 'Weapon Fit Debug · Landrush Lab',
}

export default function WeaponFitDebugPage() {
  return (
    <Suspense fallback={<WeaponFitDebugFallback />}>
      <WeaponFitDebugClient />
    </Suspense>
  )
}

function WeaponFitDebugFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#090e17] text-slate-100">
      <div className="rounded-2xl border border-white/10 bg-slate-900/90 px-5 py-4 shadow-2xl">
        <p className="font-semibold text-cyan-200 text-xs uppercase tracking-[0.22em]">
          Weapon fit lab
        </p>
        <p className="mt-2 text-slate-400 text-sm">Preparing deterministic debug scene…</p>
      </div>
    </main>
  )
}

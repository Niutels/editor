'use client'

import dynamic from 'next/dynamic'

const LandrushPascalShell = dynamic(
  () =>
    import('@/components/landrush/landrush-pascal-shell').then(
      (module) => module.LandrushPascalShell,
    ),
  {
    ssr: false,
    loading: () => <div className="h-screen w-screen bg-sky-950" />,
  },
)

export function LandrushClient() {
  return <LandrushPascalShell />
}

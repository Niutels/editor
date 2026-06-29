'use client'

import { usePathname } from 'next/navigation'
import { lazy, Suspense } from 'react'

const Agentation = lazy(() =>
  import('agentation').then((module) => ({ default: module.Agentation })),
)

export function DevAgentation() {
  const pathname = usePathname()
  if (pathname?.startsWith('/landrush')) return null

  return (
    <Suspense fallback={null}>
      <Agentation />
    </Suspense>
  )
}

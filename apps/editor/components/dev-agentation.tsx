'use client'

import { Agentation } from 'agentation'
import { usePathname } from 'next/navigation'

export function DevAgentation() {
  const pathname = usePathname()
  if (pathname?.startsWith('/landrush')) return null

  return <Agentation />
}

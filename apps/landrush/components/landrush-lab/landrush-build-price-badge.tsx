import { cn } from '@/lib/utils'
import { resolveLandrushBuildPricePresentation } from './landrush-build-price-presentation'

export function LandrushBuildPriceBadge({
  className,
  kind,
}: {
  className?: string
  kind: string | null | undefined
}) {
  const price = resolveLandrushBuildPricePresentation(kind)
  if (!price) return null

  return (
    <span
      className={cn(
        'pointer-events-none z-10 shrink-0 rounded-md border border-white/20 bg-black/80 px-1.5 py-1 font-mono font-semibold text-[10px] text-white leading-none shadow-sm',
        className,
      )}
      data-landrush-build-kind={kind}
      data-landrush-build-price={price.label}
      title={price.ariaLabel}
    >
      {price.label}
    </span>
  )
}

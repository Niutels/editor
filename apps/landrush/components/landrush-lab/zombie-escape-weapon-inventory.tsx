import type { ReactNode } from 'react'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'

const ZOMBIE_ESCAPE_WEAPON_INVENTORY_SLOTS = ZOMBIE_ESCAPE_WEAPON_CATALOG.map(
  (weapon, weaponIndex) => ({
    displayName: weapon.displayName,
    id: weapon.id,
    mask: 1 << weaponIndex,
    previewPath: `/landrush-lab/zombie-escape/assets/weapons/previews/${weapon.id}.png`,
    weaponIndex,
  }),
)

const ZOMBIE_ESCAPE_WEAPON_INVENTORY_MASK = (1 << ZOMBIE_ESCAPE_WEAPON_INVENTORY_SLOTS.length) - 1

export function ZombieEscapeWeaponInventoryRow({
  className = '',
  weaponIndex,
  weaponInventoryMask,
}: {
  className?: string
  weaponIndex: number
  weaponInventoryMask: number
}) {
  const inventoryMask = sanitizeWeaponInventoryMask(weaponInventoryMask)
  if (inventoryMask === 0) return null

  const slots: ReactNode[] = []
  for (const weapon of ZOMBIE_ESCAPE_WEAPON_INVENTORY_SLOTS) {
    if ((inventoryMask & weapon.mask) === 0) continue
    const active = weapon.weaponIndex === weaponIndex
    slots.push(
      <div
        aria-current={active ? 'true' : undefined}
        aria-label={`${weapon.displayName}${active ? ', equipped' : ''}`}
        className={`relative grid size-[clamp(4.125rem,16.5vw,4.875rem)] shrink-0 place-items-center overflow-hidden rounded-lg border shadow-lg [@media(any-pointer:coarse)]:size-[clamp(3.09375rem,12.375vw,3.65625rem)] ${
          active
            ? 'border-cyan-100/90 bg-cyan-950/82 ring-2 ring-cyan-200/85 shadow-cyan-950/45'
            : 'border-white/20 bg-slate-950/72 shadow-slate-950/40'
        }`}
        data-active={active ? 'true' : 'false'}
        data-weapon-id={weapon.id}
        data-weapon-inventory-slot="true"
        key={weapon.id}
        role="listitem"
      >
        <img
          alt={weapon.displayName}
          className="size-full object-contain p-1"
          decoding="async"
          draggable={false}
          src={weapon.previewPath}
        />
      </div>,
    )
  }

  return (
    <div
      aria-label="Weapon inventory"
      className={`pointer-events-none flex items-center gap-1.5 ${className}`}
      data-testid="zombie-escape-weapon-inventory"
      role="list"
    >
      {slots}
    </div>
  )
}

function sanitizeWeaponInventoryMask(weaponInventoryMask: number) {
  if (!Number.isFinite(weaponInventoryMask) || weaponInventoryMask <= 0) return 0
  return Math.trunc(weaponInventoryMask) & ZOMBIE_ESCAPE_WEAPON_INVENTORY_MASK
}

import { describe, expect, test } from 'bun:test'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from '@landrush/zombie-gameplay/zombie-escape-weapon-catalog'
import { renderToStaticMarkup } from 'react-dom/server'
import { ZombieEscapeWeaponInventoryRow } from './zombie-escape-weapon-inventory'

describe('ZombieEscapeWeaponInventoryRow', () => {
  test('renders only owned weapon previews in stable catalog order', () => {
    const markup = renderToStaticMarkup(
      <ZombieEscapeWeaponInventoryRow weaponIndex={2} weaponInventoryMask={0b10101} />,
    )

    expect(markup.match(/data-weapon-inventory-slot="true"/g)).toHaveLength(3)
    expect(markup).toContain('data-weapon-id="sunflare-pistol"')
    expect(markup).toContain('data-weapon-id="driftwood-scattergun"')
    expect(markup).toContain('data-weapon-id="tidebreak-launcher"')
    expect(markup).not.toContain('data-weapon-id="reef-carbine"')
    expect(markup).not.toContain('data-weapon-id="storm-coil-repeater"')
    expect(markup.indexOf('sunflare-pistol.png')).toBeLessThan(
      markup.indexOf('driftwood-scattergun.png'),
    )
    expect(markup.indexOf('driftwood-scattergun.png')).toBeLessThan(
      markup.indexOf('tidebreak-launcher.png'),
    )
  })

  test('uses the existing transparent preview contract for every catalog weapon', () => {
    const markup = renderToStaticMarkup(
      <ZombieEscapeWeaponInventoryRow weaponIndex={0} weaponInventoryMask={0b11111} />,
    )

    for (const weapon of ZOMBIE_ESCAPE_WEAPON_CATALOG) {
      expect(markup).toContain(
        `src="/landrush-lab/zombie-escape/assets/weapons/previews/${weapon.id}.png"`,
      )
      expect(markup).toContain(`alt="${weapon.displayName}"`)
    }
  })

  test('keeps the row backgroundless with 25% smaller coarse-pointer squares', () => {
    const markup = renderToStaticMarkup(
      <ZombieEscapeWeaponInventoryRow
        className="absolute bottom-safe left-safe"
        weaponIndex={1}
        weaponInventoryMask={0b00011}
      />,
    )
    const rowTag = markup.match(/<div[^>]*data-testid="zombie-escape-weapon-inventory"[^>]*>/)?.[0]
    const slotTags = markup.match(/<div[^>]*data-weapon-inventory-slot="true"[^>]*>/g) ?? []
    const activeTag = markup.match(/<div[^>]*data-weapon-id="reef-carbine"[^>]*>/)?.[0]

    expect(rowTag).toBeDefined()
    expect(rowTag).toContain('absolute bottom-safe left-safe')
    expect(rowTag).not.toMatch(/\bbg-/)
    expect(markup).toContain('bg-slate-950/72')
    expect(markup).toContain('bg-cyan-950/82')
    expect(slotTags).toHaveLength(2)
    expect(slotTags.every((tag) => tag.includes('size-[clamp(4.125rem,16.5vw,4.875rem)]'))).toBe(
      true,
    )
    expect(
      slotTags.every((tag) =>
        tag.includes('[@media(any-pointer:coarse)]:size-[clamp(3.09375rem,12.375vw,3.65625rem)]'),
      ),
    ).toBe(true)
    expect(markup).not.toContain('size-[clamp(2.75rem,11vw,3.25rem)]')
    expect(activeTag).toContain('aria-current="true"')
    expect(activeTag).toContain('data-active="true"')
    expect(activeTag).toContain('ring-2')
  })

  test.each([0, Number.NaN, -1])('omits an invalid or empty inventory mask: %p', (mask) => {
    expect(
      renderToStaticMarkup(
        <ZombieEscapeWeaponInventoryRow weaponIndex={0} weaponInventoryMask={mask} />,
      ),
    ).toBe('')
  })
})

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./landrush-island-client.tsx', import.meta.url), 'utf8')

function readComponent(name: string, nextName: string) {
  const start = source.indexOf(`function ${name}(`)
  const end = source.indexOf(`function ${nextName}(`, start)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('Landrush island map marker frame work', () => {
  test('keeps hidden and stable-opacity frames traversal-free', () => {
    const local = readComponent(
      'LandrushIslandMapPlayerMarker',
      'LandrushIslandRemoteMapPlayerMarker',
    )
    const remote = readComponent(
      'LandrushIslandRemoteMapPlayerMarker',
      'LandrushIslandMapBadgeMarker',
    )

    expect(local.indexOf('if (!visible)')).toBeLessThan(local.indexOf('const motion ='))
    expect(remote.indexOf('if (!visible)')).toBeLessThan(remote.indexOf('const targetOpacity ='))
    for (const marker of [local, remote]) {
      expect(marker).toMatch(
        /if \(opacityChanged \|\| warmupOpacityRestorePending\) \{\s+setLandrushIslandGroupMaterialOpacity\(group, targetOpacity\)\s+\}/,
      )
      expect(marker).toMatch(
        /group\.visible = targetOpacity > 0\.002[\s\S]+applyLandrushIslandMapOverlayWarmup\(group, warmupRef\)/,
      )
    }
    expect(local).toMatch(
      /if \(opacityChanged\) \{[\s\S]+labelRef\.current\.style\.opacity = String\(targetOpacity\)[\s\S]+\}/,
    )
    expect(remote.indexOf('if (targetOpacity > 0.002)')).toBeLessThan(
      remote.indexOf('getPresentationSnapshot'),
    )
  })

  test('sleeps parcel claim presentation after one hidden-edge cleanup', () => {
    const parcelClaim = readComponent(
      'LandrushIslandParcelClaimMesh',
      'LandrushIslandParcelBuildMarker',
    )
    const hiddenGuard = parcelClaim.indexOf('if (!mapPresentationVisible)')
    const opacityWork = parcelClaim.indexOf('const opacityAmount =')

    expect(parcelClaim).toContain(
      'const wasMapPresentationVisibleRef = useRef(mapPresentationVisible)',
    )
    expect(hiddenGuard).toBeGreaterThanOrEqual(0)
    expect(hiddenGuard).toBeLessThan(opacityWork)

    const hiddenBranch = parcelClaim.slice(hiddenGuard, opacityWork)
    expect(hiddenBranch).toContain('if (wasMapPresentationVisibleRef.current)')
    expect(hiddenBranch).toContain('group.scale.setScalar(1)')
    expect(hiddenBranch).toContain('material.opacity = 0')
    expect(hiddenBranch).toContain('material.color.lerpColors(baseColor, hoverColor, 0.12)')
    expect(hiddenBranch).toContain('contourMaterial.opacity = 0')
    expect(hiddenBranch).toContain("freeBadgeRef.current.style.opacity = '0'")
    expect(hiddenBranch).toContain('group.visible = false')
    expect(hiddenBranch).toMatch(/wasMapPresentationVisibleRef\.current = false\s+return/)
    expect(parcelClaim.indexOf('MathUtils.damp(')).toBeGreaterThan(hiddenGuard)
    expect(parcelClaim.indexOf('Math.sin(')).toBeGreaterThan(hiddenGuard)
    expect(parcelClaim).toMatch(
      /if \(mapPresentationVisible\) applyLandrushIslandMapOverlayWarmup\(group, warmupRef\)/,
    )
  })
})

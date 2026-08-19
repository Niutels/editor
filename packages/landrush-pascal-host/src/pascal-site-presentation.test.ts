import { describe, expect, test } from 'bun:test'
import { Group, Mesh } from 'three'
import {
  type PascalSitePresentationVisibility,
  restorePascalSitePresentation,
  suppressPascalSitePresentation,
} from './pascal-site-presentation'

describe('Pascal site presentation adapter', () => {
  test('hides site-owned presentation while preserving registered construction children', () => {
    const site = new Group()
    const building = new Group()
    const ground = new Mesh()
    const horizon = new Mesh()
    site.add(building, ground, horizon)
    const savedVisibility: PascalSitePresentationVisibility = new Map()

    expect(suppressPascalSitePresentation(site, [building], savedVisibility)).toBe(2)
    expect(building.visible).toBe(true)
    expect(ground.visible).toBe(false)
    expect(horizon.visible).toBe(false)

    restorePascalSitePresentation(savedVisibility)
    expect(ground.visible).toBe(true)
    expect(horizon.visible).toBe(true)
  })

  test('preserves a wrapper that hosts a registered construction child', () => {
    const site = new Group()
    const constructionWrapper = new Group()
    const building = new Group()
    const presentation = new Mesh()
    constructionWrapper.add(building)
    site.add(constructionWrapper, presentation)
    const savedVisibility: PascalSitePresentationVisibility = new Map()

    suppressPascalSitePresentation(site, [building], savedVisibility)

    expect(constructionWrapper.visible).toBe(true)
    expect(presentation.visible).toBe(false)
  })
})

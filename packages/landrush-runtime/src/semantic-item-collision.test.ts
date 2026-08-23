import { describe, expect, test } from 'bun:test'
import {
  LANDRUSH_ITEM_SUPPORT_SURFACE_THICKNESS_METERS,
  resolveLandrushSemanticItemCollisionProfile,
} from './semantic-item-collision'

describe('semantic item collision profile', () => {
  test('models an open table as only its standable top slab', () => {
    const profile = resolveLandrushSemanticItemCollisionProfile({
      dimensions: [2.5, 0.8, 1],
      scale: [1.2, 1, 0.5],
      surfaceHeight: 0.8,
      tags: ['floor', 'table', 'dining'],
    })

    expect(profile).toEqual({
      depth: 0.5,
      maximumY: 0.8,
      minimumY: 0.8 - LANDRUSH_ITEM_SUPPORT_SURFACE_THICKNESS_METERS,
      shape: 'support-surface',
      width: 3,
    })
  })

  test('keeps storage furniture solid and omits attached or low-profile items', () => {
    expect(
      resolveLandrushSemanticItemCollisionProfile({
        dimensions: [2, 0.8, 1],
        scale: [1, 1, 1],
        surfaceHeight: 0.75,
        tags: ['table', 'storage'],
      }),
    ).toEqual({ depth: 1, maximumY: 0.75, minimumY: 0, shape: 'solid', width: 2 })
    expect(
      resolveLandrushSemanticItemCollisionProfile({
        attachTo: 'wall',
        dimensions: [1, 1, 1],
        scale: [1, 1, 1],
      }),
    ).toBeNull()
    expect(
      resolveLandrushSemanticItemCollisionProfile({
        dimensions: [1, 0.05, 1],
        scale: [1, 1, 1],
      }),
    ).toBeNull()
  })
})

import { describe, expect, test } from 'bun:test'
import {
  createLandrushZombieEscapeNavigationScaleProofCacheKey,
  isLandrushZombieEscapeNavigationScaleProofFixtureCaptureReady,
  shouldEnableLandrushZombieEscapeNavigationScaleProof,
  shouldEnableLandrushZombieEscapeNavigationScaleProofFixtureCapture,
  shouldEnableLandrushZombieNavigationOverlay,
  shouldPublishLandrushZombieEscapeIntegratedDebugState,
} from './landrush-zombie-escape-mode'

describe('Landrush Zombie Escape navigation scale proof bridge gate', () => {
  test('publishes integrated debug state only for benchmark runs', () => {
    expect(shouldPublishLandrushZombieEscapeIntegratedDebugState('')).toBe(false)
    expect(shouldPublishLandrushZombieEscapeIntegratedDebugState('?game=zombie-escape')).toBe(false)
    expect(shouldPublishLandrushZombieEscapeIntegratedDebugState('?bench=1')).toBe(true)
    expect(shouldPublishLandrushZombieEscapeIntegratedDebugState('?bench=0')).toBe(false)
  })

  test('requires both the benchmark and dedicated proof query flags', () => {
    expect(
      shouldEnableLandrushZombieEscapeNavigationScaleProof('?bench=1&landrushNavScaleProof=1'),
    ).toBe(true)
    expect(shouldEnableLandrushZombieEscapeNavigationScaleProof('?landrushNavScaleProof=1')).toBe(
      false,
    )
    expect(shouldEnableLandrushZombieEscapeNavigationScaleProof('?bench=1')).toBe(false)
    expect(
      shouldEnableLandrushZombieEscapeNavigationScaleProof('?bench=0&landrushNavScaleProof=1'),
    ).toBe(false)
  })

  test('keeps the visual overlay behind an explicit query flag', () => {
    expect(shouldEnableLandrushZombieNavigationOverlay('')).toBe(false)
    expect(shouldEnableLandrushZombieNavigationOverlay('?game=zombie-escape')).toBe(false)
    expect(shouldEnableLandrushZombieNavigationOverlay('?landrushNavOverlay=1')).toBe(true)
    expect(shouldEnableLandrushZombieNavigationOverlay('?navOverlay=1')).toBe(true)
    expect(shouldEnableLandrushZombieNavigationOverlay('?landrushNavOverlay=0')).toBe(false)
    expect(shouldEnableLandrushZombieNavigationOverlay('?navOverlay=0')).toBe(false)
    expect(shouldEnableLandrushZombieNavigationOverlay('?landrushNavDebug=1')).toBe(false)
    expect(shouldEnableLandrushZombieNavigationOverlay('?bench=1&landrushNavScaleProof=1')).toBe(
      false,
    )
  })

  test('keeps payload capture separately gated and authenticates the authoritative source world', () => {
    expect(
      shouldEnableLandrushZombieEscapeNavigationScaleProofFixtureCapture(
        '?bench=1&landrushNavFixtureCapture=1',
      ),
    ).toBe(true)
    expect(
      shouldEnableLandrushZombieEscapeNavigationScaleProofFixtureCapture(
        '?landrushNavFixtureCapture=1',
      ),
    ).toBe(false)

    const compiledSourceWorld = {}
    const activeViewWorld = {}
    const input = {
      buildReady: true,
      captureEnabled: true,
      compilationSignature: 'compiled-a',
      desiredSignature: 'compiled-a',
      effectiveNavigationWorld: activeViewWorld,
      installedNavigationWorld: compiledSourceWorld,
      installedSignature: 'compiled-a',
      sourceNavigationWorld: compiledSourceWorld,
    }
    expect(isLandrushZombieEscapeNavigationScaleProofFixtureCaptureReady(input)).toBe(true)
    expect(
      isLandrushZombieEscapeNavigationScaleProofFixtureCaptureReady({
        ...input,
        sourceNavigationWorld: {},
      }),
    ).toBe(false)
    expect(
      isLandrushZombieEscapeNavigationScaleProofFixtureCaptureReady({
        ...input,
        effectiveNavigationWorld: null,
      }),
    ).toBe(false)
  })

  test('keys successful single-flight results by live world generation and integrity state', () => {
    const input = {
      collisionWorldGeneration: 4,
      collisionWorldSignature: 'scene-signature-a',
      world: { activationRevision: 2, revision: 'world-a', semanticKey: 'compiled-a' },
    }
    const baseline = createLandrushZombieEscapeNavigationScaleProofCacheKey(input)

    expect(createLandrushZombieEscapeNavigationScaleProofCacheKey(input)).toBe(baseline)
    expect(
      createLandrushZombieEscapeNavigationScaleProofCacheKey({
        ...input,
        collisionWorldGeneration: 5,
      }),
    ).not.toBe(baseline)
    expect(
      createLandrushZombieEscapeNavigationScaleProofCacheKey({
        ...input,
        collisionWorldSignature: 'scene-signature-b',
      }),
    ).not.toBe(baseline)
    expect(
      createLandrushZombieEscapeNavigationScaleProofCacheKey({
        ...input,
        world: { ...input.world, activationRevision: 3 },
      }),
    ).not.toBe(baseline)
    expect(
      createLandrushZombieEscapeNavigationScaleProofCacheKey({
        ...input,
        world: { ...input.world, revision: 'world-b' },
      }),
    ).not.toBe(baseline)
    expect(
      createLandrushZombieEscapeNavigationScaleProofCacheKey({
        ...input,
        world: { ...input.world, semanticKey: 'compiled-b' },
      }),
    ).not.toBe(baseline)
  })
})

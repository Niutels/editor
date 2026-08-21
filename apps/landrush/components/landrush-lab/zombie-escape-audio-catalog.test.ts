import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeAudioCatalogState,
  ZOMBIE_ESCAPE_AUDIO_ASSETS_READY,
  ZOMBIE_ESCAPE_AUDIO_CATALOG,
} from './zombie-escape-audio-catalog'
import catalog from './zombie-escape-audio-catalog.json'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'

describe('Zombie Escape audio catalog', () => {
  test('defines deterministic generated paths and exactly one shot cue per weapon', () => {
    const paths = ZOMBIE_ESCAPE_AUDIO_CATALOG.cues.flatMap((cue) => cue.files)
    const shotCues = ZOMBIE_ESCAPE_AUDIO_CATALOG.cues.filter(
      (cue) => cue.eventKind === 'shot-fired',
    )

    expect(paths).toHaveLength(22)
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.every((path) => path.startsWith('/audios/sfx/zombie-escape/'))).toBe(true)
    expect(ZOMBIE_ESCAPE_AUDIO_ASSETS_READY).toBe(true)
    expect(shotCues.map((cue) => cue.weaponId)).toEqual(
      ZOMBIE_ESCAPE_WEAPON_CATALOG.map((weapon) => weapon.id),
    )
  })

  test('activates only when provenance covers every exact catalog artifact', () => {
    const artifacts = Object.fromEntries(
      catalog.cues.flatMap((cue) =>
        cue.files.map((path, variantIndex) => [
          path,
          {
            bitRateBps: 192_000,
            byteLength: 1024,
            channels: 2,
            codecName: 'mp3',
            cueId: cue.id,
            durationSeconds: cue.durationSeconds,
            generatedAt: '2026-08-20T00:00:00.000Z',
            path,
            requestId: null,
            requestedDurationSeconds: cue.durationSeconds,
            sampleRateHz: 48_000,
            sha256: 'a'.repeat(64),
            source: 'elevenlabs-web',
            traceId: null,
            variantIndex,
          },
        ]),
      ),
    )
    const ready = createZombieEscapeAudioCatalogState(catalog, {
      artifacts,
      catalogSha256: 'b'.repeat(64),
      catalogVersion: catalog.catalogVersion,
      generatedAt: '2026-08-20T00:00:00.000Z',
      generationSettings: {
        promptImprovement: false,
        sharedWithExplore: false,
      },
      schemaVersion: 1,
      source: 'elevenlabs-web',
    })
    expect(ready.assetsReady).toBe(true)

    delete artifacts[catalog.cues[0]!.files[0]!]
    const incomplete = createZombieEscapeAudioCatalogState(catalog, {
      artifacts,
      catalogSha256: 'b'.repeat(64),
      catalogVersion: catalog.catalogVersion,
      generatedAt: '2026-08-20T00:00:00.000Z',
      generationSettings: {
        promptImprovement: false,
        sharedWithExplore: false,
      },
      schemaVersion: 1,
      source: 'elevenlabs-web',
    })
    expect(incomplete.assetsReady).toBe(false)
  })

  test('requires exactly one cue for every non-shot semantic event', () => {
    const missing = structuredClone(catalog)
    missing.cues = missing.cues.filter((cue) => cue.eventKind !== 'enemy-hit')
    expect(() => createZombieEscapeAudioCatalogState(missing, {})).toThrow(
      'exactly one cue per non-shot event kind',
    )

    const duplicate = structuredClone(catalog)
    const enemyHit = duplicate.cues.find((cue) => cue.eventKind === 'enemy-hit')!
    duplicate.cues.push({
      ...enemyHit,
      files: ['/audios/sfx/zombie-escape/enemy/duplicate-hit-0.mp3'],
      id: 'enemy-hit-duplicate',
    })
    expect(() => createZombieEscapeAudioCatalogState(duplicate, {})).toThrow(
      'Duplicate Zombie Escape audio event kind: enemy-hit',
    )
  })
})

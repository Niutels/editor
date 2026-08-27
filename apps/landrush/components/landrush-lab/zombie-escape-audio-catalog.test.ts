import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeAudioCatalogState,
  ZOMBIE_ESCAPE_AUDIO_ASSETS_READY,
  ZOMBIE_ESCAPE_AUDIO_CATALOG,
  ZOMBIE_ESCAPE_PLAYER_JUMP_AUDIO_CUE,
  ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
} from './zombie-escape-audio-catalog'
import catalog from './zombie-escape-audio-catalog.json'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'

describe('Zombie Escape audio catalog', () => {
  test('defines deterministic generated paths and exactly one shot cue per weapon', () => {
    const eventPaths = ZOMBIE_ESCAPE_AUDIO_CATALOG.cues.flatMap((cue) => cue.files)
    const paths = [
      ...eventPaths,
      ...ZOMBIE_ESCAPE_AUDIO_CATALOG.movementCues.flatMap((cue) => cue.files),
      ...ZOMBIE_ESCAPE_AUDIO_CATALOG.presenceCues.flatMap((cue) => cue.files),
    ]
    const shotCues = ZOMBIE_ESCAPE_AUDIO_CATALOG.cues.filter(
      (cue) => cue.eventKind === 'shot-fired',
    )

    expect(eventPaths).toHaveLength(22)
    expect(paths).toHaveLength(27)
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.every((path) => path.startsWith('/audios/sfx/zombie-escape/'))).toBe(true)
    expect(ZOMBIE_ESCAPE_AUDIO_ASSETS_READY).toBe(true)
    expect(shotCues.map((cue) => cue.weaponId)).toEqual(
      ZOMBIE_ESCAPE_WEAPON_CATALOG.map((weapon) => weapon.id),
    )
    expect(Object.fromEntries(shotCues.map((cue) => [cue.weaponId, cue.playback.volume]))).toEqual({
      'driftwood-scattergun': 0.9,
      'reef-carbine': 0.74,
      'storm-coil-repeater': 0.46,
      'sunflare-pistol': 0.58,
      'tidebreak-launcher': 1,
    })
    expect(ZOMBIE_ESCAPE_PLAYER_JUMP_AUDIO_CUE.files).toEqual([
      '/audios/sfx/zombie-escape/player/jump-0.mp3',
      '/audios/sfx/zombie-escape/player/jump-1.mp3',
    ])
    expect(ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE.files).toEqual([
      '/audios/sfx/zombie-escape/enemy/presence-0.mp3',
      '/audios/sfx/zombie-escape/enemy/presence-1.mp3',
      '/audios/sfx/zombie-escape/enemy/presence-2.mp3',
    ])
  })

  test('requires explicit mastered prompts for all three zombie sound families', () => {
    expect(catalog.schemaVersion).toBe(4)
    expect(catalog.catalogVersion).toBe('2026-08-26.1')
    const rawZombieCues = [
      catalog.cues.find((cue) => cue.id === 'enemy-hit')!,
      catalog.cues.find((cue) => cue.id === 'enemy-death')!,
      catalog.presenceCues.find((cue) => cue.id === 'enemy-presence')!,
    ]
    const runtimeZombieCues = [
      ZOMBIE_ESCAPE_AUDIO_CATALOG.cues.find((cue) => cue.id === 'enemy-hit')!,
      ZOMBIE_ESCAPE_AUDIO_CATALOG.cues.find((cue) => cue.id === 'enemy-death')!,
      ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE,
    ]

    for (const [index, cue] of rawZombieCues.entries()) {
      expect(cue.files).toHaveLength(3)
      expect(cue.variantPrompts).toHaveLength(cue.files.length)
      expect(cue.variantPrompts.every((prompt) => prompt.length <= 450)).toBe(true)
      expect(
        new Set(
          cue.variantPrompts.map((prompt) =>
            prompt.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase(),
          ),
        ).size,
      ).toBe(3)
      expect(cue.masteringProfile).toBe('one-shot-v1')
      expect(cue.playback.referenceDistance).toBe(2.5)
      expect(runtimeZombieCues[index]?.variantPrompts).toEqual(cue.variantPrompts)
      expect(runtimeZombieCues[index]?.masteringProfile).toBe('one-shot-v1')
    }
  })

  test('rejects missing, duplicate, and overlong zombie variant prompts', () => {
    const missing = structuredClone(catalog)
    missing.cues.find((cue) => cue.id === 'enemy-hit')!.variantPrompts.pop()
    expect(() => createZombieEscapeAudioCatalogState(missing, {})).toThrow(
      'variantPrompts must match its three files',
    )

    const duplicate = structuredClone(catalog)
    const duplicateDeath = duplicate.cues.find((cue) => cue.id === 'enemy-death')!
    duplicateDeath.variantPrompts[1] = `  ${duplicateDeath.variantPrompts[0]!.toUpperCase()}  `
    expect(() => createZombieEscapeAudioCatalogState(duplicate, {})).toThrow(
      'variantPrompts must be unique after normalization',
    )

    const overlong = structuredClone(catalog)
    overlong.presenceCues[0]!.variantPrompts[2] = 'x'.repeat(451)
    expect(() => createZombieEscapeAudioCatalogState(overlong, {})).toThrow(
      'must be at most 450 characters',
    )
  })

  test('activates only when provenance covers every exact catalog artifact', () => {
    const artifacts = Object.fromEntries(
      [...catalog.cues, ...catalog.movementCues, ...catalog.presenceCues].flatMap((cue) =>
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
            mastering:
              'masteringProfile' in cue && cue.masteringProfile === 'one-shot-v1'
                ? {
                    algorithm: 'ffmpeg-crest-loudnorm-v1',
                    crestPreconditioner:
                      'acompressor=threshold=0.015:ratio=4:attack=0.1:release=60:knee=2.828:makeup=1',
                    inputIntegratedLoudnessLufs: -30,
                    inputSha256: 'c'.repeat(64),
                    inputTruePeakDbfs: -10,
                    normalizationTruePeakDbfs: -2.2,
                    outputBitRateBps: 128_000,
                    outputIntegratedLoudnessLufs: -20,
                    outputSampleRateHz: 44_100,
                    outputTruePeakDbfs: -1.5,
                    processedAt: '2026-08-20T00:00:00.000Z',
                    profile: 'one-shot-v1',
                    targetIntegratedLoudnessLufs: -20,
                    targetTruePeakDbfs: -1.5,
                  }
                : null,
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
      schemaVersion: 2,
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
      schemaVersion: 2,
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
      files: [
        '/audios/sfx/zombie-escape/enemy/duplicate-hit-0.mp3',
        '/audios/sfx/zombie-escape/enemy/duplicate-hit-1.mp3',
        '/audios/sfx/zombie-escape/enemy/duplicate-hit-2.mp3',
      ],
      id: 'enemy-hit-duplicate',
    })
    expect(() => createZombieEscapeAudioCatalogState(duplicate, {})).toThrow(
      'Duplicate Zombie Escape audio event kind: enemy-hit',
    )
  })

  test('keeps jump audio in the movement contract instead of the simulation event ring', () => {
    expect(ZOMBIE_ESCAPE_AUDIO_CATALOG.cues.some((cue) => cue.id === 'player-jump')).toBe(false)
    expect(ZOMBIE_ESCAPE_PLAYER_JUMP_AUDIO_CUE.movementKind).toBe('jump')

    const missing = structuredClone(catalog)
    missing.movementCues = []
    expect(() => createZombieEscapeAudioCatalogState(missing, {})).toThrow('requires movement cues')

    const duplicate = structuredClone(catalog)
    duplicate.movementCues.push({
      ...duplicate.movementCues[0]!,
      files: ['/audios/sfx/zombie-escape/player/duplicate-jump-0.mp3'],
      id: 'player-jump-duplicate',
    })
    expect(() => createZombieEscapeAudioCatalogState(duplicate, {})).toThrow(
      'Duplicate Zombie Escape movement cue: jump',
    )
  })

  test('requires one independently scheduled three-variant zombie presence cue', () => {
    expect(ZOMBIE_ESCAPE_AUDIO_CATALOG.cues.some((cue) => cue.id === 'enemy-presence')).toBe(false)
    expect(ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE).toMatchObject({
      presenceKind: 'zombie-vocalization',
      schedule: {
        initialDelaySeconds: [0.35, 2.8],
        intervalSeconds: [3.8, 7],
        rangeHysteresisMeters: 2,
      },
    })

    const missing = structuredClone(catalog)
    missing.presenceCues = []
    expect(() => createZombieEscapeAudioCatalogState(missing, {})).toThrow('requires presence cues')

    const wrongVariantCount = structuredClone(catalog)
    wrongVariantCount.presenceCues[0]!.files.pop()
    expect(() => createZombieEscapeAudioCatalogState(wrongVariantCount, {})).toThrow(
      'must contain exactly three variants',
    )

    const invalidSchedule = structuredClone(catalog)
    invalidSchedule.presenceCues[0]!.schedule.intervalSeconds = [7, 3.8]
    expect(() => createZombieEscapeAudioCatalogState(invalidSchedule, {})).toThrow(
      'intervalSeconds is invalid',
    )
  })
})

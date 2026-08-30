// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  advanceSceneReadinessState,
  getSceneReadinessBlockerNames,
  type SceneReadinessState,
  shouldWaitForSceneReadiness,
} from './scene-readiness'

describe('scene readiness blockers', () => {
  test('checks throttled roof work before reusing a ready scene', () => {
    const roofBuildWorkSource = readFileSync(
      new URL('../../systems/roof/roof-build-work.ts', import.meta.url),
      'utf8',
    ).replaceAll('\r\n', '\n')
    const roofSystemSource = readFileSync(
      new URL('../../systems/roof/roof-system.tsx', import.meta.url),
      'utf8',
    ).replaceAll('\r\n', '\n')
    const viewerSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8').replaceAll(
      '\r\n',
      '\n',
    )

    expect(roofBuildWorkSource).toContain(
      'export function hasPendingRoofBuildWork() {\n  return pendingRoofUpdates.size > 0\n}',
    )
    expect(roofSystemSource).toContain('for (const id of roofBuildWorkQueue)')
    expect(viewerSource).toContain("from '../../systems/roof/roof-build-work'")
    expect(viewerSource).not.toContain("from '../../systems/roof/roof-system'")

    const buildWorkFunctionStart = viewerSource.indexOf('function hasPendingSceneBuildWork()')
    const buildWorkFunctionEnd = viewerSource.indexOf(
      'function hasCommittedSceneRoot()',
      buildWorkFunctionStart,
    )
    const buildWorkFunction = viewerSource.slice(buildWorkFunctionStart, buildWorkFunctionEnd)
    expect(buildWorkFunction).not.toContain('hasPendingRoofBuildWork')

    const trackerStart = viewerSource.indexOf('function SceneReadyTracker(')
    const trackerEnd = viewerSource.indexOf('\n  return null\n}', trackerStart)
    const trackerSource = viewerSource.slice(trackerStart, trackerEnd)
    const roofBuildWorkRead = trackerSource.indexOf(
      'const roofBuildWork = hasPendingRoofBuildWork()',
    )
    const readyFastPath = trackerSource.indexOf('readinessStateRef.current.ready &&')
    const buildWorkRead = trackerSource.indexOf(
      'const buildWork = roofBuildWork || hasPendingSceneBuildWork()',
    )
    const blockersRead = trackerSource.indexOf('getSceneReadinessBlockerNames({')

    expect(roofBuildWorkRead).toBeGreaterThan(-1)
    expect(readyFastPath).toBeGreaterThan(roofBuildWorkRead)
    expect(buildWorkRead).toBeGreaterThan(-1)
    expect(buildWorkRead).toBeGreaterThan(readyFastPath)
    expect(blockersRead).toBeGreaterThan(buildWorkRead)
    expect(trackerSource.slice(readyFastPath, buildWorkRead)).toContain('!roofBuildWork')
    expect(trackerSource.slice(blockersRead, blockersRead + 160)).toContain('buildWork,')
  })

  test('waits for host content, scene build, and material settlement', () => {
    const blockers = getSceneReadinessBlockerNames({
      buildWork: true,
      committedRoot: true,
      failedMaterialTextures: 0,
      pendingMaterialTextures: 2,
      prerequisitesReady: false,
    })

    expect(blockers).toEqual(['host-prerequisites', 'scene-build', 'material-textures-pending'])
    expect(shouldWaitForSceneReadiness(blockers, false)).toBe(true)
  })

  test('requires the full settled-frame window after scene build work drains', () => {
    let state: SceneReadinessState = { key: 'authority-a', ready: true, settledFrames: 2 }
    const advance = (buildWork: boolean) => {
      state = advanceSceneReadinessState(state, {
        blockers: buildWork ? ['scene-build'] : [],
        capReached: false,
        key: 'authority-a',
        settledFramesRequired: 2,
      })
    }

    advance(true)
    expect(state).toEqual({ key: 'authority-a', ready: false, settledFrames: 0 })
    advance(false)
    expect(state).toEqual({ key: 'authority-a', ready: false, settledFrames: 1 })
    advance(false)
    expect(state).toEqual({ key: 'authority-a', ready: true, settledFrames: 2 })
  })

  test('is ready only when every normal blocker has cleared', () => {
    const blockers = getSceneReadinessBlockerNames({
      buildWork: false,
      committedRoot: true,
      failedMaterialTextures: 0,
      pendingMaterialTextures: 0,
      prerequisitesReady: true,
    })

    expect(blockers).toEqual([])
    expect(shouldWaitForSceneReadiness(blockers, false)).toBe(false)
  })

  test('never releases host prerequisites after the bounded cap', () => {
    const blockers = getSceneReadinessBlockerNames({
      buildWork: true,
      committedRoot: false,
      failedMaterialTextures: 0,
      pendingMaterialTextures: 1,
      prerequisitesReady: false,
    })

    expect(shouldWaitForSceneReadiness(blockers, true)).toBe(true)
  })

  test('keeps pending textures strict after the cap but releases terminal failures degraded', () => {
    const blockers = getSceneReadinessBlockerNames({
      buildWork: true,
      committedRoot: false,
      failedMaterialTextures: 1,
      pendingMaterialTextures: 1,
      prerequisitesReady: true,
    })

    expect(blockers).toEqual([
      'scene-root',
      'scene-build',
      'material-textures-pending',
      'material-textures-failed',
    ])
    expect(shouldWaitForSceneReadiness(blockers, true)).toBe(true)

    expect(
      shouldWaitForSceneReadiness(
        getSceneReadinessBlockerNames({
          buildWork: true,
          committedRoot: false,
          failedMaterialTextures: 1,
          pendingMaterialTextures: 0,
          prerequisitesReady: true,
        }),
        true,
      ),
    ).toBe(false)
  })

  test('transitions ready to prerequisite false and becomes ready again after settlement', () => {
    let state: SceneReadinessState = { key: 'authority-a', ready: false, settledFrames: 0 }
    const advance = (blockers: string[]) => {
      state = advanceSceneReadinessState(state, {
        blockers,
        capReached: false,
        key: 'authority-a',
        settledFramesRequired: 2,
      })
    }

    advance([])
    advance([])
    expect(state.ready).toBe(true)
    advance(['host-prerequisites'])
    expect(state.ready).toBe(false)
    advance([])
    advance([])
    expect(state.ready).toBe(true)
  })

  test('authority-key changes reset a ready scene before it can settle again', () => {
    const ready: SceneReadinessState = {
      key: '7:world-a',
      ready: true,
      settledFrames: 2,
    }
    const reset = advanceSceneReadinessState(ready, {
      blockers: [],
      capReached: false,
      key: '8:world-a',
      settledFramesRequired: 2,
    })

    expect(reset).toEqual({ key: '8:world-a', ready: false, settledFrames: 1 })
  })
})

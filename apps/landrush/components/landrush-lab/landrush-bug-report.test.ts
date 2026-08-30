import { describe, expect, test } from 'bun:test'
import {
  createLandrushBugReportFileName,
  createLandrushBugReportReplayUrl,
  type LandrushBugReport,
  parseLandrushBugReport,
  parseLandrushBugReportJson,
  resolveLandrushCanvasPixelRatio,
} from './landrush-bug-report'

function createReport(): LandrushBugReport {
  return {
    app: {
      experience: 'pascal-multiplayer-island',
      url: 'http://localhost:3002/landrush-lab/pascal-multiplayer-island',
    },
    camera: {
      distance: 18,
      pitch: 0.8,
      position: [4, 8, 12],
      quaternion: [0, 0, 0, 1],
      target: [1, 1.28, 2],
      yaw: 0.4,
      zoom: null,
    },
    capturedAt: '2026-08-12T14:30:15.120Z',
    diagnostics: {},
    floor: {
      buildingId: 'building_house',
      levelId: 'level_upper',
      levelNumber: 1,
      scopeId: 'parcel:parcel-02',
    },
    format: 'landrush-bug-report',
    mode: {
      buildParcelId: null,
      fpv: false,
      view: 'player',
    },
    player: {
      cameraTargetY: 3,
      falling: false,
      heading: 1.2,
      moving: false,
      position: [1, 3.04, 2],
      profile: { color: '#7dd3fc', id: 'builder', name: 'Builder' },
      speed: 0,
      velocity: [0, 0, 0],
    },
    save: {
      builds: [
        {
          nodes: [],
          parcelId: 'parcel-02',
          updatedAt: 1,
          updatedBy: 'builder',
          worldId: 'world-1',
        },
      ],
      id: 'room-1:world-1',
      ownerships: [],
      roomId: 'room-1',
      source: 'multiplayer',
      tvMediaStates: [],
      worldId: 'world-1',
    },
    scene: { nodeCount: 12, rootNodeIds: ['site'] },
    screenshot: {
      dataUrl: 'data:image/png;base64,AAAA',
      height: 720,
      mimeType: 'image/png',
      pixelRatio: 1,
      width: 1280,
    },
    version: 1,
  }
}

describe('Landrush bug reports', () => {
  test('accepts a self-contained report that can be replayed', () => {
    const report = createReport()
    expect(parseLandrushBugReportJson(JSON.stringify(report))).toEqual({ ok: true, report })
  })

  test('rejects JSON without an embedded screenshot', () => {
    const report = createReport()
    report.screenshot.dataUrl = ''
    expect(parseLandrushBugReport(report)).toEqual({
      error: 'The report does not contain a PNG screenshot.',
      ok: false,
    })
  })

  test('rejects incomplete replay context before it reaches the debug UI', () => {
    const report = createReport() as LandrushBugReport & { floor?: LandrushBugReport['floor'] }
    delete report.floor
    expect(parseLandrushBugReport(report)).toEqual({
      error: 'The report floor context is invalid.',
      ok: false,
    })
  })

  test('builds an offline replay URL without carrying conflicting startup modes', () => {
    const report = createReport()
    report.mode.view = 'map'
    const url = new URL(
      createLandrushBugReportReplayUrl(
        'http://localhost:3002/landrush-lab/pascal-multiplayer-island-bug-report?build=1&clean=1',
        report,
      ),
    )

    expect(url.pathname).toBe('/landrush-lab/pascal-multiplayer-island-bug-report')
    expect(url.searchParams.get('bugReportReplay')).toBe('1')
    expect(url.searchParams.get('landrushProbe')).toBe('1')
    expect(url.searchParams.get('landrushProbeDom')).toBe('1')
    expect(url.searchParams.get('offline')).toBe('1')
    expect(url.searchParams.get('map')).toBe('1')
    expect(url.searchParams.get('room')).toBe('room-1')
    expect(url.searchParams.has('build')).toBe(false)
    expect(url.searchParams.has('clean')).toBe(false)
  })

  test('uses a filesystem-safe timestamp in the report filename', () => {
    expect(createLandrushBugReportFileName(createReport().capturedAt)).toBe(
      'landrush-bug-report_2026-08-12_14-30-15-120.json',
    )
  })

  test('reports the captured canvas backing-to-CSS pixel ratio', () => {
    expect(
      resolveLandrushCanvasPixelRatio({
        clientHeight: 1_000,
        clientWidth: 1_600,
        height: 700,
        width: 1_120,
      }),
    ).toBe(0.7)
  })

  test('uses the captured height when CSS width is unavailable', () => {
    expect(
      resolveLandrushCanvasPixelRatio({
        clientHeight: 1_000,
        clientWidth: 0,
        height: 700,
        width: 0,
      }),
    ).toBe(0.7)
  })
})

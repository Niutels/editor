import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const readSource = (path: string) =>
  readFileSync(join(import.meta.dir, path), 'utf8').replaceAll('\r\n', '\n')

function replaceRequired(source: string, embedded: string, canonical: string): string {
  expect(source).toContain(embedded)
  return source.replace(embedded, canonical)
}

function removeLandrushBuildTabAdapters(source: string): string {
  let normalized = replaceRequired(
    source,
    `export type BuildTabCapabilities = {
  materialPaint: boolean
}

export type BuildTabProps = {
  capabilities?: Partial<BuildTabCapabilities>
  runStructureToolActivation?: (activate: () => void) => void
}

const FULL_BUILD_TAB_CAPABILITIES: BuildTabCapabilities = {
  materialPaint: true,
}

const runToolActivationDirectly = (activate: () => void) => activate()

export function applyBuildTabCapabilities<T extends { mode?: string }>(
  types: T[],
  capabilities: BuildTabCapabilities,
): T[] {
  return capabilities.materialPaint ? types : types.filter((type) => type.mode !== 'material-paint')
}

`,
    '',
  )
  normalized = replaceRequired(
    normalized,
    `export function BuildTab({
  capabilities,
  runStructureToolActivation = runToolActivationDirectly,
}: BuildTabProps = {}) {
  const materialPaintEnabled =
    capabilities?.materialPaint ?? FULL_BUILD_TAB_CAPABILITIES.materialPaint`,
    'export function BuildTab() {',
  )
  normalized = replaceRequired(
    normalized,
    `  const buildTypes = useMemo(() => {
    const availableTypes = registryReady ? collectBuildTypes(floorplanMode) : BASE_BUILD_TYPES
    return applyBuildTabCapabilities(availableTypes, { materialPaint: materialPaintEnabled })
  }, [floorplanMode, materialPaintEnabled, registryReady])`,
    `  const buildTypes = useMemo(
    () => (registryReady ? collectBuildTypes(floorplanMode) : BASE_BUILD_TYPES),
    [floorplanMode, registryReady],
  )`,
  )
  normalized = replaceRequired(
    normalized,
    `  const runBuildToolActivation = useCallback(
    (kind: string) => runStructureToolActivation(() => activateBuildTool(kind)),
    [runStructureToolActivation],
  )
  const runRoofFeatureActivation = useCallback(
    (kind: string) => runStructureToolActivation(() => activateRoofFeatureTool(kind)),
    [runStructureToolActivation],
  )
  const handleTypeClick = useCallback(
    (type: BuildType) => {
      if (type.mode === 'material-paint') {
        activatePaintMode()
      } else if (type.mode === 'terrain-sculpt') {
        activateTerrainSculptMode()
      } else if (type.id === 'mep') {
        // MEP is a group tile: arm its first tool so a usable tool is active
        // (and we leave any prior paint mode), then reveal the MEP sub-grid.
        runBuildToolActivation('duct-segment')
      } else if (type.kind) {
        runBuildToolActivation(type.kind)
      }
    },
    [runBuildToolActivation],
  )`,
    `  const handleTypeClick = useCallback((type: BuildType) => {
    if (type.mode === 'material-paint') {
      activatePaintMode()
    } else if (type.mode === 'terrain-sculpt') {
      activateTerrainSculptMode()
    } else if (type.id === 'mep') {
      // MEP is a group tile: arm its first tool so a usable tool is active
      // (and we leave any prior paint mode), then reveal the MEP sub-grid.
      activateBuildTool('duct-segment')
    } else if (type.kind) {
      activateBuildTool(type.kind)
    }
  }, [])`,
  )
  normalized = replaceRequired(
    normalized,
    'runRoofFeatureActivation(feature.kind)',
    'activateRoofFeatureTool(feature.kind)',
  )
  normalized = replaceRequired(
    normalized,
    'runBuildToolActivation(item.kind)',
    'activateBuildTool(item.kind)',
  )
  normalized = replaceRequired(
    normalized,
    `runBuildToolActivation(
                    activeTool === 'duct-fitting' ? 'duct-segment' : 'duct-fitting',
                  )`,
    "activateBuildTool(activeTool === 'duct-fitting' ? 'duct-segment' : 'duct-fitting')",
  )
  normalized = replaceRequired(
    normalized,
    `runBuildToolActivation(
                    activeTool === 'pipe-fitting' ? 'pipe-segment' : 'pipe-fitting',
                  )`,
    "activateBuildTool(activeTool === 'pipe-fitting' ? 'pipe-segment' : 'pipe-fitting')",
  )
  normalized = replaceRequired(
    normalized,
    "runBuildToolActivation(activeTool === 'pipe-trap' ? 'pipe-segment' : 'pipe-trap')",
    "activateBuildTool(activeTool === 'pipe-trap' ? 'pipe-segment' : 'pipe-trap')",
  )
  return replaceRequired(
    normalized,
    "{materialPaintEnabled && mode === 'material-paint' ? (",
    "{mode === 'material-paint' ? (",
  )
}

function removeLandrushToolbarCapabilityAdapter(source: string): string {
  let normalized = replaceRequired(
    source,
    `export type CommunityViewerToolbarCapabilities = {
  cameraProjection: boolean
  floorplan: boolean
  preview: boolean
  walkthrough: boolean
}

const FULL_EDITOR_TOOLBAR_CAPABILITIES: CommunityViewerToolbarCapabilities = {
  cameraProjection: true,
  floorplan: true,
  preview: true,
  walkthrough: true,
}

`,
    '',
  )
  normalized = replaceRequired(
    normalized,
    `function DisplayMenu({
  cameraProjectionEnabled = true,
  floorplanEnabled = true,
}: {
  cameraProjectionEnabled?: boolean
  floorplanEnabled?: boolean
}) {`,
    'function DisplayMenu() {',
  )
  normalized = replaceRequired(
    normalized,
    "{floorplanEnabled && viewMode !== '3d' ? (",
    "{viewMode !== '3d' ? (",
  )
  normalized = replaceRequired(
    normalized,
    `        {cameraProjectionEnabled ? (
          <DropdownMenuItem
            onSelect={(e) =>
              keepOpen(e, () =>
                setCameraMode(cameraMode === 'perspective' ? 'orthographic' : 'perspective'),
              )
            }
          >
            <IconifyIcon
              height={16}
              icon={cameraMode === 'perspective' ? 'icon-park-outline:perspective' : 'vaadin:grid'}
              width={16}
            />
            <span>Camera</span>
            <span className="ml-auto text-muted-foreground text-xs">
              {cameraMode === 'perspective' ? 'Perspective' : 'Orthographic'}
            </span>
          </DropdownMenuItem>
        ) : null}`,
    `        <DropdownMenuItem
          onSelect={(e) =>
            keepOpen(e, () =>
              setCameraMode(cameraMode === 'perspective' ? 'orthographic' : 'perspective'),
            )
          }
        >
          <IconifyIcon
            height={16}
            icon={cameraMode === 'perspective' ? 'icon-park-outline:perspective' : 'vaadin:grid'}
            width={16}
          />
          <span>Camera</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {cameraMode === 'perspective' ? 'Perspective' : 'Orthographic'}
          </span>
        </DropdownMenuItem>`,
  )
  normalized = replaceRequired(
    normalized,
    `export function CommunityViewerToolbarLeft({
  capabilities,
}: {
  capabilities?: Partial<CommunityViewerToolbarCapabilities>
} = {}) {
  const resolvedCapabilities = { ...FULL_EDITOR_TOOLBAR_CAPABILITIES, ...capabilities }

  return (
    <>
      <CollapseSidebarButton />
      {resolvedCapabilities.floorplan ? <ViewModeControl /> : null}
    </>
  )
}`,
    `export function CommunityViewerToolbarLeft() {
  return (
    <>
      <CollapseSidebarButton />
      <ViewModeControl />
    </>
  )
}`,
  )
  return replaceRequired(
    normalized,
    `export function CommunityViewerToolbarRight({
  capabilities,
}: {
  capabilities?: Partial<CommunityViewerToolbarCapabilities>
} = {}) {
  const resolvedCapabilities = { ...FULL_EDITOR_TOOLBAR_CAPABILITIES, ...capabilities }
  const hasStageControls = resolvedCapabilities.walkthrough || resolvedCapabilities.preview

  return (
    <div className={TOOLBAR_CONTAINER}>
      <LevelModeToggle />
      <WallModeToggle />
      <div className="my-1.5 w-px bg-border/50" />
      <DisplayMenu
        cameraProjectionEnabled={resolvedCapabilities.cameraProjection}
        floorplanEnabled={resolvedCapabilities.floorplan}
      />
      {hasStageControls ? <div className="my-1.5 w-px bg-border/50" /> : null}
      {resolvedCapabilities.walkthrough ? <WalkthroughButton /> : null}
      {resolvedCapabilities.preview ? <PreviewButton /> : null}
    </div>
  )
}`,
    `export function CommunityViewerToolbarRight() {
  return (
    <div className={TOOLBAR_CONTAINER}>
      <LevelModeToggle />
      <WallModeToggle />
      <div className="my-1.5 w-px bg-border/50" />
      <DisplayMenu />
      <div className="my-1.5 w-px bg-border/50" />
      <WalkthroughButton />
      <PreviewButton />
    </div>
  )
}`,
  )
}

describe('Landrush Pascal editor UI parity', () => {
  test('keeps the Build palette aligned with only the declared material-paint gate', () => {
    const canonical = readSource('../../../editor/components/build-tab.tsx')
    const landrush = readSource('../build-tab.tsx')

    expect(removeLandrushBuildTabAdapters(landrush)).toBe(canonical)
    for (const tool of [
      'wall',
      'fence',
      'slab',
      'ceiling',
      'roof',
      'stair',
      'elevator',
      'door',
      'window',
      'column',
      'shelf',
      'spawn',
      'duct-segment',
      'duct-terminal',
      'hvac-equipment',
      'lineset',
      'liquid-line',
      'pipe-segment',
    ]) {
      expect(landrush).toContain(`'${tool}'`)
    }
    expect(landrush).toContain("mode: 'terrain-sculpt'")
    expect(landrush).toContain('isFloorplanToolAvailableInMode')
    expect(landrush).toContain("paletteGroup === 'roof-features'")
    expect(landrush).toContain('materialPaint: boolean')
    expect(landrush).toContain("type.mode !== 'material-paint'")
  })

  test('keeps the standalone viewer toolbar with only declared embed capability gates', () => {
    const canonical = readSource('../../../editor/components/viewer-toolbar.tsx')
    const landrush = readSource('../viewer-toolbar.tsx')

    expect(removeLandrushToolbarCapabilityAdapter(landrush)).toBe(canonical)
    expect(landrush).toContain('cameraProjection: boolean')
    expect(landrush).toContain('floorplan: boolean')
    expect(landrush).toContain('walkthrough: boolean')
    expect(landrush).toContain('preview: boolean')
  })

  test('composes v2-style Landrush chrome without importing standalone app internals', () => {
    const chrome = readSource('landrush-pascal-editor-chrome.tsx')

    expect(chrome).toContain(`<BuildTab
      capabilities={{ materialPaint: false }}
      runStructureToolActivation={runLandrushPascalToolActivationInCurrentLevel}
    />`)
    expect(chrome).toContain('<ItemsPanel showSourceFilter={false} showTagFilters={false} />')
    expect(chrome).toContain('<SettingsPanel />')
    expect(chrome).toContain(
      '<CommunityViewerToolbarLeft capabilities={LANDRUSH_VIEWER_CAPABILITIES} />',
    )
    expect(chrome).toContain(
      '<CommunityViewerToolbarRight capabilities={LANDRUSH_VIEWER_CAPABILITIES} />',
    )
    expect(chrome).toContain('<FloatingLevelSelector />')
    expect(chrome).toContain('cameraProjection: false')
    expect(chrome).toContain('floorplan: false')
    expect(chrome).toContain('preview: false')
    expect(chrome).toContain('walkthrough: false')
    expect(chrome).toContain('exitLandrushPascalEditingToSelect,')
    expect(chrome).toContain('runLandrushPascalToolActivationInCurrentLevel,')
    expect(chrome).toContain("} from '@landrush/pascal-host'")
    expect(chrome).toContain('const editorMode = useEditor((state) => state.mode)')
    expect(chrome).toContain(
      'const selectionTool = useEditor((state) => state.floorplanSelectionTool)',
    )
    expect(chrome).toContain('data-editor-control-mode="select"')
    expect(chrome).toContain('data-landrush-select-mode')
    expect(chrome).toContain('aria-keyshortcuts="V"')
    expect(chrome).toContain("aria-pressed={editorMode === 'select' && selectionTool === 'click'}")
    expect(chrome).toContain('inline-flex h-11 w-11')
    expect(chrome).toContain('exitLandrushPascalEditingToSelect()')
    expect(chrome).toContain('<TooltipContent side="top">Select (V)</TooltipContent>')
    expect(chrome).not.toContain('<span>Select</span>')
    expect(chrome).not.toContain("editor.setActiveSidebarPanel('build')")
    expect(chrome).toContain('data-landrush-exit-build')
    expect(chrome).toContain('onExitBuild()')
    expect(chrome).not.toMatch(/from ['"].*apps\/editor/)
  })

  test('keeps one stable Viewer and continuous canonical editing systems in the host', () => {
    const host = readSource(
      '../../../../packages/landrush-pascal-host/src/landrush-pascal-host.tsx',
    )
    const runtime = readSource(
      '../../../../packages/landrush-pascal-host/src/landrush-pascal-editing-runtime.tsx',
    )

    expect(host.match(/<Viewer\b/g)).toHaveLength(1)
    expect(host).toContain('editingChrome: ReactNode')
    expect(host).toContain('{editingActive ? editingChrome : null}')
    expect(host).toContain('data-landrush-pascal-viewer-viewport')
    expect(host).toContain('className="absolute inset-0 min-h-0 min-w-0 overflow-hidden"')
    expect(host).not.toContain('style={{ left: viewerLeft }}')
    expect(host).toContain('const gridSnapStep = useEditor((state) => state.gridSnapStep)')
    expect(host).toContain('cellSize={gridSnapStep}')
    expect(host).toContain('<LandrushPascalEditingRuntime />')
    expect(host).toContain('exitLandrushPascalEditingToSelect()')
    expect(host).toContain('<ToolManager />')
    expect(host).not.toContain('LANDRUSH_STRUCTURE_TOOLS')
    expect(host).not.toContain('LandrushPascalEditingChrome')
    expect(runtime).toContain("emitter.on('node:click', onNodeClick)")
    expect(runtime).toContain('<LandrushSelectionOutlinerSync />')
    expect(runtime).toContain('isLandrushPascalClockwiseRotationShortcut(event)')
    expect(runtime).toContain("editor.setFloorplanSelectionTool('click')")
    expect(runtime).toContain("return 'custom'")
  })

  test('mounts Pascal chrome only for the build phase and removes competing Landrush HUD', () => {
    const island = readSource('landrush-island-client.tsx')

    expect(island).toContain(
      "import { LandrushPascalEditorChrome } from './landrush-pascal-editor-chrome'",
    )
    expect(island).toMatch(
      /editingChrome=\{\s*buildEditorChromeActive && !zombieEscapeNightActive \? \(\s*<LandrushPascalEditorChrome onExitBuild=\{enterPlayerView\} \/>/,
    )
    expect(island).toContain(
      'const buildEditorRuntimeActive = buildEditorSystemsActive && !zombieEscapeNightActive',
    )
    expect(island).toContain(
      'const buildEditorKeyboardReserved = resolveLandrushBuildEditorKeyboardReserved({',
    )
    expect(island).toContain('editingActive={buildEditorRuntimeActive}')
    expect(island).toContain(
      "event.code === 'KeyR' && !event.shiftKey && !buildEditorKeyboardReserved",
    )
    expect(island).toMatch(
      /\{!zombieEscapeNightActive && !buildEditorChromeActive \? \(\s*<MultiplayerStatusPanel/,
    )
    expect(island).toMatch(
      /\{!zombieEscapeNightActive && !buildEditorChromeActive \? \(\s*<div\s+className="pointer-events-auto absolute top-20 right-3/,
    )
  })
})

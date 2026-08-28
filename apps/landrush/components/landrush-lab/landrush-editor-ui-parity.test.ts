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
  const controllerItemPattern = /^[ \t]+data-editor-build-controller-item\n/gm
  const controllerActionPattern =
    /^[ \t]+data-editor-build-controller-action=(?:"[^"]+"|\{\n[ \t]+[^\n]+\n[ \t]+\})\n/gm
  expect(source.match(controllerItemPattern) ?? []).toHaveLength(7)
  expect(source.match(controllerActionPattern) ?? []).toHaveLength(7)
  let normalized = source.replace(controllerItemPattern, '')
  normalized = normalized.replace(controllerActionPattern, '')
  normalized = replaceRequired(
    normalized,
    `export type BuildTabCapabilities = {
  materialPaint: boolean
}

export type BuildTabProps = {
  capabilities?: Partial<BuildTabCapabilities>
  interactionReady?: boolean
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
  interactionReady = true,
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
    `  const didInitRef = useRef(false)
  const awaitingInteractionRef = useRef(!interactionReady)
  useEffect(() => {
    if (!interactionReady) {
      awaitingInteractionRef.current = true
      didInitRef.current = false
      return
    }
    if (didInitRef.current) return
    didInitRef.current = true
    const ed = useEditor.getState()
    const enteredFromVisualHandoff = awaitingInteractionRef.current
    awaitingInteractionRef.current = false
    if (!enteredFromVisualHandoff && ed.mode === 'build' && ed.tool) return
    const firstType = buildTypes.find((t) => t.kind)
    if (firstType) handleTypeClick(firstType)
  }, [buildTypes, handleTypeClick, interactionReady])`,
    `  const didInitRef = useRef(false)
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    const ed = useEditor.getState()
    if (ed.mode === 'build' && ed.tool) return
    const firstType = buildTypes.find((t) => t.kind)
    if (firstType) handleTypeClick(firstType)
  }, [buildTypes, handleTypeClick])`,
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

    expect(canonical).not.toContain('data-editor-build-controller-')
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
    expect(landrush).toContain('data-editor-build-controller-item')
    expect(landrush).toContain('data-editor-build-controller-action="placement"')
    expect(landrush).toContain('data-editor-build-controller-action="palette"')
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
      interactionReady={interactionReady}
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
    expect(chrome).toContain('ref={chromeRootRef}')
    expect(chrome).toContain('ref={exitBuildButtonRef}')
    expect(chrome).toContain('onExitBuild()')
    expect(chrome).toContain('aria-hidden={!layoutOpen}')
    expect(chrome).toContain('inert={!layoutOpen}')
    expect(chrome).toContain('inert={!interactionReady}')
    expect(chrome).toContain("pointerEvents: layoutOpen && interactionReady ? 'auto' : 'none'")
    expect(chrome).toContain('resolveLandrushPascalEditorPresentationTransition')
    expect(chrome).toContain('data-landrush-pascal-editor-mode-transition=')
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
    expect(host).toContain('{editingChrome}')
    expect(host).toContain('data-landrush-pascal-viewer-viewport')
    expect(host).toContain('data-landrush-pascal-viewer-mode-transition=')
    expect(host).toContain('data-landrush-pascal-viewer-surface')
    expect(host).toContain('className="absolute inset-0 min-h-0 min-w-0 overflow-hidden"')
    expect(host).not.toContain('style={{ left: viewerLeft }}')
    expect(host).toContain('const gridSnapStep = useEditor((state) => state.gridSnapStep)')
    expect(host).toContain('cellSize={gridSnapStep}')
    expect(host).not.toContain('visualPolicy=')
    expect(host).toContain('<LandrushPascalEditingRuntime />')
    expect(host).toContain('exitLandrushPascalEditingToSelect()')
    expect(host).toContain(
      'didLandrushPascalEditingDeactivate(previousEditingActive, editingActive)',
    )
    expect(host).not.toContain('() => exitLandrushPascalEditingToSelect()')
    expect(host).toContain('<ToolManager />')
    expect(host).not.toContain('LANDRUSH_STRUCTURE_TOOLS')
    expect(host).not.toContain('LandrushPascalEditingChrome')
    expect(runtime).toContain("emitter.on('node:click', onNodeClick)")
    expect(runtime).toContain('<LandrushSelectionOutlinerSync />')
    expect(runtime).toContain('isLandrushPascalClockwiseRotationShortcut(event)')
    expect(runtime).toContain("editor.setFloorplanSelectionTool('click')")
    expect(runtime).toContain("return 'custom'")
  })

  test('isolates fixed Viewer and host runtimes from caller child reconciliation', () => {
    const chrome = readSource('landrush-pascal-editor-chrome.tsx')
    const host = readSource(
      '../../../../packages/landrush-pascal-host/src/landrush-pascal-host.tsx',
    )
    const viewer = readSource('../../../../packages/viewer/src/components/viewer/index.tsx')

    const viewerRuntimeProps = viewer.slice(
      viewer.indexOf('type ViewerSceneRuntimeProps = {'),
      viewer.indexOf('const ViewerSceneRuntime = memo'),
    )
    const viewerRuntimeMount = viewer.indexOf('<ViewerSceneRuntime')
    const viewerCallerChildren = viewer.indexOf('{children}', viewerRuntimeMount)
    const viewerSceneBoundaryEnd = viewer.indexOf('</ErrorBoundary>', viewerRuntimeMount)
    expect(viewer).toContain('const ViewerSceneRuntime = memo(function ViewerSceneRuntime(')
    expect(viewerRuntimeProps).not.toContain('children')
    expect(viewerRuntimeMount).toBeGreaterThan(-1)
    expect(viewerCallerChildren).toBeGreaterThan(viewerRuntimeMount)
    expect(viewerCallerChildren).toBeLessThan(viewerSceneBoundaryEnd)

    const hostRuntimeStart = host.indexOf(
      'const LandrushPascalHostRuntime = memo(function LandrushPascalHostRuntime(',
    )
    const hostRuntimeEnd = host.indexOf('function LandrushPascalViewerViewport', hostRuntimeStart)
    const hostRuntimeMount = host.indexOf('<LandrushPascalHostRuntime')
    const hostCallerChildren = host.indexOf('{children}', hostRuntimeMount)
    const hostViewerEnd = host.indexOf('</Viewer>', hostRuntimeMount)
    expect(hostRuntimeStart).toBeGreaterThan(-1)
    expect(host.slice(hostRuntimeStart, hostRuntimeEnd)).not.toContain('children')
    expect(hostRuntimeMount).toBeGreaterThan(-1)
    expect(hostCallerChildren).toBeGreaterThan(hostRuntimeMount)
    expect(hostCallerChildren).toBeLessThan(hostViewerEnd)

    expect(chrome).toContain(
      'export const LandrushPascalEditorChrome = memo(function LandrushPascalEditorChrome(',
    )
  })

  test('mounts Pascal chrome only for the build phase and removes competing Landrush HUD', () => {
    const buildGridOverlay = readSource('landrush-build-grid-overlay.tsx')
    const island = readSource('landrush-island-client.tsx')

    expect(island).toContain(
      "import { LandrushPascalEditorChrome } from './landrush-pascal-editor-chrome'",
    )
    expect(island).toMatch(
      /editingChrome=\{\s*<LandrushPascalEditorChrome\s+active=\{buildEditorChromeActive && !zombieEscapeNightActive\}\s+chromeRootRef=\{buildEditorChromeRootRef\}\s+exitBuildButtonRef=\{buildEditorExitButtonRef\}\s+interactionReady=\{buildEditorInteractionReady\}\s+modeTransitionActive=\{buildEditorModeTransitionActive\}\s+onExitBuild=\{enterPlayerView\}\s+open=\{buildEditorLayoutOpen\}\s*\/>/,
    )
    expect(island).toContain(
      'const buildEditorRuntimeActive = buildEditorSystemsActive && !zombieEscapeNightActive',
    )
    expect(island).toContain(
      'const buildEditorKeyboardReserved = resolveLandrushBuildEditorKeyboardReserved({',
    )
    expect(island).toContain('editingActive={buildEditorRuntimeActive}')
    expect(island).toContain(
      'editingViewportModeTransitionActive={buildEditorModeTransitionActive}',
    )
    expect(island).toContain('editingViewportOpen={buildEditorLayoutOpen}')
    expect(island).not.toContain('LandrushIslandLevelModeControls')
    expect(island).toContain(`ownedHorizontalGridPlaneY={
                dayInterfaceState.buildControlsActive && (activeBuildParcel ?? localOwnedParcel)
                  ? activeBuildGroundY
                  : null
              }`)
    expect(buildGridOverlay).not.toContain('isGridSnapActive')
    expect(buildGridOverlay).not.toContain('resolveLandrushBuildGridOverlayMeshVisibility')
    expect(buildGridOverlay).toContain(
      'visible={(renderVisible || warmupVisible) && Boolean(renderParcel)}',
    )
    expect(island).toContain('interactionReady: buildEditorInteractionReadyState')
    expect(island).toContain('interactionReady: buildEditorInteractionReady,')
    expect(island).toContain(
      'const buildEditorModeSyncRequested = shouldSyncLandrushBuildEditorMode({',
    )
    expect(island).toContain('useLayoutEffect(() => {')
    expect(island).toContain(
      'if (!hasLiveLayoutNode || !buildEditorChromeActive || !buildEditorModeSyncRequested)',
    )
    expect(island).not.toContain('landrush-island.effect.sync-build-mode-after-scene-load')
    expect(island).toContain(
      "event.code === 'KeyR' && !event.shiftKey && !buildEditorKeyboardReserved",
    )
    expect(island).toContain('data-landrush-day-chrome')
    expect(island).toContain('data-landrush-interface-focus-sink')
    expect(island).toContain('beginBuildEditorFocusHandoff(nextTransition)')
    expect(island).toContain('resolveLandrushBuildEditorFocusRestore({')
    expect(island).toContain(
      "handoff.targetOwner === 'editor' ? buildEditorLayoutOpen : dayChromeInteractionReady",
    )
    expect(island).toContain('ref={dayBuildButtonRef}')
    expect(island).toContain('ref={dayChromeRootRef}')
    expect(island).toContain('aria-hidden={!dayChromeInteractionReady}')
    expect(island).toContain('inert={!dayChromeInteractionReady}')
    expect(island).toMatch(/transition: `opacity \$\{dayChromeTransition\}`/)
    expect(island).not.toMatch(
      /\{!zombieEscapeNightActive && !buildEditorChromeActive \? \(\s*<MultiplayerStatusPanel/,
    )
  })
})

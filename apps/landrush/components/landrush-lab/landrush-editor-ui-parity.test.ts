import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const readSource = (path: string) =>
  readFileSync(join(import.meta.dir, path), 'utf8').replaceAll('\r\n', '\n')

function replaceRequired(source: string, embedded: string, canonical: string): string {
  expect(source).toContain(embedded)
  return source.replace(embedded, canonical)
}

function replaceAllRequired(
  source: string,
  embedded: string,
  canonical: string,
  expectedCount: number,
): string {
  expect(source.split(embedded)).toHaveLength(expectedCount + 1)
  return source.replaceAll(embedded, canonical)
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
    `const VARIABLE_STRUCTURE_PRICE_KINDS = new Set(['duct-segment', 'liquid-line', 'pipe-segment'])

export function isBuildTabVariableStructurePriceKind(kind: string | undefined): boolean {
  return kind !== undefined && VARIABLE_STRUCTURE_PRICE_KINDS.has(kind)
}

function BuildTabStructurePriceBadge({
  kind,
  renderPriceBadge,
}: {
  kind: string | undefined
  renderPriceBadge?: (kind: string | undefined) => React.ReactNode
}) {
  const badge = renderPriceBadge?.(kind)
  if (!badge) return null
  return (
    <>
      {badge}
      {isBuildTabVariableStructurePriceKind(kind) ? (
        <span
          className="pointer-events-none absolute right-0.5 bottom-0.5 z-20 rounded-sm bg-black/80 px-0.5 font-mono font-semibold text-[8px] text-white leading-none"
          data-landrush-build-price-minimum
          title="Minimum price"
        >
          +
        </span>
      ) : null}
    </>
  )
}

`,
    '\n',
  )
  normalized = replaceRequired(
    normalized,
    `export type BuildTabCapabilities = {
  materialPaint: boolean
}

export type BuildTabProps = {
  allowedStructureKinds?: ReadonlySet<string>
  capabilities?: Partial<BuildTabCapabilities>
  interactionReady?: boolean
  isStructureToolDisabled?: (kind: string) => boolean
  renderStructurePriceBadge?: (kind: string | undefined) => React.ReactNode
  runStructureToolActivation?: (activate: () => void) => void
}

const FULL_BUILD_TAB_CAPABILITIES: BuildTabCapabilities = {
  materialPaint: true,
}

const runToolActivationDirectly = (activate: () => void) => activate()
const isStructureToolNeverDisabled = () => false

export function applyBuildTabCapabilities<T extends { mode?: string }>(
  types: T[],
  capabilities: BuildTabCapabilities,
): T[] {
  return capabilities.materialPaint ? types : types.filter((type) => type.mode !== 'material-paint')
}

export function applyBuildTabStructureKindAllowList<T extends { kind?: string }>(
  types: T[],
  allowedStructureKinds?: ReadonlySet<string>,
): T[] {
  if (allowedStructureKinds === undefined) return types
  return types.filter((type) => type.kind !== undefined && allowedStructureKinds.has(type.kind))
}

`,
    '',
  )
  normalized = replaceRequired(
    normalized,
    `export function BuildTab({
  allowedStructureKinds,
  capabilities,
  interactionReady = true,
  isStructureToolDisabled = isStructureToolNeverDisabled,
  renderStructurePriceBadge,
  runStructureToolActivation = runToolActivationDirectly,
}: BuildTabProps = {}) {
  const materialPaintEnabled =
    capabilities?.materialPaint ?? FULL_BUILD_TAB_CAPABILITIES.materialPaint`,
    'export function BuildTab() {',
  )
  normalized = replaceRequired(
    normalized,
    `  const structureKindsRestricted = allowedStructureKinds !== undefined
  const isStructureKindAllowed = useCallback(
    (kind: string) => allowedStructureKinds === undefined || allowedStructureKinds.has(kind),
    [allowedStructureKinds],
  )
  const buildTypes = useMemo(() => {
    const availableTypes = registryReady ? collectBuildTypes(floorplanMode) : BASE_BUILD_TYPES
    return applyBuildTabStructureKindAllowList(
      applyBuildTabCapabilities(availableTypes, { materialPaint: materialPaintEnabled }),
      allowedStructureKinds,
    )
  }, [allowedStructureKinds, floorplanMode, materialPaintEnabled, registryReady])`,
    `  const buildTypes = useMemo(
    () => (registryReady ? collectBuildTypes(floorplanMode) : BASE_BUILD_TYPES),
    [floorplanMode, registryReady],
  )`,
  )
  normalized = replaceRequired(
    normalized,
    `      if (
        !isStructureKindAllowed(kind) ||
        (def.capabilities.roofAccessory === undefined &&
          def.presentation?.paletteGroup !== 'roof-features')
      ) {`,
    `      if (
        def.capabilities.roofAccessory === undefined &&
        def.presentation?.paletteGroup !== 'roof-features'
      ) {`,
  )
  normalized = replaceRequired(
    normalized,
    '  }, [isStructureKindAllowed, registryReady])',
    '  }, [registryReady])',
  )
  normalized = replaceRequired(
    normalized,
    `  const isMepActive =
    !structureKindsRestricted && mode === 'build' && !!activeTool && MEP_TOOL_KINDS.has(activeTool)`,
    `  const isMepActive = mode === 'build' && !!activeTool && MEP_TOOL_KINDS.has(activeTool)`,
  )
  normalized = replaceRequired(
    normalized,
    `  const ductFittingTargetKind = activeTool === 'duct-fitting' ? 'duct-segment' : 'duct-fitting'
  const pipeFittingTargetKind = activeTool === 'pipe-fitting' ? 'pipe-segment' : 'pipe-fitting'
  const pipeTrapTargetKind = activeTool === 'pipe-trap' ? 'pipe-segment' : 'pipe-trap'

`,
    '\n',
  )
  normalized = replaceRequired(
    normalized,
    `  const runBuildToolActivation = useCallback(
    (kind: string) => {
      if (!isStructureKindAllowed(kind) || isStructureToolDisabled(kind)) return
      runStructureToolActivation(() => activateBuildTool(kind))
    },
    [isStructureKindAllowed, isStructureToolDisabled, runStructureToolActivation],
  )
  const runRoofFeatureActivation = useCallback(
    (kind: string) => {
      if (!isStructureKindAllowed(kind) || isStructureToolDisabled(kind)) return
      runStructureToolActivation(() => activateRoofFeatureTool(kind))
    },
    [isStructureKindAllowed, isStructureToolDisabled, runStructureToolActivation],
  )
  const handleTypeClick = useCallback(
    (type: BuildType) => {
      if (
        structureKindsRestricted &&
        (type.kind === undefined || !isStructureKindAllowed(type.kind))
      ) {
        return
      }
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
    [isStructureKindAllowed, runBuildToolActivation, structureKindsRestricted],
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
    '  // On open, land on the first enabled build tool — parity with the community Build\n',
    '  // On open, land on the first build tool — parity with the community Build\n',
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
    if (
      !enteredFromVisualHandoff &&
      ed.mode === 'build' &&
      ed.tool &&
      isStructureKindAllowed(ed.tool)
    ) {
      return
    }
    const firstType = buildTypes.find((type) => type.kind && !isStructureToolDisabled(type.kind))
    if (firstType) handleTypeClick(firstType)
  }, [
    buildTypes,
    handleTypeClick,
    interactionReady,
    isStructureKindAllowed,
    isStructureToolDisabled,
  ])

  useEffect(() => {
    if (!interactionReady || !structureKindsRestricted) return
    const disallowedStructureTool =
      mode === 'build' && activeTool !== null && !isStructureKindAllowed(activeTool)
    const disallowedSpecialMode = mode === 'material-paint' || mode === 'terrain-sculpt'
    if (!disallowedStructureTool && !disallowedSpecialMode) return
    const firstType = buildTypes.find((type) => type.kind && !isStructureToolDisabled(type.kind))
    if (firstType) handleTypeClick(firstType)
  }, [
    activeTool,
    buildTypes,
    handleTypeClick,
    interactionReady,
    isStructureKindAllowed,
    isStructureToolDisabled,
    mode,
    structureKindsRestricted,
  ])`,
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
    `            const priceKind = type.kind ?? (type.id === 'mep' ? MEP_ITEMS[0]!.kind : undefined)
            const disabled = priceKind ? isStructureToolDisabled(priceKind) : false
            const active = !disabled && isTypeActive(type)`,
    '            const active = isTypeActive(type)',
  )
  normalized = replaceRequired(
    normalized,
    `                const disabled = isStructureToolDisabled(feature.kind)
                const active = !disabled && mode === 'build' && activeTool === feature.kind`,
    "                const active = mode === 'build' && activeTool === feature.kind",
  )
  normalized = replaceRequired(
    normalized,
    `                const disabled = isStructureToolDisabled(item.kind)
                const active = !disabled && isMepItemActive(item)`,
    '                const active = isMepItemActive(item)',
  )
  normalized = replaceAllRequired(
    normalized,
    `                      disabled &&
                        'cursor-not-allowed opacity-35 hover:bg-muted/40 hover:opacity-35 hover:grayscale',
`,
    '',
    1,
  )
  normalized = replaceAllRequired(
    normalized,
    `                          disabled &&
                            'cursor-not-allowed opacity-35 hover:bg-muted/40 hover:opacity-35 hover:grayscale',
`,
    '',
    2,
  )
  const nativeDisabledPattern = /^[ \t]+disabled=\{disabled\}\n/gm
  const guardedClickPattern = /^[ \t]+if \(disabled\) return\n/gm
  expect(normalized.match(nativeDisabledPattern) ?? []).toHaveLength(3)
  expect(normalized.match(guardedClickPattern) ?? []).toHaveLength(3)
  normalized = normalized.replace(nativeDisabledPattern, '')
  normalized = normalized.replace(guardedClickPattern, '')
  normalized = replaceAllRequired(
    normalized,
    `                    onMouseEnter={() => {
                      if (!disabled) triggerSFX('sfx:menu-hover')
                    }}`,
    "                    onMouseEnter={() => triggerSFX('sfx:menu-hover')}",
    1,
  )
  normalized = replaceAllRequired(
    normalized,
    `                        onMouseEnter={() => {
                          if (!disabled) triggerSFX('sfx:menu-hover')
                        }}`,
    "                        onMouseEnter={() => triggerSFX('sfx:menu-hover')}",
    2,
  )
  normalized = replaceAllRequired(
    normalized,
    'size-full object-contain transition-transform duration-200 group-hover:scale-110 group-disabled:scale-100',
    'size-full object-contain transition-transform duration-200 group-hover:scale-110',
    3,
  )
  const priceBadgePattern =
    /^[ \t]+<BuildTabStructurePriceBadge\n[ \t]+kind=\{[^}]+\}\n[ \t]+renderPriceBadge=\{renderStructurePriceBadge\}\n[ \t]+\/>\n/gm
  expect(normalized.match(priceBadgePattern) ?? []).toHaveLength(6)
  normalized = normalized.replace(priceBadgePattern, '')
  normalized = replaceAllRequired(
    normalized,
    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-35 disabled:ring-0 disabled:hover:bg-muted/40',
    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
    3,
  )
  normalized = replaceAllRequired(
    normalized,
    "                  renderStructurePriceBadge && 'relative pr-14 pl-3',\n",
    '',
    3,
  )
  normalized = replaceRequired(
    normalized,
    "                  activeTool === 'duct-fitting' && !isStructureToolDisabled(ductFittingTargetKind)",
    "                  activeTool === 'duct-fitting'",
  )
  normalized = replaceRequired(
    normalized,
    "                  activeTool === 'pipe-fitting' && !isStructureToolDisabled(pipeFittingTargetKind)",
    "                  activeTool === 'pipe-fitting'",
  )
  normalized = replaceRequired(
    normalized,
    "                  activeTool === 'pipe-trap' && !isStructureToolDisabled(pipeTrapTargetKind)",
    "                  activeTool === 'pipe-trap'",
  )
  normalized = replaceRequired(
    normalized,
    `                disabled={isStructureToolDisabled(ductFittingTargetKind)}
                onClick={() => {
                  if (isStructureToolDisabled(ductFittingTargetKind)) return
                  triggerSFX('sfx:menu-click')
                  runBuildToolActivation(ductFittingTargetKind)
                }}
                onMouseEnter={() => {
                  if (!isStructureToolDisabled(ductFittingTargetKind)) {
                    triggerSFX('sfx:menu-hover')
                  }
                }}`,
    `                onClick={() => {
                  triggerSFX('sfx:menu-click')
                  activateBuildTool(activeTool === 'duct-fitting' ? 'duct-segment' : 'duct-fitting')
                }}
                onMouseEnter={() => triggerSFX('sfx:menu-hover')}`,
  )
  normalized = replaceRequired(
    normalized,
    `                disabled={isStructureToolDisabled(pipeFittingTargetKind)}
                onClick={() => {
                  if (isStructureToolDisabled(pipeFittingTargetKind)) return
                  triggerSFX('sfx:menu-click')
                  runBuildToolActivation(pipeFittingTargetKind)
                }}
                onMouseEnter={() => {
                  if (!isStructureToolDisabled(pipeFittingTargetKind)) {
                    triggerSFX('sfx:menu-hover')
                  }
                }}`,
    `                onClick={() => {
                  triggerSFX('sfx:menu-click')
                  activateBuildTool(activeTool === 'pipe-fitting' ? 'pipe-segment' : 'pipe-fitting')
                }}
                onMouseEnter={() => triggerSFX('sfx:menu-hover')}`,
  )
  normalized = replaceRequired(
    normalized,
    `                disabled={isStructureToolDisabled(pipeTrapTargetKind)}
                onClick={() => {
                  if (isStructureToolDisabled(pipeTrapTargetKind)) return
                  triggerSFX('sfx:menu-click')
                  runBuildToolActivation(pipeTrapTargetKind)
                }}
                onMouseEnter={() => {
                  if (!isStructureToolDisabled(pipeTrapTargetKind)) triggerSFX('sfx:menu-hover')
                }}`,
    `                onClick={() => {
                  triggerSFX('sfx:menu-click')
                  activateBuildTool(activeTool === 'pipe-trap' ? 'pipe-segment' : 'pipe-trap')
                }}
                onMouseEnter={() => triggerSFX('sfx:menu-hover')}`,
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
    "{!structureKindsRestricted && materialPaintEnabled && mode === 'material-paint' ? (",
    "{mode === 'material-paint' ? (",
  )
  return replaceRequired(
    normalized,
    ") : !structureKindsRestricted && mode === 'terrain-sculpt' ? (",
    ") : mode === 'terrain-sculpt' ? (",
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
  test('keeps the Build palette aligned with the declared Landrush host gates', () => {
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
    expect(landrush).toContain('allowedStructureKinds?: ReadonlySet<string>')
    expect(landrush).toContain('applyBuildTabStructureKindAllowList')
    expect(landrush).toContain('data-editor-build-controller-item')
    expect(landrush).toContain('data-editor-build-controller-action="placement"')
    expect(landrush).toContain('data-editor-build-controller-action="palette"')
    expect(landrush.match(/<BuildTabStructurePriceBadge/g) ?? []).toHaveLength(6)
    expect(landrush.match(/disabled=\{disabled\}/g) ?? []).toHaveLength(3)
    expect(landrush.match(/disabled=\{isStructureToolDisabled\(/g) ?? []).toHaveLength(3)
    expect(landrush).toContain('data-landrush-build-price-minimum')
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
    const itemCatalog = readSource(
      '../../../../packages/editor/src/components/ui/item-catalog/item-catalog.tsx',
    )

    expect(chrome).toContain(`<BuildTab
      capabilities={{ materialPaint: false }}
      interactionReady={interactionReady}
      isStructureToolDisabled={isStructureToolDisabled}
      renderStructurePriceBadge={renderLandrushStructurePriceBadge}
      runStructureToolActivation={runLandrushPascalToolActivationInCurrentLevel}
    />`)
    expect(chrome).toContain('isItemDisabled={isItemDisabled}')
    expect(chrome).toContain('renderItemBadge={renderLandrushItemPriceBadge}')
    expect(chrome).toContain("item.tool === 'cabinet' ? { ...item, tool: undefined } : item")
    expect(chrome).toContain('items={LANDRUSH_ITEM_CATALOG}')
    expect(itemCatalog).toContain('const disabled = isItemDisabled?.(item) ?? false')
    expect(itemCatalog).toContain('disabled={disabled}')
    expect(itemCatalog).toContain('if (disabled) return')
    expect(itemCatalog).toContain("setTool(item.tool ?? 'item')")
    expect(chrome).toContain(
      "buildCostsEnabled && !canAffordLandrushBuildSelection('item', profileMoney)",
    )
    expect(chrome).not.toContain('FIRST_HOUSE')
    expect(chrome).not.toContain('waitingOnFirstHouse')
    expect(chrome).not.toContain('first-house-build-gate')
    expect(chrome).not.toContain('allowedStructureKinds=')
    expect(chrome).toContain("import { CATALOG_ITEMS } from '@pascal-app/editor/catalog'")
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
      /editingChrome=\{\s*<LandrushPascalEditorChrome\s+active=\{buildEditorChromeActive && !zombieEscapeNightActive\}\s+buildCostsEnabled=\{!offline\}\s+chromeRootRef=\{buildEditorChromeRootRef\}\s+exitBuildButtonRef=\{buildEditorExitButtonRef\}\s+interactionReady=\{buildEditorInteractionReady\}\s+modeTransitionActive=\{buildEditorModeTransitionActive\}\s+onExitBuild=\{enterPlayerView\}\s+open=\{buildEditorLayoutOpen\}\s+profileMoney=\{multiplayer\.profileMoney\}\s*\/>/,
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

  test('keeps the compact multiplayer status visible across day and zombie chrome', () => {
    const statusPanel = readSource('multiplayer-status-panel.tsx')

    expect(statusPanel).toContain("import { createPortal } from 'react-dom'")
    expect(statusPanel).toContain('setPortalTarget(document.body)')
    expect(statusPanel).toContain(
      'fixed right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[120] flex min-h-7',
    )
    expect(statusPanel).toContain('data-landrush-multiplayer-status')
    expect(statusPanel).toContain('createPortal(panel, portalTarget)')
    expect(statusPanel).toContain('[latencyLabel, portalTarget]')
  })
})

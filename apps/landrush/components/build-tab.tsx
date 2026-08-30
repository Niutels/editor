'use client'

import { nodeRegistry } from '@pascal-app/core'
import {
  type FloorplanMode,
  getFloorplanNodeExtension,
  isFloorplanToolAvailableInMode,
  MaterialPaintPanel,
  TerrainSculptPanel,
  triggerSFX,
  useEditor,
  useFloorplanMode,
} from '@pascal-app/editor'
import { useLiquidLineToolOptions } from '@pascal-app/nodes'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/toolbar-tooltip'
import { cn } from '@/lib/utils'

/**
 * MEP (mechanical / plumbing) tool kinds surfaced under the Build tab's "MEP"
 * group tile — its own sub-grid, like Roof's "Features".
 */
type MepToolKind =
  | 'duct-segment'
  | 'duct-fitting'
  | 'duct-terminal'
  | 'hvac-equipment'
  | 'lineset'
  | 'liquid-line'
  | 'pipe-segment'
  | 'pipe-fitting'
  | 'pipe-trap'

type BuildType = {
  /** Selection id — equals `kind` for tool types, `'painting'` for paint mode, `'mep'` for the MEP group. */
  id: string
  label: string
  /** Raster asset tile (legacy Build sidebar artwork). */
  iconSrc: string
  /** Present for structure-tool types (absent for paint mode and the MEP group). */
  kind?: string
  paletteOrder?: number
  /** Non-placement special mode. */
  mode?: 'material-paint' | 'terrain-sculpt'
}

type MepItem = {
  /** Selection id — equals `kind`. */
  id: string
  label: string
  iconSrc: string
  kind: MepToolKind
}

// Same icons + ordering as the community Build sidebar, minus presets.
const BASE_BUILD_TYPES: BuildType[] = [
  { id: 'wall', label: 'Wall', iconSrc: '/icons/wall.webp', kind: 'wall' },
  { id: 'fence', label: 'Fence', iconSrc: '/icons/fence.webp', kind: 'fence' },
  { id: 'slab', label: 'Slab', iconSrc: '/icons/floor.webp', kind: 'slab' },
  { id: 'ceiling', label: 'Ceiling', iconSrc: '/icons/ceiling.webp', kind: 'ceiling' },
  { id: 'roof', label: 'Roof', iconSrc: '/icons/roof.webp', kind: 'roof' },
  { id: 'stair', label: 'Stairs', iconSrc: '/icons/stairs.webp', kind: 'stair' },
  { id: 'elevator', label: 'Elevator', iconSrc: '/icons/elevator.webp', kind: 'elevator' },
  { id: 'door', label: 'Door', iconSrc: '/icons/door.webp', kind: 'door' },
  { id: 'window', label: 'Window', iconSrc: '/icons/window.webp', kind: 'window' },
  { id: 'column', label: 'Column', iconSrc: '/icons/column.webp', kind: 'column' },
  { id: 'shelf', label: 'Shelf', iconSrc: '/icons/shelf.webp', kind: 'shelf' },
  { id: 'spawn', label: 'Spawn Point', iconSrc: '/icons/spawn-point.webp', kind: 'spawn' },
  // Group tile — no tool of its own; opens the MEP sub-grid below (like Roof).
  { id: 'mep', label: 'MEP', iconSrc: '/icons/HVAC.webp' },
  { id: 'painting', label: 'Painting', iconSrc: '/icons/paint.webp', mode: 'material-paint' },
  { id: 'terrain', label: 'Terrain', iconSrc: '/icons/mesh.webp', mode: 'terrain-sculpt' },
]

export type BuildTabCapabilities = {
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
const VARIABLE_STRUCTURE_PRICE_KINDS = new Set(['duct-segment', 'liquid-line', 'pipe-segment'])

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

const subscribeToClientMount = () => () => {}

function collectBuildTypes(floorplanMode: FloorplanMode): BuildType[] {
  const baseKinds = new Set(BASE_BUILD_TYPES.flatMap((type) => (type.kind ? [type.kind] : [])))
  const tools = BASE_BUILD_TYPES.filter((type) => type.kind).map((type, index) => ({
    ...type,
    paletteOrder:
      nodeRegistry.get(type.kind!)?.presentation?.paletteOrder ?? type.paletteOrder ?? index * 10,
  }))
  for (const [kind, definition] of nodeRegistry.entries()) {
    const presentation = definition.presentation
    const extension = getFloorplanNodeExtension(definition)
    if (
      baseKinds.has(kind) ||
      definition.presentation?.paletteGroup === 'roof-features' ||
      !extension?.tool ||
      !isFloorplanToolAvailableInMode(extension.availableModes, floorplanMode) ||
      !presentation ||
      presentation.hidden ||
      presentation.paletteSection !== 'structure'
    ) {
      continue
    }
    tools.push({
      id: kind,
      kind,
      label: presentation.label,
      iconSrc: presentation.icon.kind === 'url' ? presentation.icon.src : '/icons/spawn-point.webp',
      paletteOrder: presentation.paletteOrder ?? Number.MAX_SAFE_INTEGER,
    })
  }
  tools.sort((left, right) => (left.paletteOrder ?? 0) - (right.paletteOrder ?? 0))
  return [...tools, ...BASE_BUILD_TYPES.filter((type) => !type.kind)]
}

// MEP sub-grid surfaced under the "MEP" tile — same icons + ordering the MEP
// tools had in the community Build sidebar.
const MEP_ITEMS: MepItem[] = [
  { id: 'duct-segment', label: 'Duct', iconSrc: '/icons/duct.webp', kind: 'duct-segment' },
  {
    id: 'duct-terminal',
    label: 'Register',
    iconSrc: '/icons/registers.webp',
    kind: 'duct-terminal',
  },
  { id: 'hvac-equipment', label: 'HVAC Unit', iconSrc: '/icons/HVAC.webp', kind: 'hvac-equipment' },
  { id: 'lineset', label: 'Lineset', iconSrc: '/icons/lineset.webp', kind: 'lineset' },
  { id: 'liquid-line', label: 'Liquid Line', iconSrc: '/icons/lineset.webp', kind: 'liquid-line' },
  { id: 'pipe-segment', label: 'DWV Pipe', iconSrc: '/icons/dwv-pipes.webp', kind: 'pipe-segment' },
]

/**
 * Activate a raw structure draw/cursor tool. Mirrors the editor's own
 * structure-tool activation (`setPhase`/`setStructureLayer`/`setMode`/`setTool`).
 */
function activateBuildTool(kind: string): void {
  const ed = useEditor.getState()
  const definition = nodeRegistry.get(kind)
  const extension = getFloorplanNodeExtension(definition)
  if (
    !isFloorplanToolAvailableInMode(extension?.availableModes, useFloorplanMode.getState().mode)
  ) {
    useFloorplanMode.getState().showExpertModeNotice(definition?.presentation?.label ?? kind)
    return
  }
  const preferredView = extension?.preferredView
  if (preferredView) ed.setViewMode(preferredView)
  ed.setPhase('structure')
  ed.setStructureLayer('elements')
  ed.setCatalogCategory(null)
  ed.setToolDefaults(kind, null)
  ed.setMode('build')
  ed.setTool(kind)
}

/** Enter material-paint mode — the Build tab's "Painting" category. */
function activatePaintMode(): void {
  const ed = useEditor.getState()
  ed.setPhase('structure')
  ed.setStructureLayer('elements')
  ed.setMode('material-paint')
}

/**
 * Enter terrain-sculpt mode — the Build tab's "Terrain" category. No `setPhase`:
 * `setMode` moves to the site phase itself, since sculpting is a site-phase mode.
 */
function activateTerrainSculptMode(): void {
  useEditor.getState().setMode('terrain-sculpt')
}

type RoofFeature = { kind: string; label: string; iconSrc: string }

const ROOF_FEATURE_FALLBACK_ICON = '/icons/roof.webp'

/**
 * Roof accessories and extensions surfaced under the Roof tile. Unlike the
 * community editor these aren't DB presets — each is a registry kind, either
 * carrying `capabilities.roofAccessory` or explicitly classified as a roof
 * extension. They are enumerated at render time because the registry is
 * populated during app bootstrap. Label + icon come from `presentation`;
 * non-url icons fall back to the roof icon.
 */
function activateRoofFeatureTool(kind: string): void {
  const ed = useEditor.getState()
  ed.setPhase('structure')
  ed.setStructureLayer('elements')
  ed.setCatalogCategory(null)
  ed.setMode('build')
  ed.setTool(kind)
}

/**
 * Build tab for the open-source standalone editor — a preset-less replica of
 * the community Build sidebar. Clicking a type activates its raw tool, drawn
 * with the kind's own `def.defaults()`. The "Painting" type swaps in the
 * material-paint panel.
 */
// MEP tool kinds that, when active, mean the MEP group tile (and its sub-grid)
// is what the user is working in.
const MEP_TOOL_KINDS = new Set<string>([
  ...MEP_ITEMS.map((item) => item.kind),
  'duct-fitting',
  'pipe-fitting',
  'pipe-trap',
])

export function BuildTab({
  allowedStructureKinds,
  capabilities,
  interactionReady = true,
  isStructureToolDisabled = isStructureToolNeverDisabled,
  renderStructurePriceBadge,
  runStructureToolActivation = runToolActivationDirectly,
}: BuildTabProps = {}) {
  const materialPaintEnabled =
    capabilities?.materialPaint ?? FULL_BUILD_TAB_CAPABILITIES.materialPaint
  const activeTool = useEditor((s) => s.tool)
  const mode = useEditor((s) => s.mode)
  const floorplanMode = useFloorplanMode((s) => s.mode)
  const follow = useLiquidLineToolOptions((s) => s.follow)
  const toggleFollow = useLiquidLineToolOptions((s) => s.toggleFollow)
  const registryReady = useSyncExternalStore(
    subscribeToClientMount,
    () => true,
    () => false,
  )
  const structureKindsRestricted = allowedStructureKinds !== undefined
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
  }, [allowedStructureKinds, floorplanMode, materialPaintEnabled, registryReady])

  // The fitting / follow tools are armed from a segment's panel, not a grid
  // tile — keep the segment tile lit so the panel (and the way back) stays
  // visible.
  const ductContext =
    mode === 'build' && (activeTool === 'duct-segment' || activeTool === 'duct-fitting')
  const pipeContext =
    mode === 'build' &&
    (activeTool === 'pipe-segment' || activeTool === 'pipe-fitting' || activeTool === 'pipe-trap')
  const liquidLineContext = mode === 'build' && activeTool === 'liquid-line'
  const ductFittingTargetKind = activeTool === 'duct-fitting' ? 'duct-segment' : 'duct-fitting'
  const pipeFittingTargetKind = activeTool === 'pipe-fitting' ? 'pipe-segment' : 'pipe-fitting'
  const pipeTrapTargetKind = activeTool === 'pipe-trap' ? 'pipe-segment' : 'pipe-trap'

  const isMepItemActive = (item: MepItem) =>
    item.kind === 'duct-segment'
      ? ductContext
      : item.kind === 'pipe-segment'
        ? pipeContext
        : item.kind === 'liquid-line'
          ? liquidLineContext
          : mode === 'build' && activeTool === item.kind

  // Read at render time (not module scope): the registry is populated by the
  // app bootstrap, so enumerating earlier would race it and see no kinds.
  const roofFeatures = useMemo<RoofFeature[]>(() => {
    if (!registryReady) return []
    const features: RoofFeature[] = []
    for (const [kind, def] of nodeRegistry.entries()) {
      if (
        !isStructureKindAllowed(kind) ||
        (def.capabilities.roofAccessory === undefined &&
          def.presentation?.paletteGroup !== 'roof-features')
      ) {
        continue
      }
      // Door / window declare `roofAccessory` for the wall-face cut but
      // already have their own Build tiles — listing them here too
      // would duplicate the entry under Roof → Features.
      if (def.capabilities.wallOpeningPlacement) continue
      const icon = def.presentation?.icon
      features.push({
        kind,
        label: def.presentation?.label ?? kind,
        iconSrc: icon?.kind === 'url' ? icon.src : ROOF_FEATURE_FALLBACK_ICON,
      })
    }
    return features
  }, [isStructureKindAllowed, registryReady])

  // Tile highlight derives from the single source of truth (the active tool /
  // mode), never a separate local selection — so keyboard shortcuts and panel
  // clicks always agree on which tile is lit.
  // The roof Features sub-grid arms roof-accessory tools (skylight, chimney,
  // …); keep the Roof tile lit (and its panel open) while any of them is the
  // active tool, the same way MEP stays lit for its sub-grid tools.
  const isRoofFeatureActive =
    mode === 'build' && !!activeTool && roofFeatures.some((f) => f.kind === activeTool)
  const isMepActive =
    !structureKindsRestricted && mode === 'build' && !!activeTool && MEP_TOOL_KINDS.has(activeTool)

  const isTypeActive = (type: BuildType) => {
    if (type.mode) return mode === type.mode
    if (type.id === 'mep') return isMepActive
    if (type.id === 'roof')
      return mode === 'build' && (activeTool === 'roof' || isRoofFeatureActive)
    return mode === 'build' && activeTool === type.kind
  }

  const runBuildToolActivation = useCallback(
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
  )

  // On open, land on the first enabled build tool — parity with the community Build
  // sidebar, so switching to Build immediately arms a usable tool. Skip when a
  // build tool is already active (e.g. the B shortcut armed one before this
  // panel mounted): the active tool is the source of truth, not this default.
  const didInitRef = useRef(false)
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
  ])

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <TooltipProvider delayDuration={0} disableHoverableContent>
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
        >
          {buildTypes.map((type) => {
            const priceKind = type.kind ?? (type.id === 'mep' ? MEP_ITEMS[0]!.kind : undefined)
            const disabled = priceKind ? isStructureToolDisabled(priceKind) : false
            const active = !disabled && isTypeActive(type)
            return (
              <Tooltip key={type.id}>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      'group relative flex aspect-square items-center justify-center rounded-xl p-1 transition-all duration-200',
                      active
                        ? 'bg-primary/10 ring-1 ring-primary/50'
                        : 'bg-muted/40 opacity-70 grayscale hover:bg-muted hover:opacity-100 hover:grayscale-0',
                      disabled &&
                        'cursor-not-allowed opacity-35 hover:bg-muted/40 hover:opacity-35 hover:grayscale',
                    )}
                    data-editor-build-controller-action={
                      type.id === 'mep' ? 'palette' : 'placement'
                    }
                    data-editor-build-controller-item
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return
                      triggerSFX('sfx:menu-click')
                      handleTypeClick(type)
                    }}
                    onMouseEnter={() => {
                      if (!disabled) triggerSFX('sfx:menu-hover')
                    }}
                    type="button"
                  >
                    <Image
                      alt={type.label}
                      className="size-full object-contain transition-transform duration-200 group-hover:scale-110 group-disabled:scale-100"
                      height={48}
                      src={type.iconSrc}
                      width={48}
                    />
                    <BuildTabStructurePriceBadge
                      kind={priceKind}
                      renderPriceBadge={renderStructurePriceBadge}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="pointer-events-none" side="top">
                  {type.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>

      {!structureKindsRestricted && materialPaintEnabled && mode === 'material-paint' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MaterialPaintPanel />
        </div>
      ) : !structureKindsRestricted && mode === 'terrain-sculpt' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TerrainSculptPanel />
        </div>
      ) : mode === 'build' &&
        (activeTool === 'roof' || isRoofFeatureActive) &&
        roofFeatures.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          <div className="px-0.5 pt-1 font-medium text-muted-foreground text-xs">
            Features & extensions
          </div>
          <TooltipProvider delayDuration={0} disableHoverableContent>
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
            >
              {roofFeatures.map((feature) => {
                const disabled = isStructureToolDisabled(feature.kind)
                const active = !disabled && mode === 'build' && activeTool === feature.kind
                return (
                  <Tooltip key={feature.kind}>
                    <TooltipTrigger asChild>
                      <button
                        className={cn(
                          'group relative flex aspect-square items-center justify-center rounded-xl p-1 transition-all duration-200',
                          active
                            ? 'bg-primary/10 ring-1 ring-primary/50'
                            : 'bg-muted/40 opacity-70 grayscale hover:bg-muted hover:opacity-100 hover:grayscale-0',
                          disabled &&
                            'cursor-not-allowed opacity-35 hover:bg-muted/40 hover:opacity-35 hover:grayscale',
                        )}
                        data-editor-build-controller-action="placement"
                        data-editor-build-controller-item
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return
                          triggerSFX('sfx:menu-click')
                          runRoofFeatureActivation(feature.kind)
                        }}
                        onMouseEnter={() => {
                          if (!disabled) triggerSFX('sfx:menu-hover')
                        }}
                        type="button"
                      >
                        <Image
                          alt={feature.label}
                          className="size-full object-contain transition-transform duration-200 group-hover:scale-110 group-disabled:scale-100"
                          height={48}
                          src={feature.iconSrc}
                          width={48}
                        />
                        <BuildTabStructurePriceBadge
                          kind={feature.kind}
                          renderPriceBadge={renderStructurePriceBadge}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="pointer-events-none" side="top">
                      {feature.label}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </TooltipProvider>
        </div>
      ) : isMepActive ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          <div className="px-0.5 pt-1 font-medium text-muted-foreground text-xs">MEP</div>
          <TooltipProvider delayDuration={0} disableHoverableContent>
            <div
              className="grid gap-1.5 px-0.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
            >
              {MEP_ITEMS.map((item) => {
                const disabled = isStructureToolDisabled(item.kind)
                const active = !disabled && isMepItemActive(item)
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>
                      <button
                        className={cn(
                          'group relative flex aspect-square items-center justify-center rounded-xl transition-all duration-200',
                          active
                            ? 'bg-primary/10 ring-1 ring-primary/50'
                            : 'bg-muted/40 opacity-70 grayscale hover:bg-muted hover:opacity-100 hover:grayscale-0',
                          disabled &&
                            'cursor-not-allowed opacity-35 hover:bg-muted/40 hover:opacity-35 hover:grayscale',
                        )}
                        data-editor-build-controller-action="placement"
                        data-editor-build-controller-item
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return
                          triggerSFX('sfx:menu-click')
                          runBuildToolActivation(item.kind)
                        }}
                        onMouseEnter={() => {
                          if (!disabled) triggerSFX('sfx:menu-hover')
                        }}
                        type="button"
                      >
                        <Image
                          alt={item.label}
                          className="size-full object-contain transition-transform duration-200 group-hover:scale-110 group-disabled:scale-100"
                          height={48}
                          src={item.iconSrc}
                          width={48}
                        />
                        <BuildTabStructurePriceBadge
                          kind={item.kind}
                          renderPriceBadge={renderStructurePriceBadge}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="pointer-events-none" side="top">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </TooltipProvider>

          {ductContext ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">Duct</span>
              <button
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-35 disabled:ring-0 disabled:hover:bg-muted/40',
                  renderStructurePriceBadge && 'relative pr-14 pl-3',
                  activeTool === 'duct-fitting' && !isStructureToolDisabled(ductFittingTargetKind)
                    ? 'bg-primary/10 ring-1 ring-primary/50'
                    : 'bg-muted/40 hover:bg-muted',
                )}
                data-editor-build-controller-action="placement"
                data-editor-build-controller-item
                disabled={isStructureToolDisabled(ductFittingTargetKind)}
                onClick={() => {
                  if (isStructureToolDisabled(ductFittingTargetKind)) return
                  triggerSFX('sfx:menu-click')
                  runBuildToolActivation(ductFittingTargetKind)
                }}
                onMouseEnter={() => {
                  if (!isStructureToolDisabled(ductFittingTargetKind)) {
                    triggerSFX('sfx:menu-hover')
                  }
                }}
                type="button"
              >
                <Image
                  alt=""
                  aria-hidden
                  className="size-4 object-contain"
                  height={16}
                  src="/icons/duct-fitting.webp"
                  width={16}
                />
                Add Fitting
                <BuildTabStructurePriceBadge
                  kind={ductFittingTargetKind}
                  renderPriceBadge={renderStructurePriceBadge}
                />
              </button>
            </div>
          ) : null}

          {pipeContext ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">DWV Pipe</span>
              <button
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-35 disabled:ring-0 disabled:hover:bg-muted/40',
                  renderStructurePriceBadge && 'relative pr-14 pl-3',
                  activeTool === 'pipe-fitting' && !isStructureToolDisabled(pipeFittingTargetKind)
                    ? 'bg-primary/10 ring-1 ring-primary/50'
                    : 'bg-muted/40 hover:bg-muted',
                )}
                data-editor-build-controller-action="placement"
                data-editor-build-controller-item
                disabled={isStructureToolDisabled(pipeFittingTargetKind)}
                onClick={() => {
                  if (isStructureToolDisabled(pipeFittingTargetKind)) return
                  triggerSFX('sfx:menu-click')
                  runBuildToolActivation(pipeFittingTargetKind)
                }}
                onMouseEnter={() => {
                  if (!isStructureToolDisabled(pipeFittingTargetKind)) {
                    triggerSFX('sfx:menu-hover')
                  }
                }}
                type="button"
              >
                <Image
                  alt=""
                  aria-hidden
                  className="size-4 object-contain"
                  height={16}
                  src="/icons/duct-fitting.webp"
                  width={16}
                />
                Add Fitting
                <BuildTabStructurePriceBadge
                  kind={pipeFittingTargetKind}
                  renderPriceBadge={renderStructurePriceBadge}
                />
              </button>
              <button
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-35 disabled:ring-0 disabled:hover:bg-muted/40',
                  renderStructurePriceBadge && 'relative pr-14 pl-3',
                  activeTool === 'pipe-trap' && !isStructureToolDisabled(pipeTrapTargetKind)
                    ? 'bg-primary/10 ring-1 ring-primary/50'
                    : 'bg-muted/40 hover:bg-muted',
                )}
                data-editor-build-controller-action="placement"
                data-editor-build-controller-item
                disabled={isStructureToolDisabled(pipeTrapTargetKind)}
                onClick={() => {
                  if (isStructureToolDisabled(pipeTrapTargetKind)) return
                  triggerSFX('sfx:menu-click')
                  runBuildToolActivation(pipeTrapTargetKind)
                }}
                onMouseEnter={() => {
                  if (!isStructureToolDisabled(pipeTrapTargetKind)) triggerSFX('sfx:menu-hover')
                }}
                type="button"
              >
                <Image
                  alt=""
                  aria-hidden
                  className="size-4 object-contain"
                  height={16}
                  src="/icons/dwv-pipes.webp"
                  width={16}
                />
                Add Trap
                <BuildTabStructurePriceBadge
                  kind={pipeTrapTargetKind}
                  renderPriceBadge={renderStructurePriceBadge}
                />
              </button>
            </div>
          ) : null}

          {liquidLineContext ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">Liquid Line</span>
              <button
                className={cn(
                  'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
                  follow ? 'bg-primary/10 ring-1 ring-primary/50' : 'bg-muted/40 hover:bg-muted',
                )}
                data-editor-build-controller-action="palette"
                data-editor-build-controller-item
                onClick={() => {
                  triggerSFX('sfx:menu-click')
                  toggleFollow()
                }}
                onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                type="button"
              >
                <span>Follow lineset</span>
                <span className="text-muted-foreground text-xs">{follow ? 'On' : 'Off'}</span>
              </button>
              <span className="px-1 text-[11px] text-muted-foreground">
                {follow
                  ? 'Click a lineset to lay the line beside it.'
                  : 'Trace a line alongside an existing lineset (F).'}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

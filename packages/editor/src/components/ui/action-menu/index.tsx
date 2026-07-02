'use client'

import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { AnimatePresence, motion } from 'motion/react'
import { memo, Profiler, type ProfilerOnRenderCallback, type ReactNode, useEffect, useMemo } from 'react'
import { MaterialPicker } from './../../../components/ui/controls/material-picker'
import { TooltipProvider } from './../../../components/ui/primitives/tooltip'
import { useIsMobile } from './../../../hooks/use-mobile'
import { useReducedMotion } from './../../../hooks/use-reduced-motion'
import { resolvePaintTargetFromSelection } from './../../../lib/material-paint'
import { cn } from './../../../lib/utils'
import useEditor from './../../../store/use-editor'
import { CameraActions } from './camera-actions'
import { ControlModes } from './control-modes'
import { StructureTools } from './structure-tools'
import { GridSnapControl, SecondaryToggles } from './view-toggles'

// Mobile bottom offset matches the viewer's overlap behind the sheet's
// rounded corners (SHEET_OVERLAP_PX in editor-layout-mobile) so the menu sits
// just above that strip instead of inside it.
const MOBILE_BOTTOM_OFFSET = 24
const CONTEXTUAL_PANEL_IDS = ['ai', 'items', 'studio'] as const

type ActionMenuReactProfilerConfig = {
  enabled: boolean
  idPrefix: string
  onRender: ProfilerOnRenderCallback
}

function ActionMenuReactProfiler({
  children,
  config,
  id,
}: {
  children: ReactNode
  config?: ActionMenuReactProfilerConfig
  id: string
}) {
  if (!config?.enabled) return <>{children}</>
  return (
    <Profiler id={`${config.idPrefix}.${id}`} onRender={config.onRender}>
      {children}
    </Profiler>
  )
}

function PaintMaterialTray() {
  const activePaintMaterial = useEditor((state) => state.activePaintMaterial)
  const activePaintTarget = useEditor((state) => state.activePaintTarget)
  const setActivePaintMaterial = useEditor((state) => state.setActivePaintMaterial)
  const setActivePaintTarget = useEditor((state) => state.setActivePaintTarget)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const nodes = useScene((state) => state.nodes)
  const selectedId = selectedIds.length === 1 ? (selectedIds[0] ?? null) : null

  useEffect(() => {
    const selectedPaintTarget = resolvePaintTargetFromSelection({
      nodes,
      selectedId,
    })

    if (selectedPaintTarget) {
      setActivePaintTarget(selectedPaintTarget)
    }
  }, [nodes, selectedId, setActivePaintTarget])

  return (
    <div className="w-[42rem] max-w-[calc(100vw-2rem)]">
      <MaterialPicker
        onChange={(material) => {
          setActivePaintMaterial({ material, sourceTarget: activePaintTarget })
        }}
        onSelectMaterialPreset={(materialPreset) => {
          setActivePaintMaterial({ materialPreset, sourceTarget: activePaintTarget })
        }}
        selectedMaterialPreset={activePaintMaterial?.materialPreset}
        value={activePaintMaterial?.material}
      />
    </div>
  )
}

export const ActionMenu = memo(function ActionMenu({
  availableMobilePanelIds,
  className,
  reactProfiler,
}: {
  availableMobilePanelIds?: readonly string[]
  className?: string
  reactProfiler?: ActionMenuReactProfilerConfig
}) {
  const phase = useEditor((state) => state.phase)
  const mode = useEditor((state) => state.mode)
  const isMobile = useIsMobile()
  const contextualMobilePanelIds = useMemo(() => {
    const availablePanels = availableMobilePanelIds ? new Set(availableMobilePanelIds) : null
    return new Set<string>(
      CONTEXTUAL_PANEL_IDS.filter((id) => !availablePanels || availablePanels.has(id)),
    )
  }, [availableMobilePanelIds])
  const hasSelectionOnMobile = useViewer((s) => isMobile && s.selection.selectedIds.length > 0)
  const hasReferenceOnMobile = useEditor((s) => isMobile && Boolean(s.selectedReferenceId))
  const isContextualPanelOnMobile = useEditor(
    (s) => isMobile && contextualMobilePanelIds.has(s.activeSidebarPanel),
  )
  const reducedMotion = useReducedMotion()
  const showPaintTray = useMemo(() => mode === 'material-paint', [mode])

  // On mobile, defer the bottom rail to the selection bar when something
  // is selected — the contextual actions take priority over mode controls.
  // Also hide on Chat / Items / Studio tabs; those are contextual workflows
  // (composing / picking furniture / generating renders) where the build
  // menu is irrelevant.
  if (hasSelectionOnMobile || hasReferenceOnMobile || isContextualPanelOnMobile) return null

  const transition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, bounce: 0.2, duration: 0.4 }

  return (
    <TooltipProvider>
      <motion.div
        className={cn(
          'left-1/2 z-50 -translate-x-1/2',
          isMobile
            ? 'absolute w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] origin-bottom scale-90'
            : 'fixed bottom-6',
          'rounded-2xl border border-border bg-background/90 shadow-2xl backdrop-blur-md',
          'transition-colors duration-200 ease-out',
          className,
        )}
        layout
        style={isMobile ? { bottom: MOBILE_BOTTOM_OFFSET } : undefined}
        transition={transition}
      >
        {/* Structure Tools Row - Animated */}
        <AnimatePresence>
          {phase === 'structure' && mode === 'build' && (
            <motion.div
              animate={{
                opacity: 1,
                maxHeight: 80,
                paddingTop: 8,
                paddingBottom: 8,
                borderBottomWidth: 1,
              }}
              className={cn('max-h-20 overflow-hidden border-border border-b px-2 py-2')}
              exit={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              initial={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              transition={transition}
            >
              <div className="no-scrollbar max-w-full overflow-x-auto overscroll-x-contain [touch-action:pan-x]">
                <div className="w-max">
                  <ActionMenuReactProfiler config={reactProfiler} id="action-menu.structure-tools">
                    <StructureTools />
                  </ActionMenuReactProfiler>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPaintTray && (
            <motion.div
              animate={{
                opacity: 1,
                maxHeight: 96,
                paddingTop: 8,
                paddingBottom: 8,
                borderBottomWidth: 1,
              }}
              className={cn('overflow-hidden border-border border-b px-3')}
              exit={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              initial={{
                opacity: 0,
                maxHeight: 0,
                paddingTop: 0,
                paddingBottom: 0,
                borderBottomWidth: 0,
              }}
              transition={transition}
            >
              <ActionMenuReactProfiler config={reactProfiler} id="action-menu.paint-material-tray">
                <PaintMaterialTray />
              </ActionMenuReactProfiler>
            </motion.div>
          )}
        </AnimatePresence>
        {isMobile ? (
          <div className="px-2 py-1.5">
            <div className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain [touch-action:pan-x]">
              <div className="w-max shrink-0">
                <ActionMenuReactProfiler config={reactProfiler} id="action-menu.control-modes">
                  <ControlModes />
                </ActionMenuReactProfiler>
              </div>
              <div className="mx-1 h-5 w-px shrink-0 bg-border" />
              <div className="shrink-0">
                <ActionMenuReactProfiler config={reactProfiler} id="action-menu.grid-snap-control">
                  <GridSnapControl />
                </ActionMenuReactProfiler>
              </div>
              <div className="shrink-0">
                <ActionMenuReactProfiler config={reactProfiler} id="action-menu.secondary-toggles">
                  <SecondaryToggles />
                </ActionMenuReactProfiler>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1 px-2 py-1.5">
            <ActionMenuReactProfiler config={reactProfiler} id="action-menu.control-modes">
              <ControlModes />
            </ActionMenuReactProfiler>
            <div className="mx-1 h-5 w-px bg-border" />
            <ActionMenuReactProfiler config={reactProfiler} id="action-menu.grid-snap-control">
              <GridSnapControl />
            </ActionMenuReactProfiler>
            <ActionMenuReactProfiler config={reactProfiler} id="action-menu.secondary-toggles">
              <SecondaryToggles />
            </ActionMenuReactProfiler>
            <div className="mx-1 h-5 w-px bg-border" />
            <ActionMenuReactProfiler config={reactProfiler} id="action-menu.camera-actions">
              <CameraActions />
            </ActionMenuReactProfiler>
          </div>
        )}
      </motion.div>
    </TooltipProvider>
  )
})

'use client'

import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
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
import { SecondaryToggles } from './view-toggles'

const MOBILE_BOTTOM_OFFSET = 24
const CONTEXTUAL_TABS = new Set(['ai', 'items', 'studio'])

function PaintMaterialTray() {
  const activePaintMaterial = useEditor((state) => state.activePaintMaterial)
  const activePaintTarget = useEditor((state) => state.activePaintTarget)
  const setActivePaintMaterial = useEditor((state) => state.setActivePaintMaterial)
  const setActivePaintTarget = useEditor((state) => state.setActivePaintTarget)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const nodes = useScene((state) => state.nodes)
  const selectedId = selectedIds.length === 1 ? (selectedIds[0] ?? null) : null

  useEffect(() => {
    const selectedPaintTarget = resolvePaintTargetFromSelection({ nodes, selectedId })
    if (selectedPaintTarget) setActivePaintTarget(selectedPaintTarget)
  }, [nodes, selectedId, setActivePaintTarget])

  return (
    <div className="w-[42rem] max-w-[calc(100vw-2rem)]">
      <MaterialPicker
        onSelectMaterialPreset={(materialPreset) => {
          setActivePaintMaterial({ materialPreset, sourceTarget: activePaintTarget })
        }}
        selectedMaterialPreset={activePaintMaterial?.materialPreset}
      />
    </div>
  )
}

export function ActionMenu({
  className,
  showFullToolset = false,
}: {
  className?: string
  showFullToolset?: boolean
}) {
  const phase = useEditor((state) => state.phase)
  const mode = useEditor((state) => state.mode)
  const isMobile = useIsMobile()
  const hasSelectionOnMobile = useViewer((state) =>
    isMobile ? state.selection.selectedIds.length > 0 : false,
  )
  const hasReferenceOnMobile = useEditor((state) =>
    isMobile ? Boolean(state.selectedReferenceId) : false,
  )
  const isContextualPanelOnMobile = useEditor(
    (state) => isMobile && !showFullToolset && CONTEXTUAL_TABS.has(state.activeSidebarPanel),
  )
  const reducedMotion = useReducedMotion()

  if (hasSelectionOnMobile || hasReferenceOnMobile || isContextualPanelOnMobile) return null

  const transition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, bounce: 0.2, duration: 0.4 }
  const showStructureTools =
    showFullToolset && phase === 'structure' && (mode === 'select' || mode === 'build')
  const showPaintTray = showFullToolset && mode === 'material-paint'

  return (
    <TooltipProvider>
      <motion.div
        className={cn(
          'pointer-events-none left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden',
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
        <AnimatePresence>
          {showStructureTools ? (
            <motion.div
              animate={{ opacity: 1, maxHeight: 80, paddingTop: 8, paddingBottom: 8 }}
              className="pointer-events-auto max-h-20 w-[min(42rem,calc(100vw-2rem))] overflow-hidden border-border border-b px-2"
              exit={{ opacity: 0, maxHeight: 0, paddingTop: 0, paddingBottom: 0 }}
              initial={{ opacity: 0, maxHeight: 0, paddingTop: 0, paddingBottom: 0 }}
              transition={transition}
            >
              <div className="no-scrollbar max-w-full overflow-x-auto overscroll-x-contain [touch-action:pan-x]">
                <div className="w-max">
                  <StructureTools />
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {showPaintTray ? (
            <motion.div
              animate={{ opacity: 1, maxHeight: 96, paddingTop: 8, paddingBottom: 8 }}
              className="pointer-events-auto overflow-hidden border-border border-b px-3"
              exit={{ opacity: 0, maxHeight: 0, paddingTop: 0, paddingBottom: 0 }}
              initial={{ opacity: 0, maxHeight: 0, paddingTop: 0, paddingBottom: 0 }}
              transition={transition}
            >
              <PaintMaterialTray />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {isMobile ? (
          <div className="pointer-events-auto px-2 py-1.5">
            <div className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain [touch-action:pan-x]">
              <div className="w-max shrink-0">
                <ControlModes full={showFullToolset} />
              </div>
              <div className="mx-1 h-5 w-px shrink-0 bg-border" />
              <div className="shrink-0">
                <SecondaryToggles />
              </div>
            </div>
          </div>
        ) : (
          <div className="pointer-events-auto flex items-center justify-center gap-1 px-2 py-1.5">
            <ControlModes full={showFullToolset} />
            <div className="mx-1 h-5 w-px bg-border" />
            <SecondaryToggles />
            <div className="mx-1 h-5 w-px bg-border" />
            <CameraActions />
          </div>
        )}
      </motion.div>
    </TooltipProvider>
  )
}

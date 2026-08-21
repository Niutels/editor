'use client'

import {
  exitLandrushPascalEditingToSelect,
  runLandrushPascalToolActivationInCurrentLevel,
} from '@landrush/pascal-host'
import {
  FloatingLevelSelector,
  ItemsPanel,
  SettingsPanel,
  triggerSFX,
  useEditor,
  useSidebarStore,
} from '@pascal-app/editor'
import { LogOut } from 'lucide-react'
import Image from 'next/image'
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react'
import { BuildTab } from '@/components/build-tab'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/toolbar-tooltip'
import {
  type CommunityViewerToolbarCapabilities,
  CommunityViewerToolbarLeft,
  CommunityViewerToolbarRight,
} from '@/components/viewer-toolbar'
import { cn } from '@/lib/utils'

const RAIL_WIDTH = 56
const SIDEBAR_MIN_WIDTH = 300
const SIDEBAR_MAX_WIDTH = 800
const SIDEBAR_COLLAPSE_THRESHOLD = 220

const LANDRUSH_VIEWER_CAPABILITIES: CommunityViewerToolbarCapabilities = {
  cameraProjection: false,
  floorplan: false,
  preview: false,
  walkthrough: false,
}

const EDITOR_TABS = [
  { id: 'build', iconSrc: '/icons/build.webp', label: 'Build' },
  { id: 'items', iconSrc: '/icons/couch.webp', label: 'Items' },
  { id: 'settings', iconSrc: '/icons/settings.webp', label: 'Settings' },
] as const

type EditorPanelId = (typeof EDITOR_TABS)[number]['id']

function isEditorPanelId(value: string): value is EditorPanelId {
  return EDITOR_TABS.some((tab) => tab.id === value)
}

export function LandrushPascalEditorChrome({ onExitBuild }: { onExitBuild: () => void }) {
  const width = useSidebarStore((state) => state.width)
  const isCollapsed = useSidebarStore((state) => state.isCollapsed)
  const setIsCollapsed = useSidebarStore((state) => state.setIsCollapsed)
  const setWidth = useSidebarStore((state) => state.setWidth)
  const isDragging = useSidebarStore((state) => state.isDragging)
  const setIsDragging = useSidebarStore((state) => state.setIsDragging)
  const storedActivePanel = useEditor((state) => state.activeSidebarPanel)
  const editorMode = useEditor((state) => state.mode)
  const selectionTool = useEditor((state) => state.floorplanSelectionTool)
  const setActivePanel = useEditor((state) => state.setActiveSidebarPanel)
  const activePanel = isEditorPanelId(storedActivePanel) ? storedActivePanel : 'build'
  const isResizing = useRef(false)

  useEffect(() => {
    const editor = useEditor.getState()
    editor.setFirstPersonMode(false)
    editor.setPreviewMode(false)
    editor.setViewMode('3d')
  }, [])

  useEffect(() => {
    if (activePanel === 'items') return
    const editor = useEditor.getState()
    if (editor.phase === 'furnish' && editor.mode === 'build') editor.setMode('select')
  }, [activePanel])

  useEffect(() => {
    if (!isCollapsed) return
    const editor = useEditor.getState()
    if (editor.mode === 'build') editor.setMode('select')
  }, [isCollapsed])

  const handleRailClick = useCallback(
    (panelId: EditorPanelId) => {
      if (isCollapsed) {
        setIsCollapsed(false)
        if (width < SIDEBAR_MIN_WIDTH) setWidth(SIDEBAR_MIN_WIDTH)
        setActivePanel(panelId)
        return
      }
      if (panelId === activePanel) {
        setIsCollapsed(true)
        return
      }
      setActivePanel(panelId)
    },
    [activePanel, isCollapsed, setActivePanel, setIsCollapsed, setWidth, width],
  )

  const handleResizerDown = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault()
      isResizing.current = true
      setIsDragging(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [setIsDragging],
  )

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isResizing.current) return
      const nextWidth = event.clientX - RAIL_WIDTH
      if (nextWidth < SIDEBAR_COLLAPSE_THRESHOLD) {
        setIsCollapsed(true)
      } else {
        setIsCollapsed(false)
        setWidth(Math.max(SIDEBAR_MIN_WIDTH, Math.min(nextWidth, SIDEBAR_MAX_WIDTH)))
      }
    }
    const handlePointerUp = () => {
      isResizing.current = false
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      if (isResizing.current) handlePointerUp()
    }
  }, [setIsCollapsed, setIsDragging, setWidth])

  const viewerLeft = RAIL_WIDTH + (isCollapsed ? 0 : width)

  return (
    <div
      className="dark pointer-events-none fixed inset-0 z-40 text-foreground"
      data-editor-active-panel={activePanel}
      data-landrush-pascal-editor-chrome
    >
      <aside
        className="pointer-events-auto fixed inset-y-0 left-0 flex bg-sidebar text-sidebar-foreground"
        data-landrush-editor-sidebar
      >
        <TooltipProvider delayDuration={0} disableHoverableContent>
          <nav className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-border/50 border-r py-2">
            {EDITOR_TABS.map((tab) => {
              const showActive = activePanel === tab.id && !isCollapsed
              return (
                <Tooltip key={tab.id}>
                  <TooltipTrigger asChild>
                    <button
                      aria-label={tab.label}
                      aria-pressed={showActive}
                      className={cn(
                        'group flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200',
                        showActive
                          ? 'bg-accent text-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )}
                      data-editor-sidebar-tab={tab.id}
                      onClick={() => {
                        triggerSFX('sfx:menu-click')
                        handleRailClick(tab.id)
                      }}
                      onMouseEnter={() => triggerSFX('sfx:menu-hover')}
                      type="button"
                    >
                      <Image
                        alt=""
                        aria-hidden
                        className={cn(
                          'h-8 w-8 object-contain transition-[opacity,filter] duration-200 group-hover:opacity-100 group-hover:grayscale-0',
                          showActive ? 'opacity-100 grayscale-0' : 'opacity-60 grayscale',
                        )}
                        height={32}
                        src={tab.iconSrc}
                        width={32}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{tab.label}</TooltipContent>
                </Tooltip>
              )
            })}
          </nav>
        </TooltipProvider>

        {!isCollapsed ? (
          <section
            className="relative flex h-full flex-col overflow-hidden"
            data-landrush-editor-panel={activePanel}
            style={{
              transition: isDragging ? 'none' : 'width 150ms ease',
              width,
            }}
          >
            <div className="min-h-0 flex-1 overflow-hidden">{renderPanel(activePanel)}</div>
            <div
              className="absolute inset-y-0 -right-3 z-[100] flex w-6 cursor-col-resize items-center justify-center"
              onPointerDown={handleResizerDown}
            >
              <div className="h-8 w-1 rounded-full bg-neutral-500" />
            </div>
          </section>
        ) : null}
      </aside>

      <div
        className="pointer-events-none fixed top-0 right-0 bottom-0 overflow-hidden transition-[left] duration-150"
        data-landrush-editor-viewer-overlays
        style={{ left: viewerLeft }}
      >
        <div className="pointer-events-none absolute top-3 right-3 left-3 z-20 flex items-center justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            <CommunityViewerToolbarLeft capabilities={LANDRUSH_VIEWER_CAPABILITIES} />
            <button
              aria-label="Exit build"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border bg-background/90 px-2.5 font-medium text-foreground/90 text-xs shadow-2xl backdrop-blur-md transition-colors hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-landrush-exit-build
              onClick={() => {
                triggerSFX('sfx:menu-click')
                onExitBuild()
              }}
              type="button"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              <span>Exit Build</span>
            </button>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <CommunityViewerToolbarRight capabilities={LANDRUSH_VIEWER_CAPABILITIES} />
          </div>
        </div>
        <div className="pointer-events-auto absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-2xl border border-border bg-background/90 px-2 py-1.5 shadow-2xl backdrop-blur-md">
          <TooltipProvider delayDuration={0} disableHoverableContent>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-keyshortcuts="V"
                  aria-label="Select"
                  aria-pressed={editorMode === 'select' && selectionTool === 'click'}
                  className={cn(
                    'group relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    editorMode === 'select' && selectionTool === 'click'
                      ? 'bg-white/10 hover:bg-white/10'
                      : 'hover:bg-white/5 hover:text-foreground',
                  )}
                  data-editor-control-mode="select"
                  data-landrush-select-mode
                  onClick={() => {
                    triggerSFX('sfx:menu-click')
                    exitLandrushPascalEditingToSelect()
                  }}
                  type="button"
                >
                  <span className="flex h-full w-full -translate-x-0.5 -translate-y-0.5 items-center justify-center">
                    <Image
                      alt=""
                      aria-hidden
                      className={cn(
                        'h-7 w-7 object-contain transition-[opacity,filter] duration-200',
                        editorMode === 'select' && selectionTool === 'click'
                          ? 'opacity-100 grayscale-0'
                          : 'opacity-60 grayscale group-hover:opacity-100 group-hover:grayscale-0',
                      )}
                      height={28}
                      src="/icons/select.webp"
                      width={28}
                    />
                  </span>
                  <span className="absolute right-1 bottom-1 rounded border border-border/40 bg-background/40 px-1 py-[2px] backdrop-blur-md">
                    <span className="block font-medium font-mono text-[9px] text-muted-foreground/70 leading-none">
                      V
                    </span>
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Select (V)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <FloatingLevelSelector />
      </div>
    </div>
  )
}

function renderPanel(panelId: EditorPanelId) {
  if (panelId === 'items') {
    return <ItemsPanel showSourceFilter={false} showTagFilters={false} />
  }
  if (panelId === 'settings') {
    return (
      <div className="h-full overflow-y-auto">
        <SettingsPanel />
      </div>
    )
  }
  return (
    <BuildTab
      capabilities={{ materialPaint: false }}
      runStructureToolActivation={runLandrushPascalToolActivationInCurrentLevel}
    />
  )
}

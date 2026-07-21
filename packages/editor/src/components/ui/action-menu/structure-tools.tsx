'use client'

import { cn } from '../../../lib/utils'
import useEditor, { type CatalogCategory, type StructureTool } from '../../../store/use-editor'
import { ActionButton } from './action-button'
import { ACTION_MENU_ICON_URLS } from './icon-assets'

export type ToolConfig = {
  id: StructureTool
  iconSrc: string
  label: string
  catalogCategory?: CatalogCategory
}

// Shared structure-tool metadata for the Build sidebar, cursor indicators,
// and hosts that opt into the full bottom action menu. Roof-mounted accessories are intentionally
// absent — they're placed from the roof inspector's "Add element" section.
export const tools: ToolConfig[] = [
  { id: 'wall', iconSrc: ACTION_MENU_ICON_URLS.wall, label: 'Wall' },
  { id: 'door', iconSrc: ACTION_MENU_ICON_URLS.door, label: 'Door' },
  { id: 'window', iconSrc: ACTION_MENU_ICON_URLS.window, label: 'Window' },
  { id: 'stair', iconSrc: ACTION_MENU_ICON_URLS.stairs, label: 'Stairs' },
  { id: 'roof', iconSrc: ACTION_MENU_ICON_URLS.roof, label: 'Gable Roof' },
  { id: 'fence', iconSrc: ACTION_MENU_ICON_URLS.fence, label: 'Fence' },
  { id: 'column', iconSrc: ACTION_MENU_ICON_URLS.column, label: 'Column' },
  { id: 'elevator', iconSrc: ACTION_MENU_ICON_URLS.elevator, label: 'Elevator' },
  { id: 'slab', iconSrc: ACTION_MENU_ICON_URLS.floor, label: 'Slab' },
  { id: 'ceiling', iconSrc: ACTION_MENU_ICON_URLS.ceiling, label: 'Ceiling' },
  { id: 'zone', iconSrc: ACTION_MENU_ICON_URLS.zone, label: 'Zone' },
  { id: 'spawn', iconSrc: ACTION_MENU_ICON_URLS.spawnPoint, label: 'Spawn Point' },
  { id: 'shelf', iconSrc: ACTION_MENU_ICON_URLS.shelf, label: 'Shelf' },
  { id: 'duct-segment', iconSrc: ACTION_MENU_ICON_URLS.duct, label: 'Duct' },
  { id: 'duct-fitting', iconSrc: ACTION_MENU_ICON_URLS.ductFitting, label: 'Duct Fitting' },
  { id: 'duct-terminal', iconSrc: ACTION_MENU_ICON_URLS.registers, label: 'Register' },
  { id: 'hvac-equipment', iconSrc: ACTION_MENU_ICON_URLS.hvac, label: 'HVAC Unit' },
  { id: 'pipe-segment', iconSrc: ACTION_MENU_ICON_URLS.dwvPipes, label: 'DWV Pipe' },
  { id: 'pipe-trap', iconSrc: ACTION_MENU_ICON_URLS.dwvPipes, label: 'Trap' },
  { id: 'pipe-fitting', iconSrc: ACTION_MENU_ICON_URLS.ductFitting, label: 'Pipe Fitting' },
  { id: 'lineset', iconSrc: ACTION_MENU_ICON_URLS.lineset, label: 'Lineset' },
  { id: 'liquid-line', iconSrc: ACTION_MENU_ICON_URLS.lineset, label: 'Liquid Line' },
]

export function StructureTools() {
  const activeTool = useEditor((state) => state.tool)
  const catalogCategory = useEditor((state) => state.catalogCategory)
  const structureLayer = useEditor((state) => state.structureLayer)
  const setTool = useEditor((state) => state.setTool)
  const setCatalogCategory = useEditor((state) => state.setCatalogCategory)

  const visibleTools =
    structureLayer === 'zones'
      ? tools.filter((tool) => tool.id === 'zone')
      : tools.filter((tool) => tool.id !== 'zone')

  return (
    <div className="flex items-center gap-1 px-1 md:gap-1.5">
      {visibleTools.map((tool, index) => {
        const isActive =
          activeTool === tool.id &&
          (tool.catalogCategory ? catalogCategory === tool.catalogCategory : true)

        return (
          <ActionButton
            className={cn(
              'h-10 w-10 shrink-0 rounded-lg duration-300 md:h-11 md:w-11',
              isActive
                ? 'z-10 scale-110 bg-black/40 hover:bg-black/40'
                : 'scale-95 bg-transparent opacity-60 grayscale hover:bg-black/20 hover:opacity-100 hover:grayscale-0',
            )}
            data-editor-structure-tool={tool.id}
            key={`${tool.id}-${tool.catalogCategory ?? index}`}
            label={tool.label}
            onClick={() => {
              if (isActive) return
              setTool(tool.id)
              setCatalogCategory(tool.catalogCategory ?? null)
              if (useEditor.getState().mode !== 'build') {
                useEditor.getState().setMode('build')
              }
            }}
            size="icon"
            variant="ghost"
          >
            <img alt={tool.label} className="size-full object-contain" src={tool.iconSrc} />
          </ActionButton>
        )
      })}
    </div>
  )
}

'use client'

import { cn } from '../../../lib/utils'
import useEditor, { type CatalogCategory, type StructureTool } from '../../../store/use-editor'
import { ActionButton } from './action-button'

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
  { id: 'wall', iconSrc: '/icons/wall.webp', label: 'Wall' },
  { id: 'door', iconSrc: '/icons/door.webp', label: 'Door' },
  { id: 'window', iconSrc: '/icons/window.webp', label: 'Window' },
  { id: 'stair', iconSrc: '/icons/stairs.webp', label: 'Stairs' },
  { id: 'roof', iconSrc: '/icons/roof.webp', label: 'Gable Roof' },
  { id: 'fence', iconSrc: '/icons/fence.webp', label: 'Fence' },
  { id: 'column', iconSrc: '/icons/column.webp', label: 'Column' },
  { id: 'elevator', iconSrc: '/icons/elevator.webp', label: 'Elevator' },
  { id: 'slab', iconSrc: '/icons/floor.webp', label: 'Slab' },
  { id: 'ceiling', iconSrc: '/icons/ceiling.webp', label: 'Ceiling' },
  { id: 'zone', iconSrc: '/icons/zone.webp', label: 'Zone' },
  { id: 'spawn', iconSrc: '/icons/spawn-point.webp', label: 'Spawn Point' },
  { id: 'shelf', iconSrc: '/icons/shelf.webp', label: 'Shelf' },
  { id: 'duct-segment', iconSrc: '/icons/duct.webp', label: 'Duct' },
  { id: 'duct-fitting', iconSrc: '/icons/duct-fitting.webp', label: 'Duct Fitting' },
  { id: 'duct-terminal', iconSrc: '/icons/registers.webp', label: 'Register' },
  { id: 'hvac-equipment', iconSrc: '/icons/HVAC.webp', label: 'HVAC Unit' },
  { id: 'pipe-segment', iconSrc: '/icons/dwv-pipes.webp', label: 'DWV Pipe' },
  { id: 'pipe-trap', iconSrc: '/icons/dwv-pipes.webp', label: 'Trap' },
  { id: 'pipe-fitting', iconSrc: '/icons/duct-fitting.webp', label: 'Pipe Fitting' },
  { id: 'lineset', iconSrc: '/icons/lineset.webp', label: 'Lineset' },
  { id: 'liquid-line', iconSrc: '/icons/lineset.webp', label: 'Liquid Line' },
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

'use client'

import {
  AirVent,
  BrickWall,
  Building2,
  Cable,
  ChartNoAxesColumnIncreasing,
  Columns3,
  DoorOpen,
  Fan,
  Fence,
  GitFork,
  House,
  Layers3,
  MapPin,
  PanelsTopLeft,
  Rows3,
  Square,
  type LucideIcon,
  Wind,
  Workflow,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import useEditor, { type CatalogCategory, type StructureTool } from '../../../store/use-editor'
import { ActionButton } from './action-button'
import { ACTION_MENU_ICON_URLS } from './icon-assets'

export type ToolConfig = {
  id: StructureTool
  icon: LucideIcon
  iconSrc: string
  label: string
  catalogCategory?: CatalogCategory
}

// Shared structure-tool metadata for the Build sidebar, cursor indicators,
// and hosts that opt into the full bottom action menu. Roof-mounted accessories are intentionally
// absent — they're placed from the roof inspector's "Add element" section.
export const tools: ToolConfig[] = [
  { id: 'wall', icon: BrickWall, iconSrc: ACTION_MENU_ICON_URLS.wall, label: 'Wall' },
  { id: 'door', icon: DoorOpen, iconSrc: ACTION_MENU_ICON_URLS.door, label: 'Door' },
  { id: 'window', icon: PanelsTopLeft, iconSrc: ACTION_MENU_ICON_URLS.window, label: 'Window' },
  {
    id: 'stair',
    icon: ChartNoAxesColumnIncreasing,
    iconSrc: ACTION_MENU_ICON_URLS.stairs,
    label: 'Stairs',
  },
  { id: 'roof', icon: House, iconSrc: ACTION_MENU_ICON_URLS.roof, label: 'Gable Roof' },
  { id: 'fence', icon: Fence, iconSrc: ACTION_MENU_ICON_URLS.fence, label: 'Fence' },
  { id: 'column', icon: Columns3, iconSrc: ACTION_MENU_ICON_URLS.column, label: 'Column' },
  {
    id: 'elevator',
    icon: Building2,
    iconSrc: ACTION_MENU_ICON_URLS.elevator,
    label: 'Elevator',
  },
  { id: 'slab', icon: Square, iconSrc: ACTION_MENU_ICON_URLS.floor, label: 'Slab' },
  {
    id: 'ceiling',
    icon: Layers3,
    iconSrc: ACTION_MENU_ICON_URLS.ceiling,
    label: 'Ceiling',
  },
  { id: 'zone', icon: MapPin, iconSrc: ACTION_MENU_ICON_URLS.zone, label: 'Zone' },
  {
    id: 'spawn',
    icon: MapPin,
    iconSrc: ACTION_MENU_ICON_URLS.spawnPoint,
    label: 'Spawn Point',
  },
  { id: 'shelf', icon: Rows3, iconSrc: ACTION_MENU_ICON_URLS.shelf, label: 'Shelf' },
  { id: 'duct-segment', icon: Wind, iconSrc: ACTION_MENU_ICON_URLS.duct, label: 'Duct' },
  {
    id: 'duct-fitting',
    icon: GitFork,
    iconSrc: ACTION_MENU_ICON_URLS.ductFitting,
    label: 'Duct Fitting',
  },
  {
    id: 'duct-terminal',
    icon: AirVent,
    iconSrc: ACTION_MENU_ICON_URLS.registers,
    label: 'Register',
  },
  {
    id: 'hvac-equipment',
    icon: Fan,
    iconSrc: ACTION_MENU_ICON_URLS.hvac,
    label: 'HVAC Unit',
  },
  {
    id: 'pipe-segment',
    icon: Workflow,
    iconSrc: ACTION_MENU_ICON_URLS.dwvPipes,
    label: 'DWV Pipe',
  },
  {
    id: 'pipe-trap',
    icon: Workflow,
    iconSrc: ACTION_MENU_ICON_URLS.dwvPipes,
    label: 'Trap',
  },
  {
    id: 'pipe-fitting',
    icon: GitFork,
    iconSrc: ACTION_MENU_ICON_URLS.ductFitting,
    label: 'Pipe Fitting',
  },
  { id: 'lineset', icon: Cable, iconSrc: ACTION_MENU_ICON_URLS.lineset, label: 'Lineset' },
  {
    id: 'liquid-line',
    icon: Cable,
    iconSrc: ACTION_MENU_ICON_URLS.lineset,
    label: 'Liquid Line',
  },
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
        const ToolIcon = tool.icon
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
            <ToolIcon aria-hidden className="size-6 stroke-[1.7]" />
          </ActionButton>
        )
      })}
    </div>
  )
}

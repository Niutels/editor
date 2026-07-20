'use client'

import { type LevelNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { type LucideIcon, SquareDashedMousePointer, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { cn } from './../../../lib/utils'
import useEditor from './../../../store/use-editor'
import { ActionButton } from './action-button'
import { ACTION_MENU_ICON_URLS } from './icon-assets'

type ControlId =
  | 'select'
  | 'box-select'
  | 'site-edit'
  | 'build'
  | 'material-paint'
  | 'zone'
  | 'delete'

type ControlConfig = {
  id: ControlId
  icon?: LucideIcon
  imageSrc?: string
  label: string
  shortcut?: string
  color: string
  activeColor: string
}

const compactControls: ControlConfig[] = [
  {
    id: 'select',
    imageSrc: ACTION_MENU_ICON_URLS.select,
    label: 'Select',
    shortcut: 'V',
    color: 'hover:bg-blue-500/20 hover:text-blue-400',
    activeColor: 'bg-blue-500/20 text-blue-400',
  },
  {
    id: 'zone',
    imageSrc: ACTION_MENU_ICON_URLS.zone,
    label: 'Zone',
    shortcut: 'Z',
    color: 'hover:bg-green-500/20 hover:text-green-400',
    activeColor: 'bg-green-500/20 text-green-400',
  },
  {
    id: 'delete',
    icon: Trash2,
    label: 'Delete',
    shortcut: 'X',
    color: 'hover:bg-red-500/20 hover:text-red-400',
    activeColor: 'bg-red-500/20 text-red-400',
  },
]

const fullControls: ControlConfig[] = [
  compactControls[0]!,
  {
    id: 'box-select',
    icon: SquareDashedMousePointer,
    label: 'Box select',
    color: 'hover:bg-white/5',
    activeColor: 'bg-white/10 hover:bg-white/10',
  },
  {
    id: 'site-edit',
    imageSrc: ACTION_MENU_ICON_URLS.site,
    label: 'Edit site',
    color: 'hover:bg-white/5',
    activeColor: 'bg-white/10 hover:bg-white/10',
  },
  {
    id: 'build',
    imageSrc: ACTION_MENU_ICON_URLS.build,
    label: 'Build',
    shortcut: 'B',
    color: 'hover:bg-green-500/20 hover:text-green-400',
    activeColor: 'bg-green-500/20 text-green-400',
  },
  {
    id: 'material-paint',
    imageSrc: ACTION_MENU_ICON_URLS.paint,
    label: 'Material Paint',
    shortcut: 'P',
    color: 'hover:bg-amber-500/20 hover:text-amber-400',
    activeColor: 'bg-amber-500/20 text-amber-400',
  },
  compactControls[1]!,
  compactControls[2]!,
]

export function ControlModes({ full = false }: { full?: boolean }) {
  const mode = useEditor((state) => state.mode)
  const phase = useEditor((state) => state.phase)
  const selectionTool = useEditor((state) => state.floorplanSelectionTool)
  const structureLayer = useEditor((state) => state.structureLayer)
  const setMode = useEditor((state) => state.setMode)
  const setPhase = useEditor((state) => state.setPhase)
  const setStructureLayer = useEditor((state) => state.setStructureLayer)
  const setSelectionTool = useEditor((state) => state.setFloorplanSelectionTool)
  const primeMaterialPaintFromSelection = useEditor(
    (state) => state.primeMaterialPaintFromSelection,
  )
  const levelId = useViewer((state) => state.selection.levelId)
  const levelIndex = useScene((state) => {
    if (!levelId) return null
    const node = state.nodes[levelId]
    return node?.type === 'level' ? (node as LevelNode).level : null
  })

  const isSiteEditing = phase === 'site'
  const canEnterSiteEdit = levelIndex === 0 || isSiteEditing
  const controls = full ? fullControls : compactControls

  const getIsActive = (id: ControlId): boolean => {
    if (isSiteEditing) return id === 'site-edit'
    if (id === 'select') return mode === 'select' && selectionTool === 'click'
    if (id === 'box-select') return mode === 'select' && selectionTool === 'marquee'
    if (id === 'site-edit') return false
    if (id === 'build')
      return mode === 'build' && phase === 'structure' && structureLayer === 'elements'
    if (id === 'material-paint') return mode === 'material-paint'
    if (id === 'zone')
      return mode === 'build' && phase === 'structure' && structureLayer === 'zones'
    return mode === id
  }

  const handleClick = (id: ControlId) => {
    if (id === 'site-edit') {
      if (isSiteEditing) {
        setPhase('structure')
        setMode('select')
        setStructureLayer('elements')
      } else if (levelIndex === 0) {
        useEditor.setState({ phase: 'site', mode: 'select', tool: null, catalogCategory: null })
        useViewer.getState().setSelection({ selectedIds: [] })
      }
      return
    }

    if (isSiteEditing) {
      setPhase('structure')
      setStructureLayer('elements')
    }

    if (id === 'select') {
      setMode('select')
      setSelectionTool('click')
    } else if (id === 'box-select') {
      setMode('select')
      setSelectionTool('marquee')
    } else if (id === 'build') {
      if (getIsActive('build')) {
        setMode('select')
      } else {
        setPhase('structure')
        setStructureLayer('elements')
        setMode('build')
      }
    } else if (id === 'material-paint') {
      if (getIsActive('material-paint')) {
        setMode('select')
      } else {
        primeMaterialPaintFromSelection()
        setPhase('structure')
        setStructureLayer('elements')
        setMode('material-paint')
      }
    } else if (id === 'zone') {
      if (getIsActive('zone')) {
        setMode('select')
      } else {
        setPhase('structure')
        setStructureLayer('zones')
        setMode('build')
      }
    } else {
      setMode(id)
    }
  }

  return (
    <div className="flex items-center gap-1">
      {controls.map((control) => {
        const ModeIcon = control.icon
        const isImageMode = Boolean(control.imageSrc)
        const isSiteButton = control.id === 'site-edit'
        const isActive = getIsActive(control.id)
        const isDisabled = isSiteButton && !canEnterSiteEdit

        return (
          <ActionButton
            className={cn(
              'group text-muted-foreground',
              isSiteButton
                ? isActive
                  ? control.activeColor
                  : canEnterSiteEdit
                    ? 'opacity-60 grayscale hover:bg-white/5 hover:opacity-100 hover:grayscale-0'
                    : 'cursor-not-allowed opacity-35 grayscale'
                : !(isImageMode || isActive) && control.color,
              !(isSiteButton || isImageMode) && isActive && control.activeColor,
              !isSiteButton && isImageMode && isActive && 'bg-white/10 hover:bg-white/10',
              !isSiteButton && isImageMode && !isActive && 'hover:bg-white/5',
            )}
            data-editor-control-mode={control.id}
            disabled={isDisabled}
            key={control.id}
            label={
              isSiteButton
                ? isActive
                  ? 'Exit site editing'
                  : canEnterSiteEdit
                    ? 'Edit site'
                    : 'Site editing (ground level only)'
                : control.label
            }
            onClick={() => handleClick(control.id)}
            shortcut={control.shortcut}
            size="icon"
            variant="ghost"
          >
            {control.imageSrc ? (
              <Image
                alt={control.label}
                className={cn(
                  'h-[28px] w-[28px] object-contain transition-[opacity,filter] duration-200',
                  isActive
                    ? 'opacity-100 grayscale-0'
                    : 'opacity-60 grayscale group-hover:opacity-100 group-hover:grayscale-0',
                )}
                height={28}
                src={control.imageSrc}
                width={28}
              />
            ) : (
              ModeIcon && <ModeIcon className="h-5 w-5" />
            )}
          </ActionButton>
        )
      })}
    </div>
  )
}

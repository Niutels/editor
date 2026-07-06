import type { AssetInput } from '@pascal-app/core'
import { resolveCdnUrl } from '@pascal-app/viewer'
import { useEffect, useMemo } from 'react'
import { cn } from './../../../lib/utils'
import useEditor, { type CatalogCategory } from './../../../store/use-editor'
import { CATALOG_ITEMS } from './../item-catalog/catalog-items'
import { ActionButton } from './action-button'

export type FurnishToolConfig = {
  id: 'item'
  iconSrc: string
  label: string
  catalogCategory: CatalogCategory
}

export const furnishTools: FurnishToolConfig[] = [
  { id: 'item', iconSrc: '/icons/couch.png', label: 'Furniture', catalogCategory: 'furniture' },
  { id: 'item', iconSrc: '/icons/appliance.png', label: 'Appliance', catalogCategory: 'appliance' },
  { id: 'item', iconSrc: '/icons/kitchen.png', label: 'Kitchen', catalogCategory: 'kitchen' },
  { id: 'item', iconSrc: '/icons/bathroom.png', label: 'Bathroom', catalogCategory: 'bathroom' },
  { id: 'item', iconSrc: '/icons/tree.png', label: 'Outdoor', catalogCategory: 'outdoor' },
]

function getActiveFurnishCategory(category: CatalogCategory | null): CatalogCategory {
  return (
    furnishTools.find((tool) => tool.catalogCategory === category)?.catalogCategory ??
    furnishTools[0]!.catalogCategory
  )
}

function getAttachmentIcon(attachTo: AssetInput['attachTo']) {
  if (attachTo === 'wall' || attachTo === 'wall-side') return '/icons/wall.png'
  if (attachTo === 'ceiling') return '/icons/ceiling.png'
  return null
}

export function FurnishTools() {
  const activeTool = useEditor((state) => state.tool)
  const catalogCategory = useEditor((state) => state.catalogCategory)
  const setCatalogCategory = useEditor((state) => state.setCatalogCategory)
  const setMode = useEditor((state) => state.setMode)
  const setPhase = useEditor((state) => state.setPhase)
  const setTool = useEditor((state) => state.setTool)

  return (
    <div className="flex items-center gap-1 px-1 md:gap-1.5">
      {furnishTools.map((tool) => {
        const isActive = activeTool === tool.id && catalogCategory === tool.catalogCategory

        return (
          <ActionButton
            className={cn(
              'h-10 w-10 shrink-0 rounded-lg duration-300 md:h-11 md:w-11',
              isActive
                ? 'z-10 scale-110 bg-black/40 hover:bg-black/40'
                : 'scale-95 bg-transparent opacity-60 grayscale hover:bg-black/20 hover:opacity-100 hover:grayscale-0',
            )}
            data-editor-furnish-tool={tool.catalogCategory}
            key={tool.catalogCategory}
            label={tool.label}
            onClick={() => {
              if (isActive) return
              setPhase('furnish')
              setTool(tool.id)
              setCatalogCategory(tool.catalogCategory)
              if (useEditor.getState().mode !== 'build') {
                setMode('build')
              }
            }}
            size="icon"
            tooltipProvider={false}
            variant="ghost"
          >
            <img alt={tool.label} className="size-full object-contain" src={tool.iconSrc} />
          </ActionButton>
        )
      })}
    </div>
  )
}

export function FurnishItemTools() {
  const catalogCategory = useEditor((state) => state.catalogCategory)
  const selectedItem = useEditor((state) => state.selectedItem)
  const setCatalogCategory = useEditor((state) => state.setCatalogCategory)
  const setMode = useEditor((state) => state.setMode)
  const setPhase = useEditor((state) => state.setPhase)
  const setSelectedItem = useEditor((state) => state.setSelectedItem)
  const setTool = useEditor((state) => state.setTool)

  const activeCategory = getActiveFurnishCategory(catalogCategory)
  const categoryItems = useMemo(
    () => CATALOG_ITEMS.filter((item) => item.category === activeCategory),
    [activeCategory],
  )

  useEffect(() => {
    const selectedItemIsVisible = categoryItems.some((item) => item.src === selectedItem?.src)
    const firstItem = categoryItems[0]

    if (!(selectedItemIsVisible || !firstItem)) {
      setSelectedItem(firstItem)
    }
  }, [categoryItems, selectedItem?.src, setSelectedItem])

  return (
    <div className="flex items-center gap-1 px-1 md:gap-1.5">
      {categoryItems.map((item) => {
        const isActive = selectedItem?.src === item.src
        const attachmentIcon = getAttachmentIcon(item.attachTo)

        return (
          <ActionButton
            className={cn(
              'h-12 w-12 shrink-0 overflow-hidden rounded-lg p-1 duration-300 md:h-14 md:w-14',
              isActive
                ? 'z-10 scale-105 bg-black/40 ring-1 ring-primary-foreground hover:bg-black/40'
                : 'scale-95 bg-transparent opacity-70 grayscale hover:bg-black/20 hover:opacity-100 hover:grayscale-0',
            )}
            data-editor-furnish-item={item.id}
            key={item.id}
            label={item.name}
            onClick={() => {
              setPhase('furnish')
              setTool('item')
              setCatalogCategory(activeCategory)
              setSelectedItem(item)
              if (useEditor.getState().mode !== 'build') {
                setMode('build')
              }
            }}
            size="icon"
            tooltipProvider={false}
            variant="ghost"
          >
            <div className="relative size-full overflow-hidden rounded-md">
              <img
                alt={item.name}
                className="h-full w-full object-cover"
                loading="eager"
                src={resolveCdnUrl(item.thumbnail) || ''}
              />
              {attachmentIcon && (
                <span className="absolute right-0.5 bottom-0.5 flex h-4 w-4 items-center justify-center rounded bg-black/65">
                  <img
                    alt={item.attachTo === 'ceiling' ? 'Ceiling attachment' : 'Wall attachment'}
                    className="h-3.5 w-3.5"
                    src={attachmentIcon}
                  />
                </span>
              )}
            </div>
          </ActionButton>
        )
      })}
    </div>
  )
}

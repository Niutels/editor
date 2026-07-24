import { cn } from './../../../lib/utils'
import useEditor, { type CatalogCategory } from './../../../store/use-editor'
import { ActionButton } from './action-button'
import { ACTION_MENU_ICON_URLS } from './icon-assets'

export type FurnishToolConfig = {
  id: 'item'
  iconSrc: string
  label: string
  catalogCategory: CatalogCategory
}

export const furnishTools: FurnishToolConfig[] = [
  {
    id: 'item',
    iconSrc: ACTION_MENU_ICON_URLS.couch,
    label: 'Furniture',
    catalogCategory: 'furniture',
  },
  {
    id: 'item',
    iconSrc: ACTION_MENU_ICON_URLS.appliance,
    label: 'Appliance',
    catalogCategory: 'appliance',
  },
  {
    id: 'item',
    iconSrc: ACTION_MENU_ICON_URLS.kitchen,
    label: 'Kitchen',
    catalogCategory: 'kitchen',
  },
  {
    id: 'item',
    iconSrc: ACTION_MENU_ICON_URLS.bathroom,
    label: 'Bathroom',
    catalogCategory: 'bathroom',
  },
  {
    id: 'item',
    iconSrc: ACTION_MENU_ICON_URLS.tree,
    label: 'Outdoor',
    catalogCategory: 'outdoor',
  },
]

export function FurnishTools() {
  const mode = useEditor((state) => state.mode)
  const phase = useEditor((state) => state.phase)
  const activeTool = useEditor((state) => state.tool)
  const catalogCategory = useEditor((state) => state.catalogCategory)

  return (
    <div className="flex items-center gap-1.5 px-1">
      {furnishTools.map((tool) => {
        const isActive =
          mode === 'build' &&
          phase === 'furnish' &&
          activeTool === tool.id &&
          catalogCategory === tool.catalogCategory

        return (
          <ActionButton
            className={cn(
              'rounded-lg duration-300',
              isActive
                ? 'z-10 scale-110 bg-black/40 hover:bg-black/40'
                : 'scale-95 bg-transparent opacity-60 grayscale hover:bg-black/20 hover:opacity-100 hover:grayscale-0',
            )}
            data-editor-furnish-tool={tool.catalogCategory}
            key={tool.catalogCategory}
            label={tool.label}
            onClick={() => {
              if (isActive) return
              useEditor.setState({
                catalogCategory: tool.catalogCategory,
                mode: 'build',
                phase: 'furnish',
                structureLayer: 'elements',
                tool: tool.id,
              })
            }}
            size="icon"
            variant="ghost"
          >
            <img
              alt={tool.label}
              className="size-full object-contain"
              height={28}
              src={tool.iconSrc}
              width={28}
            />
          </ActionButton>
        )
      })}
    </div>
  )
}

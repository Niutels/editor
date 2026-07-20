import type { CatalogCategory } from './../../../store/use-editor'
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

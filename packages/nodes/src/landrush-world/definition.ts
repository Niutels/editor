import { LandrushWorldNode as LandrushWorldNodeSchema, type NodeDefinition } from '@pascal-app/core'
import { LandrushWorldNode } from './schema'

export const landrushWorldDefinition: NodeDefinition<typeof LandrushWorldNode> = {
  kind: 'landrush-world',
  schemaVersion: 1,
  schema: LandrushWorldNode,
  category: 'site',

  defaults: () => {
    const stub = LandrushWorldNodeSchema.parse({
      id: 'landrush-world_default' as never,
      type: 'landrush-world',
    })
    const { id: _id, type: _type, ...rest } = stub
    return rest
  },

  capabilities: {
    duplicable: false,
    deletable: true,
    presettable: false,
  },

  renderer: {
    kind: 'parametric',
    module: () => import('./renderer'),
  },

  presentation: {
    label: 'Landrush World',
    description: 'Procedural island, parcels, roads, trees, water, and player state.',
    icon: { kind: 'iconify', name: 'lucide:map' },
    paletteSection: 'site',
    paletteOrder: 80,
    hidden: true,
  },

  mcp: {
    description: 'Pascal-native Landrush island world node.',
  },
}

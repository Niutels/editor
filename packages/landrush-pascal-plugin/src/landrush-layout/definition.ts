import type { NodeDefinition } from '@pascal-app/core'
import { LandrushLayoutNode } from './schema'

export const landrushLayoutDefinition: NodeDefinition<typeof LandrushLayoutNode> = {
  kind: 'landrush-layout',
  schemaVersion: 1,
  schema: LandrushLayoutNode,
  category: 'site',
  dirtyTracking: false,

  defaults: () => {
    const stub = LandrushLayoutNode.parse({
      id: 'landrush-layout_default' as never,
      type: 'landrush-layout',
    })
    const { id: _id, type: _type, ...rest } = stub
    return rest
  },

  capabilities: {
    duplicable: false,
    deletable: true,
    presettable: false,
  },

  presentation: {
    label: 'Landrush Layout',
    description: 'Landrush island perimeter, parcels, roads, and player anchors without rendering.',
    icon: { kind: 'iconify', name: 'lucide:map-pinned' },
    paletteSection: 'site',
    paletteOrder: 79,
    hidden: true,
  },

  mcp: {
    description: 'Renderer-free Landrush island layout data node.',
  },
}

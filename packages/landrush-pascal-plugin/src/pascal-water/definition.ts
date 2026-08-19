import type { NodeDefinition } from '@pascal-app/core'
import { PascalWaterNode } from './schema'

export const pascalWaterDefinition: NodeDefinition<typeof PascalWaterNode> = {
  kind: 'pascal-water',
  schemaVersion: 2,
  schema: PascalWaterNode,
  category: 'site',
  dirtyTracking: false,

  defaults: () => {
    const stub = PascalWaterNode.parse({
      id: 'pascal-water_default' as never,
      type: 'pascal-water',
    })
    const { id: _id, type: _type, ...rest } = stub
    return rest
  },

  capabilities: {
    selectable: { hitVolume: 'bbox' },
    duplicable: true,
    deletable: true,
    presettable: false,
  },

  renderer: {
    kind: 'parametric',
    module: () => import('./renderer'),
  },

  presentation: {
    label: 'Pascal Water',
    description: 'A Pascal-native Landrush water surface with generated shore/depth texture.',
    icon: { kind: 'iconify', name: 'lucide:waves' },
    paletteSection: 'site',
    paletteOrder: 82,
    hidden: true,
  },

  mcp: {
    description: 'Pascal-native Landrush water canvas slice.',
  },
}

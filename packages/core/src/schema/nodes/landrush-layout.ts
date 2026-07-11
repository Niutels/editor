import type { z } from 'zod'
import { nodeType, objectId } from '../base'
import { LandrushWorldNode } from './landrush-world'

export const LandrushLayoutNode = LandrushWorldNode.omit({
  id: true,
  renderFlags: true,
  type: true,
})
  .extend({
    id: objectId('landrush-layout'),
    type: nodeType('landrush-layout'),
  })
  .describe('Landrush island layout data without a renderer')

export type LandrushLayoutNode = z.infer<typeof LandrushLayoutNode>

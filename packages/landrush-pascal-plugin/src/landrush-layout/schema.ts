import { nodeType, objectId } from '@pascal-app/core'
import type { z } from 'zod'
import { LandrushWorldNode } from '../landrush-world/schema'

export const LandrushLayoutNode = LandrushWorldNode.omit({
  focusParcelId: true,
  id: true,
  landrushMode: true,
  playerHeading: true,
  playerMoving: true,
  playerPosition: true,
  playerSpeed: true,
  remotePlayers: true,
  renderFlags: true,
  type: true,
})
  .extend({
    id: objectId('landrush-layout'),
    type: nodeType('landrush-layout'),
  })
  .describe('Landrush island layout data without a renderer')

export type LandrushLayoutNode = z.infer<typeof LandrushLayoutNode>

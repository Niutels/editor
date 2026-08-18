import {
  activateEditorTool,
  benchmarkParams,
  readLandrushViewMode,
  scenarioDurationMs,
  waitForSceneNodes,
} from '../scenario-utils.mjs'

export default {
  name: 'landrush-floorplan',
  urlParams: () => benchmarkParams('build'),
  prepare: ({ bridge }) => waitForSceneNodes(bridge, 100),
  async execute({ bridge, input, minutes, mark, page, sleep, trace }) {
    const durationMs = scenarioDurationMs(minutes)
    const startedAt = Date.now()
    const viewMode = await readLandrushViewMode(page)
    if (viewMode !== 'build') throw new Error(`floorplan benchmark is in ${viewMode ?? 'unknown'} view`)

    const editorState = await activateEditorTool(bridge, 'build', 'wall')
    trace.write({
      kind: 'validation',
      t: performance.now(),
      name: 'floorplan-tool-active',
      editorState,
    })
    const before = await bridge.digest()
    const pose = await bridge.cameraPose()
    if (!pose?.target) throw new Error('floorplan benchmark camera target is unavailable')

    const [centerX, groundY, centerZ] = pose.target
    const points = [
      [centerX - 3, groundY, centerZ - 2],
      [centerX + 3, groundY, centerZ - 2],
      [centerX + 3, groundY, centerZ + 2],
      [centerX - 3, groundY, centerZ + 2],
      [centerX - 3, groundY, centerZ - 2],
    ]

    await mark('floorplan-start')
    for (const point of points) {
      const projected = await bridge.project(point)
      if (!projected?.visible) throw new Error(`floorplan point is outside the camera: ${point}`)
      await input.click(projected.x, projected.y, { intent: 'place floorplan corner' })
      await sleep(450)
    }
    await input.key('escape', { intent: 'finish wall loop' })
    await bridge.waitForSettle({ stableFrames: 12, timeoutMs: 15_000 })
    const after = await bridge.digest()
    const nodeDelta = (after?.nodeCount ?? 0) - (before?.nodeCount ?? 0)
    trace.write({
      kind: 'validation',
      t: performance.now(),
      name: 'floorplan-node-delta',
      before,
      after,
      nodeDelta,
    })
    if (nodeDelta < 4) throw new Error(`floorplan created only ${nodeDelta} nodes`)
    await mark(`floorplan-created-${nodeDelta}`)
    const remainingMs = durationMs - (Date.now() - startedAt)
    if (remainingMs > 0) await sleep(remainingMs)
    await mark('floorplan-end')
  },
}

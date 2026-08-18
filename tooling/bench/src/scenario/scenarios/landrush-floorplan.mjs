import {
  activateEditorTool,
  benchmarkParams,
  enterLandrushBuildMode,
  readLandrushViewMode,
  restoreLandrushBenchmarkFixture,
  scenarioDurationMs,
  waitForSceneNodes,
} from '../scenario-utils.mjs'

export default {
  name: 'landrush-floorplan',
  fixture: 'build',
  urlParams: () => benchmarkParams('build'),
  async prepare({ bridge, page }) {
    await waitForSceneNodes(bridge, 100)
    await restoreLandrushBenchmarkFixture(page, bridge)
    await enterLandrushBuildMode(page)
    await activateEditorTool(bridge, 'build', 'wall')
  },
  async execute({ bridge, input, minutes, mark, page, sleep, trace }) {
    const durationMs = scenarioDurationMs(minutes)
    const startedAt = Date.now()
    const editorState = await activateEditorTool(bridge, 'build', 'wall')
    const viewMode = await readLandrushViewMode(page)
    if (viewMode !== 'build') throw new Error(`floorplan benchmark is in ${viewMode ?? 'unknown'} view`)
    trace.write({
      kind: 'validation',
      t: performance.now(),
      name: 'floorplan-tool-active',
      editorState,
    })
    const before = await bridge.digest()
    const pose = await bridge.cameraPose()
    if (!pose) throw new Error('floorplan benchmark camera pose is unavailable')
    const targetY = await page.evaluate(
      () => (window.__LANDRUSH_BENCHMARK_FIXTURE__?.player.position[1] ?? 0) + 0.35,
    )
    const cameraTarget = pose.target ?? cameraPlaneTarget(pose, targetY)

    const [centerX, groundY, centerZ] = cameraTarget
    const points = [
      [centerX - 3, groundY, centerZ - 2],
      [centerX + 3, groundY, centerZ - 2],
      [centerX + 3, groundY, centerZ + 2],
      [centerX - 3, groundY, centerZ + 2],
      [centerX - 3, groundY, centerZ - 2],
    ]

    await mark('floorplan-start')
    for (const [index, point] of points.entries()) {
      const projected = await bridge.project(point)
      if (!projected?.visible) throw new Error(`floorplan point is outside the camera: ${point}`)
      await input.click(projected.x, projected.y, { intent: 'place floorplan corner' })
      await sleep(450)
      trace.write({
        kind: 'validation',
        t: performance.now(),
        name: `floorplan-corner-${index + 1}`,
        beacon: (await bridge.beacon()).beacon,
        digest: await bridge.digest(),
      })
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

function cameraPlaneTarget(pose, targetY) {
  const [x, y, z, w] = pose.quaternion
  const forward = [
    -2 * (x * z + w * y),
    2 * (w * x - y * z),
    2 * (x * x + y * y) - 1,
  ]
  if (Math.abs(forward[1]) < 0.000001) {
    throw new Error('floorplan benchmark camera is parallel to the build plane')
  }
  const distance = (targetY - pose.position[1]) / forward[1]
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error('floorplan benchmark camera does not face the build plane')
  }
  return [
    pose.position[0] + forward[0] * distance,
    targetY,
    pose.position[2] + forward[2] * distance,
  ]
}

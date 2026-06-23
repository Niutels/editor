import { useFrame } from '@react-three/fiber'
import { perfRecorder } from '../../runtime/perf-recorder'
import { renderScheduler } from '../../runtime/render-scheduler'

export function PerfProbe() {
  useFrame(({ gl }, delta) => {
    if (!perfRecorder.isEnabled()) return

    const snapshot = renderScheduler.getSnapshot()
    const renderInfo = gl.info?.render
    const memoryInfo = gl.info?.memory

    perfRecorder.record('frame.delta.ms', delta * 1000, {
      profile: snapshot.profile,
      tags: {
        reasons: snapshot.reasonsThisFrame.join(','),
        postFxDirty: snapshot.postFxDirty,
        shadowDirty: snapshot.shadowDirty,
        pickingEnabled: snapshot.pickingEnabled,
      },
    })
    perfRecorder.record('renderer.drawCalls', renderInfo?.calls ?? 0, {
      profile: snapshot.profile,
    })
    perfRecorder.record('renderer.triangles', renderInfo?.triangles ?? 0, {
      profile: snapshot.profile,
    })
    perfRecorder.record('renderer.geometries', memoryInfo?.geometries ?? 0, {
      profile: snapshot.profile,
    })
  }, 100)

  return null
}

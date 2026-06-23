import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { readViewerPerfFlagsFromUrl } from '../../runtime/perf-flags'
import { renderScheduler } from '../../runtime/render-scheduler'

export function ShadowController() {
  const gl = useThree((state) => state.gl)
  const flags = useMemo(() => readViewerPerfFlagsFromUrl(), [])
  const freezeShadowMapOnCameraMove =
    flags.freezeShadowMapOnCameraMove || flags.postFxVariant === 'orbit-lite'
  const disableShadowMapOnCameraMove =
    flags.postFxVariant === 'orbit-lite' || flags.orbitPostFxVariant === 'orbit-lite'
  const previousAutoUpdate = useRef<boolean | null>(null)
  const previousEnabled = useRef<boolean | null>(null)
  const snapshot = useSyncExternalStore(
    renderScheduler.subscribe,
    renderScheduler.getSnapshot,
    renderScheduler.getSnapshot,
  )

  useEffect(() => {
    return () => {
      if (previousAutoUpdate.current !== null && gl.shadowMap) {
        gl.shadowMap.autoUpdate = previousAutoUpdate.current
      }
      if (previousEnabled.current !== null && gl.shadowMap) {
        gl.shadowMap.enabled = previousEnabled.current
      }
    }
  }, [gl])

  useFrame(() => {
    if (snapshot.profile !== 'orbit') {
      renderScheduler.markShadowClean()
    }
    if (!(freezeShadowMapOnCameraMove && gl.shadowMap)) return

    if (previousAutoUpdate.current === null) {
      previousAutoUpdate.current = gl.shadowMap.autoUpdate
    }
    if (previousEnabled.current === null) {
      previousEnabled.current = gl.shadowMap.enabled
    }
    const isOrbiting =
      snapshot.profile === 'orbit' ||
      (typeof window !== 'undefined' &&
        ((window as any).__PASCAL_CAMERA_DRAGGING__ === true ||
          (window as any).__PASCAL_BENCH_ORBITING__ === true))
    const shouldUseLiteShadowPath = isOrbiting && !snapshot.shadowDirty
    gl.shadowMap.autoUpdate = !shouldUseLiteShadowPath
    gl.shadowMap.enabled =
      disableShadowMapOnCameraMove && shouldUseLiteShadowPath ? false : previousEnabled.current
  }, 0)

  return null
}

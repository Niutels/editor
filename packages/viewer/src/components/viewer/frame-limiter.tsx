import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { renderScheduler } from '../../runtime/render-scheduler'
import useViewer from '../../store/use-viewer'

type FrameLimiterProps = {
  fps?: number
  idleFps?: number
}

const FrameLimiter: React.FC<FrameLimiterProps> = ({ fps = 50, idleFps = 20 }) => {
  const { advance, set, frameloop: initFrameloop } = useThree()

  useLayoutEffect(() => {
    let elapsed = 0
    let then = 0
    let i = 0
    let raf: number | null = null
    function tick(t: DOMHighResTimeStamp) {
      raf = requestAnimationFrame(tick)
      const profile = renderScheduler.getSnapshot().profile
      const cameraDragging = useViewer.getState().cameraDragging
      const globalCameraDragging =
        typeof window !== 'undefined' && (window as any).__PASCAL_CAMERA_DRAGGING__ === true
      const benchOrbiting =
        typeof window !== 'undefined' && (window as any).__PASCAL_BENCH_ORBITING__ === true
      const targetFps =
        profile === 'static' && !cameraDragging && !globalCameraDragging && !benchOrbiting
          ? idleFps
          : fps
      const interval = 1000 / targetFps
      elapsed = t - then
      if (elapsed > interval) {
        advance(i)
        i += elapsed / 1000 - (elapsed % interval) / 1000
        then = t - (elapsed % interval)
      }
    }
    // Set frameloop to never, it will shut down the default render loop
    set({ frameloop: 'never' })
    // Kick off custom render loop
    raf = requestAnimationFrame(tick)
    // Restore initial setting
    return () => {
      if (raf) {
        cancelAnimationFrame(raf)
      }
      set({ frameloop: initFrameloop })
    }
  }, [fps, idleFps, advance, set, initFrameloop])

  return null
}

export default FrameLimiter

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { renderScheduler } from '../../runtime/render-scheduler'

export function RenderSchedulerBridge() {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    renderScheduler.setInvalidate(invalidate)
    return () => {
      renderScheduler.setInvalidate(null)
    }
  }, [invalidate])

  useFrame(() => {
    renderScheduler.drainFrameReasons()
  }, -100)

  return null
}

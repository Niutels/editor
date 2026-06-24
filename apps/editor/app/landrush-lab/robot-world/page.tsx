import { Suspense } from 'react'
import { RobotWorldLabClient } from '@/components/landrush-lab/robot-world-lab-client'

export default function LandrushRobotWorldLabPage() {
  return (
    <Suspense fallback={null}>
      <RobotWorldLabClient />
    </Suspense>
  )
}

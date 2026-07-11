import { Suspense } from 'react'
import { RobotLabClient } from '@/components/landrush-lab/robot-lab-client'

export default function LandrushRobotLabPage() {
  return (
    <Suspense fallback={null}>
      <RobotLabClient />
    </Suspense>
  )
}

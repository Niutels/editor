import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'

type BenchStatsSample = {
  at: number
  deltaMs: number
  drawCalls: number | null
  triangles: number | null
  geometries: number | null
  textures: number | null
}

type BenchSceneIssue = {
  id: number
  name: string
  path: string
  type: string
  visible: boolean
  material: string
  positionCount: number | null
  hasIndex: boolean
  drawRangeCount: number | null
}

type BenchStatsSink = {
  samples: BenchStatsSample[]
  clear: () => void
  inspectScene: () => BenchSceneIssue[]
  snapshot: () => BenchStatsSample[]
}

const MAX_SAMPLES = 5000

function isBenchStatsEnabled() {
  return (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('benchStats')
  )
}

declare global {
  interface Window {
    __PASCAL_BENCH_STATS__?: BenchStatsSink
  }
}

export function BenchStatsProbe() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(isBenchStatsEnabled())
  }, [])

  if (!enabled) return null

  return <BenchStatsProbeInner />
}

function BenchStatsProbeInner() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const sink: BenchStatsSink = {
      samples: [],
      clear: () => {
        sink.samples.length = 0
      },
      inspectScene: () => {
        const issues: BenchSceneIssue[] = []
        scene.traverse((object) => {
          const candidate = object as any
          if (!(candidate.isMesh || candidate.isLine || candidate.isPoints)) return

          const geometry = candidate.geometry
          const position = geometry?.getAttribute?.('position')
          const positionCount = typeof position?.count === 'number' ? position.count : null
          const drawRangeCount =
            typeof geometry?.drawRange?.count === 'number' ? geometry.drawRange.count : null
          const material = candidate.material
          const materialName = Array.isArray(material)
            ? material
                .map((entry) => entry?.type ?? entry?.constructor?.name ?? 'unknown')
                .join(',')
            : (material?.type ?? material?.constructor?.name ?? 'unknown')

          if (positionCount !== null && positionCount > 0 && drawRangeCount !== 0) return

          const path: string[] = []
          let cursor: any = object
          while (cursor) {
            path.push(cursor.name || cursor.type || `#${cursor.id}`)
            cursor = cursor.parent
          }

          issues.push({
            id: candidate.id,
            name: candidate.name || '',
            path: path.reverse().join(' > '),
            type: candidate.type ?? 'unknown',
            visible: candidate.visible !== false,
            material: materialName,
            positionCount,
            hasIndex: Boolean(geometry?.index),
            drawRangeCount,
          })
        })
        return issues.slice(0, 200)
      },
      snapshot: () => [...sink.samples],
    }
    window.__PASCAL_BENCH_STATS__ = sink
    return () => {
      if (window.__PASCAL_BENCH_STATS__ === sink) {
        window.__PASCAL_BENCH_STATS__ = undefined
      }
    }
  }, [scene])

  useEffect(() => {
    if (!gl?.info) return
    const previousAutoReset = gl.info.autoReset
    gl.info.autoReset = false
    gl.info.reset()
    return () => {
      gl.info.reset()
      gl.info.autoReset = previousAutoReset
    }
  }, [gl])

  useFrame(({ gl }, delta) => {
    const sink = window.__PASCAL_BENCH_STATS__
    if (!sink) return

    sink.samples.push({
      at: performance.now(),
      deltaMs: delta * 1000,
      drawCalls: gl.info?.render?.calls ?? null,
      triangles: gl.info?.render?.triangles ?? null,
      geometries: gl.info?.memory?.geometries ?? null,
      textures: gl.info?.memory?.textures ?? null,
    })
    if (sink.samples.length > MAX_SAMPLES) {
      sink.samples.splice(0, sink.samples.length - MAX_SAMPLES)
    }
    gl.info?.reset()
  }, 100)

  return null
}

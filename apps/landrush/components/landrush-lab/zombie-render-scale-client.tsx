'use client'

import { useGLTFKTX2, useGpuResourceLifetime, Viewer } from '@pascal-app/viewer'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { Box3, Color, type Group, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { BenchBridgeProbe } from '@/components/bench/bench-bridge'
import { measureLandrushFrameSlice } from './frame-load-profiler'
import { LandrushZombieEscapeCamera } from './landrush-zombie-escape-camera'
import { createZombieEscapeAttackClip } from './zombie-escape-attack-presentation'
import { createZombieEscapeDeathClip } from './zombie-escape-death-presentation'
import {
  createZombieVisual,
  type GeneratedZombieVisual,
  updateZombieVisualLocomotion,
} from './zombie-escape-generated-assets'
import {
  createZombieEscapeAuthoredInstancePresentation,
  type ZombieEscapeAuthoredInstancePresentation,
  type ZombieEscapeAuthoredInstanceSelection,
  type ZombieEscapeAuthoredInstanceState,
} from './zombie-escape-instanced-skinned-presentation'
import { ZOMBIE_ESCAPE_ZOMBIE_INTENT } from './zombie-escape-simulation'
import { createZombieEscapeImpactVisualRegistry } from './zombie-escape-skinned-impact-attachment'
import { ZOMBIE_ESCAPE_DETAILED_ZOMBIE_CAPACITY } from './zombie-escape-visual-lod'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from './zombie-escape-zombie-catalog'
import { createZombieEscapeZombieShader } from './zombie-escape-zombie-material'

const LAYOUT_SIDE = 10
const LAYOUT_SPACING_METERS = 1.02
const REQUIRED_STABLE_FRAMES = 120
const STATUS_FRAME_PRIORITY = 90_000

export type ZombieRenderScalePresentation = 'authored-instanced' | 'exact'

type VariantStatus = Readonly<{
  failures: number
  materialCount: number
  mixerCount: number
  rootCount: number
}>

type ZombieRenderScaleSnapshot = Readonly<{
  activeMixerCount: number
  assetFailureCount: number
  authoredAnimationMode: 'baked-vertex' | 'none'
  authoredBakedFrameCount: number
  authoredBakedTextureBytes: number
  authoredBakedTextureCount: number
  authoredBakedTextureFormat: 'mixed' | 'none' | 'rgba16float'
  authoredComputeDispatchCount: number
  authoredInstancedActiveCount: number
  authoredInstancedBatchCount: number
  authoredMaterialMode: 'authored-texture-grade' | 'mixed' | 'none'
  authoredRuntimeGeometryUploadCount: number
  authoredRuntimeMixerCount: number
  authoredSpatialBoundsValidCount: number
  authoredTextureFetchesPerVertex: number
  backend: 'webgl' | 'webgpu' | 'unknown'
  cameraHash: string
  coldReadyMs: number | null
  detailedRootCount: number
  drawCalls: number
  fallbackCount: number
  frameCount: number
  layoutHash: string
  materialCount: number
  presentation: ZombieRenderScalePresentation
  ready: boolean
  requestedCount: number
  stableFrameCount: number
  triangleCount: number
  unpresentedActiveCount: number
  variantCount: number
  visibility: DocumentVisibilityState
}>

declare global {
  interface Window {
    __LANDRUSH_ZOMBIE_RENDER_SCALE__?: ZombieRenderScaleSnapshot
  }
}

const NESTED_LAYOUT = Array.from({ length: LAYOUT_SIDE * LAYOUT_SIDE }, (_, index) => {
  const column = index % LAYOUT_SIDE
  const row = Math.floor(index / LAYOUT_SIDE)
  return {
    x: (column - (LAYOUT_SIDE - 1) / 2) * LAYOUT_SPACING_METERS,
    z: (row - (LAYOUT_SIDE - 1) / 2) * LAYOUT_SPACING_METERS,
  }
}).sort(
  (first, second) =>
    first.x * first.x + first.z * first.z - (second.x * second.x + second.z * second.z) ||
    Math.atan2(first.z, first.x) - Math.atan2(second.z, second.x),
)

function createAssignments(count: number) {
  return ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((_, variantIndex) =>
    Array.from({ length: count }, (_, slot) => slot).filter(
      (slot) => slot % ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length === variantIndex,
    ),
  )
}

function createLayoutHash(count: number) {
  return NESTED_LAYOUT.slice(0, count)
    .map(({ x, z }, slot) => `${slot}:${x.toFixed(3)}:${z.toFixed(3)}`)
    .join('|')
}

function createDetailedSlots(count: number, presentation: ZombieRenderScalePresentation) {
  const detailed = new Uint8Array(count)
  detailed.fill(
    1,
    0,
    presentation === 'exact' ? count : Math.min(count, ZOMBIE_ESCAPE_DETAILED_ZOMBIE_CAPACITY),
  )
  return detailed
}

function createAuthoredInstanceState(count: number): ZombieEscapeAuthoredInstanceState {
  const active = new Uint8Array(count)
  const heading = new Float32Array(count)
  const health = new Float32Array(count)
  const locomotionBlend = new Float32Array(count)
  const locomotionPhase = new Float32Array(count)
  const runBlend = new Float32Array(count)
  const spawnOrdinal = new Uint32Array(count)
  const variant = new Uint8Array(count)
  const x = new Float32Array(count)
  const y = new Float32Array(count)
  const z = new Float32Array(count)
  active.fill(1)
  health.fill(1)
  locomotionBlend.fill(1)
  runBlend.fill(1)
  for (let slot = 0; slot < count; slot += 1) {
    const position = NESTED_LAYOUT[slot]!
    heading[slot] = ((slot * 17) % 24) * (Math.PI / 12)
    locomotionPhase[slot] = ((slot * 37) % 100) * (Math.PI / 50)
    spawnOrdinal[slot] = slot + 1
    variant[slot] = slot % ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length
    x[slot] = position.x
    y[slot] = 0
    z[slot] = position.z
  }
  return {
    attackCooldown: new Float32Array(count),
    deathPresentationSeconds: new Float32Array(count),
    heading,
    hitImpulseX: new Float32Array(count),
    hitImpulseY: new Float32Array(count),
    hitImpulseZ: new Float32Array(count),
    hitReaction: new Float32Array(count),
    health,
    intent: new Uint8Array(count),
    locomotionBlend,
    locomotionPhase,
    pool: { active },
    runBlend,
    spawnOrdinal,
    variant,
    x,
    y,
    z,
  }
}

function advanceAuthoredInstancePhases(zombies: ZombieEscapeAuthoredInstanceState, delta: number) {
  for (let slot = 0; slot < zombies.pool.active.length; slot += 1) {
    if (zombies.pool.active[slot] === 0) continue
    zombies.locomotionPhase[slot] =
      (zombies.locomotionPhase[slot] ?? 0) + delta * (4 + (slot % 7) * 0.07)
  }
}

export function ZombieRenderScaleClient({
  count,
  presentation = 'exact',
}: {
  count: number
  presentation?: ZombieRenderScalePresentation
}) {
  return (
    <main className="h-screen w-screen overflow-hidden bg-[#1f2433] [&_canvas]:h-full [&_canvas]:w-full">
      <Viewer
        disablePostFx={false}
        maxFps={60}
        perf={false}
        selectionManager="custom"
        transparent={false}
        useBvh={false}
      >
        <ZombieRenderScaleWorld count={count} presentation={presentation} />
        <BenchBridgeProbe />
      </Viewer>
    </main>
  )
}

function ZombieRenderScaleWorld({
  count,
  presentation,
}: {
  count: number
  presentation: ZombieRenderScalePresentation
}) {
  const assignments = useMemo(() => createAssignments(count), [count])
  const detailedSlots = useMemo(
    () => createDetailedSlots(count, presentation),
    [count, presentation],
  )
  const detailedAssignments = useMemo(
    () => assignments.map((slots) => slots.filter((slot) => detailedSlots[slot] !== 0)),
    [assignments, detailedSlots],
  )
  const authoredSelections = useMemo<readonly ZombieEscapeAuthoredInstanceSelection[]>(
    () =>
      assignments.map((slots) => {
        const authoredSlots = slots.filter((slot) => detailedSlots[slot] === 0)
        return { count: authoredSlots.length, slots: Uint16Array.from(authoredSlots) }
      }),
    [assignments, detailedSlots],
  )
  const authoredInstanceState = useMemo(() => createAuthoredInstanceState(count), [count])
  const impactVisualRegistry = useMemo(createZombieEscapeImpactVisualRegistry, [])
  const zombieShader = useMemo(() => createZombieEscapeZombieShader({ phaseAmount: 1 }), [])
  const variantStatusesRef = useRef<Array<VariantStatus | null>>(
    ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map(() => null),
  )
  const authoredPresentationsRef = useRef<Array<ZombieEscapeAuthoredInstancePresentation | null>>(
    ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map(() => null),
  )
  const motionRef = useRef({ cameraTargetY: 0, position: new Vector3(0, 0, 0) })
  const startedAtRef = useRef(typeof performance === 'undefined' ? 0 : performance.now())
  const readyAtRef = useRef<number | null>(null)
  const frameCountRef = useRef(0)
  const stableFrameCountRef = useRef(0)
  const previousRenderCountsRef = useRef({ draws: -1, triangles: -1 })
  const layoutHash = useMemo(() => createLayoutHash(count), [count])
  const groundGeometry = useMemo(() => new PlaneGeometry(22, 15), [])
  const groundMaterial = useMemo(
    () => new MeshStandardMaterial({ color: new Color('#6a7168'), roughness: 0.92 }),
    [],
  )
  const reportVariant = useCallback((variantIndex: number, status: VariantStatus | null) => {
    variantStatusesRef.current[variantIndex] = status
  }, [])
  const registerAuthoredPresentation = useCallback(
    (variantIndex: number, authoredPresentation: ZombieEscapeAuthoredInstancePresentation) => {
      authoredPresentationsRef.current[variantIndex] = authoredPresentation
      return () => {
        if (authoredPresentationsRef.current[variantIndex] === authoredPresentation) {
          authoredPresentationsRef.current[variantIndex] = null
        }
      }
    },
    [],
  )

  useLayoutEffect(
    () => () => {
      groundGeometry.dispose()
      groundMaterial.dispose()
      delete window.__LANDRUSH_ZOMBIE_RENDER_SCALE__
    },
    [groundGeometry, groundMaterial],
  )

  useFrame((_, delta) => {
    if (presentation !== 'authored-instanced') return
    advanceAuthoredInstancePhases(authoredInstanceState, delta)
    for (
      let variantIndex = 0;
      variantIndex < authoredPresentationsRef.current.length;
      variantIndex += 1
    ) {
      const authoredPresentation = authoredPresentationsRef.current[variantIndex]
      if (!authoredPresentation) continue
      authoredPresentation.update(authoredSelections[variantIndex]!, authoredInstanceState)
    }
  }, -17)

  useFrame((state) => {
    frameCountRef.current += 1
    const statuses = variantStatusesRef.current
    const rootCount = statuses.reduce((total, status) => total + (status?.rootCount ?? 0), 0)
    const mixerCount = statuses.reduce((total, status) => total + (status?.mixerCount ?? 0), 0)
    const materialCount = statuses.reduce(
      (total, status) => total + (status?.materialCount ?? 0),
      0,
    )
    const authoredDebug = authoredPresentationsRef.current.map((authoredPresentation) =>
      authoredPresentation?.getDebugSnapshot(),
    )
    const authoredReadiness = authoredPresentationsRef.current.map((authoredPresentation) =>
      authoredPresentation?.getReadinessSnapshot(),
    )
    const authoredInstancedActiveCount = authoredDebug.reduce(
      (total, debug) => total + (debug?.activeCount ?? 0),
      0,
    )
    const authoredInstancedBatchCount = authoredDebug.reduce(
      (total, debug) => total + (debug?.batchCount ?? 0),
      0,
    )
    const activeAuthoredPresentationCount = authoredDebug.reduce(
      (total, debug) => total + (debug && debug.activeCount > 0 ? 1 : 0),
      0,
    )
    const authoredRuntimeMixerCount = authoredDebug.reduce(
      (total, debug) => total + (debug?.runtimeMixerCount ?? 0),
      0,
    )
    const authoredComputeDispatchCount = authoredDebug.reduce(
      (total, debug) => total + (debug?.computeDispatchCount ?? 0),
      0,
    )
    const authoredSpatialBoundsValidCount = authoredDebug.reduce(
      (total, debug) => total + (debug?.spatialBoundsValid ? 1 : 0),
      0,
    )
    const authoredBakedFrameCount = authoredDebug.reduce(
      (maximum, debug) => Math.max(maximum, debug?.bakedFrameCount ?? 0),
      0,
    )
    const authoredBakedTextureBytes = authoredDebug.reduce(
      (total, debug) => total + (debug?.bakedTextureBytes ?? 0),
      0,
    )
    const authoredBakedTextureCount = authoredDebug.reduce(
      (total, debug) => total + (debug?.bakedTextureCount ?? 0),
      0,
    )
    const authoredBakedTextureFormats = new Set(
      authoredDebug.flatMap((debug) =>
        debug && debug.activeCount > 0 ? [debug.bakedTextureFormat] : [],
      ),
    )
    const authoredBakedTextureFormat =
      authoredBakedTextureFormats.size === 0
        ? 'none'
        : authoredBakedTextureFormats.size === 1
          ? [...authoredBakedTextureFormats][0]!
          : 'mixed'
    const authoredRuntimeGeometryUploadCount = authoredDebug.reduce(
      (total, debug) => total + (debug?.runtimeGeometryUploadCount ?? 0),
      0,
    )
    const authoredTextureFetchesPerVertex = authoredDebug.reduce(
      (maximum, debug) => Math.max(maximum, debug?.textureFetchesPerVertex ?? 0),
      0,
    )
    const authoredMaterialModes = new Set(
      authoredDebug.flatMap((debug) =>
        debug && debug.activeCount > 0 ? [debug.materialMode] : [],
      ),
    )
    const authoredMaterialMode =
      authoredMaterialModes.size === 0
        ? 'none'
        : authoredMaterialModes.size === 1
          ? [...authoredMaterialModes][0]!
          : 'mixed'
    const failures =
      statuses.reduce((total, status) => total + (status?.failures ?? 0), 0) +
      authoredReadiness.reduce((total, readiness) => total + (readiness?.failed ? 1 : 0), 0)
    const variantCount = statuses.reduce(
      (total, status, variantIndex) =>
        total +
        (assignments[variantIndex]!.length > 0 &&
        ((status?.rootCount ?? 0) > 0 || (authoredDebug[variantIndex]?.activeCount ?? 0) > 0)
          ? 1
          : 0),
      0,
    )
    const renderInfo = (state.gl as unknown as WebGPURenderer).info?.render
    const draws = renderInfo?.drawCalls ?? renderInfo?.calls ?? 0
    const triangles = renderInfo?.triangles ?? 0
    const expectedVariantCount = Math.min(count, ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length)
    const expectedDetailedRootCount =
      presentation === 'exact' ? count : Math.min(count, ZOMBIE_ESCAPE_DETAILED_ZOMBIE_CAPACITY)
    const expectedAuthoredInstancedActiveCount = count - expectedDetailedRootCount
    const unpresentedActiveCount = Math.max(0, count - rootCount - authoredInstancedActiveCount)
    const authoredBatchesReady =
      expectedAuthoredInstancedActiveCount === 0
        ? authoredInstancedBatchCount === 0
        : authoredInstancedBatchCount > 0 &&
          authoredInstancedBatchCount <= ZOMBIE_ESCAPE_ZOMBIE_CATALOG.length
    const authoredBatchesPrepared = authoredReadiness.every(
      (readiness, variantIndex) =>
        assignments[variantIndex]!.every((slot) => detailedSlots[slot] !== 0) ||
        readiness?.ready === true,
    )
    const activeMixerCount = mixerCount + authoredRuntimeMixerCount
    const countsReady =
      failures === 0 &&
      rootCount === expectedDetailedRootCount &&
      authoredInstancedActiveCount === expectedAuthoredInstancedActiveCount &&
      authoredBatchesReady &&
      authoredBatchesPrepared &&
      unpresentedActiveCount === 0 &&
      activeMixerCount === expectedDetailedRootCount &&
      authoredComputeDispatchCount === 0 &&
      authoredRuntimeGeometryUploadCount === 0 &&
      authoredRuntimeMixerCount === 0 &&
      authoredMaterialMode ===
        (expectedAuthoredInstancedActiveCount > 0 ? 'authored-texture-grade' : 'none') &&
      authoredBakedTextureFormat ===
        (expectedAuthoredInstancedActiveCount > 0 ? 'rgba16float' : 'none') &&
      (expectedAuthoredInstancedActiveCount === 0
        ? authoredBakedTextureBytes === 0 &&
          authoredBakedTextureCount === 0 &&
          authoredTextureFetchesPerVertex === 0
        : authoredBakedTextureBytes > 0 &&
          authoredBakedTextureCount >= activeAuthoredPresentationCount &&
          authoredTextureFetchesPerVertex === 2) &&
      authoredSpatialBoundsValidCount === activeAuthoredPresentationCount &&
      variantCount === expectedVariantCount &&
      draws > 0 &&
      triangles > 0
    const previous = previousRenderCountsRef.current
    if (countsReady && previous.draws === draws && previous.triangles === triangles) {
      stableFrameCountRef.current += 1
    } else {
      stableFrameCountRef.current = 0
    }
    previous.draws = draws
    previous.triangles = triangles
    const ready = countsReady && stableFrameCountRef.current >= REQUIRED_STABLE_FRAMES
    if (ready && readyAtRef.current === null) readyAtRef.current = performance.now()
    const camera = state.camera
    const cameraHash = [
      camera.position.x,
      camera.position.y,
      camera.position.z,
      camera.quaternion.x,
      camera.quaternion.y,
      camera.quaternion.z,
      camera.quaternion.w,
      camera.projectionMatrix.elements[0],
      camera.projectionMatrix.elements[5],
    ]
      .map((value) => value.toFixed(5))
      .join(':')
    const renderer = state.gl as unknown as WebGPURenderer & { isWebGPURenderer?: boolean }
    window.__LANDRUSH_ZOMBIE_RENDER_SCALE__ = {
      activeMixerCount,
      assetFailureCount: failures,
      authoredAnimationMode: expectedAuthoredInstancedActiveCount > 0 ? 'baked-vertex' : 'none',
      authoredBakedFrameCount,
      authoredBakedTextureBytes,
      authoredBakedTextureCount,
      authoredBakedTextureFormat,
      authoredComputeDispatchCount,
      authoredInstancedActiveCount,
      authoredInstancedBatchCount,
      authoredMaterialMode,
      authoredRuntimeGeometryUploadCount,
      authoredRuntimeMixerCount,
      authoredSpatialBoundsValidCount,
      authoredTextureFetchesPerVertex,
      backend: renderer.isWebGPURenderer ? 'webgpu' : 'webgl',
      cameraHash,
      coldReadyMs:
        readyAtRef.current === null ? null : Math.max(0, readyAtRef.current - startedAtRef.current),
      detailedRootCount: rootCount,
      drawCalls: draws,
      fallbackCount: 0,
      frameCount: frameCountRef.current,
      layoutHash,
      materialCount,
      presentation,
      ready,
      requestedCount: count,
      stableFrameCount: stableFrameCountRef.current,
      triangleCount: triangles,
      unpresentedActiveCount,
      variantCount,
      visibility: document.visibilityState,
    }
  }, STATUS_FRAME_PRIORITY)

  return (
    <>
      <LandrushZombieEscapeCamera active motionRef={motionRef} />
      <mesh geometry={groundGeometry} material={groundMaterial} rotation-x={-Math.PI / 2} />
      {ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((zombie, variantIndex) => {
        const slots = assignments[variantIndex]!
        if (slots.length === 0) return null
        const exactSlots = detailedAssignments[variantIndex]!
        return (
          <Suspense fallback={null} key={zombie.id}>
            <ZombieRenderScaleVariant
              impactVisualRegistry={impactVisualRegistry}
              onStatusChange={reportVariant}
              authoredInstanceCapacity={slots.length - exactSlots.length}
              onAuthoredPresentationChange={registerAuthoredPresentation}
              slots={exactSlots}
              variantIndex={variantIndex}
              zombieShader={zombieShader}
            />
          </Suspense>
        )
      })}
    </>
  )
}

function ZombieRenderScaleVariant({
  authoredInstanceCapacity,
  impactVisualRegistry,
  onAuthoredPresentationChange,
  onStatusChange,
  slots,
  variantIndex,
  zombieShader,
}: {
  authoredInstanceCapacity: number
  impactVisualRegistry: ReturnType<typeof createZombieEscapeImpactVisualRegistry>
  onAuthoredPresentationChange: (
    variantIndex: number,
    presentation: ZombieEscapeAuthoredInstancePresentation,
  ) => () => void
  onStatusChange: (variantIndex: number, status: VariantStatus | null) => void
  slots: readonly number[]
  variantIndex: number
  zombieShader: ReturnType<typeof createZombieEscapeZombieShader>
}) {
  const zombie = ZOMBIE_ESCAPE_ZOMBIE_CATALOG[variantIndex]!
  const riggedGltf = useGLTFKTX2(zombie.glb.riggedBase.path)
  const runGltf = useGLTF(zombie.glb.run.path)
  const walkGltf = useGLTF(zombie.glb.walk.path)
  const groupRef = useRef<Group>(null)
  const visualsRef = useRef<GeneratedZombieVisual[]>([])
  const runClip = useMemo(
    () => runGltf.animations.find((clip) => clip.name === zombie.glb.run.expectedClipName) ?? null,
    [runGltf.animations, zombie.glb.run.expectedClipName],
  )
  const walkClip = useMemo(
    () =>
      walkGltf.animations.find((clip) => clip.name === zombie.glb.walk.expectedClipName) ?? null,
    [walkGltf.animations, zombie.glb.walk.expectedClipName],
  )
  const attackClip = useMemo(
    () => createZombieEscapeAttackClip(riggedGltf.scene, walkClip),
    [riggedGltf.scene, walkClip],
  )
  const deathClip = useMemo(() => createZombieEscapeDeathClip(riggedGltf.scene), [riggedGltf.scene])
  const modelTransform = useMemo(() => {
    const bounds = new Box3().setFromObject(riggedGltf.scene)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const scale = zombie.characterHeightMeters / Math.max(0.000_1, size.y)
    return {
      bodyCenterY: (center.y - bounds.min.y) * scale,
      offset: new Vector3(-center.x * scale, -bounds.min.y * scale, -center.z * scale),
      scale,
    }
  }, [riggedGltf.scene, zombie.characterHeightMeters])
  const authoredPresentation = useMemo(
    () =>
      authoredInstanceCapacity > 0
        ? createZombieEscapeAuthoredInstancePresentation({
            attackClip,
            deathClip,
            instanceCapacity: authoredInstanceCapacity,
            modelTransform,
            runClip,
            source: riggedGltf.scene,
            variantIndex,
            walkClip,
            zombieShader,
          })
        : null,
    [
      authoredInstanceCapacity,
      attackClip,
      deathClip,
      modelTransform,
      riggedGltf.scene,
      runClip,
      variantIndex,
      walkClip,
      zombieShader,
    ],
  )
  useGpuResourceLifetime(authoredPresentation)

  useLayoutEffect(() => {
    if (!authoredPresentation) return
    return onAuthoredPresentationChange(variantIndex, authoredPresentation)
  }, [authoredPresentation, onAuthoredPresentationChange, variantIndex])

  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group) return
    let failures = 0
    try {
      for (const slot of slots) {
        const visual = createZombieVisual({
          active: true,
          attackClip,
          deathClip,
          generation: 1,
          group,
          impactVisualRegistry,
          modelTransform,
          runClip,
          slot: null,
          source: riggedGltf.scene,
          walkClip,
          zombieShader,
          zombieShaderSeed: variantIndex,
        })
        const position = NESTED_LAYOUT[slot]!
        visual.root.position.set(position.x, 0, position.z)
        visual.root.rotation.y = ((slot * 17) % 24) * (Math.PI / 12)
        visualsRef.current.push(visual)
      }
    } catch (error) {
      failures += 1
      console.error('[zombie-render-scale] Failed to create detailed visual.', error)
    }
    onStatusChange(variantIndex, {
      failures,
      materialCount: visualsRef.current.reduce(
        (total, visual) => total + visual.ownedMaterials.length,
        0,
      ),
      mixerCount: visualsRef.current.filter((visual) => visual.mixer !== null).length,
      rootCount: visualsRef.current.length,
    })
    return () => {
      onStatusChange(variantIndex, null)
      for (const visual of visualsRef.current) disposeScaleVisual(visual, group)
      visualsRef.current.length = 0
    }
  }, [
    impactVisualRegistry,
    attackClip,
    deathClip,
    modelTransform,
    onStatusChange,
    riggedGltf.scene,
    runClip,
    slots,
    variantIndex,
    walkClip,
    zombieShader,
  ])

  useFrame((_, delta) => {
    measureLandrushFrameSlice('zombie.render-scale.visual-update', () => {
      for (const visual of visualsRef.current) {
        updateZombieVisualLocomotion({
          attackCooldown: 0,
          attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
          delta,
          horizontalSpeed: zombie.movement.runMetersPerSecond,
          paused: false,
          runBlend: 1,
          runMetersPerSecond: zombie.movement.runMetersPerSecond,
          visual,
          walkMetersPerSecond: zombie.movement.walkMetersPerSecond,
        })
      }
    })
  })

  return (
    <group ref={groupRef} userData={{ zombieRenderScaleVariant: zombie.id }}>
      {authoredPresentation ? <primitive object={authoredPresentation.root} /> : null}
    </group>
  )
}

function disposeScaleVisual(visual: GeneratedZombieVisual, group: Group) {
  visual.unregisterImpactVisual()
  visual.mixer?.stopAllAction()
  visual.mixer?.uncacheRoot(visual.animationRoot)
  for (const material of visual.ownedMaterials) material.dispose()
  group.remove(visual.root)
}

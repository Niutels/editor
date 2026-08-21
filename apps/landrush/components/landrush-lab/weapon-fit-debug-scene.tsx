'use client'

import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  type ComponentRef,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  Box3,
  Box3Helper,
  type Group,
  MathUtils,
  type PerspectiveCamera,
  Sphere,
  Vector3,
} from 'three'
import { WeaponFitSubject } from './weapon-fit-debug-rig'
import type {
  WeaponAssetDiagnostic,
  WeaponFitCameraBookmark,
  WeaponFitDebugDiagnostics,
  WeaponFitDebugSettings,
} from './weapon-fit-debug-state'

type WeaponFitDebugSceneProps = {
  bookmarkRevision: number
  onDiagnosticsChange: (patch: Partial<WeaponFitDebugDiagnostics>) => void
  settings: WeaponFitDebugSettings
}

type OrbitControlsHandle = ComponentRef<typeof OrbitControls>

const CAMERA_FOV = 42

export function WeaponFitDebugScene({
  bookmarkRevision,
  onDiagnosticsChange,
  settings,
}: WeaponFitDebugSceneProps) {
  return (
    <Canvas
      camera={{ far: 30, fov: CAMERA_FOV, near: 0.02, position: [1.8, 1.8, -2.4] }}
      className="h-full w-full"
      dpr={[1, 1.75]}
      frameloop="always"
      gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
      shadows={false}
    >
      <WeaponFitWorld
        bookmarkRevision={bookmarkRevision}
        onDiagnosticsChange={onDiagnosticsChange}
        settings={settings}
      />
    </Canvas>
  )
}

function WeaponFitWorld({
  bookmarkRevision,
  onDiagnosticsChange,
  settings,
}: WeaponFitDebugSceneProps) {
  const subjectRef = useRef<Group>(null)
  const controlsRef = useRef<OrbitControlsHandle>(null)
  const [assetRevision, setAssetRevision] = useState(0)
  const [bounds, setBounds] = useState(
    () => new Box3(new Vector3(-0.55, 0.82, -1.05), new Vector3(0.55, 2.08, 0.35)),
  )

  const handleAssetDiagnostic = useCallback(
    (asset: WeaponAssetDiagnostic) => {
      onDiagnosticsChange({ asset })
      setAssetRevision((revision) => revision + 1)
    },
    [onDiagnosticsChange],
  )
  const handlePoseDiagnostic = useCallback(
    (pose: Pick<WeaponFitDebugDiagnostics, 'arms' | 'grips'>) => {
      onDiagnosticsChange(pose)
    },
    [onDiagnosticsChange],
  )

  useLayoutEffect(() => {
    void assetRevision
    void settings
    const subject = subjectRef.current
    if (!subject) return
    subject.updateWorldMatrix(true, true)
    const nextBounds = new Box3().setFromObject(subject)
    if (nextBounds.isEmpty()) return
    const size = nextBounds.getSize(new Vector3())
    const center = nextBounds.getCenter(new Vector3())
    const sphere = nextBounds.getBoundingSphere(new Sphere())
    setBounds(nextBounds)
    onDiagnosticsChange({
      bounds: {
        center: center.toArray() as [number, number, number],
        radius: sphere.radius,
        size: size.toArray() as [number, number, number],
      },
    })
  }, [assetRevision, onDiagnosticsChange, settings])

  return (
    <>
      <color args={['#090e17']} attach="background" />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={['#dbeafe', '#172033', 1.05]} />
      <directionalLight color="#f8fafc" intensity={2.3} position={[3.2, 4.5, -3.6]} />
      <directionalLight color="#b8d8ff" intensity={0.8} position={[-3, 2, 2.5]} />

      <mesh position={[0, 0.795, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#0d1624" metalness={0.02} roughness={0.92} />
      </mesh>
      <gridHelper args={[6, 60, '#3b82a0', '#1c3145']} position={[0, 0.802, 0]} />
      {settings.showAxes ? <axesHelper args={[0.35]} position={[0, 0.81, 0]} /> : null}

      <WeaponFitSubject
        onAssetDiagnosticChange={handleAssetDiagnostic}
        onPoseDiagnosticChange={handlePoseDiagnostic}
        ref={subjectRef}
        settings={settings}
      />
      {settings.showBounds ? <SubjectBoundsHelper bounds={bounds} /> : null}

      <OrbitControls
        dampingFactor={0.08}
        enableDamping
        enablePan={false}
        makeDefault
        maxDistance={12}
        maxPolarAngle={Math.PI - 0.2}
        minDistance={0.22}
        minPolarAngle={0.15}
        ref={controlsRef}
      />
      <BoundsCameraDirector
        bookmark={settings.cameraBookmark}
        bookmarkRevision={bookmarkRevision}
        bounds={bounds}
        controlsRef={controlsRef}
        onDiagnosticsChange={onDiagnosticsChange}
      />
      <RenderMetricsReporter onDiagnosticsChange={onDiagnosticsChange} />
      <WeaponFitManualRenderDriver />
    </>
  )
}

function WeaponFitManualRenderDriver() {
  useFrame(({ camera, gl, scene }) => {
    gl.render(scene, camera)
  }, 100)
  return null
}

function SubjectBoundsHelper({ bounds }: { bounds: Box3 }) {
  const [helper] = useState(() => new Box3Helper(new Box3(), '#fbbf24'))
  useLayoutEffect(() => {
    helper.box.copy(bounds)
    helper.updateMatrixWorld(true)
  }, [bounds, helper])
  useEffect(
    () => () => {
      helper.geometry.dispose()
      const materials = Array.isArray(helper.material) ? helper.material : [helper.material]
      for (const material of materials) material.dispose()
    },
    [helper],
  )
  return <primitive object={helper} />
}

function BoundsCameraDirector({
  bookmark,
  bookmarkRevision,
  bounds,
  controlsRef,
  onDiagnosticsChange,
}: {
  bookmark: WeaponFitCameraBookmark
  bookmarkRevision: number
  bounds: Box3
  controlsRef: RefObject<OrbitControlsHandle | null>
  onDiagnosticsChange: (patch: Partial<WeaponFitDebugDiagnostics>) => void
}) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const size = useThree((state) => state.size)

  useLayoutEffect(() => {
    const controls = controlsRef.current
    const snapshot = {
      far: camera.far,
      fov: camera.fov,
      near: camera.near,
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      target: controls?.target.clone() ?? new Vector3(),
      up: camera.up.clone(),
      zoom: camera.zoom,
    }
    return () => {
      camera.position.copy(snapshot.position)
      camera.quaternion.copy(snapshot.quaternion)
      camera.up.copy(snapshot.up)
      camera.fov = snapshot.fov
      camera.near = snapshot.near
      camera.far = snapshot.far
      camera.zoom = snapshot.zoom
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld(true)
      if (controlsRef.current) {
        controlsRef.current.target.copy(snapshot.target)
        controlsRef.current.update()
      }
    }
  }, [camera, controlsRef])

  useLayoutEffect(() => {
    void bookmarkRevision
    const pose = createBoundsCameraPose(bounds, bookmark, CAMERA_FOV, size.width / size.height)
    camera.position.copy(pose.position)
    camera.up.set(0, 1, 0)
    camera.fov = CAMERA_FOV
    camera.near = pose.near
    camera.far = pose.far
    camera.zoom = 1
    camera.lookAt(pose.target)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    if (controlsRef.current) {
      controlsRef.current.target.copy(pose.target)
      controlsRef.current.update()
    }
    onDiagnosticsChange({
      camera: {
        bookmark,
        distance: pose.distance,
        far: pose.far,
        fov: CAMERA_FOV,
        near: pose.near,
      },
    })
  }, [bookmark, bookmarkRevision, bounds, camera, controlsRef, onDiagnosticsChange, size])

  return null
}

function createBoundsCameraPose(
  bounds: Box3,
  bookmark: WeaponFitCameraBookmark,
  fovDegrees: number,
  aspect: number,
) {
  const safeAspect = Math.max(0.25, aspect)
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const sphere = bounds.getBoundingSphere(new Sphere())
  const verticalFov = MathUtils.degToRad(fovDegrees)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect)
  const projectedWidth = Math.max(size.x, size.z * 0.62)
  const heightDistance = size.y / (2 * Math.tan(verticalFov / 2))
  const widthDistance = projectedWidth / (2 * Math.tan(horizontalFov / 2))
  const fitDistance = Math.max(0.45, heightDistance, widthDistance, sphere.radius * 1.35)
  const multiplier = bookmark === 'near' ? 0.72 : bookmark === 'far' ? 2.05 : 1.16
  const distance = fitDistance * multiplier
  const target = center.clone()
  if (bookmark === 'near') {
    target.y += size.y * 0.08
    target.z -= size.z * 0.13
  }
  const direction = new Vector3(0.82, 0.34, -1.34).normalize()
  const position = target.clone().addScaledVector(direction, distance)
  const near = Math.max(0.01, distance - sphere.radius * 1.8)
  const far = Math.max(20, distance + sphere.radius * 8)
  return { distance, far, near, position, target }
}

function RenderMetricsReporter({
  onDiagnosticsChange,
}: {
  onDiagnosticsChange: (patch: Partial<WeaponFitDebugDiagnostics>) => void
}) {
  const previousSignature = useRef('')
  useFrame(({ gl }) => {
    const drawCalls = gl.info.render.calls
    const triangles = gl.info.render.triangles
    const signature = `${drawCalls}:${triangles}`
    if (signature === previousSignature.current) return
    previousSignature.current = signature
    onDiagnosticsChange({
      rendering: { drawCalls, postProcessPasses: 0, triangles },
    })
  })
  return null
}

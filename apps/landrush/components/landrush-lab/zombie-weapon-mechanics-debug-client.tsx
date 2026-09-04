'use client'

import { ZOMBIE_ESCAPE_WEAPON_PROFILES } from '@landrush/zombie-gameplay/zombie-escape-config'
import type { ZombieEscapeSimulation } from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from '@landrush/zombie-gameplay/zombie-escape-weapon-catalog'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ACESFilmicToneMapping,
  Color,
  type Group,
  type MeshStandardMaterial,
  NoToneMapping,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { ZombieEscapeEffects } from './zombie-escape-effects'
import {
  createZombieEscapeImpactVisualRegistry,
  type ZombieEscapeImpactVisualRegistry,
} from './zombie-escape-skinned-impact-attachment'
import { resolveZombieEscapeWeaponVfxStyle } from './zombie-escape-weapon-vfx'
import {
  advanceZombieWeaponMechanicsScenarioRuntime,
  createZombieWeaponMechanicsScenarioRuntime,
  type ZombieWeaponMechanicsScenarioReport,
  type ZombieWeaponMechanicsScenarioRuntime,
} from './zombie-weapon-mechanics-debug-runtime'
import {
  clampZombieWeaponMechanicsProofTime,
  parseZombieWeaponMechanicsDebugQuery,
  ZOMBIE_WEAPON_MECHANICS_PROOF_DURATION_SECONDS,
  ZOMBIE_WEAPON_MECHANICS_SCENARIOS,
  type ZombieWeaponMechanicsDebugView,
  type ZombieWeaponMechanicsScenario,
} from './zombie-weapon-mechanics-debug-state'

type ZombieWeaponMechanicsDebugState = Readonly<{
  ready: boolean
  scenarios: readonly ZombieWeaponMechanicsScenarioReport[]
  timeSeconds: number
  variantIndex: number
  view: ZombieWeaponMechanicsDebugView
  weaponId: ZombieWeaponMechanicsScenario['id'] | null
}>

type ZombieWeaponMechanicsDebugApi = Readonly<{
  getState: () => ZombieWeaponMechanicsDebugState
  reset: () => void
  setAuto: () => void
  setTime: (timeSeconds: number) => void
}>

declare global {
  interface Window {
    __ZOMBIE_WEAPON_MECHANICS_DEBUG__?: ZombieWeaponMechanicsDebugApi
  }
}

export function ZombieWeaponMechanicsDebugClient() {
  const [urlReady, setUrlReady] = useState(false)
  const [fixedTimeSeconds, setFixedTimeSeconds] = useState<number | null>(null)
  const [view, setView] = useState<ZombieWeaponMechanicsDebugView>('final')
  const [variantIndex, setVariantIndex] = useState(0)
  const [selectedWeaponId, setSelectedWeaponId] = useState<
    ZombieWeaponMechanicsScenario['id'] | null
  >(null)
  const [resetRevision, setResetRevision] = useState(0)
  const [readyMask, setReadyMask] = useState(0)
  const [reports, setReports] = useState<readonly ZombieWeaponMechanicsScenarioReport[]>(() =>
    ZOMBIE_WEAPON_MECHANICS_SCENARIOS.map(createEmptyScenarioReport),
  )
  const publicStateRef = useRef<ZombieWeaponMechanicsDebugState>({
    ready: false,
    scenarios: reports,
    timeSeconds: 0,
    variantIndex: 0,
    view,
    weaponId: null,
  })

  useEffect(() => {
    const query = parseZombieWeaponMechanicsDebugQuery(new URLSearchParams(window.location.search))
    setFixedTimeSeconds(query.timeSeconds)
    setView(query.view)
    setVariantIndex(query.variantIndex)
    setSelectedWeaponId(query.weaponId)
    setReports(
      (query.weaponId
        ? ZOMBIE_WEAPON_MECHANICS_SCENARIOS.filter(({ id }) => id === query.weaponId)
        : ZOMBIE_WEAPON_MECHANICS_SCENARIOS
      ).map(createEmptyScenarioReport),
    )
    setUrlReady(true)
  }, [])

  const activeScenarios = selectedWeaponId
    ? ZOMBIE_WEAPON_MECHANICS_SCENARIOS.filter(({ id }) => id === selectedWeaponId)
    : ZOMBIE_WEAPON_MECHANICS_SCENARIOS

  const setTime = useCallback((timeSeconds: number) => {
    const resolvedTime = clampZombieWeaponMechanicsProofTime(timeSeconds)
    publicStateRef.current = {
      ...publicStateRef.current,
      ready: false,
      timeSeconds: resolvedTime,
    }
    setReadyMask(0)
    setFixedTimeSeconds(resolvedTime)
  }, [])
  const reset = useCallback(() => {
    publicStateRef.current = { ...publicStateRef.current, ready: false, timeSeconds: 0 }
    setReadyMask(0)
    setFixedTimeSeconds(0)
    setResetRevision((revision) => revision + 1)
  }, [])
  const setAuto = useCallback(() => {
    publicStateRef.current = { ...publicStateRef.current, ready: false, timeSeconds: 0 }
    setReadyMask(0)
    setFixedTimeSeconds(null)
    setResetRevision((revision) => revision + 1)
  }, [])
  const setScenarioReady = useCallback((scenarioIndex: number) => {
    setReadyMask((mask) => mask | (1 << scenarioIndex))
  }, [])
  const updateReport = useCallback(
    (scenarioIndex: number, report: ZombieWeaponMechanicsScenarioReport) => {
      setReports((current) => {
        if (current[scenarioIndex] === report) return current
        const next = [...current]
        next[scenarioIndex] = report
        return next
      })
    },
    [],
  )

  const ready = readyMask === (1 << activeScenarios.length) - 1
  const timelineSeconds =
    fixedTimeSeconds ?? Math.max(0, ...reports.map((report) => report.timeSeconds))
  const selectedWeaponIndex = selectedWeaponId
    ? ZOMBIE_ESCAPE_WEAPON_CATALOG.findIndex(({ id }) => id === selectedWeaponId)
    : 0
  const selectedVfxStyle = resolveZombieEscapeWeaponVfxStyle(selectedWeaponIndex, variantIndex)
  publicStateRef.current = {
    ready,
    scenarios: reports,
    timeSeconds: Number(timelineSeconds.toFixed(6)),
    variantIndex,
    view,
    weaponId: selectedWeaponId,
  }

  useEffect(() => {
    const api: ZombieWeaponMechanicsDebugApi = {
      getState: () => publicStateRef.current,
      reset,
      setAuto,
      setTime,
    }
    window.__ZOMBIE_WEAPON_MECHANICS_DEBUG__ = api
    return () => {
      if (window.__ZOMBIE_WEAPON_MECHANICS_DEBUG__ === api) {
        delete window.__ZOMBIE_WEAPON_MECHANICS_DEBUG__
      }
    }
  }, [reset, setAuto, setTime])

  if (!urlReady) {
    return (
      <main className="grid h-screen place-items-center bg-[#08131b] text-cyan-100">
        Preparing deterministic production simulations…
      </main>
    )
  }

  return (
    <main
      className="flex h-screen w-screen select-none flex-col overflow-hidden bg-[#08131b] text-white"
      data-capture-ready={ready ? 'true' : 'false'}
      data-proof-time={timelineSeconds.toFixed(4)}
      data-proof-variant={variantIndex + 1}
      data-proof-view={view}
      data-proof-weapon={selectedWeaponId ?? 'all'}
    >
      <header className="flex min-h-[76px] items-center justify-between gap-5 border-white/10 border-b bg-[#0a1822] px-5 py-3">
        <div>
          <p className="font-semibold text-[10px] text-cyan-300 uppercase tracking-[0.24em]">
            Production mechanics proof · fixed seed · one trigger
          </p>
          <h1 className="mt-1 font-semibold text-lg">
            {activeScenarios.length === 1
              ? `${activeScenarios[0]?.label} · V${variantIndex + 1} ${selectedVfxStyle.variantLabel}`
              : 'Five weapons, five observable outcomes'}
          </h1>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Real createZombieEscapeSimulation states · production ZombieEscapeEffects · no copied
            hit paths
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProofButton active={fixedTimeSeconds === null} label="Auto" onClick={setAuto} />
          <ProofButton active={fixedTimeSeconds === 0} label="Reset" onClick={reset} />
          <ProofButton active={view === 'final'} label="Final" onClick={() => setView('final')} />
          <ProofButton
            active={view === 'no-post'}
            label="No post"
            onClick={() => setView('no-post')}
          />
          <div className="ml-2 min-w-[88px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-right font-mono text-xs">
            {timelineSeconds.toFixed(2)}s
          </div>
        </div>
      </header>

      <div
        className={`grid min-h-0 flex-1 gap-2 p-2 ${
          activeScenarios.length === 1 ? 'grid-cols-1 grid-rows-1' : 'grid-cols-3 grid-rows-2'
        }`}
      >
        {activeScenarios.map((scenario, scenarioIndex) => (
          <ScenarioPanel
            fixedTimeSeconds={fixedTimeSeconds}
            key={scenario.id}
            onReady={() => setScenarioReady(scenarioIndex)}
            onReport={(report) => updateReport(scenarioIndex, report)}
            report={reports[scenarioIndex] ?? createEmptyScenarioReport(scenario)}
            resetRevision={resetRevision}
            scenario={scenario}
            variantIndex={variantIndex}
            view={view}
          />
        ))}
        {activeScenarios.length > 1 ? <ProofLegend reports={reports} /> : null}
      </div>
    </main>
  )
}

function ScenarioPanel({
  fixedTimeSeconds,
  onReady,
  onReport,
  report,
  resetRevision,
  scenario,
  variantIndex,
  view,
}: {
  fixedTimeSeconds: number | null
  onReady: () => void
  onReport: (report: ZombieWeaponMechanicsScenarioReport) => void
  report: ZombieWeaponMechanicsScenarioReport
  resetRevision: number
  scenario: ZombieWeaponMechanicsScenario
  variantIndex: number
  view: ZombieWeaponMechanicsDebugView
}) {
  return (
    <section
      className="relative min-h-0 overflow-hidden rounded-xl border border-white/10 bg-[#0c1c27] shadow-lg"
      data-scenario-id={scenario.id}
    >
      <Canvas
        camera={{ far: 40, fov: 48, near: 0.05, position: [6.4, 7.4, 8.6] }}
        dpr={1}
        frameloop="always"
        gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
        shadows={false}
      >
        <ScenarioWorld
          fixedTimeSeconds={fixedTimeSeconds}
          onReady={onReady}
          onReport={onReport}
          resetRevision={resetRevision}
          scenario={scenario}
          variantIndex={variantIndex}
          view={view}
        />
      </Canvas>
      <div className="pointer-events-none absolute top-2 right-2 left-2 flex items-start justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/76 px-2.5 py-2 backdrop-blur-sm">
        <div>
          <h2 className="font-semibold text-[12px] text-white">{report.label}</h2>
          <p className="mt-0.5 text-[9px] text-slate-400 uppercase tracking-[0.12em]">
            V{variantIndex + 1} ·{' '}
            {
              resolveZombieEscapeWeaponVfxStyle(
                ZOMBIE_ESCAPE_WEAPON_CATALOG.findIndex(({ id }) => id === scenario.id),
                variantIndex,
              ).variantLabel
            }
          </p>
        </div>
        <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 font-mono text-[9px] text-cyan-200 uppercase">
          {report.mechanic}
        </span>
      </div>
      <div className="pointer-events-none absolute right-2 bottom-2 left-2 grid grid-cols-4 gap-1 rounded-lg border border-white/10 bg-slate-950/80 px-2 py-1.5 font-mono text-[9px] backdrop-blur-sm">
        <ProofMetric label="carriers" value={report.projectileCount} />
        <ProofMetric label="contacts" value={report.contactCount} />
        <ProofMetric
          label="targets"
          value={`${report.damagedTargetCount}/${report.remainingHealth.length}`}
        />
        <ProofMetric label="damage" value={Math.round(report.damage)} />
      </div>
    </section>
  )
}

function ScenarioWorld({
  fixedTimeSeconds,
  onReady,
  onReport,
  resetRevision,
  scenario,
  variantIndex,
  view,
}: {
  fixedTimeSeconds: number | null
  onReady: () => void
  onReport: (report: ZombieWeaponMechanicsScenarioReport) => void
  resetRevision: number
  scenario: ZombieWeaponMechanicsScenario
  variantIndex: number
  view: ZombieWeaponMechanicsDebugView
}) {
  const runtimeRef = useRef<ZombieWeaponMechanicsScenarioRuntime | null>(null)
  runtimeRef.current ??= createZombieWeaponMechanicsScenarioRuntime(scenario)
  const simulationRef = useRef<ZombieEscapeSimulation>(runtimeRef.current.simulation)
  const impactVisualRegistry = useMemo<ZombieEscapeImpactVisualRegistry>(
    () => createZombieEscapeImpactVisualRegistry(),
    [],
  )

  return (
    <>
      <color args={[view === 'final' ? '#173847' : '#10232c']} attach="background" />
      <ScenarioRendererPresentation view={view} />
      <ScenarioCamera />
      <hemisphereLight args={['#e9fbff', '#153f39', view === 'final' ? 2.1 : 1.45]} />
      <directionalLight color="#fff1cf" intensity={2.8} position={[5, 9, 6]} />
      <directionalLight color="#67d7ff" intensity={0.75} position={[-5, 4, -4]} />
      <ScenarioStage runtimeRef={runtimeRef} scenario={scenario} />
      <ZombieEscapeEffects
        framePriority={-16}
        impactVisualRegistry={impactVisualRegistry}
        simulationRef={simulationRef}
        vfxVariantIndex={variantIndex}
      />
      <ScenarioSimulationDriver
        fixedTimeSeconds={fixedTimeSeconds}
        onReady={onReady}
        onReport={onReport}
        resetRevision={resetRevision}
        runtimeRef={runtimeRef}
        scenario={scenario}
        simulationRef={simulationRef}
      />
    </>
  )
}

function ScenarioSimulationDriver({
  fixedTimeSeconds,
  onReady,
  onReport,
  resetRevision,
  runtimeRef,
  scenario,
  simulationRef,
}: {
  fixedTimeSeconds: number | null
  onReady: () => void
  onReport: (report: ZombieWeaponMechanicsScenarioReport) => void
  resetRevision: number
  runtimeRef: MutableRefObject<ZombieWeaponMechanicsScenarioRuntime | null>
  scenario: ZombieWeaponMechanicsScenario
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const lastPublishedSignatureRef = useRef('')

  const replaceRuntime = useCallback(() => {
    const runtime = createZombieWeaponMechanicsScenarioRuntime(scenario)
    runtimeRef.current = runtime
    simulationRef.current = runtime.simulation
    lastPublishedSignatureRef.current = ''
    return runtime
  }, [runtimeRef, scenario, simulationRef])

  useLayoutEffect(() => {
    void resetRevision
    replaceRuntime()
  }, [replaceRuntime, resetRevision])

  useFrame(({ gl }, rawDelta) => {
    let runtime = runtimeRef.current ?? replaceRuntime()
    if (
      fixedTimeSeconds !== null &&
      runtime.simulation.elapsedSeconds > fixedTimeSeconds + 0.000_001
    ) {
      runtime = replaceRuntime()
    }
    if (
      fixedTimeSeconds === null &&
      runtime.simulation.elapsedSeconds >= ZOMBIE_WEAPON_MECHANICS_PROOF_DURATION_SECONDS
    ) {
      runtime = replaceRuntime()
    }
    const targetTime =
      fixedTimeSeconds ??
      Math.min(
        ZOMBIE_WEAPON_MECHANICS_PROOF_DURATION_SECONDS,
        runtime.simulation.elapsedSeconds + Math.min(0.05, Math.max(0, rawDelta)),
      )
    const report = advanceZombieWeaponMechanicsScenarioRuntime(runtime, targetTime)
    simulationRef.current = runtime.simulation
    const signature = `${Math.floor(report.timeSeconds * 20)}:${report.contactCount}:${report.damage}:${report.projectileCount}`
    if (signature !== lastPublishedSignatureRef.current || fixedTimeSeconds !== null) {
      lastPublishedSignatureRef.current = signature
      onReport(report)
    }
    const atTarget =
      fixedTimeSeconds === null ||
      Math.abs(runtime.simulation.elapsedSeconds - fixedTimeSeconds) < 0.000_1
    if (atTarget && gl.info.render.calls > 0) onReady()
  }, -30)

  return null
}

function ScenarioStage({
  runtimeRef,
  scenario,
}: {
  runtimeRef: MutableRefObject<ZombieWeaponMechanicsScenarioRuntime | null>
  scenario: ZombieWeaponMechanicsScenario
}) {
  return (
    <group>
      <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[11, 13]} />
        <meshStandardMaterial color="#326552" roughness={0.96} />
      </mesh>
      <gridHelper args={[12, 24, '#68c7b0', '#264c48']} position={[0, 0, -0.5]} />
      <mesh position={[0, 0.42, 5]}>
        <cylinderGeometry args={[0.32, 0.46, 0.84, 10]} />
        <meshStandardMaterial color="#64d5e8" emissive="#123e48" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, 1.14, 4.72]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.12, 0.72, 8]} />
        <meshStandardMaterial color="#f7c75d" metalness={0.25} roughness={0.35} />
      </mesh>
      {scenario.targetPositions.map((position, targetIndex) => (
        <ScenarioTarget
          initialHealth={TARGET_PROXY_INITIAL_HEALTH}
          key={`${position.x}:${position.z}`}
          runtimeRef={runtimeRef}
          targetIndex={targetIndex}
        />
      ))}
    </group>
  )
}

const TARGET_PROXY_INITIAL_HEALTH = 500

function ScenarioTarget({
  initialHealth,
  runtimeRef,
  targetIndex,
}: {
  initialHealth: number
  runtimeRef: MutableRefObject<ZombieWeaponMechanicsScenarioRuntime | null>
  targetIndex: number
}) {
  const groupRef = useRef<Group>(null)
  const materialRef = useRef<MeshStandardMaterial>(null)
  const healthy = useMemo(() => new Color('#b9f36b'), [])
  const damaged = useMemo(() => new Color('#ff6f61'), [])
  const dead = useMemo(() => new Color('#4d2730'), [])

  useFrame(() => {
    const runtime = runtimeRef.current
    const group = groupRef.current
    const material = materialRef.current
    if (!(runtime && group && material)) return
    const slot = runtime.targetSlots[targetIndex]
    if (slot === undefined) return
    const zombies = runtime.simulation.zombies
    const health = Math.max(0, zombies.health[slot] ?? 0)
    const ratio = Math.max(0, Math.min(1, health / initialHealth))
    group.position.set(zombies.x[slot] ?? 0, (zombies.y[slot] ?? 0) + 0.78, zombies.z[slot] ?? 0)
    group.rotation.z = health <= 0 ? Math.PI / 2 : (zombies.hitReaction[slot] ?? 0) * 0.12
    group.scale.set(1, health <= 0 ? 0.42 : 1, 1)
    material.color.copy(health <= 0 ? dead : healthy).lerp(damaged, 1 - ratio)
    material.emissive.copy(damaged)
    material.emissiveIntensity = (zombies.hitFlash[slot] ?? 0) * 1.8
  }, -10)

  return (
    <group ref={groupRef}>
      <mesh>
        <capsuleGeometry args={[0.34, 0.82, 5, 10]} />
        <meshStandardMaterial ref={materialRef} roughness={0.68} />
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.3, 12, 8]} />
        <meshStandardMaterial color="#c7f48e" roughness={0.72} />
      </mesh>
    </group>
  )
}

function ScenarioCamera() {
  const camera = useThree((state) => state.camera)
  useLayoutEffect(() => {
    camera.position.set(6.4, 7.4, 8.6)
    camera.lookAt(new Vector3(0, 0.45, -0.2))
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
  }, [camera])
  return null
}

function ScenarioRendererPresentation({ view }: { view: ZombieWeaponMechanicsDebugView }) {
  const gl = useThree((state) => state.gl)
  useLayoutEffect(() => {
    const previousColorSpace = gl.outputColorSpace
    const previousToneMapping = gl.toneMapping
    const previousExposure = gl.toneMappingExposure
    gl.outputColorSpace = SRGBColorSpace
    gl.toneMapping = view === 'final' ? ACESFilmicToneMapping : NoToneMapping
    gl.toneMappingExposure = view === 'final' ? 1.05 : 1
    return () => {
      gl.outputColorSpace = previousColorSpace
      gl.toneMapping = previousToneMapping
      gl.toneMappingExposure = previousExposure
    }
  }, [gl, view])
  return null
}

function ProofLegend({ reports }: { reports: readonly ZombieWeaponMechanicsScenarioReport[] }) {
  const allOneTrigger = reports.every((report) => report.shotsFired <= 1)
  return (
    <section className="flex min-h-0 flex-col justify-between rounded-xl border border-white/10 bg-[#0d202b] p-5">
      <div>
        <p className="font-semibold text-[10px] text-cyan-300 uppercase tracking-[0.22em]">
          Observable contract
        </p>
        <h2 className="mt-2 font-semibold text-xl">The counters come from production pools.</h2>
        <p className="mt-2 max-w-md text-slate-400 text-xs leading-relaxed">
          Carriers are unique generated shot slots. Contacts are immutable impact-event generations.
          Targets and damage are measured directly from zombie health arrays.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <LegendItem label="Pistol" value="single contact" />
        <LegendItem label="Carbine" value="four in line" />
        <LegendItem label="Scatter" value="seven carriers" />
        <LegendItem label="Coil" value="primary + two chains" />
        <LegendItem label="Launcher" value="direct + blast victims" />
        <LegendItem label="Ammo/audio" value={allOneTrigger ? 'one trigger each' : 'waiting'} />
      </div>
      <p className="font-mono text-[10px] text-slate-500">
        final / no-post · DPR 1 capture · deterministic fixed-step replay
      </p>
    </section>
  )
}

function LegendItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2">
      <span className="block text-slate-500 uppercase tracking-wide">{label}</span>
      <span className="mt-0.5 block text-slate-200">{value}</span>
    </div>
  )
}

function ProofMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="text-center">
      <span className="block text-slate-500 uppercase">{label}</span>
      <span className="block font-semibold text-cyan-100 text-[11px]">{value}</span>
    </span>
  )
}

function ProofButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={`rounded-lg border px-3 py-2 font-medium text-[11px] transition ${
        active
          ? 'border-cyan-300/45 bg-cyan-300/15 text-cyan-100'
          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

function createEmptyScenarioReport(
  scenario: ZombieWeaponMechanicsScenario,
): ZombieWeaponMechanicsScenarioReport {
  const weaponIndex = ZOMBIE_ESCAPE_WEAPON_CATALOG.findIndex((weapon) => weapon.id === scenario.id)
  return {
    contactCount: 0,
    damage: 0,
    damagedTargetCount: 0,
    effectContacts: {},
    formation: scenario.formation,
    id: scenario.id,
    label: scenario.label,
    mechanic: ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]?.mechanic ?? 'unknown',
    projectileCount: 0,
    remainingHealth: scenario.targetPositions.map(() => TARGET_PROXY_INITIAL_HEALTH),
    shotsFired: 0,
    timeSeconds: 0,
    volleySize: 0,
  }
}

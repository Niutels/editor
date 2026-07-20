'use client'

import {
  createPascalWaterLandSurface,
  createPascalWaterSmoothedPerimeter,
  LANDRUSH_WATER_SURFACE_ELEVATION,
} from '@pascal-app/nodes'
import { OrbitControls, OrthographicCamera } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Vector3 } from 'three'
import { PASCAL_WORLD_ELEVATION_PARAMETERS } from './pascal-world-visual-defaults'
import {
  DEFAULT_PROCEDURAL_BEACH_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_OFFSHORE_CONTROLS,
  DEFAULT_PROCEDURAL_ROCK_TONE_CONTROLS,
  type ProceduralBeachControls,
  type ProceduralRockCliffDebugMode,
  type ProceduralRockCliffMetrics,
  type ProceduralRockCliffQuality,
  type ProceduralRockCliffRuntimeMetrics,
  ProceduralRockCliffs,
  type ProceduralRockCliffWallControls,
  type ProceduralRockOffshoreControls,
  type ProceduralRockToneControls,
} from './procedural-rock-cliffs'
import {
  createStandaloneOceanRenderer,
  STANDALONE_OCEAN_QUALITY,
  StandaloneOceanWorld,
} from './standalone-ocean-client'
import {
  createDefaultStandaloneOceanParameters,
  type StandaloneOceanDebugMode,
  type StandaloneOceanParameters,
} from './standalone-ocean-material'
import { StandaloneOceanParameterControls } from './standalone-ocean-parameter-controls'
import { generateWaterLabIsland, WATER_LAB_DEFAULT_ISLAND_PARAMETERS } from './water-lab-parameters'
import { WATER_PLANE_SIZE } from './water-material'
import type { WaterViewPreset } from './water-view-presets'
import type { WaterlineInteractionField } from './waterline-interaction-field'

type RockCliffCameraBookmark = 'design' | 'far' | 'near'
type ProceduralBeachNumericControl = Exclude<keyof ProceduralBeachControls, 'enabled'>

const ROCK_CLIFF_DEFAULT_SEED = 1847
const ROCK_CLIFF_STRESS_SEED = 90_210
const ROCK_CLIFF_DEFAULT_CUTS = 17
const ROCK_CLIFF_DEFAULT_SCALE = 1.02

const ROCK_CLIFF_CAMERA_PRESETS: Record<RockCliffCameraBookmark, WaterViewPreset> = {
  design: {
    id: 'overview',
    label: 'Design',
    camera: { position: [88, 76, 96], target: [0, 4.5, 0], zoom: 7.65 },
  },
  near: {
    id: 'low-shore',
    label: 'Near cliff',
    camera: { position: [58, 36, 72], target: [-16, 4.2, 7], zoom: 10.4 },
  },
  far: {
    id: 'wide-atoll',
    label: 'Far silhouette',
    camera: { position: [126, 108, 142], target: [0, 4, 0], zoom: 5.55 },
  },
}

declare global {
  interface Window {
    __LANDRUSH_PROCEDURAL_ROCK_CLIFFS_DEBUG__?: {
      camera: RockCliffCameraBookmark
      beachControls: ProceduralBeachControls
      cutCount: number
      debugMode: ProceduralRockCliffDebugMode
      deliberateDivergences: readonly string[]
      fieldContract: readonly string[]
      metrics: ProceduralRockCliffMetrics | null
      noPostBaseline: true
      offshoreControls: ProceduralRockOffshoreControls
      oceanDebugMode: StandaloneOceanDebugMode
      quality: ProceduralRockCliffQuality
      reference: string
      rockScale: number
      runtime: ProceduralRockCliffRuntimeMetrics | null
      seed: number
      toneControls: ProceduralRockToneControls
      wallControls: ProceduralRockCliffWallControls
      waterlineInteractionField: {
        maximumDistanceMeters: number
        resolution: number
        segmentCount: number
      } | null
      waterlineFoam: Pick<
        StandaloneOceanParameters,
        | 'waterlineFoamBreakup'
        | 'waterlineFoamBreakupScale'
        | 'waterlineFoamCrestInfluence'
        | 'waterlineFoamEnabled'
        | 'waterlineFoamEvolutionSpeed'
        | 'waterlineFoamIntensity'
        | 'waterlineFoamReach'
        | 'waterlineFoamSoftness'
        | 'waterlineFoamSpeed'
        | 'waterlineFoamWarpStrength'
        | 'waterlineFoamWidth'
      >
      waterPaused: boolean
    }
  }
}

export function PascalProceduralRockCliffsDebugClient() {
  const island = useMemo(() => generateWaterLabIsland(WATER_LAB_DEFAULT_ISLAND_PARAMETERS), [])
  const landSurface = useMemo(
    () =>
      createPascalWaterLandSurface({
        elevationParameters: PASCAL_WORLD_ELEVATION_PARAMETERS,
        shorelinePoints: createPascalWaterSmoothedPerimeter(island.perimeter.points),
        waterPlaneSize: WATER_PLANE_SIZE,
      }),
    [island],
  )
  const [camera, setCamera] = useState<RockCliffCameraBookmark>('design')
  const [beachControls, setBeachControls] = useState<ProceduralBeachControls>(() => ({
    ...DEFAULT_PROCEDURAL_BEACH_CONTROLS,
  }))
  const [bottomElevationMeters, setBottomElevationMeters] = useState<number>(
    DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS.bottomElevationMeters,
  )
  const [coverageOverlap, setCoverageOverlap] = useState<number>(
    DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS.coverageOverlap,
  )
  const [cutCount, setCutCount] = useState(ROCK_CLIFF_DEFAULT_CUTS)
  const [debugMode, setDebugMode] = useState<ProceduralRockCliffDebugMode>('final')
  const [metrics, setMetrics] = useState<ProceduralRockCliffMetrics | null>(null)
  const [oceanDebugMode, setOceanDebugMode] = useState<StandaloneOceanDebugMode>('final')
  const [oceanParameters, setOceanParameters] = useState(createDefaultStandaloneOceanParameters)
  const [offshoreControls, setOffshoreControls] = useState<ProceduralRockOffshoreControls>(() => ({
    ...DEFAULT_PROCEDURAL_ROCK_OFFSHORE_CONTROLS,
  }))
  const [reliefDepthMeters, setReliefDepthMeters] = useState<number>(
    DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS.reliefDepthMeters,
  )
  const [quality, setQuality] = useState<ProceduralRockCliffQuality>('balanced')
  const [rockHeightMeters, setRockHeightMeters] = useState<number>(
    DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS.rockHeightMeters,
  )
  const [rockScale, setRockScale] = useState(ROCK_CLIFF_DEFAULT_SCALE)
  const [rockWidthMeters, setRockWidthMeters] = useState<number>(
    DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS.rockWidthMeters,
  )
  const [runtime, setRuntime] = useState<ProceduralRockCliffRuntimeMetrics | null>(null)
  const [seed, setSeed] = useState(ROCK_CLIFF_DEFAULT_SEED)
  const [toneControls, setToneControls] = useState<ProceduralRockToneControls>(() => ({
    ...DEFAULT_PROCEDURAL_ROCK_TONE_CONTROLS,
  }))
  const [waterlineInteractionField, setWaterlineInteractionField] =
    useState<WaterlineInteractionField | null>(null)
  const [waterPaused, setWaterPaused] = useState(false)
  const preset = ROCK_CLIFF_CAMERA_PRESETS[camera]
  const wallControls = useMemo<ProceduralRockCliffWallControls>(
    () => ({
      bottomElevationMeters,
      coverageOverlap,
      reliefDepthMeters,
      rockHeightMeters,
      rockWidthMeters,
    }),
    [bottomElevationMeters, coverageOverlap, reliefDepthMeters, rockHeightMeters, rockWidthMeters],
  )

  useEffect(() => {
    window.__LANDRUSH_PROCEDURAL_ROCK_CLIFFS_DEBUG__ = {
      beachControls,
      camera,
      cutCount,
      debugMode,
      deliberateDivergences: [
        'runtime convex half-space cuts plus hull reconstruction replace Blender mesh-boolean cube cutters',
        'transformed procedural rocks compile into one mesh before the weighted world/local tone field is evaluated',
        'waterline-crossing triangles are split so submerged colors cannot interpolate into dry rock',
        'a flat curtain is merged 0.5 m inside the grass perimeter and stops 0.04 m below grass',
        'convex source rocks are embedded into the curtain as shallow relief instead of radial cliff bands',
        'offshore outcrops reuse the wall variants while only their submerged sections extend beneath fixed waterline silhouettes',
      ],
      fieldContract: [
        'the standalone ocean renderer and unmodified default ocean parameters are the only visible water path',
        'one 192 by 192 ocean mesh evaluates the deterministic 24-mode analytic displacement and normal bundle',
        'the ocean and cliff color split share the same minus 0.3 meter water elevation',
        'crest compression drives foam, moving glints, and single-pass analytic glare without post-process render targets',
        'a high-resolution distance field is baked from the compiled rock triangles that cross the shared water elevation',
        'the full water-plane domain carries deterministic world-XZ bathymetry with broad coastal opportunities, warped basins, and a minus 10 meter floor',
        'the primary foam samples an interpolable signed-distance field in world space, pins its zero-distance contact, and evolves only its ocean-side thickness',
        'one continuous rock-cladding field follows the inset grass perimeter with no radial layers',
        'offshore density, placement, submersion, horizontal oversizing, and compound-formation controls are live generator inputs',
        'irregular column-specific height partitions prevent continuous horizontal rock courses',
        'the cladding covers the complete curtain from the shared rock bottom elevation to 0.04 m beneath grass',
        'horizontal and vertical overlap expose faceted relief while the inset curtain closes residual seams',
        'deterministic offshore formations keep a visible anchor while allowing submerged companions and shared bottom elevations',
        'large offshore footprints compile as stratified multi-rock formations instead of horizontally stretched single blobs',
        'inter-formation spacing, shore clearance, and shared bathymetry probes keep offshore rocks away from surfaced beach sectors while members of one compound rock intentionally overlap',
        'convex-hull reconstruction after every cutter pass keeps every source watertight',
        'source topology reports zero boundary or non-manifold edges',
        'variant-local width and depth are normalized before wall-cell scaling',
        'five named radius profiles, 24 or 36 source variants, and per-placement scale variation diversify volume',
        'side-only cutter passes preserve the crown instead of producing horizontal top caps',
        'PCA-aligned bottom-pivot rock variants',
        'cool erosion tones are restricted to the submerged side of the waterline cut',
        'the 0% base palette position is 60% world altitude, 20% deterministic rock-space gradient spread, 10% local bottom-to-top height, and 10% signed per-rock offset',
        'the offshore bottom-to-top contribution crossfades only offshore dry rocks from their lowest exposed warm tone to their highest warm tone',
        'the signed offshore gradient bias favors either the low/cool or high/warm end without changing cliff tones',
        'the perimeter cliff rocks and inset backing remain on the base world-altitude tone field at every offshore tone setting',
        'weighted tone composition occurs independently inside the submerged and dry palette segments',
        'the waterline split prevents cool submerged tones from entering dry rock',
        'height-tone, wall-cell and offshore coverage, variant, normal, and wireframe diagnostic channels',
      ],
      metrics,
      noPostBaseline: true,
      offshoreControls,
      oceanDebugMode,
      quality,
      reference: 'https://github.com/IRCSS/Blender-Geometry-Node-French-Houses/tree/main',
      rockScale,
      runtime,
      seed,
      toneControls,
      wallControls,
      waterlineInteractionField: waterlineInteractionField
        ? {
            maximumDistanceMeters: waterlineInteractionField.maximumDistanceMeters,
            resolution: waterlineInteractionField.resolution,
            segmentCount: waterlineInteractionField.segmentCount,
          }
        : null,
      waterlineFoam: {
        waterlineFoamBreakup: oceanParameters.waterlineFoamBreakup,
        waterlineFoamBreakupScale: oceanParameters.waterlineFoamBreakupScale,
        waterlineFoamCrestInfluence: oceanParameters.waterlineFoamCrestInfluence,
        waterlineFoamEnabled: oceanParameters.waterlineFoamEnabled,
        waterlineFoamEvolutionSpeed: oceanParameters.waterlineFoamEvolutionSpeed,
        waterlineFoamIntensity: oceanParameters.waterlineFoamIntensity,
        waterlineFoamReach: oceanParameters.waterlineFoamReach,
        waterlineFoamSoftness: oceanParameters.waterlineFoamSoftness,
        waterlineFoamSpeed: oceanParameters.waterlineFoamSpeed,
        waterlineFoamWarpStrength: oceanParameters.waterlineFoamWarpStrength,
        waterlineFoamWidth: oceanParameters.waterlineFoamWidth,
      },
      waterPaused,
    }

    return () => {
      delete window.__LANDRUSH_PROCEDURAL_ROCK_CLIFFS_DEBUG__
    }
  }, [
    beachControls,
    camera,
    cutCount,
    debugMode,
    metrics,
    offshoreControls,
    oceanDebugMode,
    oceanParameters,
    quality,
    rockScale,
    runtime,
    seed,
    toneControls,
    wallControls,
    waterlineInteractionField,
    waterPaused,
  ])

  const reset = () => {
    setBeachControls({ ...DEFAULT_PROCEDURAL_BEACH_CONTROLS })
    setCamera('design')
    setBottomElevationMeters(DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS.bottomElevationMeters)
    setCoverageOverlap(DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS.coverageOverlap)
    setCutCount(ROCK_CLIFF_DEFAULT_CUTS)
    setDebugMode('final')
    setOceanDebugMode('final')
    setOceanParameters(createDefaultStandaloneOceanParameters())
    setOffshoreControls({ ...DEFAULT_PROCEDURAL_ROCK_OFFSHORE_CONTROLS })
    setQuality('balanced')
    setReliefDepthMeters(DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS.reliefDepthMeters)
    setRockHeightMeters(DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS.rockHeightMeters)
    setRockScale(ROCK_CLIFF_DEFAULT_SCALE)
    setRockWidthMeters(DEFAULT_PROCEDURAL_ROCK_CLIFF_WALL_CONTROLS.rockWidthMeters)
    setSeed(ROCK_CLIFF_DEFAULT_SEED)
    setToneControls({ ...DEFAULT_PROCEDURAL_ROCK_TONE_CONTROLS })
    setWaterPaused(false)
  }

  const setOffshoreControl = useCallback(
    (key: keyof ProceduralRockOffshoreControls, value: number) => {
      setOffshoreControls((current) => ({ ...current, [key]: value }))
    },
    [],
  )
  const setBeachControl = useCallback((key: ProceduralBeachNumericControl, value: number) => {
    setBeachControls((current) => ({ ...current, [key]: value }))
  }, [])
  const handleWaterlineInteractionField = useCallback(
    (field: WaterlineInteractionField | null) => setWaterlineInteractionField(field),
    [],
  )

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-[#164a77]"
      data-landrush-procedural-rock-cliffs-debug
    >
      <Canvas
        className="h-full w-full"
        dpr={STANDALONE_OCEAN_QUALITY.balanced.dpr}
        frameloop="always"
        gl={createStandaloneOceanRenderer as never}
        shadows={false}
      >
        <RockCliffCamera preset={preset} />
        <ambientLight intensity={1.25} />
        <directionalLight intensity={1.9} position={[46, 72, 34]} />
        <StandaloneOceanWorld
          animated={!waterPaused}
          cameraPreset="design"
          debugMode={oceanDebugMode}
          elevation={LANDRUSH_WATER_SURFACE_ELEVATION}
          parameters={oceanParameters}
          quality="balanced"
          resetRevision={0}
          submergedRockRefraction
          waterlineInteractionField={waterlineInteractionField}
        />
        <ProceduralRockCliffs
          beachControls={beachControls}
          cutCount={cutCount}
          debugMode={debugMode}
          offshoreControls={offshoreControls}
          onMetrics={setMetrics}
          onRuntimeMetrics={setRuntime}
          onWaterlineInteractionField={handleWaterlineInteractionField}
          quality={quality}
          rockRenderOrder={-10}
          rockScale={rockScale}
          seed={seed}
          surface={landSurface}
          toneControls={toneControls}
          wallControls={wallControls}
          waterSurfaceElevation={LANDRUSH_WATER_SURFACE_ELEVATION}
        />
      </Canvas>
      <ProceduralRockCliffsPanel
        beachControls={beachControls}
        camera={camera}
        cutCount={cutCount}
        debugMode={debugMode}
        metrics={metrics}
        offshoreControls={offshoreControls}
        onCameraChange={setCamera}
        onBottomElevationChange={setBottomElevationMeters}
        onBeachControlChange={setBeachControl}
        onCapture={captureRockCliffCanvas}
        onCutCountChange={setCutCount}
        onCoverageOverlapChange={setCoverageOverlap}
        onDebugModeChange={setDebugMode}
        onOffshoreControlChange={setOffshoreControl}
        onOceanDebugModeChange={setOceanDebugMode}
        onOceanParametersChange={setOceanParameters}
        onQualityChange={setQuality}
        onReliefDepthChange={setReliefDepthMeters}
        onReset={reset}
        onRockHeightChange={setRockHeightMeters}
        onRockScaleChange={setRockScale}
        onRockWidthChange={setRockWidthMeters}
        onSeedChange={setSeed}
        onToneBiasChange={(value) =>
          setToneControls((current) => ({ ...current, offshoreGradientBias: value }))
        }
        onToneContributionChange={(value) =>
          setToneControls((current) => ({ ...current, dryBottomToTopContribution: value }))
        }
        onWaterPausedChange={setWaterPaused}
        oceanDebugMode={oceanDebugMode}
        oceanParameters={oceanParameters}
        quality={quality}
        rockScale={rockScale}
        runtime={runtime}
        seed={seed}
        toneControls={toneControls}
        wallControls={wallControls}
        waterlineInteractionField={waterlineInteractionField}
        waterPaused={waterPaused}
      />
    </main>
  )
}

function RockCliffCamera({ preset }: { preset: WaterViewPreset }) {
  const controlsTarget = useMemo(() => new Vector3(...preset.camera.target), [preset.camera.target])

  return (
    <>
      <OrthographicCamera
        far={900}
        makeDefault
        near={0.1}
        position={preset.camera.position}
        zoom={preset.camera.zoom}
      />
      <RockCliffCameraTarget target={preset.camera.target} />
      <OrbitControls
        dampingFactor={0.08}
        enableDamping
        makeDefault
        maxDistance={1400}
        maxZoom={80}
        minDistance={2}
        minZoom={0.75}
        target={controlsTarget}
      />
    </>
  )
}

function RockCliffCameraTarget({ target }: { target: [number, number, number] }) {
  const { camera } = useThree()

  useEffect(() => {
    camera.lookAt(new Vector3(...target))
    camera.updateProjectionMatrix()
  }, [camera, target])

  return null
}

function ProceduralRockCliffsPanel({
  beachControls,
  camera,
  cutCount,
  debugMode,
  metrics,
  offshoreControls,
  onBottomElevationChange,
  onBeachControlChange,
  onCameraChange,
  onCapture,
  onCoverageOverlapChange,
  onCutCountChange,
  onDebugModeChange,
  onOffshoreControlChange,
  onOceanDebugModeChange,
  onOceanParametersChange,
  onQualityChange,
  onReliefDepthChange,
  onReset,
  onRockHeightChange,
  onRockScaleChange,
  onRockWidthChange,
  onSeedChange,
  onToneBiasChange,
  onToneContributionChange,
  onWaterPausedChange,
  oceanDebugMode,
  oceanParameters,
  quality,
  rockScale,
  runtime,
  seed,
  toneControls,
  wallControls,
  waterlineInteractionField,
  waterPaused,
}: {
  beachControls: ProceduralBeachControls
  camera: RockCliffCameraBookmark
  cutCount: number
  debugMode: ProceduralRockCliffDebugMode
  metrics: ProceduralRockCliffMetrics | null
  offshoreControls: ProceduralRockOffshoreControls
  onBeachControlChange: (key: ProceduralBeachNumericControl, value: number) => void
  onBottomElevationChange: (elevationMeters: number) => void
  onCameraChange: (camera: RockCliffCameraBookmark) => void
  onCapture: () => void
  onCoverageOverlapChange: (overlap: number) => void
  onCutCountChange: (cutCount: number) => void
  onDebugModeChange: (mode: ProceduralRockCliffDebugMode) => void
  onOffshoreControlChange: (key: keyof ProceduralRockOffshoreControls, value: number) => void
  onOceanDebugModeChange: (mode: StandaloneOceanDebugMode) => void
  onOceanParametersChange: Dispatch<SetStateAction<StandaloneOceanParameters>>
  onQualityChange: (quality: ProceduralRockCliffQuality) => void
  onReliefDepthChange: (depthMeters: number) => void
  onReset: () => void
  onRockHeightChange: (heightMeters: number) => void
  onRockScaleChange: (scale: number) => void
  onRockWidthChange: (widthMeters: number) => void
  onSeedChange: (seed: number) => void
  onToneBiasChange: (bias: number) => void
  onToneContributionChange: (contribution: number) => void
  onWaterPausedChange: (paused: boolean) => void
  oceanDebugMode: StandaloneOceanDebugMode
  oceanParameters: StandaloneOceanParameters
  quality: ProceduralRockCliffQuality
  rockScale: number
  runtime: ProceduralRockCliffRuntimeMetrics | null
  seed: number
  toneControls: ProceduralRockToneControls
  wallControls: ProceduralRockCliffWallControls
  waterlineInteractionField: WaterlineInteractionField | null
  waterPaused: boolean
}) {
  return (
    <section className="pointer-events-auto absolute left-4 top-4 z-10 max-h-[calc(100vh-2rem)] w-[380px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-white/15 bg-[#151b19]/90 px-4 py-3.5 text-xs text-stone-100 shadow-2xl shadow-black/35 backdrop-blur-md">
      <div className="font-semibold uppercase tracking-[0.17em] text-[#d8dfc0]">
        Procedural Rock Cliffs
      </div>
      <div className="mt-1 text-[10px] leading-4 text-stone-300/75">
        One continuous cut-rock field covers the inset cliff curtain, while spaced clusters of the
        same procedural rocks break the water outside the island.
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <PanelSelect
          label="Camera"
          onChange={(value) => onCameraChange(value as RockCliffCameraBookmark)}
          options={[
            ['design', 'Design'],
            ['near', 'Near'],
            ['far', 'Far'],
          ]}
          value={camera}
        />
        <PanelSelect
          label="View"
          onChange={(value) => onDebugModeChange(value as ProceduralRockCliffDebugMode)}
          options={[
            ['final', 'Final'],
            ['height', 'Height tones'],
            ['variants', 'Variants'],
            ['coverage', 'Coverage'],
            ['normals', 'Normals'],
            ['wireframe', 'Wireframe'],
          ]}
          value={debugMode}
        />
        <PanelSelect
          label="Quality"
          onChange={(value) => onQualityChange(value as ProceduralRockCliffQuality)}
          options={[
            ['balanced', 'Balanced'],
            ['dense', 'Dense'],
          ]}
          value={quality}
        />
        <PanelSelect
          label="Seed"
          onChange={(value) => onSeedChange(Number(value))}
          options={[
            [String(ROCK_CLIFF_DEFAULT_SEED), 'Hero 1847'],
            [String(ROCK_CLIFF_STRESS_SEED), 'Stress 90210'],
          ]}
          value={String(seed)}
        />
        <PanelSelect
          label="Water view"
          onChange={(value) => onOceanDebugModeChange(value as StandaloneOceanDebugMode)}
          options={[
            ['final', 'Final'],
            ['waterline', 'Boundary field'],
            ['submerged-rocks', 'Submerged rocks'],
            ['foam', 'All foam'],
            ['no-glare', 'No glare'],
          ]}
          value={oceanDebugMode}
        />
      </div>

      <div className="mt-3 space-y-2.5 border-t border-white/10 pt-3">
        <StandaloneOceanParameterControls
          animated={!waterPaused}
          onAnimatedChange={(animated) => onWaterPausedChange(!animated)}
          onParametersChange={onOceanParametersChange}
          parameters={oceanParameters}
        />
        <div className="border-t border-white/10 pt-2.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#d8dfc0]">
            Ocean-floor bathymetry
          </div>
          <div className="mb-2 text-[9px] leading-4 text-stone-400">
            Sand spans the full water plane. Coast fields decide where it reaches air; warped basin
            fields carry other sectors down to the shared floor.
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            <PanelRange
              label="Beach coastline"
              max={85}
              min={0}
              onChange={(value) => onBeachControlChange('dryCoverage', value / 100)}
              step={1}
              value={Math.round(beachControls.dryCoverage * 100)}
              valueLabel={`${Math.round(beachControls.dryCoverage * 100)}%`}
            />
            <PanelRange
              label="Maximum emergence"
              max={3}
              min={0.05}
              onChange={(value) => onBeachControlChange('maximumEmergenceMeters', value)}
              step={0.05}
              value={beachControls.maximumEmergenceMeters}
              valueLabel={`${beachControls.maximumEmergenceMeters.toFixed(2)}m`}
            />
            <PanelRange
              label="Cliff-coast depth"
              max={10}
              min={0.25}
              onChange={(value) => onBeachControlChange('shorelineDepthMeters', value)}
              step={0.05}
              value={beachControls.shorelineDepthMeters}
              valueLabel={`${beachControls.shorelineDepthMeters.toFixed(2)}m`}
            />
            <PanelRange
              label="Coastal falloff"
              max={180}
              min={8}
              onChange={(value) => onBeachControlChange('widthMeters', value)}
              step={1}
              value={beachControls.widthMeters}
              valueLabel={`${beachControls.widthMeters.toFixed(0)}m`}
            />
            <PanelRange
              label="Falloff variation"
              max={80}
              min={0}
              onChange={(value) => onBeachControlChange('widthVariation', value / 100)}
              step={1}
              value={Math.round(beachControls.widthVariation * 100)}
              valueLabel={`${Math.round(beachControls.widthVariation * 100)}%`}
            />
            <PanelRange
              label="Coastal profile"
              max={3.5}
              min={0.45}
              onChange={(value) => onBeachControlChange('profilePower', value)}
              step={0.05}
              value={beachControls.profilePower}
              valueLabel={beachControls.profilePower.toFixed(2)}
            />
            <PanelRange
              label="Near-shore relief"
              max={4}
              min={0}
              onChange={(value) => onBeachControlChange('surfaceVariationMeters', value)}
              step={0.05}
              value={beachControls.surfaceVariationMeters}
              valueLabel={`${beachControls.surfaceVariationMeters.toFixed(2)}m`}
            />
            <PanelRange
              label="Basin relief"
              max={4}
              min={0}
              onChange={(value) => onBeachControlChange('basinVariationMeters', value)}
              step={0.05}
              value={beachControls.basinVariationMeters}
              valueLabel={`${beachControls.basinVariationMeters.toFixed(2)}m`}
            />
            <PanelRange
              label="Domain warp"
              max={48}
              min={0}
              onChange={(value) => onBeachControlChange('domainWarpMeters', value)}
              step={0.5}
              value={beachControls.domainWarpMeters}
              valueLabel={`${beachControls.domainWarpMeters.toFixed(1)}m`}
            />
            <PanelRange
              label="Macro scale"
              max={180}
              min={12}
              onChange={(value) => onBeachControlChange('macroScaleMeters', value)}
              step={1}
              value={beachControls.macroScaleMeters}
              valueLabel={`${beachControls.macroScaleMeters.toFixed(0)}m`}
            />
            <PanelRange
              label="Nominal grid spacing"
              max={8}
              min={1.5}
              onChange={(value) => onBeachControlChange('gridSpacingMeters', value)}
              step={0.1}
              value={beachControls.gridSpacingMeters}
              valueLabel={`${beachControls.gridSpacingMeters.toFixed(1)}m`}
            />
          </div>
        </div>
        <PanelRange
          label="Cliff + offshore bottom"
          max={LANDRUSH_WATER_SURFACE_ELEVATION - 0.25}
          min={-10}
          onChange={onBottomElevationChange}
          step={0.05}
          value={wallControls.bottomElevationMeters}
          valueLabel={`${wallControls.bottomElevationMeters.toFixed(2)}m`}
        />
        <PanelRange
          label="Cutter passes"
          max={18}
          min={8}
          onChange={onCutCountChange}
          step={1}
          value={cutCount}
          valueLabel={String(cutCount)}
        />
        <PanelRange
          label="Rock scale"
          max={1.2}
          min={0.82}
          onChange={onRockScaleChange}
          step={0.01}
          value={rockScale}
          valueLabel={`${rockScale.toFixed(2)}x`}
        />
        <PanelRange
          label="Rock width"
          max={6}
          min={0.7}
          onChange={onRockWidthChange}
          step={0.05}
          value={wallControls.rockWidthMeters}
          valueLabel={`${wallControls.rockWidthMeters.toFixed(2)}m`}
        />
        <PanelRange
          label="Rock height"
          max={5}
          min={0.6}
          onChange={onRockHeightChange}
          step={0.05}
          value={wallControls.rockHeightMeters}
          valueLabel={`${wallControls.rockHeightMeters.toFixed(2)}m`}
        />
        <PanelRange
          label="Relief depth"
          max={2.5}
          min={0.15}
          onChange={onReliefDepthChange}
          step={0.05}
          value={wallControls.reliefDepthMeters}
          valueLabel={`${wallControls.reliefDepthMeters.toFixed(2)}m`}
        />
        <PanelRange
          label="Coverage overlap"
          max={45}
          min={0}
          onChange={(value) => onCoverageOverlapChange(value / 100)}
          step={1}
          value={Math.round(wallControls.coverageOverlap * 100)}
          valueLabel={`${Math.round(wallControls.coverageOverlap * 100)}%`}
        />
        <div className="border-t border-white/10 pt-2.5">
          <PanelRange
            label="Offshore bottom-to-top contribution"
            max={100}
            min={0}
            onChange={(value) => onToneContributionChange(value / 100)}
            step={1}
            value={Math.round(toneControls.dryBottomToTopContribution * 100)}
            valueLabel={`${Math.round(toneControls.dryBottomToTopContribution * 100)}%`}
          />
          <PanelRange
            label="Offshore tone offset"
            max={100}
            min={-100}
            onChange={(value) => onToneBiasChange(value / 100)}
            step={1}
            value={Math.round(toneControls.offshoreGradientBias * 100)}
            valueLabel={`${toneControls.offshoreGradientBias > 0 ? '+' : ''}${Math.round(toneControls.offshoreGradientBias * 100)}%`}
          />
          <div className="mt-1 text-[9px] normal-case tracking-normal text-stone-400">
            Contribution blends the offshore height field. Bias favors the cool/lower end at
            negative values and the warm/upper end at positive values. Cliffs remain unchanged.
          </div>
        </div>
        <div className="border-t border-white/10 pt-2.5">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#d8dfc0]">
            Offshore field
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            <PanelRange
              label="Distribution density"
              max={400}
              min={0}
              onChange={(value) => onOffshoreControlChange('density', value / 100)}
              step={5}
              value={Math.round(offshoreControls.density * 100)}
              valueLabel={`${Math.round(offshoreControls.density * 100)}%`}
            />
            <PanelRange
              label="Cluster count"
              max={32}
              min={1}
              onChange={(value) => onOffshoreControlChange('clusterCount', value)}
              step={1}
              value={offshoreControls.clusterCount}
              valueLabel={String(offshoreControls.clusterCount)}
            />
            <PanelRange
              label="Distance from shore"
              max={60}
              min={2}
              onChange={(value) => onOffshoreControlChange('shoreDistanceMeters', value)}
              step={0.5}
              value={offshoreControls.shoreDistanceMeters}
              valueLabel={`${offshoreControls.shoreDistanceMeters.toFixed(1)}m`}
            />
            <PanelRange
              label="Distribution spread"
              max={40}
              min={0}
              onChange={(value) => onOffshoreControlChange('clusterSpreadMeters', value)}
              step={0.5}
              value={offshoreControls.clusterSpreadMeters}
              valueLabel={`${offshoreControls.clusterSpreadMeters.toFixed(1)}m`}
            />
            <PanelRange
              label="Boulder size"
              max={4}
              min={0.2}
              onChange={(value) => onOffshoreControlChange('sizeScale', value)}
              step={0.05}
              value={offshoreControls.sizeScale}
              valueLabel={`${offshoreControls.sizeScale.toFixed(2)}x`}
            />
            <PanelRange
              label="Size variation"
              max={250}
              min={0}
              onChange={(value) => onOffshoreControlChange('sizeVariation', value / 100)}
              step={5}
              value={Math.round(offshoreControls.sizeVariation * 100)}
              valueLabel={`${Math.round(offshoreControls.sizeVariation * 100)}%`}
            />
            <PanelRange
              label="Water exposure"
              max={95}
              min={2}
              onChange={(value) => onOffshoreControlChange('exposure', value / 100)}
              step={1}
              value={Math.round(offshoreControls.exposure * 100)}
              valueLabel={`${Math.round(offshoreControls.exposure * 100)}%`}
            />
            <PanelRange
              label="Minimum spacing"
              max={300}
              min={50}
              onChange={(value) => onOffshoreControlChange('minimumSpacingRatio', value / 100)}
              step={1}
              value={Math.round(offshoreControls.minimumSpacingRatio * 100)}
              valueLabel={`${Math.round(offshoreControls.minimumSpacingRatio * 100)}%`}
            />
            <PanelRange
              label="Fully submerged"
              max={100}
              min={0}
              onChange={(value) => onOffshoreControlChange('submergedFraction', value / 100)}
              step={1}
              value={Math.round(offshoreControls.submergedFraction * 100)}
              valueLabel={`${Math.round(offshoreControls.submergedFraction * 100)}%`}
            />
            <PanelRange
              label="Shallow crown depth"
              max={9}
              min={0.05}
              onChange={(value) => onOffshoreControlChange('submergedCrownDepthMinMeters', value)}
              step={0.05}
              value={offshoreControls.submergedCrownDepthMinMeters}
              valueLabel={`${offshoreControls.submergedCrownDepthMinMeters.toFixed(2)}m`}
            />
            <PanelRange
              label="Deep crown depth"
              max={9}
              min={0.05}
              onChange={(value) => onOffshoreControlChange('submergedCrownDepthMaxMeters', value)}
              step={0.05}
              value={offshoreControls.submergedCrownDepthMaxMeters}
              valueLabel={`${offshoreControls.submergedCrownDepthMaxMeters.toFixed(2)}m`}
            />
            <PanelRange
              label="Wide rock chance"
              max={100}
              min={0}
              onChange={(value) => onOffshoreControlChange('horizontalScaleChance', value / 100)}
              step={1}
              value={Math.round(offshoreControls.horizontalScaleChance * 100)}
              valueLabel={`${Math.round(offshoreControls.horizontalScaleChance * 100)}%`}
            />
            <PanelRange
              label="Maximum horizontal size"
              max={4}
              min={1}
              onChange={(value) => onOffshoreControlChange('horizontalScaleMaximum', value)}
              step={0.05}
              value={offshoreControls.horizontalScaleMaximum}
              valueLabel={`${offshoreControls.horizontalScaleMaximum.toFixed(2)}x`}
            />
            <PanelRange
              label="Compound chance"
              max={100}
              min={0}
              onChange={(value) => onOffshoreControlChange('compoundChance', value / 100)}
              step={1}
              value={Math.round(offshoreControls.compoundChance * 100)}
              valueLabel={`${Math.round(offshoreControls.compoundChance * 100)}%`}
            />
            <PanelRange
              label="Compound members"
              max={8}
              min={0}
              onChange={(value) => onOffshoreControlChange('compoundMemberCount', value)}
              step={1}
              value={offshoreControls.compoundMemberCount}
              valueLabel={String(offshoreControls.compoundMemberCount)}
            />
            <PanelRange
              label="Compound spread"
              max={92}
              min={8}
              onChange={(value) => onOffshoreControlChange('compoundSpreadRatio', value / 100)}
              step={1}
              value={Math.round(offshoreControls.compoundSpreadRatio * 100)}
              valueLabel={`${Math.round(offshoreControls.compoundSpreadRatio * 100)}%`}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1 border-t border-white/10 pt-2.5 text-[10px] text-stone-300/75">
        <MetricRow
          label="Bathymetry"
          value={
            metrics
              ? `${metrics.beachWidthMeters.toFixed(0)}m domain · ${metrics.beachSegments}² · ${metrics.beachMinimumElevationMeters.toFixed(1)}–${metrics.beachMaximumElevationMeters.toFixed(1)}m · ${Math.round(metrics.beachExposedVertexRatio * 100)}% exposed`
              : 'building...'
          }
        />
        <MetricRow
          label="Rock system"
          value={
            metrics
              ? `${metrics.wallRockInstances.toLocaleString()} wall + ${metrics.offshoreRockInstances.toLocaleString()} offshore · ${metrics.variants} variants`
              : 'building…'
          }
        />
        <MetricRow
          label="Geometry"
          value={
            metrics
              ? `${Math.round(metrics.renderedTriangles).toLocaleString()} drawn tris · ${metrics.backingTriangles.toLocaleString()} wall tris`
              : 'building…'
          }
        />
        <MetricRow
          label="Coverage"
          value={
            metrics
              ? `${metrics.columnCount} perimeter columns · ${metrics.minimumColumnRockCount}–${metrics.maximumColumnRockCount} rocks high`
              : 'building...'
          }
        />
        <MetricRow
          label="Offshore"
          value={
            metrics
              ? `${metrics.offshoreRockInstances}/${metrics.offshoreTargetRockInstances} rocks · ${metrics.offshoreClusterCount} clusters · ${metrics.offshoreMinimumSpacingRatio.toFixed(2)}x min spacing`
              : 'building...'
          }
        />
        <MetricRow
          label="Formations"
          value={
            metrics
              ? `${metrics.offshoreFormationCount} formations Â· ${metrics.offshoreCompoundRockInstances} compound members`
              : 'building...'
          }
        />
        <MetricRow
          label="Special rocks"
          value={
            metrics
              ? `${metrics.offshoreSubmergedRockInstances} submerged Â· ${metrics.offshoreOversizedRockInstances} wide`
              : 'building...'
          }
        />
        <MetricRow
          label="Wall span"
          value={metrics ? `${metrics.wallHeightMeters.toFixed(2)}m floor-to-grass` : 'building...'}
        />
        <MetricRow
          label="Shared bottom"
          value={metrics ? `${metrics.bottomElevationMeters.toFixed(2)}m` : 'building...'}
        />
        <MetricRow
          label="Topology"
          value={metrics ? `${metrics.sourceBoundaryEdges} open source edges` : 'building...'}
        />
        <MetricRow
          label="Boundary field"
          value={
            waterlineInteractionField
              ? `${waterlineInteractionField.resolution}² · ${waterlineInteractionField.segmentCount.toLocaleString()} contour segments`
              : 'building...'
          }
        />
        <MetricRow
          label="Offshore tone"
          value={`${Math.round(toneControls.dryBottomToTopContribution * 100)}% bottom-to-top · ${toneControls.offshoreGradientBias > 0 ? '+' : ''}${Math.round(toneControls.offshoreGradientBias * 100)}% bias`}
        />
        <MetricRow
          label="Runtime"
          value={
            runtime
              ? `${runtime.fps.toFixed(0)} fps · ${runtime.frameMs.toFixed(1)} ms · ${runtime.drawCalls} calls`
              : 'warming…'
          }
        />
        <MetricRow label="Pipeline" value="WebGPU · merged wall + offshore rocks + inset backing" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
        <button
          className="rounded-md border border-white/15 bg-white/7 px-2 py-1.5 text-[11px] font-medium text-stone-100 hover:bg-white/12"
          onClick={onReset}
          type="button"
        >
          Reset
        </button>
        <button
          className="rounded-md border border-[#b9c888]/30 bg-[#71814a]/25 px-2 py-1.5 text-[11px] font-medium text-[#e5edcc] hover:bg-[#71814a]/35"
          onClick={onCapture}
          type="button"
        >
          Save PNG
        </button>
      </div>
    </section>
  )
}

function PanelSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: string) => void
  options: readonly (readonly [string, string])[]
  value: string
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.1em] text-stone-300/70">
      {label}
      <select
        className="rounded-md border border-white/12 bg-black/25 px-2 py-1.5 text-[11px] normal-case tracking-normal text-stone-100 outline-none"
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  )
}

function PanelRange({
  label,
  max,
  min,
  onChange,
  step,
  value,
  valueLabel,
}: {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
  valueLabel: string
}) {
  return (
    <label className="block text-[10px] font-medium uppercase tracking-[0.1em] text-stone-300/70">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="normal-case tracking-normal text-stone-100">{valueLabel}</span>
      </span>
      <input
        className="mt-1 h-1.5 w-full accent-[#a9b86d]"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="text-right text-stone-200">{value}</span>
    </div>
  )
}

function captureRockCliffCanvas() {
  const canvas = document.querySelector<HTMLCanvasElement>(
    '[data-landrush-procedural-rock-cliffs-debug] canvas',
  )
  if (!canvas) return
  const link = document.createElement('a')
  link.download = 'pascal-procedural-rock-cliffs.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
}

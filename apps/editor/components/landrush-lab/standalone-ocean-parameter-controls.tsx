'use client'

import { renderScheduler } from '@pascal-app/viewer'
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  LANDRUSH_ROBOT_SCREEN_REVEAL_OUTER_RADIUS_SCALE_DEFAULT,
  LANDRUSH_ROBOT_SCREEN_REVEAL_OUTER_RADIUS_SCALE_MAX,
  LANDRUSH_ROBOT_SCREEN_REVEAL_OUTER_RADIUS_SCALE_MIN,
  LANDRUSH_ROBOT_SCREEN_REVEAL_RADIUS_SCALE_DEFAULT,
  LANDRUSH_ROBOT_SCREEN_REVEAL_RADIUS_SCALE_MAX,
  LANDRUSH_ROBOT_SCREEN_REVEAL_RADIUS_SCALE_MIN,
  LANDRUSH_ROBOT_SCREEN_REVEAL_SMOOTHNESS_DEFAULT,
  LANDRUSH_ROBOT_SCREEN_REVEAL_SMOOTHNESS_MAX,
  LANDRUSH_ROBOT_SCREEN_REVEAL_SMOOTHNESS_MIN,
  readLandrushRobotScreenRevealMaskSnapshot,
  readLandrushRobotScreenRevealOuterRadiusScale,
  readLandrushRobotScreenRevealRadiusScale,
  readLandrushRobotScreenRevealSmoothness,
  updateLandrushRobotScreenRevealOuterRadiusScale,
  updateLandrushRobotScreenRevealRadiusScale,
  updateLandrushRobotScreenRevealSmoothness,
} from './robot-screen-reveal-mask'
import {
  createDefaultStandaloneOceanParameters,
  type StandaloneOceanParameters,
  type StandaloneOceanWaveBandParameters,
} from './standalone-ocean-material'

const OCEAN_EFFECT_TOGGLES = [
  { key: 'wavesEnabled', label: 'Waves' },
  { key: 'choppinessEnabled', label: 'Chop' },
  { key: 'foamEnabled', label: 'Foam' },
  { key: 'waterlineFoamEnabled', label: 'Boundary' },
  { key: 'waterlineFoamCloneEnabled', label: 'Sweep' },
  { key: 'underwaterRocksEnabled', label: 'Submerged' },
  { key: 'toonEnabled', label: 'Toon' },
  { key: 'reflectionEnabled', label: 'Reflect' },
  { key: 'fresnelEnabled', label: 'Fresnel' },
  { key: 'glintsEnabled', label: 'Glints' },
  { key: 'hazeEnabled', label: 'Haze' },
  { key: 'glareEnabled', label: 'Glare' },
  { key: 'skyEnabled', label: 'Sky' },
] as const

const OCEAN_WAVE_BAND_LABELS = [
  'Primary swell',
  'Cross swell',
  'Mid waves',
  'Short waves',
  'Ripples',
  'Micro waves',
] as const

export function StandaloneOceanParameterControls({
  animated,
  onAnimatedChange,
  onParametersChange,
  parameters,
}: {
  animated: boolean
  onAnimatedChange: (animated: boolean) => void
  onParametersChange: Dispatch<SetStateAction<StandaloneOceanParameters>>
  parameters: StandaloneOceanParameters
}) {
  function setParameter<Key extends keyof StandaloneOceanParameters>(
    key: Key,
    value: StandaloneOceanParameters[Key],
  ) {
    onParametersChange((current) => ({ ...current, [key]: value }))
  }

  function setWaveBandParameter<Key extends keyof StandaloneOceanWaveBandParameters>(
    index: number,
    key: Key,
    value: StandaloneOceanWaveBandParameters[Key],
  ) {
    onParametersChange((current) => ({
      ...current,
      waveBands: current.waveBands.map((band, bandIndex) =>
        bandIndex === index ? { ...band, [key]: value } : band,
      ),
    }))
  }

  function setAllWaveBandsEnabled(enabled: boolean) {
    onParametersChange((current) => ({
      ...current,
      waveBands: current.waveBands.map((band) => ({ ...band, enabled })),
    }))
  }

  function soloWaveBand(index: number) {
    onParametersChange((current) => ({
      ...current,
      waveBands: current.waveBands.map((band, bandIndex) => ({
        ...band,
        enabled: bandIndex === index,
      })),
    }))
  }

  function resetWaveBand(index: number) {
    const defaultBand = createDefaultStandaloneOceanParameters().waveBands[index]
    if (!defaultBand) return
    onParametersChange((current) => ({
      ...current,
      waveBands: current.waveBands.map((band, bandIndex) =>
        bandIndex === index ? defaultBand : band,
      ),
    }))
  }

  function setAllEffects(enabled: boolean) {
    onAnimatedChange(enabled)
    onParametersChange((current) => ({
      ...current,
      choppinessEnabled: enabled,
      foamEnabled: enabled,
      fresnelEnabled: enabled,
      glareEnabled: enabled,
      glintsEnabled: enabled,
      hazeEnabled: enabled,
      reflectionEnabled: enabled,
      skyEnabled: enabled,
      toonEnabled: enabled,
      underwaterRocksEnabled: enabled,
      waterlineFoamCloneEnabled: enabled,
      waterlineFoamEnabled: enabled,
      wavesEnabled: enabled,
    }))
  }

  return (
    <div className="border-t border-white/10 pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#d8dfc0]">
          Ocean parameters
        </div>
        <div className="flex gap-1">
          <button
            className="rounded border border-cyan-200/30 bg-cyan-300/10 px-2 py-1 font-semibold text-[8px] uppercase text-cyan-100 hover:bg-cyan-300/20"
            onClick={() => setAllEffects(true)}
            type="button"
          >
            All on
          </button>
          <button
            className="rounded border border-white/10 bg-white/5 px-2 py-1 font-semibold text-[8px] uppercase text-stone-300 hover:bg-white/10"
            onClick={() => setAllEffects(false)}
            type="button"
          >
            All off
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <OceanEffectToggle
          enabled={animated}
          label="Motion"
          onClick={() => onAnimatedChange(!animated)}
        />
        {OCEAN_EFFECT_TOGGLES.map((effect) => (
          <OceanEffectToggle
            enabled={parameters[effect.key]}
            key={effect.key}
            label={effect.label}
            onClick={() => setParameter(effect.key, !parameters[effect.key])}
          />
        ))}
      </div>

      <OceanControlSection label="Robot passthrough" open>
        <div className="text-[9px] leading-4 text-stone-400">
          Clear and outer radius are fixed, independent endpoints. Smoothness only reshapes opacity
          between them; dragging either radius never shifts the other.
        </div>
        <RobotPassthroughControls />
      </OceanControlSection>

      <OceanControlSection label="Wave-following shoreline ribbon" open>
        <div className="text-[9px] leading-4 text-stone-400">
          The foam fill begins at the live displaced ocean/mesh intersection and fades toward the
          ocean. Neither boundary is drawn as a separate line.
        </div>
        <OceanEffectToggle
          enabled={parameters.waterlineFoamEnabled}
          label="Boundary foam"
          onClick={() => setParameter('waterlineFoamEnabled', !parameters.waterlineFoamEnabled)}
        />
        <OceanSlider
          format={percent}
          label="Wave-height tracking"
          max={1.5}
          min={0}
          onChange={(value) => setParameter('waterlineFoamSurfaceTracking', value)}
          step={0.01}
          value={parameters.waterlineFoamSurfaceTracking}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Contact elevation bias"
          max={2.5}
          min={-2.5}
          onChange={(value) => setParameter('waterlineFoamElevationOffset', value)}
          step={0.02}
          value={parameters.waterlineFoamElevationOffset}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Ribbon ocean reach"
          max={4}
          min={0.1}
          onChange={(value) => setParameter('waterlineFoamReach', value)}
          step={0.01}
          value={parameters.waterlineFoamReach}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Contact edge feather"
          max={0.8}
          min={0.02}
          onChange={(value) => setParameter('waterlineFoamWidth', value)}
          step={0.01}
          value={parameters.waterlineFoamWidth}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Outer fade width"
          max={1}
          min={0.02}
          onChange={(value) => setParameter('waterlineFoamOuterWidth', value)}
          step={0.01}
          value={parameters.waterlineFoamOuterWidth}
        />
        <OceanSlider
          format={percent}
          label="Ribbon fill"
          max={1}
          min={0}
          onChange={(value) => setParameter('waterlineFoamFillOpacity', value)}
          step={0.01}
          value={parameters.waterlineFoamFillOpacity}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Outer-edge variation"
          max={1.5}
          min={0}
          onChange={(value) => setParameter('waterlineFoamWarpStrength', value)}
          step={0.02}
          value={parameters.waterlineFoamWarpStrength}
        />
        <OceanSlider
          format={percent}
          label="Overall intensity"
          max={1.5}
          min={0}
          onChange={(value) => setParameter('waterlineFoamIntensity', value)}
          step={0.01}
          value={parameters.waterlineFoamIntensity}
        />
      </OceanControlSection>

      <OceanControlSection label="Global wave shape" open>
        <OceanSlider
          label="Amplitude"
          max={8}
          min={0}
          onChange={(value) => setParameter('oceanWaveScale', value)}
          step={0.01}
          value={parameters.oceanWaveScale}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Frequency"
          max={4}
          min={0.25}
          onChange={(value) => setParameter('oceanFrequencyScale', value)}
          step={0.01}
          value={parameters.oceanFrequencyScale}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Smallest wave"
          max={4}
          min={0.35}
          onChange={(value) => setParameter('oceanSmallestWave', value)}
          step={0.01}
          value={parameters.oceanSmallestWave}
        />
        <OceanSlider
          label="Choppiness"
          max={2}
          min={0}
          onChange={(value) => setParameter('oceanChoppiness', value)}
          step={0.001}
          value={parameters.oceanChoppiness}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Spectral spread"
          max={1.5}
          min={0}
          onChange={(value) => setParameter('oceanSpectrumSpread', value)}
          step={0.01}
          value={parameters.oceanSpectrumSpread}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Crest curvature"
          max={1.5}
          min={0}
          onChange={(value) => setParameter('oceanCrestCurvature', value)}
          step={0.01}
          value={parameters.oceanCrestCurvature}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Micro-surface detail"
          max={1.2}
          min={0}
          onChange={(value) => setParameter('oceanDetailStrength', value)}
          step={0.01}
          value={parameters.oceanDetailStrength}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(1)} m/s`}
          label="Wind velocity"
          max={35}
          min={1}
          onChange={(value) => setParameter('oceanWindVelocity', value)}
          step={0.1}
          value={parameters.oceanWindVelocity}
        />
        <OceanSlider
          label="Alignment"
          max={1}
          min={0}
          onChange={(value) => setParameter('oceanAlignment', value)}
          step={0.001}
          value={parameters.oceanAlignment}
        />
        <OceanSlider
          format={(value) => `${Math.round(value)}°`}
          label="Direction"
          max={360}
          min={0}
          onChange={(value) => setParameter('oceanDirectionDegrees', value)}
          step={1}
          value={parameters.oceanDirectionDegrees}
        />
        <OceanSlider
          label="Damping"
          max={1}
          min={0}
          onChange={(value) => setParameter('oceanDamping', value)}
          step={0.001}
          value={parameters.oceanDamping}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Global animation speed"
          max={1.5}
          min={0}
          onChange={(value) => setParameter('oceanTimeScale', value)}
          step={0.01}
          value={parameters.oceanTimeScale}
        />
        <OceanSlider
          format={(value) => String(Math.round(value))}
          label="Seed"
          max={128}
          min={0}
          onChange={(value) => setParameter('seed', Math.round(value))}
          step={1}
          value={parameters.seed}
        />
      </OceanControlSection>

      <OceanControlSection label="Spectral bands · 6" open>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            className="rounded-md border border-cyan-200/20 bg-cyan-300/10 px-2 py-1.5 font-semibold text-[8px] uppercase text-cyan-100 hover:bg-cyan-300/20"
            onClick={() => setAllWaveBandsEnabled(true)}
            type="button"
          >
            All bands on
          </button>
          <button
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-semibold text-[8px] uppercase text-stone-300 hover:bg-white/10"
            onClick={() => setAllWaveBandsEnabled(false)}
            type="button"
          >
            All bands off
          </button>
          <button
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-semibold text-[8px] uppercase text-stone-300 hover:bg-white/10"
            onClick={() =>
              onParametersChange((current) => ({
                ...current,
                waveBands: createDefaultStandaloneOceanParameters().waveBands,
              }))
            }
            type="button"
          >
            Reset bands
          </button>
        </div>
        {parameters.waveBands.map((band, index) => (
          <OceanWaveBandControls
            band={band}
            index={index}
            key={OCEAN_WAVE_BAND_LABELS[index] ?? index}
            label={OCEAN_WAVE_BAND_LABELS[index] ?? `Wave ${index + 1}`}
            onChange={(key, value) => setWaveBandParameter(index, key, value)}
            onReset={() => resetWaveBand(index)}
            onSolo={() => soloWaveBand(index)}
            open={index === 0}
          />
        ))}
      </OceanControlSection>

      <OceanControlSection label="Foam shader">
        <OceanSlider
          label="Coverage"
          max={1}
          min={0}
          onChange={(value) => setParameter('waveFoamCoverage', value)}
          step={0.01}
          value={parameters.waveFoamCoverage}
        />
        <OceanSlider
          format={percent}
          label="Foam opacity"
          max={1}
          min={0}
          onChange={(value) => setParameter('waveFoamOpacity', value)}
          step={0.01}
          value={parameters.waveFoamOpacity}
        />
        <OceanSlider
          label="Blue ramp position"
          max={0.9}
          min={0.05}
          onChange={(value) => setParameter('foamColorRampPosition', value)}
          step={0.001}
          value={parameters.foamColorRampPosition}
        />
        <OceanSlider
          label="White ramp position"
          max={0.9}
          min={0.05}
          onChange={(value) => setParameter('foamWhiteRampPosition', value)}
          step={0.001}
          value={parameters.foamWhiteRampPosition}
        />
        <OceanSlider
          label="Emission"
          max={24}
          min={0}
          onChange={(value) => setParameter('foamEmissionStrength', value)}
          step={0.1}
          value={parameters.foamEmissionStrength}
        />
        <OceanColorControl
          label="Ocean A"
          onChange={(value) => setParameter('oceanColorA', value)}
          value={parameters.oceanColorA}
        />
        <OceanColorControl
          label="Ocean B"
          onChange={(value) => setParameter('oceanColorB', value)}
          value={parameters.oceanColorB}
        />
        <OceanColorControl
          label="Foam"
          onChange={(value) => setParameter('foamColor', value)}
          value={parameters.foamColor}
        />
      </OceanControlSection>

      <OceanControlSection label="Optics & glare">
        <OceanSlider
          format={percent}
          label="Reflection"
          max={1}
          min={0}
          onChange={(value) => setParameter('reflectionStrength', value)}
          step={0.01}
          value={parameters.reflectionStrength}
        />
        <OceanSlider
          format={percent}
          label="Moving glints"
          max={1.5}
          min={0}
          onChange={(value) => setParameter('glintStrength', value)}
          step={0.01}
          value={parameters.glintStrength}
        />
        <OceanSlider
          format={percent}
          label="Horizon haze"
          max={1}
          min={0}
          onChange={(value) => setParameter('horizonHaze', value)}
          step={0.01}
          value={parameters.horizonHaze}
        />
        <OceanSlider
          label="Glare strength"
          max={2}
          min={0}
          onChange={(value) => setParameter('glareStrength', value)}
          step={0.001}
          value={parameters.glareStrength}
        />
        <OceanSlider
          label="Glare saturation"
          max={1}
          min={0}
          onChange={(value) => setParameter('glareSaturation', value)}
          step={0.01}
          value={parameters.glareSaturation}
        />
        <OceanSlider
          label="Glare size"
          max={1}
          min={0}
          onChange={(value) => setParameter('glareSize', value)}
          step={0.01}
          value={parameters.glareSize}
        />
        <OceanColorControl
          label="Deep water"
          onChange={(value) => setParameter('deepColor', value)}
          value={parameters.deepColor}
        />
        <OceanColorControl
          label="Shallow water"
          onChange={(value) => setParameter('shallowColor', value)}
          value={parameters.shallowColor}
        />
        <OceanColorControl
          label="Glare tint"
          onChange={(value) => setParameter('glareTint', value)}
          value={parameters.glareTint}
        />
      </OceanControlSection>

      <OceanControlSection label="Submerged rocks" open>
        <div className="text-[9px] leading-4 text-stone-400">
          Visibility sets the shallow ceiling. Depth fade removes the rocks by elevation; blur and
          distortion strengthen only as the optical path gets deeper.
        </div>
        <OceanSlider
          format={percent}
          label="Surface visibility"
          max={1}
          min={0}
          onChange={(value) => setParameter('underwaterRockVisibility', value)}
          step={0.01}
          value={parameters.underwaterRockVisibility}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Fade starts at"
          max={Math.max(0.05, parameters.underwaterRockMaxDepth - 0.05)}
          min={0}
          onChange={(value) => setParameter('underwaterRockFadeStartDepth', value)}
          step={0.05}
          value={parameters.underwaterRockFadeStartDepth}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Fully hidden at"
          max={12}
          min={0.5}
          onChange={(value) =>
            onParametersChange((current) => ({
              ...current,
              underwaterRockFadeStartDepth: Math.min(
                current.underwaterRockFadeStartDepth,
                value - 0.05,
              ),
              underwaterRockMaxDepth: value,
            }))
          }
          step={0.05}
          value={parameters.underwaterRockMaxDepth}
        />
        <OceanSlider
          format={(value) => value.toFixed(2)}
          label="Depth fade curve"
          max={4}
          min={0.25}
          onChange={(value) => setParameter('underwaterRockDepthFalloff', value)}
          step={0.05}
          value={parameters.underwaterRockDepthFalloff}
        />
        <div className="text-[9px] leading-4 text-stone-400">
          Lower curves lose visibility sooner. Higher curves hold visibility longer before the final
          cutoff.
        </div>
        <OceanSlider
          format={(value) => `${value.toFixed(2)} px`}
          label="Deep blur"
          max={6}
          min={0}
          onChange={(value) => setParameter('underwaterRockBlur', value)}
          step={0.05}
          value={parameters.underwaterRockBlur}
        />
        <OceanSlider
          format={(value) => value.toFixed(3)}
          label="Deep distortion"
          max={0.03}
          min={0}
          onChange={(value) => setParameter('underwaterRockDistortion', value)}
          step={0.001}
          value={parameters.underwaterRockDistortion}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Color absorption"
          max={3}
          min={0}
          onChange={(value) => setParameter('underwaterRockAbsorption', value)}
          step={0.01}
          value={parameters.underwaterRockAbsorption}
        />
      </OceanControlSection>

      <OceanControlSection label="Sky">
        <OceanSlider
          format={(value) => `${Math.round(value)}°`}
          label="Sun azimuth"
          max={180}
          min={-180}
          onChange={(value) => setParameter('sunAzimuthDegrees', value)}
          step={1}
          value={parameters.sunAzimuthDegrees}
        />
        <OceanSlider
          format={(value) => `${Math.round(value)}°`}
          label="Sun elevation"
          max={85}
          min={3}
          onChange={(value) => setParameter('sunElevationDegrees', value)}
          step={1}
          value={parameters.sunElevationDegrees}
        />
        <OceanColorControl
          label="Horizon"
          onChange={(value) => setParameter('skyHorizonColor', value)}
          value={parameters.skyHorizonColor}
        />
        <OceanColorControl
          label="Zenith"
          onChange={(value) => setParameter('skyZenithColor', value)}
          value={parameters.skyZenithColor}
        />
      </OceanControlSection>

      <OceanControlSection label="Shoreline ribbon breakup" open>
        <div className="text-[9px] leading-4 text-stone-400">
          Noise changes the fill and ocean-side fade while the ribbon remains attached to the live
          mesh intersection. Neither edge is rendered as a standalone stroke.
        </div>
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Fill-edge softness"
          max={2}
          min={0.02}
          onChange={(value) => setParameter('waterlineFoamSoftness', value)}
          step={0.02}
          value={parameters.waterlineFoamSoftness}
        />
        <OceanSlider
          format={percent}
          label="Fill breakup"
          max={1}
          min={0}
          onChange={(value) => setParameter('waterlineFoamBreakup', value)}
          step={0.01}
          value={parameters.waterlineFoamBreakup}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Wisp scale"
          max={20}
          min={1}
          onChange={(value) => setParameter('waterlineFoamBreakupScale', value)}
          step={0.25}
          value={parameters.waterlineFoamBreakupScale}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Thickness drift"
          max={2}
          min={0}
          onChange={(value) => setParameter('waterlineFoamSpeed', value)}
          step={0.02}
          value={parameters.waterlineFoamSpeed}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Shape evolution"
          max={2}
          min={0}
          onChange={(value) => setParameter('waterlineFoamEvolutionSpeed', value)}
          step={0.02}
          value={parameters.waterlineFoamEvolutionSpeed}
        />
        <OceanSlider
          format={percent}
          label="Crest response"
          max={1}
          min={0}
          onChange={(value) => setParameter('waterlineFoamCrestInfluence', value)}
          step={0.01}
          value={parameters.waterlineFoamCrestInfluence}
        />
      </OceanControlSection>

      <OceanControlSection label="Optional contour sweep" open>
        <div className="text-[9px] leading-4 text-stone-400">
          Adds an optional animated contour over the completed filled ribbon, reusing the same
          field, material, and draw call.
        </div>
        <OceanEffectToggle
          enabled={parameters.waterlineFoamCloneEnabled}
          label="Clone"
          onClick={() =>
            setParameter('waterlineFoamCloneEnabled', !parameters.waterlineFoamCloneEnabled)
          }
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Inward threshold"
          max={6}
          min={-6}
          onChange={(value) => setParameter('waterlineFoamCloneInward', value)}
          step={0.05}
          value={parameters.waterlineFoamCloneInward}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Outward threshold"
          max={6}
          min={-6}
          onChange={(value) => setParameter('waterlineFoamCloneOutward', value)}
          step={0.05}
          value={parameters.waterlineFoamCloneOutward}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} cycles/s`}
          label="Sweep speed"
          max={2}
          min={0}
          onChange={(value) => setParameter('waterlineFoamCloneSpeed', value)}
          step={0.01}
          value={parameters.waterlineFoamCloneSpeed}
        />
        <OceanSlider
          format={(value) => `${Math.round(value)}°`}
          label="Cycle phase"
          max={180}
          min={-180}
          onChange={(value) => setParameter('waterlineFoamClonePhaseDegrees', value)}
          step={1}
          value={parameters.waterlineFoamClonePhaseDegrees}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Contour variation"
          max={3}
          min={0}
          onChange={(value) => setParameter('waterlineFoamCloneVariation', value)}
          step={0.05}
          value={parameters.waterlineFoamCloneVariation}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Crest width"
          max={1.5}
          min={0.02}
          onChange={(value) => setParameter('waterlineFoamCloneWidth', value)}
          step={0.01}
          value={parameters.waterlineFoamCloneWidth}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)} m`}
          label="Fog softness"
          max={3}
          min={0.01}
          onChange={(value) => setParameter('waterlineFoamCloneSoftness', value)}
          step={0.01}
          value={parameters.waterlineFoamCloneSoftness}
        />
        <OceanSlider
          format={percent}
          label="Breakup"
          max={1}
          min={0}
          onChange={(value) => setParameter('waterlineFoamCloneBreakup', value)}
          step={0.01}
          value={parameters.waterlineFoamCloneBreakup}
        />
        <OceanSlider
          format={percent}
          label="Wave coupling"
          max={1}
          min={0}
          onChange={(value) => setParameter('waterlineFoamCloneCrestInfluence', value)}
          step={0.01}
          value={parameters.waterlineFoamCloneCrestInfluence}
        />
        <OceanSlider
          format={percent}
          label="Intensity"
          max={1.5}
          min={0}
          onChange={(value) => setParameter('waterlineFoamCloneIntensity', value)}
          step={0.01}
          value={parameters.waterlineFoamCloneIntensity}
        />
      </OceanControlSection>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] text-stone-200 hover:bg-white/10"
          onClick={() => setParameter('seed', (parameters.seed + 31) % 129)}
          type="button"
        >
          Next ocean seed
        </button>
        <button
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] text-stone-200 hover:bg-white/10"
          onClick={() => {
            onParametersChange(createDefaultStandaloneOceanParameters())
            onAnimatedChange(true)
          }}
          type="button"
        >
          Reset ocean defaults
        </button>
      </div>
    </div>
  )
}

function OceanEffectToggle({
  enabled,
  label,
  onClick,
}: {
  enabled: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-pressed={enabled}
      className={
        enabled
          ? 'rounded-md border border-cyan-100/70 bg-cyan-300 px-1 py-1.5 text-slate-950 shadow-[0_0_14px_rgba(103,232,249,0.16)]'
          : 'rounded-md border border-white/10 bg-white/[0.035] px-1 py-1.5 text-stone-400 hover:bg-white/[0.07]'
      }
      onClick={onClick}
      title={`${label}: ${enabled ? 'on' : 'off'}`}
      type="button"
    >
      <span className="block font-semibold text-[8px] uppercase leading-none tracking-[0.05em]">
        {label}
      </span>
      <span className="mt-1 block font-mono text-[7px] leading-none">{enabled ? 'ON' : 'OFF'}</span>
    </button>
  )
}

function OceanWaveBandControls({
  band,
  index,
  label,
  onChange,
  onReset,
  onSolo,
  open,
}: {
  band: StandaloneOceanWaveBandParameters
  index: number
  label: string
  onChange: <Key extends keyof StandaloneOceanWaveBandParameters>(
    key: Key,
    value: StandaloneOceanWaveBandParameters[Key],
  ) => void
  onReset: () => void
  onSolo: () => void
  open: boolean
}) {
  return (
    <details className="rounded-lg border border-white/10 bg-black/15 px-2.5 py-2" open={open}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 font-semibold text-[9px] uppercase tracking-[0.08em] text-stone-200">
        <span className="flex items-center gap-2">
          <span
            className={
              band.enabled
                ? 'h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.8)]'
                : 'h-1.5 w-1.5 rounded-full bg-stone-600'
            }
          />
          {index + 1}. {label}
        </span>
        <span className="font-mono text-[7px] text-stone-500">
          {band.enabled ? 'ACTIVE' : 'OFF'}
        </span>
      </summary>
      <div className="mt-2 space-y-2.5 border-t border-white/10 pt-2">
        <div className="grid grid-cols-3 gap-1.5">
          <button
            className={
              band.enabled
                ? 'rounded-md border border-cyan-100/50 bg-cyan-300 px-2 py-1.5 font-semibold text-[8px] uppercase text-slate-950'
                : 'rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-semibold text-[8px] uppercase text-stone-400 hover:bg-white/10'
            }
            onClick={() => onChange('enabled', !band.enabled)}
            type="button"
          >
            {band.enabled ? 'Band on' : 'Band off'}
          </button>
          <button
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-semibold text-[8px] uppercase text-stone-300 hover:bg-white/10"
            onClick={onSolo}
            type="button"
          >
            Solo
          </button>
          <button
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 font-semibold text-[8px] uppercase text-stone-300 hover:bg-white/10"
            onClick={onReset}
            type="button"
          >
            Reset
          </button>
        </div>
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Band speed"
          max={3}
          min={0}
          onChange={(value) => onChange('speed', value)}
          step={0.01}
          value={band.speed}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Amplitude"
          max={3}
          min={0}
          onChange={(value) => onChange('amplitude', value)}
          step={0.01}
          value={band.amplitude}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Frequency"
          max={4}
          min={0.25}
          onChange={(value) => onChange('frequency', value)}
          step={0.01}
          value={band.frequency}
        />
        <OceanSlider
          format={(value) => value.toFixed(2)}
          label="Peak shape"
          max={4}
          min={1}
          onChange={(value) => onChange('shape', value)}
          step={0.01}
          value={band.shape}
        />
        <OceanSlider
          format={(value) => `${value.toFixed(2)}×`}
          label="Horizontal chop"
          max={2.5}
          min={0}
          onChange={(value) => onChange('choppiness', value)}
          step={0.01}
          value={band.choppiness}
        />
        <OceanSlider
          format={(value) => `${Math.round(value)}°`}
          label="Direction trim"
          max={180}
          min={-180}
          onChange={(value) => onChange('directionOffsetDegrees', value)}
          step={1}
          value={band.directionOffsetDegrees}
        />
        <OceanSlider
          format={(value) => `${Math.round(value)}°`}
          label="Phase"
          max={180}
          min={-180}
          onChange={(value) => onChange('phaseDegrees', value)}
          step={1}
          value={band.phaseDegrees}
        />
      </div>
    </details>
  )
}

function OceanControlSection({
  children,
  label,
  open = false,
}: {
  children: ReactNode
  label: string
  open?: boolean
}) {
  return (
    <details
      className="mt-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"
      open={open}
    >
      <summary className="cursor-pointer font-semibold text-[10px] uppercase tracking-[0.12em] text-cyan-100">
        {label}
      </summary>
      <div className="mt-2 space-y-2.5">{children}</div>
    </details>
  )
}

function RobotPassthroughControls() {
  const [radiusScale, setRadiusScale] = useState(readLandrushRobotScreenRevealRadiusScale)
  const [outerRadiusScale, setOuterRadiusScale] = useState(
    readLandrushRobotScreenRevealOuterRadiusScale,
  )
  const [smoothness, setSmoothness] = useState(readLandrushRobotScreenRevealSmoothness)
  const minimumRadiusGap = 0.05

  return (
    <>
      <RobotPassthroughRadiusOverlay />
      <RobotPassthroughControl
        defaultValue={LANDRUSH_ROBOT_SCREEN_REVEAL_RADIUS_SCALE_DEFAULT}
        label="Complete see-through radius"
        max={LANDRUSH_ROBOT_SCREEN_REVEAL_RADIUS_SCALE_MAX}
        min={LANDRUSH_ROBOT_SCREEN_REVEAL_RADIUS_SCALE_MIN}
        onChange={(nextValue) => {
          setRadiusScale(
            updateLandrushRobotScreenRevealRadiusScale(
              Math.min(nextValue, outerRadiusScale - minimumRadiusGap),
            ),
          )
          renderScheduler.requestFrame('animation')
        }}
        value={radiusScale}
      />
      <RobotPassthroughControl
        defaultValue={LANDRUSH_ROBOT_SCREEN_REVEAL_OUTER_RADIUS_SCALE_DEFAULT}
        label="Fully opaque outer radius"
        max={LANDRUSH_ROBOT_SCREEN_REVEAL_OUTER_RADIUS_SCALE_MAX}
        min={LANDRUSH_ROBOT_SCREEN_REVEAL_OUTER_RADIUS_SCALE_MIN}
        onChange={(nextValue) => {
          setOuterRadiusScale(
            updateLandrushRobotScreenRevealOuterRadiusScale(
              Math.max(nextValue, radiusScale + minimumRadiusGap),
            ),
          )
          renderScheduler.requestFrame('animation')
        }}
        value={outerRadiusScale}
      />
      <RobotPassthroughControl
        defaultValue={LANDRUSH_ROBOT_SCREEN_REVEAL_SMOOTHNESS_DEFAULT}
        label="Transition curve smoothness"
        mapping="linear"
        max={LANDRUSH_ROBOT_SCREEN_REVEAL_SMOOTHNESS_MAX}
        min={LANDRUSH_ROBOT_SCREEN_REVEAL_SMOOTHNESS_MIN}
        onChange={(nextValue) => {
          setSmoothness(updateLandrushRobotScreenRevealSmoothness(nextValue))
          renderScheduler.requestFrame('animation')
        }}
        step={1}
        suffix="%"
        value={smoothness}
      />
    </>
  )
}

function RobotPassthroughRadiusOverlay() {
  const innerCircleRef = useRef<HTMLDivElement>(null)
  const outerCircleRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted) return
    let animationFrame = 0
    const updateCircle = (
      circle: HTMLDivElement | null,
      centerX: number,
      centerY: number,
      radius: number,
      visible: boolean,
    ) => {
      if (!circle) return
      const diameter = radius * 2
      circle.style.width = `${diameter}px`
      circle.style.height = `${diameter}px`
      circle.style.opacity = visible ? '1' : '0'
      circle.style.transform = `translate3d(${centerX - radius}px, ${centerY - radius}px, 0)`
    }
    const updateOverlay = () => {
      const mask = readLandrushRobotScreenRevealMaskSnapshot()
      const [centerX, centerY] = mask.centerPx
      const [viewportWidth, viewportHeight] = mask.viewportPx
      const visible =
        mask.innerRadiusPx > 0 &&
        mask.outerRadiusPx > mask.innerRadiusPx &&
        centerX + mask.outerRadiusPx >= 0 &&
        centerX - mask.outerRadiusPx <= viewportWidth &&
        centerY + mask.outerRadiusPx >= 0 &&
        centerY - mask.outerRadiusPx <= viewportHeight
      updateCircle(innerCircleRef.current, centerX, centerY, mask.innerRadiusPx, visible)
      updateCircle(outerCircleRef.current, centerX, centerY, mask.outerRadiusPx, visible)
      animationFrame = requestAnimationFrame(updateOverlay)
    }
    updateOverlay()
    return () => cancelAnimationFrame(animationFrame)
  }, [mounted])

  if (!mounted) return null
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      data-landrush-robot-reveal-radius-overlay
    >
      <div
        className="absolute top-0 left-0 box-border rounded-full border-2 border-cyan-300 shadow-[0_0_0_1px_rgba(2,6,23,0.9),0_0_12px_rgba(34,211,238,0.8)] transition-opacity duration-75"
        data-landrush-robot-reveal-radius="inner"
        ref={innerCircleRef}
      />
      <div
        className="absolute top-0 left-0 box-border rounded-full border-2 border-amber-300 border-dashed shadow-[0_0_0_1px_rgba(2,6,23,0.9),0_0_12px_rgba(251,191,36,0.75)] transition-opacity duration-75"
        data-landrush-robot-reveal-radius="outer"
        ref={outerCircleRef}
      />
    </div>,
    document.body,
  )
}

function RobotPassthroughControl({
  defaultValue,
  label,
  mapping = 'logarithmic',
  max,
  min,
  onChange,
  step = 0.05,
  suffix = 'x',
  value,
}: {
  defaultValue: number
  label: string
  mapping?: 'linear' | 'logarithmic'
  max: number
  min: number
  onChange: (value: number) => void
  step?: number
  suffix?: string
  value: number
}) {
  const hasRange = max > min
  const sliderValue = !hasRange
    ? 0
    : mapping === 'logarithmic'
      ? Math.log(value / min) / Math.log(max / min)
      : (value - min) / (max - min)

  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-[10px] text-stone-300">
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <input
            className="h-6 w-16 rounded border border-white/15 bg-black/20 px-1.5 text-right font-mono text-[9px] text-stone-100 outline-none focus:border-cyan-200/60"
            max={max}
            min={min}
            onChange={(event) => onChange(Number(event.currentTarget.value))}
            step={step}
            type="number"
            value={value}
          />
          <span className="font-mono text-stone-400">{suffix}</span>
          <button
            className="rounded border border-white/10 bg-white/5 px-1.5 py-1 font-semibold text-[8px] uppercase text-stone-300 hover:bg-white/10"
            onClick={() => onChange(defaultValue)}
            type="button"
          >
            Reset
          </button>
        </span>
      </span>
      <input
        className="mt-1 block w-full accent-cyan-300"
        max={1}
        min={0}
        onChange={(event) => {
          if (!hasRange) return
          const normalized = Number(event.currentTarget.value)
          onChange(
            mapping === 'logarithmic'
              ? min * (max / min) ** normalized
              : min + (max - min) * normalized,
          )
        }}
        step={0.001}
        type="range"
        value={sliderValue}
      />
    </label>
  )
}

function OceanSlider({
  format = (value) => value.toFixed(3),
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  format?: (value: number) => string
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-[10px] text-stone-300">
        <span>{label}</span>
        <span className="font-mono text-stone-100">{format(value)}</span>
      </span>
      <input
        className="mt-1 block w-full accent-cyan-300"
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

function OceanColorControl({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[10px] text-stone-300">
      <span>{label}</span>
      <span className="flex items-center gap-2 font-mono text-[9px] text-stone-400">
        {value}
        <input
          className="h-6 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
          onChange={(event) => onChange(event.currentTarget.value)}
          type="color"
          value={value}
        />
      </span>
    </label>
  )
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

'use client'

import type { ZombieEscapeWeaponId } from '@landrush/zombie-gameplay/zombie-escape-weapon-catalog'
import { useState } from 'react'
import {
  changeWeaponFitDebugWeapon,
  createDefaultWeaponFitSettings,
  createDefaultWeaponFitTransform,
  getWeaponFitDebugWeapon,
  serializeWeaponFitDebugParams,
  WEAPON_FIT_DEBUG_WEAPONS,
  WEAPON_FIT_TRANSFORM_LIMITS,
  type WeaponFitCameraBookmark,
  type WeaponFitDebugDiagnostics,
  type WeaponFitDebugSettings,
  type WeaponFitDominantHand,
  type WeaponFitGripMode,
  type WeaponFitTransformKey,
} from './weapon-fit-debug-state'

type WeaponFitDebugControlsProps = {
  diagnostics: WeaponFitDebugDiagnostics
  onCameraBookmarkChange: (bookmark: WeaponFitCameraBookmark) => void
  onSettingsChange: (settings: WeaponFitDebugSettings) => void
  settings: WeaponFitDebugSettings
}

const POSITION_CONTROLS = ['offsetX', 'offsetY', 'offsetZ'] as const
const ROTATION_CONTROLS = ['rotationX', 'rotationY', 'rotationZ'] as const

export function WeaponFitDebugControls({
  diagnostics,
  onCameraBookmarkChange,
  onSettingsChange,
  settings,
}: WeaponFitDebugControlsProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const weapon = getWeaponFitDebugWeapon(settings.weaponId)

  const setTransform = (key: WeaponFitTransformKey, value: number) => {
    onSettingsChange({
      ...settings,
      transform: { ...settings.transform, [key]: value },
    })
  }

  const copyShareUrl = async () => {
    const query = serializeWeaponFitDebugParams(settings).toString()
    const url = `${window.location.origin}${window.location.pathname}?${query}`
    try {
      await navigator.clipboard.writeText(url)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <>
      <aside
        aria-label="Weapon fit controls"
        className="absolute top-4 bottom-4 left-4 z-10 flex w-[320px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#09111f]/94 text-slate-100 shadow-2xl backdrop-blur-xl max-sm:top-2 max-sm:bottom-auto max-sm:left-2 max-sm:max-h-[58vh] max-sm:w-[calc(100vw-1rem)]"
      >
        <header className="border-white/10 border-b px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-[11px] text-cyan-200 uppercase tracking-[0.2em]">
                Weapon fit lab
              </p>
              <h1 className="mt-1 font-semibold text-base text-white">
                Hands · anchors · silhouette
              </h1>
            </div>
            <StatusPill status={diagnostics.asset.status} />
          </div>
          <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
            Catalog-driven palm anchors with deterministic fallback geometry. No post effects.
          </p>
        </header>

        <div className="overflow-y-auto px-3.5 py-3">
          <ControlLabel label="Weapon">
            <select
              className="w-full rounded-lg border border-white/10 bg-[#101b2d] px-2.5 py-2 text-sm text-white outline-none focus:border-cyan-300/60"
              onChange={(event) =>
                onSettingsChange(
                  changeWeaponFitDebugWeapon(settings, event.target.value as ZombieEscapeWeaponId),
                )
              }
              value={settings.weaponId}
            >
              {WEAPON_FIT_DEBUG_WEAPONS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName}
                </option>
              ))}
            </select>
          </ControlLabel>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <SegmentedControl<WeaponFitDominantHand>
              label="Dominant hand"
              onChange={(dominantHand) => onSettingsChange({ ...settings, dominantHand })}
              options={[
                ['right', 'Right'],
                ['left', 'Left'],
              ]}
              value={settings.dominantHand}
            />
            <SegmentedControl<WeaponFitGripMode>
              label="Grip"
              onChange={(gripMode) => onSettingsChange({ ...settings, gripMode })}
              options={[
                ['one-hand', 'One'],
                ['two-hand', 'Two'],
              ]}
              value={settings.gripMode}
            />
          </div>

          <section className="mt-4 border-white/10 border-t pt-3">
            <SectionHeading label="Camera bookmarks" value="bounds-derived" />
            <div className="grid grid-cols-3 gap-1.5">
              {(['near', 'design', 'far'] as const).map((bookmark) => (
                <button
                  aria-pressed={settings.cameraBookmark === bookmark}
                  className={buttonClass(settings.cameraBookmark === bookmark)}
                  key={bookmark}
                  onClick={() => onCameraBookmarkChange(bookmark)}
                  type="button"
                >
                  {bookmark}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-4 border-white/10 border-t pt-3">
            <SectionHeading label="Inspection" value="actual scene fields" />
            <div className="grid grid-cols-3 gap-1.5">
              <ToggleButton
                active={settings.showSkeleton}
                label="Skeleton"
                onClick={() =>
                  onSettingsChange({ ...settings, showSkeleton: !settings.showSkeleton })
                }
              />
              <ToggleButton
                active={settings.showAxes}
                label="Axes"
                onClick={() => onSettingsChange({ ...settings, showAxes: !settings.showAxes })}
              />
              <ToggleButton
                active={settings.showBounds}
                label="Bounds"
                onClick={() => onSettingsChange({ ...settings, showBounds: !settings.showBounds })}
              />
            </div>
          </section>

          <section className="mt-4 border-white/10 border-t pt-3">
            <SectionHeading label="Position offset" value="primary-palm frame" />
            <div className="space-y-2.5">
              {POSITION_CONTROLS.map((key) => (
                <TransformSlider
                  key={key}
                  onChange={(value) => setTransform(key, value)}
                  transformKey={key}
                  value={settings.transform[key]}
                />
              ))}
            </div>
          </section>

          <section className="mt-4 border-white/10 border-t pt-3">
            <SectionHeading label="Rotation offset" value="XYZ degrees" />
            <div className="space-y-2.5">
              {ROTATION_CONTROLS.map((key) => (
                <TransformSlider
                  key={key}
                  onChange={(value) => setTransform(key, value)}
                  transformKey={key}
                  value={settings.transform[key]}
                />
              ))}
            </div>
          </section>

          <section className="mt-4 border-white/10 border-t pt-3">
            <SectionHeading label="Uniform scale" value="around primary grip" />
            <TransformSlider
              onChange={(value) => setTransform('scale', value)}
              transformKey="scale"
              value={settings.transform.scale}
            />
          </section>

          <div className="mt-4 grid grid-cols-2 gap-1.5 border-white/10 border-t pt-3">
            <button
              className={buttonClass(false)}
              onClick={() =>
                onSettingsChange({
                  ...settings,
                  gripMode: weapon.wield,
                  transform: createDefaultWeaponFitTransform(),
                })
              }
              type="button"
            >
              Reset weapon
            </button>
            <button className={buttonClass(false)} onClick={copyShareUrl} type="button">
              {copyState === 'copied'
                ? 'URL copied'
                : copyState === 'failed'
                  ? 'Copy failed'
                  : 'Copy share URL'}
            </button>
          </div>
          <button
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/[0.035] px-2 py-2 font-medium text-[10px] text-slate-400 uppercase tracking-wide hover:bg-white/[0.07] hover:text-white"
            onClick={() => onSettingsChange(createDefaultWeaponFitSettings())}
            type="button"
          >
            Reset all defaults
          </button>
        </div>
      </aside>

      <aside
        aria-label="Weapon fit diagnostics"
        className="absolute top-4 right-4 z-10 w-[292px] overflow-hidden rounded-2xl border border-white/10 bg-[#09111f]/90 text-slate-100 shadow-2xl backdrop-blur-xl max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto"
      >
        <header className="flex items-center justify-between border-white/10 border-b px-3.5 py-3">
          <p className="font-semibold text-[10px] text-slate-300 uppercase tracking-[0.18em]">
            Fit diagnostics
          </p>
          <span className="font-mono text-[9px] text-emerald-300">URL · deterministic</span>
        </header>
        <div className="max-h-[calc(100vh-5rem)] space-y-3 overflow-y-auto px-3.5 py-3 text-[11px] max-sm:max-h-[31vh]">
          <DiagnosticSection title="Asset">
            <DiagnosticRow label="State" value={diagnostics.asset.status} />
            <p className="break-all font-mono text-[9px] text-slate-500 leading-relaxed">
              {diagnostics.asset.url}
            </p>
            <p className="text-slate-400 leading-relaxed">{diagnostics.asset.message}</p>
            {diagnostics.asset.sourceSize ? (
              <DiagnosticRow
                label="Source XYZ"
                value={diagnostics.asset.sourceSize.map((value) => value.toFixed(2)).join(' × ')}
              />
            ) : null}
            {diagnostics.asset.normalizationScale !== null ? (
              <DiagnosticRow
                label="Auto scale"
                value={`${diagnostics.asset.normalizationScale.toFixed(3)}×`}
              />
            ) : null}
          </DiagnosticSection>

          <DiagnosticSection title="Grip registration">
            <DiagnosticRow
              label="Primary error"
              value={`${(diagnostics.grips.primaryErrorMeters * 100).toFixed(1)} cm`}
            />
            <DiagnosticRow
              label="Support error"
              value={
                diagnostics.grips.secondaryErrorMeters === null
                  ? 'derived target'
                  : `${(diagnostics.grips.secondaryErrorMeters * 100).toFixed(1)} cm`
              }
            />
            <DiagnosticRow
              label="Catalog wield"
              value={`${weapon.wield} · ${weapon.canonicalDimensionsMeters.lengthZ.toFixed(2)} m`}
            />
          </DiagnosticSection>

          <DiagnosticSection title="Arm reach">
            <ArmReachBar arm={diagnostics.arms.dominant} label="Dominant" />
            <ArmReachBar arm={diagnostics.arms.support} label="Support" />
          </DiagnosticSection>

          <DiagnosticSection title="Subject bounds">
            <DiagnosticRow label="Width" value={`${diagnostics.bounds.size[0].toFixed(2)} m`} />
            <DiagnosticRow label="Height" value={`${diagnostics.bounds.size[1].toFixed(2)} m`} />
            <DiagnosticRow label="Depth" value={`${diagnostics.bounds.size[2].toFixed(2)} m`} />
            <DiagnosticRow label="Radius" value={`${diagnostics.bounds.radius.toFixed(2)} m`} />
          </DiagnosticSection>

          <DiagnosticSection title="Camera / renderer">
            <DiagnosticRow
              label="Projection"
              value={`${diagnostics.camera.fov.toFixed(0)}° · ${diagnostics.camera.distance.toFixed(2)} m`}
            />
            <DiagnosticRow
              label="Clip"
              value={`${diagnostics.camera.near.toFixed(3)}–${diagnostics.camera.far.toFixed(1)}`}
            />
            <DiagnosticRow
              label="Geometry"
              value={`${diagnostics.rendering.drawCalls} calls · ${diagnostics.rendering.triangles.toLocaleString()} tris`}
            />
            <DiagnosticRow label="Post" value="0 passes" />
          </DiagnosticSection>

          <p className="border-white/10 border-t pt-2 text-[10px] text-slate-500">
            Drag to orbit · wheel to zoom · camera cuts remain reproducible.
          </p>
        </div>
      </aside>
    </>
  )
}

function ControlLabel({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-medium text-[10px] text-slate-400 uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  )
}

function SegmentedControl<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: T) => void
  options: readonly (readonly [T, string])[]
  value: T
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 font-medium text-[10px] text-slate-400 uppercase tracking-wide">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.035] p-1">
        {options.map(([option, optionLabel]) => (
          <button
            aria-pressed={option === value}
            className={buttonClass(option === value)}
            key={option}
            onClick={() => onChange(option)}
            type="button"
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function SectionHeading({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="font-semibold text-[10px] text-slate-300 uppercase tracking-wide">{label}</h2>
      <span className="font-mono text-[9px] text-slate-600">{value}</span>
    </div>
  )
}

function TransformSlider({
  onChange,
  transformKey,
  value,
}: {
  onChange: (value: number) => void
  transformKey: WeaponFitTransformKey
  value: number
}) {
  const limits = WEAPON_FIT_TRANSFORM_LIMITS[transformKey]
  const digits = limits.step < 0.01 ? 3 : limits.step < 1 ? 2 : 0
  const formatted =
    transformKey === 'scale' ? `${value.toFixed(2)}×` : `${value.toFixed(digits)}${limits.unit}`

  return (
    <label className="grid grid-cols-[48px_1fr_58px] items-center gap-2">
      <span className="text-[10px] text-slate-400">{limits.label}</span>
      <input
        aria-label={`${limits.label} weapon transform`}
        className="h-1.5 w-full cursor-pointer accent-cyan-300"
        max={limits.maximum}
        min={limits.minimum}
        onChange={(event) => onChange(Number(event.target.value))}
        step={limits.step}
        type="range"
        value={value}
      />
      <output className="text-right font-mono text-[9px] text-cyan-100">{formatted}</output>
    </label>
  )
}

function ToggleButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button aria-pressed={active} className={buttonClass(active)} onClick={onClick} type="button">
      {label}
    </button>
  )
}

function StatusPill({ status }: { status: WeaponFitDebugDiagnostics['asset']['status'] }) {
  const styles = {
    fallback: 'border-amber-300/25 bg-amber-300/10 text-amber-200',
    loaded: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200',
    loading: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-200',
  } as const
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] ${styles[status]}`}
    >
      {status}
    </span>
  )
}

function DiagnosticSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="space-y-1.5 border-white/10 border-b pb-3 last:border-0 last:pb-0">
      <h2 className="font-semibold text-[9px] text-cyan-200 uppercase tracking-[0.15em]">
        {title}
      </h2>
      {children}
    </section>
  )
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-mono text-[10px] text-slate-200">{value}</span>
    </div>
  )
}

function ArmReachBar({
  arm,
  label,
}: {
  arm: WeaponFitDebugDiagnostics['arms']['dominant']
  label: string
}) {
  const width = Math.min(100, arm.reachRatio * 100)
  const color =
    arm.fit === 'overextended'
      ? 'bg-rose-400'
      : arm.fit === 'near-limit'
        ? 'bg-amber-300'
        : 'bg-emerald-300'
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-slate-500">
          {label} · {arm.side}
        </span>
        <span className="font-mono text-[9px] text-slate-300">
          {arm.activeGrip ? `${Math.round(arm.reachRatio * 100)}%` : 'relaxed'} ·{' '}
          {arm.elbowAngleDegrees.toFixed(0)}°
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/8">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function buttonClass(active: boolean): string {
  return active
    ? 'rounded-md border border-cyan-200/30 bg-cyan-300 px-2 py-1.5 font-semibold text-[10px] text-slate-950 uppercase tracking-wide'
    : 'rounded-md border border-white/10 bg-white/[0.045] px-2 py-1.5 font-semibold text-[10px] text-slate-300 uppercase tracking-wide hover:bg-white/10 hover:text-white'
}

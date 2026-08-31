'use client'

import {
  ZOMBIE_ESCAPE_QUALITY,
  type ZombieEscapeInputMode,
  type ZombieEscapeQuality,
} from './zombie-escape-config'
import type { ZombieEscapeSceneApi } from './zombie-escape-scene'
import type { ZombieEscapeHudSnapshot } from './zombie-escape-simulation'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'
import { ZombieEscapeWeaponInventoryRow } from './zombie-escape-weapon-inventory'

const BUTTON_CLASS =
  'rounded-lg border border-white/15 bg-slate-950/55 px-3 py-2 font-semibold text-[11px] text-white/85 uppercase tracking-wide backdrop-blur-md transition hover:border-cyan-200/45 hover:bg-slate-900/75 hover:text-white'

export function ZombieEscapeMoneyBadge({
  className = '',
  money,
}: {
  className?: string
  money: number
}) {
  const amount = Number.isFinite(money) ? Math.max(0, Math.trunc(money)) : 0
  return (
    <div
      aria-label={`Money: $${String(amount)}`}
      className={`inline-flex items-center gap-1 rounded-full border border-amber-200/25 bg-slate-950/68 px-3 py-1.5 font-bold font-mono text-amber-100 text-sm shadow-lg backdrop-blur-md ${className}`}
      data-testid="landrush-zombie-escape-money"
      role="status"
    >
      <span aria-hidden="true" className="text-amber-300">
        $
      </span>
      <span>{amount}</span>
    </div>
  )
}

export function ZombieEscapeHud({
  api,
  inputMode,
  onQualityToggle,
  quality,
  snapshot,
}: {
  api: ZombieEscapeSceneApi | null
  inputMode: ZombieEscapeInputMode
  onQualityToggle: () => void
  quality: ZombieEscapeQuality
  snapshot: ZombieEscapeHudSnapshot
}) {
  const objective = resolveObjective(snapshot)
  const health = Math.max(0, Math.min(100, snapshot.health))
  const terminal = snapshot.status !== 'playing'
  const overlayVisible = snapshot.paused || terminal
  const equippedWeapon =
    ZOMBIE_ESCAPE_WEAPON_CATALOG[snapshot.weaponIndex] ?? ZOMBIE_ESCAPE_WEAPON_CATALOG[0]

  return (
    <div className="pointer-events-none absolute inset-0 z-10 text-white">
      <section className="absolute top-4 left-4 w-[min(330px,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-slate-950/68 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black text-amber-200 text-xs uppercase tracking-[0.24em]">
              Zombie Escape
            </p>
            <p className="mt-1 font-semibold text-lg text-white">Wave {snapshot.wave}</p>
          </div>
          <div className="rounded-full border border-cyan-200/25 bg-cyan-300/10 px-3 py-1 font-mono text-[10px] text-cyan-100">
            {snapshot.waveRemaining} threats
          </div>
        </div>
        <ZombieEscapeMoneyBadge className="mt-3" money={snapshot.money} />
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-lime-300 transition-[width] duration-150"
            style={{ width: `${String(health)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-white/65">
          <span>ROBOT INTEGRITY</span>
          <span>{Math.ceil(health)}%</span>
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <p className="text-[9px] text-cyan-200 uppercase tracking-[0.2em]">Objective</p>
          <p className="mt-1 font-medium text-sm">{objective}</p>
        </div>
      </section>

      <div className="pointer-events-auto absolute top-4 right-4 flex flex-wrap justify-end gap-2">
        <button className={BUTTON_CLASS} onClick={() => api?.togglePause()} type="button">
          {snapshot.paused ? 'Resume' : 'Pause'}
        </button>
        <button className={BUTTON_CLASS} onClick={() => api?.cycleCamera()} type="button">
          Camera · {snapshot.cameraBookmark}
        </button>
        <button className={BUTTON_CLASS} onClick={() => api?.cycleDebug()} type="button">
          View · {snapshot.debugMode}
        </button>
        <button className={BUTTON_CLASS} onClick={onQualityToggle} type="button">
          {ZOMBIE_ESCAPE_QUALITY[quality].label}
        </button>
        <button className={BUTTON_CLASS} onClick={() => api?.reset()} type="button">
          Reset
        </button>
      </div>

      {snapshot.debugMode !== 'final' ? (
        <section className="absolute top-16 right-4 w-56 rounded-xl border border-cyan-200/20 bg-slate-950/74 p-3 font-mono text-[10px] text-cyan-50 shadow-xl backdrop-blur-lg">
          <div className="flex justify-between">
            <span>seed</span>
            <span>0x5a452026</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>frame</span>
            <span>{snapshot.frameMs.toFixed(2)} ms CPU interval</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>render</span>
            <span>
              {snapshot.renderCalls} calls · {snapshot.triangles} tris
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>shot pool</span>
            <span>
              {snapshot.shots} active · {snapshot.muzzleFlashes} muzzle
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>shot phases</span>
            <span>
              {snapshot.shotsTraveling} flight · {snapshot.shotsImpacting} impact
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>zombies</span>
            <span>{snapshot.zombies}/64</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>post RT</span>
            <span>0</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>GPU time</span>
            <span>unavailable</span>
          </div>
        </section>
      ) : null}

      <div className="absolute right-4 bottom-4 left-4 flex justify-center">
        <div className="rounded-xl border border-white/12 bg-slate-950/62 px-4 py-2 text-center text-[11px] text-white/72 shadow-xl backdrop-blur-lg">
          {inputMode === 'gamepad' ? (
            <span>
              LS move · RS aim · RT fire · L3 run · L1/R1 swap · Menu pause · Y reset · View debug ·
              D-pad camera/quality
            </span>
          ) : inputMode === 'touch' ? (
            <span>Left stick move · Right stick aim · Push the right stick outward to fire</span>
          ) : (
            <span>
              WASD move · Mouse aim · LMB/Space fire · Shift run · Mouse wheel swap · P pause · R
              reset · F1 debug · C camera · Q quality
            </span>
          )}
        </div>
      </div>

      <div className="absolute bottom-[max(7.75rem,calc(env(safe-area-inset-bottom)+7.75rem))] left-[max(1rem,env(safe-area-inset-left))] rounded-lg border border-white/10 bg-slate-950/48 px-3 py-1.5 text-[10px] text-white/55 backdrop-blur">
        {equippedWeapon?.displayName ?? 'Weapon'} · {snapshot.kills} cleared · {snapshot.shotsFired}{' '}
        shots · cyan armory pads add weapons · wheel or L1/R1 to swap
      </div>

      <ZombieEscapeWeaponInventoryRow
        className="absolute bottom-[max(4rem,calc(env(safe-area-inset-bottom)+4rem))] left-[max(1rem,env(safe-area-inset-left))]"
        weaponIndex={snapshot.weaponIndex}
        weaponInventoryMask={snapshot.weaponInventoryMask}
      />

      {overlayVisible ? (
        <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-slate-950/45 backdrop-blur-[3px]">
          <section className="mx-4 w-[min(430px,calc(100vw-2rem))] rounded-3xl border border-white/18 bg-slate-950/88 p-7 text-center shadow-2xl">
            <p className="font-black text-amber-200 text-xs uppercase tracking-[0.28em]">
              {snapshot.status === 'won'
                ? 'Extraction complete'
                : snapshot.status === 'lost'
                  ? 'Robot disabled'
                  : 'Simulation paused'}
            </p>
            <h1 className="mt-3 font-black text-3xl">
              {snapshot.status === 'won'
                ? 'You escaped the island.'
                : snapshot.status === 'lost'
                  ? 'The horde closed in.'
                  : 'Catch your breath.'}
            </h1>
            <p className="mt-3 text-sm text-white/65">
              Seeded run · {snapshot.kills} zombies cleared · {snapshot.elapsedSeconds.toFixed(1)}s
            </p>
            <div className="mt-6 flex justify-center gap-2">
              {snapshot.paused && !terminal ? (
                <button className={BUTTON_CLASS} onClick={() => api?.togglePause()} type="button">
                  Resume
                </button>
              ) : null}
              <button className={BUTTON_CLASS} onClick={() => api?.reset()} type="button">
                Run again
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function resolveObjective(snapshot: ZombieEscapeHudSnapshot) {
  if (snapshot.status === 'won') return 'Extraction complete. The skiff has you.'
  if (snapshot.status === 'lost') return 'Reset the deterministic run and try another route.'
  if (snapshot.extractionOpen) return 'Extraction is live — reach the cyan dock beacon.'
  if (snapshot.waveState === 'intermission') return 'Brief repair window. The next wave is forming.'
  return `Clear ${String(snapshot.waveRemaining)} threats to unlock extraction.`
}

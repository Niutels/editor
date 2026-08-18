---
name: landrush-performance-investigation
description: Diagnose and verify Landrush/Pascal runtime performance regressions without letting the benchmark create the symptom. Use for periodic freezes, lag spikes, stutter, low FPS, delayed input, multiplayer reconciliation hitches, or slow building and floor transitions on the Landrush lab pages, and when comparing the normal open-world page with the isolated Pascal integration page.
---

# Landrush Performance Investigation

Establish an observer-light baseline, prove that the intended world and interaction loaded, and add instrumentation only through controlled differential runs. Keep freeze conclusions separate from average-FPS and profiler-budget conclusions.

## Inspect the Current Harness

Read these files before changing or running the benchmark because its flags, gates, and scenarios may evolve:

- `tooling/bench/src/cli.mjs`
- `tooling/bench/src/report.mjs`
- `tooling/bench/src/scenario/scenario-utils.mjs`
- The selected file under `tooling/bench/src/scenario/scenarios/`

Inspect `git status` and preserve unrelated work. Check `/api/health` and record the returned mode. Never describe a development-mode run as production evidence.

## Define the Symptom

Record the user's observable problem before profiling:

- Distinguish a freeze from persistently low FPS, delayed input, visual judder, network correction, and scene-loading delay.
- Record the affected action: static, walking, camera yaw, floor-plan construction, entering a house, changing floors, or multiplayer activity.
- Estimate any apparent period. Measure for at least three minutes or ten suspected periods, whichever is longer.

Do not infer an application timer from cadence alone. Benchmark polling, screenshots, DOM serialization, checkpoint capture, GPU queries, garbage collection, and server compilation can produce their own cadence.

## Protect the Measurement

Prefer the benchmark route and an offline deterministic fixture for the first pass. Keep the user's active page and server untouched when another verified server is available.

Use a production server for release-performance claims. The current harness only auto-spawns development mode, so pass `--no-spawn` when targeting an already running production server. Building Next.js can replace the shared `.next` output; do not build over an active development session unless restoring or restarting it is within scope.

Confirm all of the following before timing:

- The health endpoint reports the requested server mode.
- The intended route loaded instead of a loader, error page, or fallback shell.
- The expected node and level counts remain stable across several samples.
- The expected view mode and tool are active for interaction scenarios.
- The page remains visible for the entire run.

Reject the run if readiness times out or reports the wrong scene. Never reinterpret a partial startup wait as a clean soak.

## Run an Observer-Light Baseline

Run the same commit, seed, viewport, page, scene, and scenario for every comparison. Start with CPU, frame, and GPU profiling disabled. Keep DOM probe output disabled. Keep periodic checkpoints disabled; the harness captures one replay checkpoint before measurement, while `--checkpoints` explicitly opts into full-scene snapshots during timing.

From the repository root, target a verified production server on the selected port:

```powershell
$env:PASCAL_BENCH_PORT = '3012'
node tooling/bench/src/cli.mjs run `
  --scenario landrush-static `
  --page pascal-multiplayer-island-benchmark `
  --minutes 3 `
  --warmup 20 `
  --seed 42 `
  --no-spawn `
  --server-mode production `
  --no-cpuprofile `
  --no-frame-profile `
  --no-gpu-profile
```

Select the smallest scenario that reproduces the report:

- `landrush-static`: isolate background work and periodic behavior.
- `landrush-yaw`: exercise camera-relative rendering.
- `landrush-move`: exercise traversal, collision, streaming, and visibility.
- `landrush-floorplan`: exercise build-mode placement and scene mutation.
- `landrush-enter-house`: exercise parcel and floor visibility transitions.

Run `scripts/analyze-run.mjs <runDir>` after each soak. Inspect `report.md`, `report.json`, `events.jsonl`, and `frames.jsonl` directly when a conclusion depends on individual episodes.

## Interpret the Baseline

Report these as separate outcomes:

- Frame freezes at or above 250 ms.
- Main-thread task-starvation episodes at or above 250 ms.
- Frame-time distribution: p50, p95, p99, and maximum.
- Effective FPS and persistent frame-budget misses.
- Page errors, crashes, device loss, and visibility loss.
- Timing of large gaps and intervals between them.

Treat regular cadence as evidence only when several episodes cluster around the same interval. Treat irregular sub-250 ms gaps as frame-time instability, not as the same periodic freeze without additional proof.

A clean run with profilers disabled can legitimately have an overall `FAIL` because CPU/GPU attribution gates are unmeasured. State which gates were intentionally unmeasured and evaluate the freeze-specific gates directly. Never relabel the overall verdict as a pass.

## Add Instrumentation Differentially

Enable one source of measurement overhead at a time and preserve every other variable:

1. Run the clean baseline.
2. Enable frame profiling only.
3. Enable GPU profiling only.
4. Enable the V8 CPU profile only.
5. Enable periodic checkpoints with `--checkpoints` only when checkpoint behavior itself must be measured.
6. Enable DOM probe output only for a separate state-debugging run, never for the baseline.

Attribute a newly appearing cadence to instrumentation when the clean run is clear and the otherwise identical instrumented run consistently reproduces it. Move expensive capture outside the measured window or make it explicit opt-in; do not merely raise the freeze threshold.

## Isolate the Owning Subsystem

Change only one axis per comparison:

- Compare static with yaw to isolate camera/render work.
- Compare static with movement to isolate traversal, collision, and streaming.
- Compare offline with online using the same path and scene to isolate multiplayer behavior.
- Compare outside, entry, and floor transitions to isolate visibility and scene reconciliation.
- Compare the normal route with the isolated integration route to isolate open-world composition overhead.

For suspected multiplayer problems, first prove that offline is clean and online is not. Then correlate WebSocket message cadence, reconciliation work, and visible player correction. Do not label a hitch as network-caused from appearance alone.

Search for timers only after confirming the period in a clean run. Inspect interval, timeout, heartbeat, persistence, snapshot, autosave, reconciliation, and polling code near the affected subsystem. Prefer removing unnecessary synchronous work, chunking unavoidable work, or invalidating only changed data over broad throttles or compatibility shims.

## Verify a Fix

Repeat the exact reproducing scenario with the same seed and environment. Require:

- A valid, fully loaded scene.
- At least three minutes or ten former periods of measured time.
- Zero freezes and zero task-starvation episodes for a freeze fix.
- Absence of the former interval in raw event and frame-gap timing.
- No page errors, crashes, device loss, or hidden-page periods.
- A separate targeted profiler run when CPU or GPU attribution is part of the claim.
- A health and load check of the normal local page after using temporary servers or production builds.

Stop temporary servers started for the investigation. Do not stop or restart a reused user server unless the task authorizes it.

## Report Evidence

Lead with whether the specific reported symptom remains. Include:

- Route, mode, scenario, seed, duration, and measured frame count.
- Scene validity evidence such as node count, level count, and expected mode.
- Freeze, starvation, error, and maximum-gap counts.
- Any repeated interval and the number of repetitions.
- Clean-versus-instrumented comparison when observer effects were tested.
- Clickable paths to the run report and relevant raw artifacts.
- Remaining problems separately, especially low average FPS that is not the reported freeze.

Use precise language: "the former periodic freeze was not observed over N periods" is stronger and more honest than claiming that no future freeze is possible.

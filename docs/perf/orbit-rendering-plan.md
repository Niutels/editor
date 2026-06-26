# Orbit Rendering Optimization Plan

This plan turns the orbit-performance discussion into independent checkpoints that can be developed and verified without stepping on the same files.

## Checkpoint 0: Shared Contract

Status: started.

Owned files:

- `packages/viewer/src/runtime/render-reasons.ts`
- `packages/viewer/src/runtime/render-profiles.ts`
- `packages/viewer/src/runtime/perf-flags.ts`
- `packages/viewer/src/runtime/render-scheduler.ts`

Acceptance:

- No default visual behavior change.
- Render reasons, profiles, post-FX variants, and perf flags are exported from `@pascal-app/viewer`.
- Later checkpoints use these contracts instead of local ad hoc flags.

## Checkpoint 1: Perf Recorder

Status: started.

Owned files:

- `packages/viewer/src/runtime/perf-recorder.ts`
- `packages/viewer/src/components/viewer/perf-probe.tsx`
- `packages/viewer/src/components/viewer/post-processing.tsx`

Acceptance:

- `?perf` or `?collectPerfMetrics=1` records frame and post-FX CPU samples.
- Browser console users can inspect `window.__PASCAL_PERF__.getSamples()` and `summarize(name)`.
- Metrics include render profile and variant tags.

## Checkpoint 2: Camera Scheduler Controls

Status: partial.

Owned files:

- `packages/viewer/src/components/viewer/frame-limiter.tsx`
- `packages/viewer/src/components/viewer/render-scheduler-bridge.tsx`
- `packages/viewer/src/components/viewer/shadow-controller.tsx`
- `packages/viewer/src/store/use-viewer.ts`

Acceptance:

- Camera drag start/end and per-frame camera movement are recorded as render reasons.
- Shadow freezing stays behind `freezeShadowMapOnCameraMove`.
- Picking suspension remains behaviorally unchanged until all manual raycast paths share one predicate.

## Checkpoint 3: Post-FX Variant Matrix

Status: started.

Owned files:

- `packages/viewer/src/runtime/perf-flags.ts`
- `packages/viewer/src/components/viewer/post-processing.tsx`

Acceptance:

- `?postFxVariant=full|orbit-lite|no-ssgi|no-denoise|no-outlines|off` maps to one named variant.
- `orbit-lite` starts conservatively by disabling SSGI and denoise while preserving scene, zones, overlays, ink, and outlines.
- Automatic camera-drag switching is deferred until the metrics prove pipeline rebuilds do not cause orbit start/end hitches.

## Checkpoint 4: Cached AO Substitute

Status: not started.

Owned files:

- Future `packages/viewer/src/ao/*`.

Acceptance:

- `enableCachedAO` is implemented behind a flag.
- Orbit-lite with cached AO visually compares closer to full than orbit-lite without cached AO.
- Basic wall/slab edits do not leave stale AO.

## Checkpoint 5: Integration

Status: not started.

Acceptance:

- Run the perf matrix against `full`, `no-ssgi`, `no-denoise`, `no-outlines`, `orbit-lite`, and `off`.
- Promote flags one at a time based on p95/p99 and visual regression evidence.
- Keep `postFxVariant=full` as the reference fallback.

## Current Manual Verification

Use the existing app until the scripted benchmark lands:

```bash
bun check-types
bun check
bun --filter editor dev
```

Then open these variants with `?perf`:

- `http://localhost:3002?perf`
- `http://localhost:3002?perf&postFxVariant=no-ssgi`
- `http://localhost:3002?perf&postFxVariant=no-denoise`
- `http://localhost:3002?perf&postFxVariant=no-outlines`
- `http://localhost:3002?perf&postFxVariant=orbit-lite`
- `http://localhost:3002?perf&postFxVariant=off`

Read summaries in the browser console:

```js
window.__PASCAL_PERF__.summarize('frame.delta.ms')
window.__PASCAL_PERF__.summarize('postfx.render.cpu.ms')
```

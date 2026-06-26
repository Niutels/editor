# Orbit Rendering Decision Ledger

## Experiment 001: Runtime Contract And Manual Variant Matrix

Status: in progress.

Hypothesis:

Orbit-frame cost can be isolated without a renderer rewrite by first naming render reasons, render profiles, and post-FX variants, then measuring manual variants under the existing post-processing graph.

Change:

- Added render reason/profile/perf-flag contracts.
- Added a render scheduler singleton.
- Added a perf recorder exposed as `window.__PASCAL_PERF__`.
- Added `postFxVariant` URL support for manual A/B tests.
- Added conservative `orbit-lite` as SSGI/denoise disabled, with the rest of the compositing path preserved.

Verification:

- Pending local typecheck and lint.
- Pending manual browser perf run.

Decision:

Do not enable automatic orbit-time post-FX switching yet. Measure manual variants first, then only add automatic switching if rebuild/start-stop hitches are acceptable or if variants can be prebuilt.

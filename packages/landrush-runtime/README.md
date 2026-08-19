# `@landrush/runtime`

Pascal-independent Landrush game runtime. Neither this package nor Pascal packages import the other.

The package owns player physics, generic collider compilation, reusable world-geometry builders, render telemetry, remote-player presentation, and multiplayer transport, persistence, and reconciliation for the multiplayer island experience. Pascal scene data reaches it only after `@landrush/pascal-host` has projected that data into Landrush-owned contracts.

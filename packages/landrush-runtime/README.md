# `@landrush/runtime`

Pascal-independent Landrush game runtime. Neither this package nor Pascal packages import the other.

The package owns player physics, generic collider compilation, reusable world-geometry builders, render telemetry, remote-player presentation, and multiplayer transport, persistence, and reconciliation for the multiplayer island experience. Pascal scene data reaches it only after `@landrush/pascal-host` has projected that data into Landrush-owned contracts.

Parcel-build transport is serialized independently per parcel. Each parcel retains at most one
stable in-flight operation and one latest pending snapshot. Reconnect and acknowledgement timeout
retries preserve the operation ID and base revision. A matching acknowledgement never becomes a
content update. Unexpected authority pauses that parcel without retrying and preserves the latest
local desired nodes until `resolveParcelBuildConflict` explicitly supplies a resolved snapshot.

`useLandrushWorldMultiplayer` exposes `parcelBuildUpdates`, a latest-per-parcel collection with
monotonic `sequence` values. Its only sources are `snapshot`, `remote`, and `conflict`; reconnect
baselines are suppressed while local desired state exists, and transport acknowledgements never
appear. An authoritative empty parcel is represented by `build: null`.

`parcelBuildContentAuthorityEpoch` changes when the watched world, room, enabled lifecycle, or
local player identity changes. It remains stable across a reconnect to the same authority.

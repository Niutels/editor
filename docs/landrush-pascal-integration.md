# Landrush and Pascal Upstream Integration

Landrush is a separate application in the same monorepo, not a second renderer and not a patch set
inside Pascal. The canonical experience is `/landrush-lab/pascal-multiplayer-island` from
`apps/landrush`. It mounts one Pascal `Viewer`, one Three.js scene, and one canvas. Pascal renders
construction nodes; Landrush contributes the island/world children to that same scene.

## Ownership boundary

| Owner | Paths | Responsibility |
| --- | --- | --- |
| Pascal upstream | `apps/editor`, `packages/{core,viewer,editor,nodes,mcp,cli,plugin-trees}` | Public scene, viewer, editor, registry, and tool contracts. These paths exactly match the pinned Pascal commit. |
| Landrush app | `apps/landrush` | The island route, gameplay/UI composition, world generation, camera modes, and integration tests. |
| Pascal adapter | `packages/landrush-pascal-host` | Scene loading, one-viewer composition, public editor systems, build palette, item catalog, and level selector. |
| Pascal plugin | `packages/landrush-pascal-plugin` | Registry-driven Landrush node definitions and renderers. |
| Game runtime | `packages/landrush-runtime` | Movement/collision, render scheduling, and renderer-backend bridges. |
| Wire contract | `packages/landrush-protocol` | Renderer-independent multiplayer versions, revisions, and operation envelopes. |
| Multiplayer server | `apps/landrush-world-multiplayer-server` | Ownership, authoritative parcel-build revisions, reconciliation, voice signaling, and persistence. |

Landrush imports only public `@pascal-app/*` exports. Pascal-owned code may never import
`@landrush/*`. Player/camera presence and presentation state stay outside the Pascal scene graph;
only durable layout and construction data are scene nodes.

## Nine-step migration

1. Checkpoint and push all durable work while excluding logs, benchmark runs, screenshots, and temp data.
2. Move the Landrush application from `apps/editor` to `apps/landrush`.
3. Restore every Pascal-owned path to the integrated upstream commit.
4. Register Landrush scene types through `packages/landrush-pascal-plugin` and Pascal's public plugin API.
5. Move game-only collision, scheduling, and backend adapters to `packages/landrush-runtime`.
6. Compose the canonical route through `packages/landrush-pascal-host` with one `Viewer` and one canvas.
7. Separate transient presence/presentation state and version parcel-build synchronization in `packages/landrush-protocol`.
8. Enforce ownership/import/route boundaries in CI and test Pascal, Landrush, multiplayer, first-load, and performance behavior.
9. Rehearse a real Pascal-main merge, record the exact integrated commit, and compare the canonical route against the saved performance baseline.

## Pulling a Pascal update

Use the public Pascal repository as `origin`, or substitute its remote name below.

```sh
git fetch origin main
git merge --no-ff origin/main
bun install --frozen-lockfile
bun run record:pascal-upstream -- origin/main
bun run check:landrush-boundary
bun run check-types
bun run test
bun run build
```

`record:pascal-upstream` refuses to advance the pin unless the requested commit is already merged
and every Pascal-owned path exactly matches it. The boundary check also rejects private Pascal
imports, reverse dependencies from Pascal into Landrush, and accidental reintroduction of unrelated
Landrush lab pages. After automated checks, run the canonical static/move/yaw/build/enter-house
benchmarks and verify a cold first load before pushing the merge.

## Compatibility rules

- One canvas is a hard contract; package separation does not create separate scenes or render loops.
- Landrush node kinds use Pascal `NodeDefinition` registration instead of union edits or legacy dispatch.
- Public package exports are the only coupling surface. Missing capability is handled in the adapter or proposed upstream as a public extension point.
- The Pascal site root remains valid scene data; the host adapter suppresses only its unregistered standalone-ground presentation so it cannot cover Landrush's ocean or construction children.
- Parcel builds are server-authoritative snapshots with `schemaVersion`, monotonic `revision`, and idempotent `operationId`; stale writes receive the current snapshot and retry in order.
- The pinned commit is evidence of what was integrated, not a forked copy to edit. New Landrush behavior belongs in Landrush-owned paths.

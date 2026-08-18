# Landrush

Landrush is the open-world application that embeds Pascal construction. Its canonical route is
`/landrush-lab/pascal-multiplayer-island`.

The app owns gameplay, the procedural island, camera modes, multiplayer presentation, and the
Landrush user interface. It does not fork Pascal's renderer. `@landrush/pascal-host` mounts one
public Pascal `Viewer`, and Landrush world content plus Pascal construction nodes share that
Viewer's Three.js scene and canvas.

## Run locally

From this directory:

```sh
bun run dev
```

The Next.js app listens on port 3002 and the local Landrush WebSocket server listens on port 3003.
Open <http://localhost:3002/landrush-lab/pascal-multiplayer-island>.

Useful checks:

```sh
bun run check-types
bun run build
```

Repository-level Landrush tests and boundary checks are defined in the root `package.json`.

## Integration boundary

- `apps/landrush` owns the product route and application composition.
- `packages/landrush-pascal-host` is the only Pascal host adapter.
- `packages/landrush-pascal-plugin` contributes Landrush scene kinds through Pascal's public plugin
  registry.
- `packages/landrush-runtime` owns game-only runtime and rendering bridges.
- `packages/landrush-protocol` owns versioned multiplayer wire contracts.
- Pascal-owned packages remain byte-for-byte aligned with the recorded upstream commit.

Do not import Pascal private source paths, add Landrush dependencies to Pascal-owned packages, or
create another Viewer/canvas for the world. See
[`docs/landrush-pascal-integration.md`](../../docs/landrush-pascal-integration.md) for the update
workflow, ownership rules, and nine-step migration.

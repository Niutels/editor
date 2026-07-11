# Landrush Within Pascal

Landrush should run as a Pascal-native world. The final architecture should not keep a separate Landrush rendering pipeline beside Pascal. The island, water, parcels, roads, vegetation, parcel surfaces, and build interactions should all live inside Pascal's scene, viewer, node, and editor architecture.

## Target Architecture

Pascal is the foundation for the whole experience:

- `packages/core` owns durable scene data and node schemas.
- `packages/nodes` owns Landrush-specific node renderers for world visuals that need custom Three.js/WebGPU behavior.
- `packages/viewer` owns the shared canvas, render loop, camera, registry, and rendering contracts.
- `packages/editor` and `apps/editor` own build tools, panels, and route composition.

Landrush contributes the world model and gameplay layer: parcels, ownership, player state, multiplayer presence, terrain generation, roads, grass, trees, water, and robot/player movement. These features should be expressed through Pascal-compatible scene data and rendered through Pascal's viewer.

## Viewer And Build Mode

The user should experience Landrush as one continuous Pascal scene. Walking around, opening map view, selecting a parcel, claiming it, and entering build mode should not swap to a separate renderer or reload the page.

Map mode and build mode should be presentation states over the same Pascal world:

- Viewer mode shows the game-like world.
- Map mode highlights parcels and ownership.
- Build mode activates Pascal's building tools inside the selected parcel.

The parcel is the bridge between Landrush gameplay and Pascal building. Once a parcel is selected or owned, Pascal build tools operate within that parcel's bounds while the island world remains mounted and visually intact.

## Rendering Contract

Landrush visuals can be expressive and game-like, but they should still follow Pascal's renderer lifecycle. Custom GPU materials, generated textures, instancing, and animated effects belong in node renderers or viewer systems, not in an external scene mounted beside Pascal.

Advanced WebGPU/TSL materials should be activated after the Pascal viewer has mounted, so generated GPU resources are ready before the material binds them. This keeps cinematic rendering compatible with Pascal's shared viewer architecture.

The final result should feel like a world game on the surface and a Pascal build scene underneath.

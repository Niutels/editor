# Landrush Zombie Gameplay

CPU-only game mechanics shared by the Landrush browser game and multiplayer server. This package owns the existing simulation, combat, spawn/boss rules, catalogs, collision-world compiler, and layered sparse navigation. It does not depend on React, Three.js, browser input devices, or Pascal scene stores.

Import the explicit module subpaths, such as `@landrush/zombie-gameplay/zombie-escape-simulation` or `@landrush/zombie-gameplay/landrush-zombie-escape-collision-world-compiler`. Consumers provide accepted world geometry and player inputs; browser rendering and input sampling remain in the app.

The TypeScript sources run directly in Bun and are transpiled by the Landrush application. Node deployment consumers must bundle their server entry for Node before deployment. `bun run check-types` checks the package without DOM libraries, and `bun test src` runs its headless contracts.

## Authoritative multiplayer room

`zombie-game-room` runs one real simulation, zombie pool, projectile pool, collision graph, population schedule, and shared navigation work budget. Each player retains health, inventory, cooldowns, kill credit, trail history, and a target-specific navigation field. Target selection is staggered and checks reachable players; disconnected or dead players stop being targets immediately. Target changes and building edits invalidate routes without deleting or relocating live zombies.

Create the room, install canonical navigation/combat worlds, register accepted player poses, and submit validated weapon controls. The host owns the authoritative phase clock and calls `stepZombieGameRoom` at its fixed rate. It reads shared pools once and adds the recipient's player state when serializing. Input fire expires after 250 ms without an update. Disconnecting retains the bounded player identity, health, ammunition, and accepted sequence so reconnecting cannot refill a player.

With `Z` zombies, `P` retained player identities (at most 32), and `G` navigation graph size, ordinary movement is `O(Z)`, staggered target selection is `O(ZP)`, and target-field storage is `O(PG)` over one shared immutable world graph. Expensive target publication and agent route searches share the existing fixed per-tick operation limits; adding players does not multiply those budgets or the nightly population. This is not an `O(1)` zombie simulation.

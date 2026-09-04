# Landrush World Multiplayer Server

Standalone WebSocket relay for the Landrush world multiplayer lab.

## Local

```bash
npm install
npm start
```

Default local URL:

```text
ws://localhost:3003/api/landrush-lab/world-multiplayer/ws
```

Parcel ownership, Pascal build nodes, and TV state are restored automatically from:

```text
<repo>/.landrush-local/world-multiplayer-state.json
```

Set `LANDRUSH_WORLD_MULTIPLAYER_STATE_FILE` to use another path, or to `off` to disable local
persistence. `LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR` is the preferred production setting; the
server stores `world-multiplayer-state.json` beneath that directory.

Joined editor clients use a server-issued writer epoch. A new tab takes over with a new session;
the displaced session keeps its expired epoch and is terminally rejected if it reconnects. Network
reconnects from the active tab retain the same session, epoch, and build operation IDs, making
retries idempotent. Displacement fences the previous socket before it is physically closed, so it
cannot reclaim a lease or mutate ownership, builds, TV state, presence, or voice signaling during
the close race. `LANDRUSH_WRITER_SESSION_CLOSE_GRACE_MS` may defer only that physical close by up
to five seconds; logical fencing remains immediate.

Inactive writer grants are retained for five minutes and capped at 1,024 entries by default.
`LANDRUSH_WRITER_SESSION_RETENTION_MS` and `LANDRUSH_MAX_INACTIVE_WRITER_SESSIONS` configure those
bounds. Once an inactive grant is evicted, reconnect behavior is equivalent to reconnecting after
a server restart: the editor obtains a fresh lease instead of relying on an expired tombstone.
Active grants are never evicted. Parcel authority is keyed by world, and `watch-parcels`
subscriptions receive ownership, build, and TV updates even when subscribers use different
presence rooms.

## Durable production saves

Production refuses to start unless persistence is explicitly configured or explicitly disabled.
Point the data directory outside the deployed release so replacing application code cannot replace
world data:

```text
LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR=/var/lib/landrush
```

For a container, mount a named volume or persistent disk at that path. For a release-directory or
systemd deployment, create the directory once, grant it to the service user, and keep it outside
every checkout or release directory. During the first protected rollout, stop the old process and
copy its existing `world-multiplayer-state.json` into this directory before starting the new one.
Production also refuses to start when that configured save is missing, preventing a mistyped or
unmounted data path from silently serving an empty world. Unreadable, invalid, or unsupported saves
also stop production startup instead of being ignored. Set
`LANDRUSH_WORLD_MULTIPLAYER_ALLOW_EMPTY_STATE=1` only for the first boot of an intentionally new
world, then remove it after the initial save has been written.

On startup, every distinct valid save is copied to `backups/` using a content-derived filename
before migration. Legacy schema-1 saves are then rewritten atomically to the current schema while
preserving ownership, parcel builds, revisions, and TV state. `/health` reports whether persistence
was restored, backed up, or migrated without exposing the filesystem path. Schema-2 build graphs
and authority envelopes are restored strictly: malformed IDs, revisions, timestamps, metadata,
duplicate keys, or lossy graph data stop production startup instead of being silently rewritten.
Explicit schema-1 parcel builds remain available for deterministic client migration.

Inbound WebSocket messages are capped slightly above the legal parcel-build snapshot size. Build
nodes also have an explicit nesting limit, so pathological JSON is rejected without risking the
multiplayer process.

The checked-in Render free-service blueprint explicitly runs statelessly because that plan has no
persistent disk. It must not be used as the canonical multiplayer world. Attach a persistent disk,
set `LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR` to its mount path, and remove the explicit `off` setting
before promoting a Render service to canonical production.

## Render

The repo root `render.yaml` deploys this folder as a Render web service.

After Render creates the service, set the editor deployment env var to the service WebSocket URL:

```text
NEXT_PUBLIC_LANDRUSH_WORLD_MULTIPLAYER_WS_URL=wss://<render-service>.onrender.com/api/landrush-lab/world-multiplayer/ws
```

Health endpoints:

- `/health`
- `/rooms`
- `/metrics`

## Optional laptop-hosted server

Use a separate process and save directory; leave the normal local server on port 3003 alone.
The following environment selects a loopback-only listener for a future HTTPS/WebSocket tunnel:

```text
LANDRUSH_WORLD_MULTIPLAYER_HOST=127.0.0.1
LANDRUSH_WORLD_MULTIPLAYER_WS_PORT=3004
LANDRUSH_WORLD_MULTIPLAYER_DATA_DIR=<separate per-user persistent directory>
LANDRUSH_WORLD_MULTIPLAYER_ALLOWED_ORIGINS=https://landrush.niutgames.com,http://localhost:3002
LANDRUSH_WORLD_MULTIPLAYER_MAX_CONNECTIONS=32
```

No tunnel is created automatically. Restrict any future tunnel to this listener, not the local
development app or other machine services. Use a separate access-control mechanism when the lab
must be private: an Origin allowlist is not authentication, and non-browser clients can forge it.
The existing player IDs and writer sessions are not authenticated accounts.

Without `HOST`, the existing all-interface binding is retained. Without `ALLOWED_ORIGINS`, the
existing unrestricted Origin behavior is retained. When configured, the allowlist must contain
exact HTTP(S) origins with no paths, trailing slash, wildcard, or `null`; missing origins are
rejected too. Invalid network-policy settings stop startup instead of silently disabling a guard.

All profiles cap open WebSockets (default 256), inbound messages (120/second, burst 240), and inbound
bytes (8 MiB/second, burst 16 MiB) before parsing JSON. Override these with `MAX_CONNECTIONS`,
`MESSAGES_PER_SECOND`, `MESSAGE_BURST`, `BYTES_PER_SECOND`, and `BYTE_BURST`, each prefixed by
`LANDRUSH_WORLD_MULTIPLAYER_`. The existing per-message payload limit still applies. Unjoined
sockets must join, watch a room, or subscribe to a parcel world within 15 seconds; heartbeat
messages do not extend this deadline. `PREJOIN_TIMEOUT_MS` changes that deadline. Leaving starts
a new deadline, and close handshakes are bounded to one second.

## Optional real-game authority

The default server needs only `ws` and `@landrush/protocol`; `npm test` exercises that release
without requiring TypeScript, the app, or a generated game bundle. Build-only workspace packages
are development dependencies.

From the full monorepo with the pinned Bun runtime, run `bun run build:zombie-game` in this package
and set `LANDRUSH_ZOMBIE_GAME_AUTHORITY=1` on the separate listener above. The generated server and
worker bundles plus canonical world manifest are required; missing artifacts stop startup. Run
`bun run test:zombie-game` to build and exercise the optional real-game integration tests.

This uses the real game's shared CPU simulation and server-accepted scene data. The server does
not accept uploaded navigation graphs or client damage/reward claims. A client must negotiate
the matching protocol, bind the canonical world, and acknowledge rendered readiness before it
can fire or be targeted. Room, night, world revision, and input sequence fence stale messages.

World compilation uses one bounded worker, with one newest pending revision per room, up to four
rooms, and a 30-second deadline including queue time. Superseded work cannot replace newer world
state. Compiled navigation caches transfer with the world; they are not regenerated during live
simulation. Failure closes that room's readiness instead of compiling on the main server thread.

### Manual Windows launcher

After building, run from this package directory in PowerShell:

```powershell
.\start-laptop-server.ps1 -Check -InitializeEmptyWorld
.\start-laptop-server.ps1 -InitializeEmptyWorld
```

`-Check` performs read-only preflight. `-InitializeEmptyWorld` is required only when intentionally
starting without a laptop save; omit it once the save exists. `-NodeExecutable` can select an
installed Node 22+ executable. The launcher never builds or downloads anything.

The launcher starts one hidden, feature-enabled process on `127.0.0.1:3004`, limited to 32
connections and the two exact origins above. It refuses an occupied port instead of replacing
another process, waits for authority readiness, and stops only its own child if startup fails.
It returns the process ID, start time, and log paths. Saves live in
`%LOCALAPPDATA%\Landrush\ZombieGameServer\data`; timestamped output and error logs live beside them
in `logs`. It never reads or copies the normal port-3003 save. At least 8 GB free is required.
Inherited Landrush settings are overridden for this child and restored in the calling shell;
tunnel tokens are not inherited by the game server.

This is manual startup only: no login task, Windows service, firewall rule, router change, or
automatic restart is installed. To stop it, verify the reported PID and start time still identify
that Node process, then stop that process. The laptop must remain awake while hosting.

### Optional tunnel, only on demand

Start an existing, separately configured named `cloudflared` tunnel only when remote access is
wanted. Its published game hostname must target `http://127.0.0.1:3004`; do not expose ports 3002,
3003, other local services, or the filesystem. The online game's WebSocket URL must use that
hostname and `/api/landrush-lab/world-multiplayer/ws`.

Keep the tunnel ID and connector credential in user-local configuration outside this repository.
Supply the credential through a process environment variable or a user-protected token file,
using the installed connector's supported options. Never paste the token into command arguments,
logs, screenshots, or committed files. Do not install the connector as a service or retrieve
credentials automatically. Stop the connector separately when remote play is finished; stopping
the game server does not manage that separately owned process. Origin filtering does not make
the public game private; add separate access controls if private access is required.

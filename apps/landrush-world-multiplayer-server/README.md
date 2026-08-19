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
was restored, backed up, or migrated without exposing the filesystem path.

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

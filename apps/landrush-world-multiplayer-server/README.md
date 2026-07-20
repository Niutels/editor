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
persistence. The default is disabled on Render unless an explicit path is configured.

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

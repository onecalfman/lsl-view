# LSLView

Web UI for discovering and viewing Lab Streaming Layer (LSL) streams on your local network.

Because browsers cannot speak the LSL protocol directly (UDP multicast discovery + data transport), this repo includes a small backend relay that uses `pylsl` to read streams and forward samples to the browser via WebSocket.

## Features

- Discover streams on your LAN (`/api/streams`)
- Stream metadata inspector (including channel labels and raw XML)
- Real-time time-series chart (Canvas, stacked/overlay, per-channel toggles)
- Event marker timeline for string streams
- Downsampling for high-rate streams

## Ports

- Frontend (nginx serving built Astro): `http://localhost:4321`
- Backend (FastAPI): `http://localhost:8765`

## Run With Docker

LSL discovery relies on UDP multicast. For this to work, the backend must run on the same network as the LSL sources.

### Linux (Recommended)

On Linux, the backend runs with host networking so multicast discovery works:

```bash
docker compose up --build
```

Open `http://localhost:4321`, click "Scan Network", then select a stream.

### Windows / macOS Docker Desktop

Docker Desktop does not reliably support the host-network + multicast setup needed for LSL discovery.

Run the backend natively, and use either the frontend container or `pnpm dev`.

Backend (requires Python + `uv`):

```bash
cd backend
uv run python server.py
```

Or from the repo root:

```bash
pnpm dev:backend
```

Frontend (Docker):

```bash
docker compose up frontend --build
```

Or frontend (local dev):

```bash
pnpm dev
```

## Mock Streams (No Hardware Needed)

In a separate terminal:

```bash
cd backend
uv run python mock_streams.py
```

Or from the repo root:

```bash
pnpm dev:mock-streams
```

Standalone mock stream project:

```bash
pnpm dev:mock
```

This publishes:

- `MockEEG` (4ch @ 256 Hz)
- `MockAccel` (3ch @ 50 Hz)
- `MockMarkers` (string markers)

Then open the UI and scan.

## Troubleshooting

- If "Scan Network" finds nothing: check firewall rules, that LSL sources are on the same LAN/VLAN, and that you are not trying to discover streams from inside a bridged Docker network.
- If you run the backend in Docker on Linux: verify `network_mode: host` is active.
- Backend health endpoint: `GET /api/health`.

## Recording

When connected to a stream, you can start a recording from the sidebar. The backend writes:

- `recordings/<timestamp>_<stream>_<id>/metadata.json` – stream + backend metadata
- `recordings/<timestamp>_<stream>_<id>/samples.ndjson` – one JSON object per sample: `{ "t": <lsl_timestamp>, "d": [...] }`
- `recordings/<timestamp>_<stream>_<id>/recording.zip` – convenience archive for download

## Repo Layout

- `src/` Astro + React UI
- `backend/` FastAPI + pylsl relay
- `docker-compose.yml` production-ish setup
- `docker-compose.dev.yml` dev setup (hot reload)

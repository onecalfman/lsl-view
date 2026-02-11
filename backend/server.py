"""
LSLView Backend - WebSocket relay for Lab Streaming Layer streams.

Discovers LSL streams on the local network, opens inlets, and relays
sample data to browser clients over WebSocket connections.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import platform
import sys
import time
import uuid
import xml.etree.ElementTree as ET
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile

import pylsl
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("lslview")

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class StreamRecord:
    """Metadata about a discovered LSL stream."""
    uid: str
    name: str
    stream_type: str
    channel_count: int
    nominal_srate: float
    channel_format: str
    source_id: str
    hostname: str
    created_at: float
    xml_desc: str
    channel_names: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "uid": self.uid,
            "name": self.name,
            "type": self.stream_type,
            "channelCount": self.channel_count,
            "nominalSrate": self.nominal_srate,
            "channelFormat": self.channel_format,
            "sourceId": self.source_id,
            "hostname": self.hostname,
            "createdAt": self.created_at,
            "xmlDesc": self.xml_desc,
            "channelNames": self.channel_names,
        }


def _parse_channel_names(info: pylsl.StreamInfo) -> list[str]:
    """Extract channel names from the LSL stream XML description."""
    names: list[str] = []
    try:
        xml_str = info.as_xml()
        root = ET.fromstring(xml_str)
        channels_el = root.find(".//channels")
        if channels_el is not None:
            for ch in channels_el.findall("channel"):
                label = ch.findtext("label", "")
                if label:
                    names.append(label)
    except Exception:
        pass
    if not names:
        names = [f"ch{i}" for i in range(info.channel_count())]
    return names


CHANNEL_FORMAT_NAMES = {
    pylsl.cf_float32: "float32",
    pylsl.cf_double64: "float64",
    pylsl.cf_string: "string",
    pylsl.cf_int8: "int8",
    pylsl.cf_int16: "int16",
    pylsl.cf_int32: "int32",
    pylsl.cf_int64: "int64",
}


def _info_to_record(info: pylsl.StreamInfo) -> StreamRecord:
    """Convert a pylsl StreamInfo to our StreamRecord model."""
    return StreamRecord(
        uid=info.uid(),
        name=info.name(),
        stream_type=info.type(),
        channel_count=info.channel_count(),
        nominal_srate=info.nominal_srate(),
        channel_format=CHANNEL_FORMAT_NAMES.get(info.channel_format(), "unknown"),
        source_id=info.source_id(),
        hostname=info.hostname(),
        created_at=info.created_at(),
        xml_desc=info.as_xml(),
        channel_names=_parse_channel_names(info),
    )


# ---------------------------------------------------------------------------
# Inlet manager – shared inlets with reference counting
# ---------------------------------------------------------------------------

@dataclass
class ManagedInlet:
    """A pylsl inlet with reference counting for shared access."""
    info: pylsl.StreamInfo
    inlet: pylsl.StreamInlet
    ref_count: int = 0
    task: asyncio.Task | None = None
    subscribers: list[asyncio.Queue] = field(default_factory=list)


class InletManager:
    """Manages shared LSL inlets – one inlet per stream, many subscribers."""

    def __init__(self) -> None:
        self._inlets: dict[str, ManagedInlet] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, stream_uid: str, info: pylsl.StreamInfo, *, queue_maxsize: int = 512) -> asyncio.Queue:
        """Subscribe to a stream. Opens an inlet if none exists."""
        async with self._lock:
            if stream_uid not in self._inlets:
                logger.info("Opening inlet for stream %s (%s)", info.name(), stream_uid)
                inlet = pylsl.StreamInlet(info, max_chunklen=32)
                try:
                    # pylsl calls are blocking; open in a thread so the asyncio
                    # event loop (health checks / websocket handshakes) stays responsive.
                    await asyncio.to_thread(inlet.open_stream, timeout=5.0)
                except Exception as e:
                    logger.error("Failed to open inlet for %s: %s", stream_uid, e)
                    raise

                managed = ManagedInlet(info=info, inlet=inlet)
                self._inlets[stream_uid] = managed
                managed.task = asyncio.create_task(self._pull_loop(stream_uid))

            managed = self._inlets[stream_uid]
            q: asyncio.Queue = asyncio.Queue(maxsize=max(1, int(queue_maxsize)))
            managed.subscribers.append(q)
            managed.ref_count += 1
            logger.info("Subscriber added to %s (refs=%d)", stream_uid, managed.ref_count)
            return q

    async def unsubscribe(self, stream_uid: str, q: asyncio.Queue) -> None:
        """Unsubscribe from a stream. Closes inlet if no subscribers remain."""
        async with self._lock:
            if stream_uid not in self._inlets:
                return
            managed = self._inlets[stream_uid]
            if q in managed.subscribers:
                managed.subscribers.remove(q)
                managed.ref_count -= 1
            logger.info("Subscriber removed from %s (refs=%d)", stream_uid, managed.ref_count)
            if managed.ref_count <= 0:
                logger.info("Closing inlet for %s", stream_uid)
                if managed.task:
                    managed.task.cancel()
                try:
                    managed.inlet.close_stream()
                except Exception:
                    pass
                del self._inlets[stream_uid]

    async def _pull_loop(self, stream_uid: str) -> None:
        """Background task that pulls samples from an inlet and fans out."""
        managed = self._inlets[stream_uid]
        inlet = managed.inlet
        is_string = managed.info.channel_format() == pylsl.cf_string

        try:
            while True:
                # Pull a chunk for efficiency
                # NOTE: pylsl pull_chunk is blocking, so run it in a thread.
                samples, timestamps = await asyncio.to_thread(inlet.pull_chunk, timeout=0.05, max_samples=32)

                if timestamps:
                    for sample, ts in zip(samples, timestamps):
                        msg = {"t": ts, "d": sample}
                        for q in list(managed.subscribers):
                            try:
                                q.put_nowait(msg)
                            except asyncio.QueueFull:
                                # Drop oldest to prevent backpressure
                                try:
                                    q.get_nowait()
                                    q.put_nowait(msg)
                                except Exception:
                                    pass
                else:
                    await asyncio.sleep(0.005)  # ~200Hz poll when idle
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("Pull loop error for %s: %s", stream_uid, e)


# ---------------------------------------------------------------------------
# Stream resolver cache
# ---------------------------------------------------------------------------

class StreamResolver:
    """Caches resolved LSL streams for quick lookup."""

    def __init__(self) -> None:
        self._streams: dict[str, StreamRecord] = {}
        self._infos: dict[str, pylsl.StreamInfo] = {}

    def resolve(self, timeout: float = 2.0) -> list[StreamRecord]:
        """Resolve all LSL streams on the network."""
        logger.info("Resolving LSL streams (timeout=%.1fs)...", timeout)
        infos = pylsl.resolve_streams(timeout)
        logger.info("Found %d streams", len(infos))

        self._streams.clear()
        self._infos.clear()
        for info in infos:
            rec = _info_to_record(info)
            self._streams[rec.uid] = rec
            self._infos[rec.uid] = info
        return list(self._streams.values())

    def get_info(self, uid: str) -> pylsl.StreamInfo | None:
        return self._infos.get(uid)

    def get_record(self, uid: str) -> StreamRecord | None:
        return self._streams.get(uid)


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

resolver = StreamResolver()
inlet_mgr = InletManager()


# ---------------------------------------------------------------------------
# Recording manager
# ---------------------------------------------------------------------------


def _iso_utc(ts: float | None = None) -> str:
    dt = datetime.fromtimestamp(ts if ts is not None else time.time(), tz=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _safe_slug(s: str) -> str:
    out = []
    for ch in s.strip():
        if ch.isalnum() or ch in ("-", "_", "."):
            out.append(ch)
        elif ch.isspace():
            out.append("-")
    slug = "".join(out).strip("-._")
    return slug[:80] if slug else "stream"


def _get_recordings_dir() -> Path:
    p = os.environ.get("LSLVIEW_RECORDINGS_DIR", "recordings")
    path = Path(p)
    path.mkdir(parents=True, exist_ok=True)
    return path


@dataclass
class RecordingSession:
    id: str
    stream_uid: str
    stream_name: str
    dir_path: Path
    meta_path: Path
    data_path: Path
    zip_path: Path
    started_at: float
    stopped_at: float | None = None
    sample_count: int = 0
    downsample: int = 1
    task: asyncio.Task | None = None
    q: asyncio.Queue | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "streamUid": self.stream_uid,
            "streamName": self.stream_name,
            "startedAt": self.started_at,
            "startedAtIso": _iso_utc(self.started_at),
            "stoppedAt": self.stopped_at,
            "stoppedAtIso": _iso_utc(self.stopped_at) if self.stopped_at else None,
            "sampleCount": self.sample_count,
            "downsample": self.downsample,
            "dir": str(self.dir_path),
            "metadata": str(self.meta_path),
            "data": str(self.data_path),
            "archive": str(self.zip_path),
            "active": self.stopped_at is None,
        }


class RecorderManager:
    def __init__(self) -> None:
        self._sessions: dict[str, RecordingSession] = {}
        self._lock = asyncio.Lock()

    async def start(self, stream_uid: str, info: pylsl.StreamInfo, rec: StreamRecord, *, label: str | None = None, downsample: int = 1) -> RecordingSession:
        downsample = max(1, int(downsample))
        async with self._lock:
            rec_id = uuid.uuid4().hex[:12]
            ts = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            name_slug = _safe_slug(label or rec.name)
            dir_path = _get_recordings_dir() / f"{ts}_{name_slug}_{rec_id}"
            dir_path.mkdir(parents=True, exist_ok=False)

            meta_path = dir_path / "metadata.json"
            data_path = dir_path / "samples.ndjson"
            zip_path = dir_path / "recording.zip"

            session = RecordingSession(
                id=rec_id,
                stream_uid=stream_uid,
                stream_name=rec.name,
                dir_path=dir_path,
                meta_path=meta_path,
                data_path=data_path,
                zip_path=zip_path,
                started_at=time.time(),
                downsample=downsample,
            )

            # Write initial metadata snapshot
            meta = {
                "recording": {
                    "id": session.id,
                    "label": label,
                    "startedAt": session.started_at,
                    "startedAtIso": _iso_utc(session.started_at),
                    "downsample": downsample,
                },
                "stream": rec.to_dict(),
                "backend": {
                    "python": sys.version,
                    "platform": platform.platform(),
                },
            }
            try:
                meta["backend"]["pylsl"] = getattr(pylsl, "__version__", None)
            except Exception:
                pass
            try:
                meta["backend"]["liblsl"] = pylsl.library_version()
            except Exception:
                pass

            meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

            # Subscribe to the inlet with a larger queue to reduce drops.
            q = await inlet_mgr.subscribe(stream_uid, info, queue_maxsize=8192)
            session.q = q
            session.task = asyncio.create_task(self._write_loop(session))
            self._sessions[rec_id] = session
            return session

    async def stop(self, rec_id: str) -> RecordingSession:
        async with self._lock:
            session = self._sessions.get(rec_id)
            if session is None:
                raise KeyError(rec_id)
            if session.stopped_at is not None:
                return session

            session.stopped_at = time.time()
            if session.task:
                session.task.cancel()
            if session.q is not None:
                await inlet_mgr.unsubscribe(session.stream_uid, session.q)

            # Update metadata with final counts
            try:
                meta = json.loads(session.meta_path.read_text(encoding="utf-8"))
            except Exception:
                meta = {}
            meta.setdefault("recording", {})
            meta["recording"].update(
                {
                    "stoppedAt": session.stopped_at,
                    "stoppedAtIso": _iso_utc(session.stopped_at),
                    "durationSeconds": max(0.0, session.stopped_at - session.started_at),
                    "sampleCount": session.sample_count,
                    "format": {
                        "data": "ndjson",
                        "schema": {"t": "lsl_timestamp", "d": "channel_data"},
                    },
                }
            )
            session.meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

            # Create an archive for easy download
            try:
                with ZipFile(session.zip_path, "w", compression=ZIP_DEFLATED) as zf:
                    zf.write(session.meta_path, arcname="metadata.json")
                    zf.write(session.data_path, arcname="samples.ndjson")
            except Exception as e:
                logger.error("Failed to create recording archive for %s: %s", rec_id, e)

            return session

    async def list(self) -> list[dict[str, Any]]:
        async with self._lock:
            return [s.to_dict() for s in self._sessions.values()]

    async def get(self, rec_id: str) -> RecordingSession | None:
        async with self._lock:
            return self._sessions.get(rec_id)

    async def _write_loop(self, session: RecordingSession) -> None:
        assert session.q is not None
        q = session.q
        ds = max(1, int(session.downsample))
        sample_idx = 0
        buf: list[str] = []
        last_flush = time.time()
        flush_interval = 0.5
        max_buf_lines = 2048

        try:
            with session.data_path.open("a", encoding="utf-8") as f:
                while True:
                    msg = await q.get()
                    sample_idx += 1
                    if sample_idx % ds != 0:
                        continue

                    session.sample_count += 1
                    buf.append(json.dumps(msg) + "\n")

                    now = time.time()
                    if len(buf) >= max_buf_lines or (now - last_flush) >= flush_interval:
                        f.write("".join(buf))
                        f.flush()
                        buf.clear()
                        last_flush = now
        except asyncio.CancelledError:
            # Final flush on cancellation
            try:
                if buf:
                    with session.data_path.open("a", encoding="utf-8") as f:
                        f.write("".join(buf))
                        f.flush()
            except Exception:
                pass
            raise
        except Exception as e:
            logger.error("Recording write loop error for %s: %s", session.id, e)


recorder = RecorderManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("LSLView backend starting...")
    yield
    logger.info("LSLView backend shutting down...")


app = FastAPI(title="LSLView Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -- REST endpoints --------------------------------------------------------

@app.get("/api/streams")
async def get_streams(timeout: float = 2.0):
    """Resolve and list all available LSL streams."""
    loop = asyncio.get_event_loop()
    streams = await loop.run_in_executor(None, resolver.resolve, timeout)
    return JSONResponse([s.to_dict() for s in streams])


@app.get("/api/streams/{uid}")
async def get_stream(uid: str):
    """Get metadata for a specific stream by UID."""
    rec = resolver.get_record(uid)
    if rec is None:
        return JSONResponse({"error": "Stream not found"}, status_code=404)
    return JSONResponse(rec.to_dict())


@app.get("/api/health")
async def health():
    return {"status": "ok", "time": time.time()}


# -- Recording endpoints ----------------------------------------------------


@app.get("/api/recordings")
async def list_recordings():
    return JSONResponse(await recorder.list())


@app.post("/api/recordings/start/{uid}")
async def start_recording(uid: str, label: str | None = None, downsample: int = 1):
    info = resolver.get_info(uid)
    rec = resolver.get_record(uid)
    if info is None or rec is None:
        return JSONResponse({"error": "Stream not found. Resolve streams first."}, status_code=404)

    try:
        session = await recorder.start(uid, info, rec, label=label, downsample=downsample)
    except Exception as e:
        return JSONResponse({"error": f"Failed to start recording: {e}"}, status_code=500)
    return JSONResponse(session.to_dict())


@app.post("/api/recordings/stop/{rec_id}")
async def stop_recording(rec_id: str):
    try:
        session = await recorder.stop(rec_id)
    except KeyError:
        return JSONResponse({"error": "Recording not found"}, status_code=404)
    except Exception as e:
        return JSONResponse({"error": f"Failed to stop recording: {e}"}, status_code=500)
    return JSONResponse(session.to_dict())


@app.get("/api/recordings/{rec_id}")
async def get_recording(rec_id: str):
    session = await recorder.get(rec_id)
    if session is None:
        return JSONResponse({"error": "Recording not found"}, status_code=404)
    return JSONResponse(session.to_dict())


@app.get("/api/recordings/{rec_id}/archive")
async def download_recording_archive(rec_id: str):
    session = await recorder.get(rec_id)
    if session is None:
        return JSONResponse({"error": "Recording not found"}, status_code=404)
    if not session.zip_path.exists():
        return JSONResponse({"error": "Archive not available"}, status_code=404)
    filename = f"lslview_{_safe_slug(session.stream_name)}_{session.id}.zip"
    return FileResponse(path=str(session.zip_path), filename=filename, media_type="application/zip")


# -- WebSocket endpoint ----------------------------------------------------

@app.websocket("/api/stream/{uid}")
async def stream_ws(ws: WebSocket, uid: str):
    """
    WebSocket endpoint to subscribe to a live LSL stream.

    Query params:
        downsample: int – keep every Nth sample (default 1 = no downsampling)
    """
    await ws.accept()

    info = resolver.get_info(uid)
    if info is None:
        await ws.send_json({"error": f"Stream {uid} not found. Resolve streams first."})
        await ws.close()
        return

    downsample = 1
    try:
        ds_param = ws.query_params.get("downsample", "1")
        downsample = max(1, int(ds_param))
    except ValueError:
        pass

    try:
        q = await inlet_mgr.subscribe(uid, info, queue_maxsize=512)
    except Exception as e:
        await ws.send_json({"error": f"Failed to open stream inlet: {e}"})
        await ws.close()
        return
    sample_idx = 0

    try:
        while True:
            msg = await q.get()
            sample_idx += 1
            if sample_idx % downsample != 0:
                continue
            await ws.send_text(json.dumps(msg))
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected from %s", uid)
    except Exception as e:
        logger.error("WebSocket error for %s: %s", uid, e)
    finally:
        await inlet_mgr.unsubscribe(uid, q)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8765,
        log_level="info",
        reload=False,
    )

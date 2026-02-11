import { useEffect } from "react";
import type { LslStream, RecordingSession } from "../lib/types";
import { getApiBase } from "../lib/utils";

interface RecordingControlsProps {
  stream: LslStream | null;
  downsample: number;
  recording: RecordingSession | null;
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
}

export function RecordingControls({
  stream,
  downsample,
  recording,
  busy,
  error,
  onStart,
  onStop,
  onRefresh,
}: RecordingControlsProps) {
  // While active, refresh periodically so sampleCount updates.
  useEffect(() => {
    if (!recording?.active) return;
    const t = setInterval(onRefresh, 1000);
    return () => clearInterval(t);
  }, [recording?.active, onRefresh]);

  const canRecord = !!stream;
  const isActive = !!recording?.active;
  const downloadUrl = recording ? `${getApiBase()}/api/recordings/${recording.id}/archive` : null;

  return (
    <div className={`recording-controls ${isActive ? "recording-active" : ""}`}>
      <div className="rec-header">
        <h3>Recording</h3>
        <span className={`rec-pill ${isActive ? "on" : "off"}`}>
          <span className="rec-dot" />
          {isActive ? "REC" : "IDLE"}
        </span>
      </div>
      {!canRecord && <div className="muted">Select a stream to enable recording.</div>}

      {canRecord && (
        <div className="rec-row">
          <button className="btn-rec-start" onClick={onStart} disabled={busy || isActive}>
            {busy && !isActive ? "Starting..." : isActive ? "Recording" : "Start recording"}
          </button>
          <button className="btn-rec-stop" onClick={onStop} disabled={busy || !isActive}>
            {busy && isActive ? "Stopping..." : "Stop"}
          </button>

          <div className="rec-meta">
            <div>
              <span className="meta-key">Downsample</span>
              <span className="mono">1/{downsample}</span>
            </div>
            {recording && (
              <div>
                <span className="meta-key">Samples</span>
                <span className="mono">{recording.sampleCount}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {recording && !recording.active && downloadUrl && (
        <div className="rec-row">
          <a className="btn-sm" href={downloadUrl}>
            Download ZIP
          </a>
          <span className="muted mono">{recording.id}</span>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

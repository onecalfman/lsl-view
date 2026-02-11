import { useEffect, useState } from "react";
import type { WsState } from "../lib/types";
import type { RecordingSession } from "../lib/types";

interface ConnectionStatusProps {
  backendUrl: string;
  wsState?: WsState;
  streamName?: string;
  recording?: RecordingSession | null;
}

export function ConnectionStatus({ backendUrl, wsState, streamName, recording }: ConnectionStatusProps) {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const checkBackend = async () => {
    setChecking(true);
    try {
      const res = await fetch(`${backendUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
      setBackendOk(res.ok);
    } catch {
      setBackendOk(false);
    }
    setChecking(false);
  };

  // Automatic health check on mount and every 5 seconds
  useEffect(() => {
    checkBackend();
    const interval = setInterval(checkBackend, 5000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  const stateColors: Record<WsState, string> = {
    connecting: "var(--color-warning)",
    open: "var(--color-success)",
    closed: "var(--color-muted)",
    error: "var(--color-error)",
  };

  const stateLabels: Record<WsState, string> = {
    connecting: "Connecting...",
    open: "Connected",
    closed: "Disconnected",
    error: "Error",
  };

  return (
    <div className="connection-status">
      <div className="status-row">
        <span className="status-label">Backend</span>
        <span
          className="status-dot"
          style={{
            backgroundColor:
              backendOk === null
                ? "var(--color-muted)"
                : backendOk
                  ? "var(--color-success)"
                  : "var(--color-error)",
          }}
        />
        <span className="status-text">
          {backendOk === null ? "Unknown" : backendOk ? "Online" : "Offline"}
        </span>
        <button className="btn-sm" onClick={checkBackend} disabled={checking}>
          {checking ? "..." : "Check"}
        </button>
      </div>

      {wsState && (
        <div className="status-row">
          <span className="status-label">Stream</span>
          <span className="status-dot" style={{ backgroundColor: stateColors[wsState] }} />
          <span className="status-text">
            {stateLabels[wsState]}
            {streamName && wsState === "open" ? ` — ${streamName}` : ""}
          </span>
        </div>
      )}

      {recording && (
        <div className="status-row">
          <span className="status-label">Rec</span>
          <span
            className={`status-dot ${recording.active ? "status-dot-rec" : ""}`}
            style={{ backgroundColor: recording.active ? "var(--color-error)" : "var(--color-muted)" }}
          />
          <span className="status-text">
            {recording.active ? `REC — ${recording.sampleCount} samples` : "Idle"}
          </span>
        </div>
      )}
    </div>
  );
}

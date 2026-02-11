import type { LslStream } from "../lib/types";
import { formatChannelFormat, formatSampleRate } from "../lib/utils";

interface StreamDiscoveryProps {
  streams: LslStream[];
  loading: boolean;
  error: string | null;
  onResolve: () => void;
  onSelect: (stream: LslStream) => void;
  selectedUid: string | null;
}

export function StreamDiscovery({
  streams,
  loading,
  error,
  onResolve,
  onSelect,
  selectedUid,
}: StreamDiscoveryProps) {
  return (
    <div className="stream-discovery">
      <div className="discovery-header">
        <h2>LSL Streams</h2>
        <button className="btn-primary" onClick={onResolve} disabled={loading}>
          {loading ? "Scanning..." : "Scan Network"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {streams.length === 0 && !loading && !error && (
        <p className="empty-state">
          No streams found. Click <strong>Scan Network</strong> to discover LSL streams on your
          local network.
        </p>
      )}

      <div className="stream-grid">
        {streams.map((s) => (
          <button
            key={s.uid}
            className={`stream-card ${selectedUid === s.uid ? "selected" : ""}`}
            onClick={() => onSelect(s)}
          >
            <div className="stream-card-header">
              <span className="stream-name">{s.name}</span>
              <span className={`stream-type-badge type-${s.type.toLowerCase()}`}>{s.type}</span>
            </div>
            <div className="stream-card-meta">
              <span>{s.channelCount} ch</span>
              <span>{formatSampleRate(s.nominalSrate)}</span>
              <span>{formatChannelFormat(s.channelFormat)}</span>
            </div>
            <div className="stream-card-host">{s.hostname}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import type { LslStream } from "../lib/types";
import { useLslStreams } from "../hooks/useLslStreams";
import { useStreamData } from "../hooks/useStreamData";
import { getApiBase } from "../lib/utils";
import { ConnectionStatus } from "./ConnectionStatus";
import { StreamDiscovery } from "./StreamDiscovery";
import { StreamMetadata } from "./StreamMetadata";
import { StreamStats } from "./StreamStats";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { EventMarkerTimeline } from "./EventMarkerTimeline";
import { RecordingControls } from "./RecordingControls";
import { useRecording } from "../hooks/useRecording";

export function App() {
  const { streams, loading, error, resolve } = useLslStreams();
  const [selectedStream, setSelectedStream] = useState<LslStream | null>(null);
  const [downsample, setDownsample] = useState(1);

  const isStringStream = selectedStream?.channelFormat === "string";

  const {
    channelBuffers,
    timestamps,
    sampleCount,
    writeHead,
    stats,
    wsState,
    disconnect,
    markers,
  } = useStreamData({
    stream: selectedStream,
    downsample,
  });

  const { recording, busy: recBusy, error: recError, start: startRec, stop: stopRec, refresh: refreshRec } =
    useRecording(selectedStream);

  const handleSelectStream = (stream: LslStream) => {
    if (selectedStream?.uid === stream.uid) {
      // Deselect
      disconnect();
      setSelectedStream(null);
    } else {
      disconnect();
      // Auto-calculate downsample for very high rate streams
      if (stream.nominalSrate > 1000) {
        setDownsample(Math.ceil(stream.nominalSrate / 500));
      } else {
        setDownsample(1);
      }
      setSelectedStream(stream);
    }
  };

  const handleStartRecording = () => {
    if (!selectedStream) return;
    // Match recording downsample to the current UI downsample.
    startRec({ downsample });
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>LSLView</h1>
          <span className="header-subtitle">Lab Streaming Layer Viewer</span>
        </div>
        <ConnectionStatus
          backendUrl={getApiBase()}
          wsState={selectedStream ? (wsState as any) : undefined}
          streamName={selectedStream?.name}
          recording={recording}
        />
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <StreamDiscovery
            streams={streams}
            loading={loading}
            error={error}
            onResolve={resolve}
            onSelect={handleSelectStream}
            selectedUid={selectedStream?.uid ?? null}
          />

          <RecordingControls
            stream={selectedStream}
            downsample={downsample}
            recording={recording}
            busy={recBusy}
            error={recError}
            onStart={handleStartRecording}
            onStop={stopRec}
            onRefresh={refreshRec}
          />

          {selectedStream && (
            <>
              <StreamMetadata stream={selectedStream} />
              {!isStringStream && (
                <div className="downsample-control">
                  <label>
                    Downsample: 1/{downsample}
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={downsample}
                      onChange={(e) => setDownsample(Number(e.target.value))}
                    />
                  </label>
                </div>
              )}
            </>
          )}
        </aside>

        <section className="main-content">
          {!selectedStream && (
            <div className="placeholder">
              <div className="placeholder-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5">
                  <path d="M2 12h4l3-9 4 18 3-9h4" />
                </svg>
              </div>
              <h2>Select a stream to visualize</h2>
              <p>Scan your network for LSL streams, then click one to connect.</p>
            </div>
          )}

          {selectedStream && !isStringStream && (
            <>
              <TimeSeriesChart
                channelBuffers={channelBuffers}
                timestamps={timestamps}
                sampleCount={sampleCount}
                writeHead={writeHead}
                channelNames={selectedStream.channelNames}
                nominalSrate={selectedStream.nominalSrate}
              />
              <StreamStats stats={stats} nominalSrate={selectedStream.nominalSrate} />
            </>
          )}

          {selectedStream && isStringStream && (
            <>
              <EventMarkerTimeline markers={markers} />
              <StreamStats stats={stats} nominalSrate={selectedStream.nominalSrate} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}

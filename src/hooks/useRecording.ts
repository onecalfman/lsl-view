import { useCallback, useEffect, useState } from "react";
import type { LslStream, RecordingSession } from "../lib/types";
import { getApiBase } from "../lib/utils";

interface UseRecordingReturn {
  recording: RecordingSession | null;
  busy: boolean;
  error: string | null;
  start: (opts?: { label?: string; downsample?: number }) => Promise<void>;
  stop: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useRecording(stream: LslStream | null): UseRecordingReturn {
  const [recording, setRecording] = useState<RecordingSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!recording) return;
    try {
      const res = await fetch(`${getApiBase()}/api/recordings/${recording.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data: RecordingSession = await res.json();
      setRecording(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh recording");
    }
  }, [recording]);

  // Clear recording when stream changes
  useEffect(() => {
    setRecording(null);
    setError(null);
    setBusy(false);
  }, [stream?.uid]);

  const start = useCallback(
    async (opts?: { label?: string; downsample?: number }) => {
      if (!stream) return;
      setBusy(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (opts?.label) params.set("label", opts.label);
        if (opts?.downsample && opts.downsample > 1) params.set("downsample", String(opts.downsample));
        const qs = params.toString();
        const res = await fetch(`${getApiBase()}/api/recordings/start/${stream.uid}${qs ? `?${qs}` : ""}`, {
          method: "POST",
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `HTTP ${res.status}: ${res.statusText}`);
        }
        const data: RecordingSession = await res.json();
        setRecording(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start recording");
      } finally {
        setBusy(false);
      }
    },
    [stream]
  );

  const stop = useCallback(async () => {
    if (!recording) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/recordings/stop/${recording.id}`, { method: "POST" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}: ${res.statusText}`);
      }
      const data: RecordingSession = await res.json();
      setRecording(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop recording");
    } finally {
      setBusy(false);
    }
  }, [recording]);

  return { recording, busy, error, start, stop, refresh };
}

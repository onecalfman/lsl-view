import { useCallback, useState } from "react";
import type { LslStream } from "../lib/types";
import { getApiBase } from "../lib/utils";

interface UseLslStreamsReturn {
  streams: LslStream[];
  loading: boolean;
  error: string | null;
  resolve: () => Promise<void>;
}

/**
 * Hook to discover LSL streams via the backend REST API.
 */
export function useLslStreams(): UseLslStreamsReturn {
  const [streams, setStreams] = useState<LslStream[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/streams?timeout=3`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data: LslStream[] = await res.json();
      setStreams(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to resolve streams";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  return { streams, loading, error, resolve };
}

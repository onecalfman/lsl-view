import { useCallback, useRef, useState } from "react";
import type { LslSample, LslStream, StreamStatistics } from "../lib/types";
import { getWsUrl } from "../lib/utils";
import { useWebSocket } from "./useWebSocket";

interface UseStreamDataOptions {
  stream: LslStream | null;
  /** Max number of samples to keep in the buffer. */
  bufferSize?: number;
  /** Keep every Nth sample (1 = keep all). */
  downsample?: number;
}

interface UseStreamDataReturn {
  /** Circular buffer of recent samples (channel-major: [ch][sampleIdx]). */
  channelBuffers: Float64Array[];
  /** Corresponding timestamps. */
  timestamps: Float64Array;
  /** How many valid samples are currently in the buffer. */
  sampleCount: number;
  /** Write head position in the circular buffer. */
  writeHead: number;
  /** Live statistics. */
  stats: StreamStatistics;
  /** WebSocket connection state. */
  wsState: string;
  /** Disconnect from the stream. */
  disconnect: () => void;
  /** Marker events (for string streams). */
  markers: Array<{ timestamp: number; value: string }>;
}

/**
 * Hook that connects to an LSL stream via WebSocket and maintains
 * a circular buffer of samples for efficient chart rendering.
 */
export function useStreamData({
  stream,
  bufferSize = 2048,
  downsample = 1,
}: UseStreamDataOptions): UseStreamDataReturn {
  const channelCount = stream?.channelCount ?? 0;
  const isStringStream = stream?.channelFormat === "string";

  // Circular buffers (allocated once per stream)
  const buffersRef = useRef<Float64Array[]>([]);
  const tsRef = useRef<Float64Array>(new Float64Array(0));
  const writeHeadRef = useRef(0);
  const sampleCountRef = useRef(0);

  // Force re-render periodically
  const [, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);

  // Stats tracking
  const statsRef = useRef<StreamStatistics>({
    actualSampleRate: 0,
    totalSamples: 0,
    latestTimestamp: 0,
    connectionUptime: 0,
  });
  const connectTimeRef = useRef(0);
  const rateWindowRef = useRef<number[]>([]);

  // Markers for string streams
  const [markers, setMarkers] = useState<Array<{ timestamp: number; value: string }>>([]);

  // Ensure buffers match current stream
  if (channelCount > 0 && buffersRef.current.length !== channelCount) {
    buffersRef.current = Array.from({ length: channelCount }, () => new Float64Array(bufferSize));
    tsRef.current = new Float64Array(bufferSize);
    writeHeadRef.current = 0;
    sampleCountRef.current = 0;
  }

  // Animation frame loop for batched re-renders (~30fps)
  const scheduleRender = useCallback(() => {
    if (dirtyRef.current && rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        dirtyRef.current = false;
        setTick((t) => t + 1);
      });
    }
  }, []);

  const onMessage = useCallback(
    (data: unknown) => {
      const sample = data as LslSample;
      if (!sample || sample.t === undefined || !sample.d) return;

      if (isStringStream) {
        // Marker stream
        const values = sample.d as string[];
        setMarkers((prev) => {
          const next = [...prev, { timestamp: sample.t, value: values.join(", ") }];
          return next.length > 500 ? next.slice(-500) : next;
        });
        return;
      }

      // Numeric stream – write into circular buffer
      const channels = sample.d as number[];
      const head = writeHeadRef.current;
      tsRef.current[head] = sample.t;
      for (let ch = 0; ch < channels.length && ch < buffersRef.current.length; ch++) {
        buffersRef.current[ch][head] = channels[ch];
      }
      writeHeadRef.current = (head + 1) % bufferSize;
      sampleCountRef.current = Math.min(sampleCountRef.current + 1, bufferSize);

      // Update stats
      const now = performance.now() / 1000;
      statsRef.current.totalSamples++;
      statsRef.current.latestTimestamp = sample.t;
      if (connectTimeRef.current > 0) {
        statsRef.current.connectionUptime = now - connectTimeRef.current;
      }

      // Track sample rate (rolling 1s window)
      rateWindowRef.current.push(now);
      const cutoff = now - 1;
      while (rateWindowRef.current.length > 0 && rateWindowRef.current[0] < cutoff) {
        rateWindowRef.current.shift();
      }
      statsRef.current.actualSampleRate = rateWindowRef.current.length;

      dirtyRef.current = true;
      scheduleRender();
    },
    [bufferSize, isStringStream, scheduleRender]
  );

  const wsUrl =
    stream && !isStringStream
      ? getWsUrl(`/api/stream/${stream.uid}${downsample > 1 ? `?downsample=${downsample}` : ""}`)
      : stream && isStringStream
        ? getWsUrl(`/api/stream/${stream.uid}`)
        : null;

  const { state: wsState, close } = useWebSocket({
    url: wsUrl,
    onMessage,
    reconnectDelay: 3000,
  });

  // Track connect time
  if (wsState === "open" && connectTimeRef.current === 0) {
    connectTimeRef.current = performance.now() / 1000;
  }
  if (wsState === "closed") {
    connectTimeRef.current = 0;
  }

  const disconnect = useCallback(() => {
    close();
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [close]);

  return {
    channelBuffers: buffersRef.current,
    timestamps: tsRef.current,
    sampleCount: sampleCountRef.current,
    writeHead: writeHeadRef.current,
    stats: { ...statsRef.current },
    wsState,
    disconnect,
    markers,
  };
}

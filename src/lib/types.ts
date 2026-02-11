/** Metadata about a discovered LSL stream. */
export interface LslStream {
  uid: string;
  name: string;
  type: string;
  channelCount: number;
  nominalSrate: number;
  channelFormat: string;
  sourceId: string;
  hostname: string;
  createdAt: number;
  xmlDesc: string;
  channelNames: string[];
}

/** A single sample received over WebSocket. */
export interface LslSample {
  /** LSL timestamp */
  t: number;
  /** Channel data (numbers for numeric streams, strings for string streams) */
  d: number[] | string[];
}

/** WebSocket connection state. */
export type WsState = "connecting" | "open" | "closed" | "error";

export interface RecordingSession {
  id: string;
  streamUid: string;
  streamName: string;
  startedAt: number;
  startedAtIso: string;
  stoppedAt: number | null;
  stoppedAtIso: string | null;
  sampleCount: number;
  downsample: number;
  archive: string;
  active: boolean;
}

/** Configuration for the time-series chart. */
export interface ChartConfig {
  /** Time window in seconds to display. */
  windowSeconds: number;
  /** Whether the chart is paused. */
  paused: boolean;
}

/** Live statistics for a connected stream. */
export interface StreamStatistics {
  actualSampleRate: number;
  totalSamples: number;
  latestTimestamp: number;
  connectionUptime: number;
}

/** Color palette for channel traces. */
export const CHANNEL_COLORS = [
  "#22d3ee", // cyan
  "#f472b6", // pink
  "#a78bfa", // violet
  "#34d399", // emerald
  "#fbbf24", // amber
  "#fb923c", // orange
  "#60a5fa", // blue
  "#e879f9", // fuchsia
  "#4ade80", // green
  "#f87171", // red
  "#818cf8", // indigo
  "#2dd4bf", // teal
  "#facc15", // yellow
  "#c084fc", // purple
  "#38bdf8", // sky
  "#fb7185", // rose
] as const;

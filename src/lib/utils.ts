/** Utility to get the backend API base URL. */
export function getApiBase(): string {
  // Use direct backend URL for health checks and API calls
  // This works both with proxy (nginx/Vite) and direct access
  if (typeof window !== "undefined") {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (isLocalhost && window.location.port === "4321") {
      // Static file server scenario - backend runs on different port
      return "http://localhost:8765";
    }
  }
  // Docker/nginx proxy scenario - /api is proxied to backend
  // Or during SSR
  return "";
}

/** Construct a WebSocket URL for a given path. */
export function getWsUrl(path: string): string {
  // In the "static nginx on :4321" mode, REST calls go directly to the backend
  // (see getApiBase), so WebSocket should also go directly to avoid relying on
  // proxying /api over WS.
  if (typeof window !== "undefined") {
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (isLocalhost && window.location.port === "4321") {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//localhost:8765${path}`;
    }
  }

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

/** Format a sample rate as human-readable. */
export function formatSampleRate(hz: number): string {
  if (hz === 0) return "Irregular";
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)} kHz`;
  return `${hz.toFixed(1)} Hz`;
}

/** Format seconds to mm:ss. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Format a channel format string for display. */
export function formatChannelFormat(fmt: string): string {
  const map: Record<string, string> = {
    float32: "32-bit Float",
    float64: "64-bit Double",
    string: "String",
    int8: "8-bit Int",
    int16: "16-bit Int",
    int32: "32-bit Int",
    int64: "64-bit Int",
  };
  return map[fmt] || fmt;
}

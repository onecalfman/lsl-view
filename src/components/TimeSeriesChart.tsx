import { useCallback, useEffect, useRef, useState } from "react";
import { CHANNEL_COLORS } from "../lib/types";

function fitTextToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;

  const ellipsis = "...";
  if (ctx.measureText(ellipsis).width > maxWidth) return "";

  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

interface TimeSeriesChartProps {
  /** Channel-major data buffers: channelBuffers[ch][sampleIdx]. */
  channelBuffers: Float64Array[];
  /** Timestamps buffer. */
  timestamps: Float64Array;
  /** Number of valid samples in the circular buffer. */
  sampleCount: number;
  /** Current write head position. */
  writeHead: number;
  /** Channel names for the legend. */
  channelNames: string[];
  /** Nominal sample rate. */
  nominalSrate: number;
  /** Time window to display (seconds). */
  windowSeconds?: number;
}

export function TimeSeriesChart({
  channelBuffers,
  timestamps,
  sampleCount,
  writeHead,
  channelNames,
  nominalSrate,
  windowSeconds: initialWindow = 5,
}: TimeSeriesChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [windowSeconds, setWindowSeconds] = useState(initialWindow);
  const [stacked, setStacked] = useState(true);
  const [visibleChannels, setVisibleChannels] = useState<Set<number>>(
    () => new Set(channelNames.map((_, i) => i))
  );

  // Update visible channels when channel count changes
  useEffect(() => {
    setVisibleChannels(new Set(channelNames.map((_, i) => i)));
  }, [channelNames.length]);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const toggleChannel = (idx: number) => {
    setVisibleChannels((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    // Background
    ctx.fillStyle = "var(--color-surface, #1a1a2e)";
    ctx.fillStyle = "#12121f";
    ctx.fillRect(0, 0, w, h);

    if (sampleCount === 0 || channelBuffers.length === 0) {
      ctx.fillStyle = "#555";
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Waiting for data...", w / 2, h / 2);
      return;
    }

    const bufLen = timestamps.length;
    const numChannels = channelBuffers.length;
    const activeChannels = Array.from(visibleChannels).filter((i) => i < numChannels).sort();
    if (activeChannels.length === 0) return;

    // Determine time range
    const latestIdx = (writeHead - 1 + bufLen) % bufLen;
    const latestTime = timestamps[latestIdx];
    const startTime = latestTime - windowSeconds;

    // Layout
    const labelFont = "12px monospace";
    ctx.font = labelFont;

    let maxLabelW = 0;
    for (const chIdx of activeChannels) {
      const label = channelNames[chIdx] || `ch${chIdx}`;
      maxLabelW = Math.max(maxLabelW, ctx.measureText(label).width);
    }

    // Keep a readable left gutter for channel labels.
    const leftGutter = Math.min(240, Math.max(90, Math.ceil(maxLabelW + 18)));

    // Collect samples in time window
    const margin = { top: 8, right: 12, bottom: 24, left: leftGutter };
    const plotW = w - margin.left - margin.right;
    const plotH = h - margin.top - margin.bottom;

    // Divider between label gutter and plot.
    ctx.strokeStyle = "#26263a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left + 0.5, margin.top);
    ctx.lineTo(margin.left + 0.5, h - margin.bottom);
    ctx.stroke();

    if (stacked) {
      // Stacked mode: each channel gets its own vertical lane
      const laneH = plotH / activeChannels.length;

      activeChannels.forEach((chIdx, laneIdx) => {
        const laneTop = margin.top + laneIdx * laneH;
        const buf = channelBuffers[chIdx];

        // Label gutter background for readability
        ctx.fillStyle = "#0d0d17";
        ctx.fillRect(0, laneTop, margin.left - 1, laneH);

        // Find min/max for this channel in the window
        let min = Infinity;
        let max = -Infinity;
        let count = 0;

        for (let i = 0; i < sampleCount; i++) {
          const idx = (writeHead - sampleCount + i + bufLen) % bufLen;
          if (timestamps[idx] < startTime) continue;
          const v = buf[idx];
          if (v < min) min = v;
          if (v > max) max = v;
          count++;
        }

        if (count === 0 || !isFinite(min) || !isFinite(max)) return;
        if (min === max) { min -= 1; max += 1; }
        const range = max - min;
        const padding = range * 0.1;
        min -= padding;
        max += padding;

        // Lane separator
        if (laneIdx > 0) {
          ctx.strokeStyle = "#333";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(margin.left, laneTop);
          ctx.lineTo(w - margin.right, laneTop);
          ctx.stroke();
        }

        // Channel label (left of plot)
        const labelColor = CHANNEL_COLORS[chIdx % CHANNEL_COLORS.length];
        const label = channelNames[chIdx] || `ch${chIdx}`;
        ctx.fillStyle = labelColor;
        ctx.font = labelFont;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(
          fitTextToWidth(ctx, label, margin.left - 14),
          margin.left - 10,
          laneTop + laneH / 2
        );

        // Draw trace
        ctx.strokeStyle = labelColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let started = false;

        for (let i = 0; i < sampleCount; i++) {
          const idx = (writeHead - sampleCount + i + bufLen) % bufLen;
          if (timestamps[idx] < startTime) continue;

          const x = margin.left + ((timestamps[idx] - startTime) / windowSeconds) * plotW;
          const y = laneTop + laneH - ((buf[idx] - min) / (max - min)) * (laneH - 2);

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      });
    } else {
      // Overlay mode: all channels share the same Y axis
      let globalMin = Infinity;
      let globalMax = -Infinity;

      for (const chIdx of activeChannels) {
        const buf = channelBuffers[chIdx];
        for (let i = 0; i < sampleCount; i++) {
          const idx = (writeHead - sampleCount + i + bufLen) % bufLen;
          if (timestamps[idx] < startTime) continue;
          const v = buf[idx];
          if (v < globalMin) globalMin = v;
          if (v > globalMax) globalMax = v;
        }
      }

      if (!isFinite(globalMin)) return;
      if (globalMin === globalMax) { globalMin -= 1; globalMax += 1; }
      const range = globalMax - globalMin;
      globalMin -= range * 0.05;
      globalMax += range * 0.05;

      // Label gutter background for readability
      ctx.fillStyle = "#0d0d17";
      ctx.fillRect(0, margin.top, margin.left - 1, plotH);

      // Grid lines
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 4; i++) {
        const y = margin.top + (i / 4) * plotH;
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(w - margin.right, y);
        ctx.stroke();

        const val = globalMax - (i / 4) * (globalMax - globalMin);
        ctx.fillStyle = "#555";
        ctx.font = "10px monospace";
        ctx.textAlign = "right";
        ctx.fillText(val.toFixed(1), margin.left - 4, y + 3);
      }

      // Draw each channel
      for (const chIdx of activeChannels) {
        // Channel label list (left of plot)
        const labelColor = CHANNEL_COLORS[chIdx % CHANNEL_COLORS.length];
        const label = channelNames[chIdx] || `ch${chIdx}`;
        ctx.fillStyle = labelColor;
        ctx.font = labelFont;
        ctx.textAlign = "right";
        ctx.textBaseline = "alphabetic";
        const labelY = margin.top + 12 + activeChannels.indexOf(chIdx) * 14;
        if (labelY < margin.top + plotH - 2) {
          ctx.fillText(
            fitTextToWidth(ctx, label, margin.left - 14),
            margin.left - 10,
            labelY
          );
        }

        const buf = channelBuffers[chIdx];
        ctx.strokeStyle = labelColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let started = false;

        for (let i = 0; i < sampleCount; i++) {
          const idx = (writeHead - sampleCount + i + bufLen) % bufLen;
          if (timestamps[idx] < startTime) continue;

          const x = margin.left + ((timestamps[idx] - startTime) / windowSeconds) * plotW;
          const y = margin.top + (1 - (buf[idx] - globalMin) / (globalMax - globalMin)) * plotH;

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    }

    // Time axis
    ctx.fillStyle = "#555";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    const timeSteps = Math.min(6, Math.ceil(windowSeconds));
    for (let i = 0; i <= timeSteps; i++) {
      const t = (i / timeSteps) * windowSeconds;
      const x = margin.left + (t / windowSeconds) * plotW;
      ctx.fillText(`-${(windowSeconds - t).toFixed(1)}s`, x, h - 4);
    }
  }, [channelBuffers, timestamps, sampleCount, writeHead, channelNames, windowSeconds, stacked, visibleChannels]);

  // Redraw on data changes
  useEffect(() => {
    if (!pausedRef.current) {
      draw();
    }
  }, [draw, sampleCount, writeHead]);

  return (
    <div className="timeseries-chart">
      <div className="chart-controls">
        <div className="control-group">
          <label>Window</label>
          <select
            value={windowSeconds}
            onChange={(e) => setWindowSeconds(Number(e.target.value))}
          >
            <option value={1}>1s</option>
            <option value={2}>2s</option>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
            <option value={30}>30s</option>
          </select>
        </div>
        <div className="control-group">
          <label>Layout</label>
          <select
            value={stacked ? "stacked" : "overlay"}
            onChange={(e) => setStacked(e.target.value === "stacked")}
          >
            <option value="stacked">Stacked</option>
            <option value="overlay">Overlay</option>
          </select>
        </div>
        <button className="btn-sm" onClick={() => setPaused(!paused)}>
          {paused ? "Resume" : "Pause"}
        </button>
      </div>

      <div className="chart-legend">
        {channelNames.map((name, i) => (
          <button
            key={i}
            className={`legend-item ${visibleChannels.has(i) ? "" : "legend-hidden"}`}
            onClick={() => toggleChannel(i)}
            style={{
              borderColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
              color: visibleChannels.has(i) ? CHANNEL_COLORS[i % CHANNEL_COLORS.length] : "#555",
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="chart-canvas-container" ref={containerRef}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

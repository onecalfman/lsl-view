import type { StreamStatistics } from "../lib/types";
import { formatDuration, formatSampleRate } from "../lib/utils";

interface StreamStatsProps {
  stats: StreamStatistics;
  nominalSrate: number;
}

export function StreamStats({ stats, nominalSrate }: StreamStatsProps) {
  const rateDeviation =
    nominalSrate > 0
      ? Math.abs(stats.actualSampleRate - nominalSrate) / nominalSrate
      : 0;

  const rateClass = rateDeviation > 0.1 ? "stat-warning" : "stat-ok";

  return (
    <div className="stream-stats">
      <h3>Live Statistics</h3>
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">Actual Rate</span>
          <span className={`stat-value ${rateClass}`}>
            {formatSampleRate(stats.actualSampleRate)}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Nominal Rate</span>
          <span className="stat-value">{formatSampleRate(nominalSrate)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Samples</span>
          <span className="stat-value">{stats.totalSamples.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Uptime</span>
          <span className="stat-value">{formatDuration(stats.connectionUptime)}</span>
        </div>
      </div>
    </div>
  );
}

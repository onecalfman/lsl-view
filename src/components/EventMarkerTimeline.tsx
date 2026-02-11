interface EventMarkerTimelineProps {
  markers: Array<{ timestamp: number; value: string }>;
}

export function EventMarkerTimeline({ markers }: EventMarkerTimelineProps) {
  if (markers.length === 0) {
    return (
      <div className="marker-timeline">
        <h3>Event Markers</h3>
        <p className="empty-state">No markers received yet.</p>
      </div>
    );
  }

  // Show most recent at the top
  const recent = markers.slice(-100).reverse();

  return (
    <div className="marker-timeline">
      <h3>Event Markers ({markers.length} total)</h3>
      <div className="marker-list">
        {recent.map((m, i) => (
          <div key={markers.length - i} className="marker-item">
            <span className="marker-dot" />
            <span className="marker-time">{m.timestamp.toFixed(3)}</span>
            <span className="marker-value">{m.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

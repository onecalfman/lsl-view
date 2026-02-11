"""
Mock LSL stream generator for testing LSLView without real hardware.

Creates fake streams:
  - A 4-channel "EEG" stream at 256 Hz (sine waves + noise)
  - An event marker stream that emits markers every few seconds

Usage:
  uv run python mock_streams.py

Requires: pylsl
"""

from __future__ import annotations

import math
import random
import time
import threading
import pylsl


def create_eeg_stream():
    """Create a mock 4-channel EEG stream at 256 Hz."""
    info = pylsl.StreamInfo(
        name="MockEEG",
        type="EEG",
        channel_count=4,
        nominal_srate=256,
        channel_format=pylsl.cf_float32,
        source_id="mock-eeg-001",
    )

    # Add channel metadata
    channels = info.desc().append_child("channels")
    for name in ["Fp1", "Fp2", "O1", "O2"]:
        ch = channels.append_child("channel")
        ch.append_child_value("label", name)
        ch.append_child_value("unit", "microvolts")
        ch.append_child_value("type", "EEG")

    outlet = pylsl.StreamOutlet(info)
    print(f"[EEG] Streaming 4-channel mock EEG at 256 Hz (source: mock-eeg-001)")

    sample_idx = 0
    dt = 1.0 / 256.0

    while True:
        t = sample_idx * dt
        sample = [
            50 * math.sin(2 * math.pi * 10 * t) + random.gauss(0, 5),   # Fp1: 10 Hz alpha
            30 * math.sin(2 * math.pi * 12 * t) + random.gauss(0, 4),   # Fp2: 12 Hz alpha
            40 * math.sin(2 * math.pi * 8 * t) + random.gauss(0, 6),    # O1: 8 Hz theta
            25 * math.sin(2 * math.pi * 20 * t) + random.gauss(0, 3),   # O2: 20 Hz beta
        ]
        outlet.push_sample(sample)
        sample_idx += 1
        time.sleep(dt)


def create_marker_stream():
    """Create a mock event marker stream."""
    info = pylsl.StreamInfo(
        name="MockMarkers",
        type="Markers",
        channel_count=1,
        nominal_srate=0,  # Irregular rate
        channel_format=pylsl.cf_string,
        source_id="mock-markers-001",
    )
    outlet = pylsl.StreamOutlet(info)
    print(f"[Markers] Streaming mock event markers (source: mock-markers-001)")

    markers = [
        "trial_start",
        "stimulus_on",
        "response",
        "stimulus_off",
        "trial_end",
        "rest_begin",
        "rest_end",
    ]

    idx = 0
    while True:
        marker = markers[idx % len(markers)]
        outlet.push_sample([marker])
        print(f"  [Marker] {marker}")
        idx += 1
        time.sleep(random.uniform(2.0, 5.0))


def create_accel_stream():
    """Create a mock 3-channel accelerometer stream at 50 Hz."""
    info = pylsl.StreamInfo(
        name="MockAccel",
        type="Accelerometer",
        channel_count=3,
        nominal_srate=50,
        channel_format=pylsl.cf_float32,
        source_id="mock-accel-001",
    )

    channels = info.desc().append_child("channels")
    for name in ["X", "Y", "Z"]:
        ch = channels.append_child("channel")
        ch.append_child_value("label", name)
        ch.append_child_value("unit", "g")

    outlet = pylsl.StreamOutlet(info)
    print(f"[Accel] Streaming 3-channel mock accelerometer at 50 Hz")

    sample_idx = 0
    dt = 1.0 / 50.0

    while True:
        t = sample_idx * dt
        sample = [
            0.02 * math.sin(2 * math.pi * 0.5 * t) + random.gauss(0, 0.01),
            0.98 + 0.01 * math.sin(2 * math.pi * 0.3 * t) + random.gauss(0, 0.005),
            0.01 * math.sin(2 * math.pi * 0.7 * t) + random.gauss(0, 0.008),
        ]
        outlet.push_sample(sample)
        sample_idx += 1
        time.sleep(dt)


if __name__ == "__main__":
    print("Starting mock LSL streams...")
    print("Press Ctrl+C to stop.\n")

    threads = [
        threading.Thread(target=create_eeg_stream, daemon=True),
        threading.Thread(target=create_marker_stream, daemon=True),
        threading.Thread(target=create_accel_stream, daemon=True),
    ]

    for t in threads:
        t.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping mock streams.")

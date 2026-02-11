#!/usr/bin/env python3
"""Mock LSL Stream Generator

Generates a mock LSL stream with random data for testing purposes.
Run with: uv run mock_lsl_stream.py
"""

import time
import random
import numpy as np
from pylsl import StreamInfo, StreamOutlet


def create_mock_stream(stream_name="MockEEG", channel_count=8, sample_rate=250):
    """Create a mock LSL stream with specified parameters."""
    
    # Create stream info
    info = StreamInfo(
        name=stream_name,
        type="EEG",
        channel_count=channel_count,
        nominal_srate=sample_rate,
        channel_format="float32",
        source_id="mock_eeg_001"
    )
    
    # Add channel labels
    channels = info.desc().append_child("channels")
    for i in range(channel_count):
        ch = channels.append_child("channel")
        ch.append_child_value("label", f"Ch{i+1}")
        ch.append_child_value("unit", "microvolts")
        ch.append_child_value("type", "EEG")
    
    # Create outlet
    outlet = StreamOutlet(info)
    print(f"Created LSL stream: '{stream_name}'")
    print(f"  Channels: {channel_count}")
    print(f"  Sample rate: {sample_rate} Hz")
    print(f"  Source ID: mock_eeg_001")
    print("\nStreaming data... Press Ctrl+C to stop\n")
    
    return outlet, sample_rate


def generate_sample(channel_count):
    """Generate a single sample with random data."""
    # Generate realistic-looking EEG-like data (mix of frequencies)
    t = time.time()
    sample = []
    for ch in range(channel_count):
        # Mix of sine waves at different frequencies + noise
        value = (
            10 * np.sin(2 * np.pi * 10 * t + ch) +  # 10 Hz (alpha)
            5 * np.sin(2 * np.pi * 20 * t + ch * 0.5) +  # 20 Hz (beta)
            2 * np.sin(2 * np.pi * 2 * t) +  # 2 Hz (delta)
            random.gauss(0, 2)  # Noise
        )
        sample.append(float(value))
    return sample


def main():
    """Main function to run the mock LSL stream."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Mock LSL Stream Generator")
    parser.add_argument("--name", default="MockEEG", help="Stream name (default: MockEEG)")
    parser.add_argument("--channels", type=int, default=8, help="Number of channels (default: 8)")
    parser.add_argument("--rate", type=int, default=250, help="Sample rate in Hz (default: 250)")
    args = parser.parse_args()
    
    outlet, sample_rate = create_mock_stream(args.name, args.channels, args.rate)
    
    sample_interval = 1.0 / sample_rate
    samples_sent = 0
    start_time = time.time()
    
    try:
        while True:
            sample = generate_sample(args.channels)
            outlet.push_sample(sample)
            samples_sent += 1
            
            # Print status every second
            elapsed = time.time() - start_time
            if int(elapsed) > int(elapsed - sample_interval):
                print(f"\rSamples sent: {samples_sent} | Rate: {samples_sent/elapsed:.1f} Hz", end="", flush=True)
            
            time.sleep(sample_interval)
            
    except KeyboardInterrupt:
        print(f"\n\nStopped. Total samples sent: {samples_sent}")


if __name__ == "__main__":
    main()

# Mock LSL Stream

A simple mock LSL (Lab Streaming Layer) stream generator for testing purposes.

## Usage

Run with uv:

```bash
uv run mock_lsl_stream.py
```

Or with custom parameters:

```bash
uv run mock_lsl_stream.py --name MyStream --channels 16 --rate 500
```

## Options

- `--name`: Stream name (default: MockEEG)
- `--channels`: Number of channels (default: 8)
- `--rate`: Sample rate in Hz (default: 250)

## Requirements

- Python 3.8+
- uv (https://github.com/astral-sh/uv)

Dependencies are automatically managed by uv via `pyproject.toml`.

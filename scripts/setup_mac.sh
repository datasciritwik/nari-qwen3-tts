#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "  Nari Qwen3-TTS: macOS Local Setup"
echo "=================================================="

# 1. Check Homebrew
if ! command -v brew &>/dev/null; then
    echo "Error: Homebrew is not installed. Please install Homebrew from https://brew.sh"
    exit 1
fi

# 2. Install audio dependencies (libsndfile and sox)
echo "Checking macOS audio system dependencies (libsndfile, sox)..."
for pkg in libsndfile sox; do
    if brew list --formula "$pkg" &>/dev/null; then
        echo "  [x] $pkg is installed."
    else
        echo "  Installing $pkg via Homebrew..."
        brew install "$pkg"
    fi
done

# 3. Check / Install uv
echo "Checking uv package manager..."
if ! command -v uv &>/dev/null; then
    echo "  Installing uv via Homebrew..."
    brew install uv
else
    echo "  [x] uv is installed ($(uv --version))."
fi

# 4. Sync Python 3.12 virtual environment
echo "Syncing Python dependencies into .venv..."
uv sync --extra codec --extra serving --extra test

# 5. Run test suite
echo "Running pytest test suite to verify installation..."
uv run pytest

echo ""
echo "=================================================="
echo "  Setup Complete! All tests passed."
echo "=================================================="
echo "Quick Commands:"
echo "  1. Run Dev Server (FastAPI + WebSocket API):"
echo "     uv run python scripts/run_mac_dev_server.py --port 8000"
echo ""
echo "  2. Run Real Speech Synthesis (MPS / CPU):"
echo "     uv run python scripts/synthesize_mac.py --text 'Hello world' --output output.wav"
echo ""
echo "  3. Run Test Suite:"
echo "     uv run pytest"
echo "=================================================="

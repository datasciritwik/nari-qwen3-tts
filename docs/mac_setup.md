# Running Nari Qwen3-TTS on macOS (Apple Silicon)

> [!NOTE]
> This documentation is part of the macOS adaptation of [Nari Qwen3-TTS](https://github.com/nari-labs/nari-qwen3-tts), originally created and developed by [Nari Labs](https://nari-labs.com).

This guide provides complete instructions for setting up, running tests, serving the API, and synthesizing speech using the Nari Qwen3-TTS repository locally on macOS.

---

## 1. Background & Why Mac Needs Special Setup

The upstream repository is specifically architected for production deployment on **NVIDIA H100 SXM GPUs** using:
- **CUDA Graph capture** (`torch.cuda.graphs.graph_pool_handle`, `CudaGraphPoolFence`)
- **FlashInfer** paged KV cache wrappers and fused kernels
- **Triton** attention math and custom sampling kernels
- **FP8 tensor math** for Talker weights

Because macOS (Apple Silicon) uses Metal (MPS) rather than CUDA:
1. The `--extra cuda` dependency bundle (`flashinfer-python`, `triton`, `ninja`) cannot be installed on macOS.
2. Direct imports of `triton` at module top-level crash on macOS unless guarded with fallback stubs.
3. The production engine pipeline requires a CUDA device, but the **FastAPI HTTP & WebSocket API**, **contract validation**, **text frontend**, **codec pipeline**, and the **entire unit test suite** (858 tests) run on macOS.
4. Real speech synthesis on Mac is supported via the integrated `qwen-tts` engine using PyTorch on Apple Silicon (`mps` or `cpu`).

---

## 2. Prerequisites

- macOS 13+ (Apple Silicon M1/M2/M3/M4 recommended)
- [Homebrew](https://brew.sh)
- [uv](https://docs.astral.sh/uv/) (`brew install uv`)

---

## 3. Quick Start (1-Click Setup)

Run the automated setup script from the root of the repository:

```bash
./scripts/setup_mac.sh
```

---

## 4. Manual Setup Step-by-Step

### Step 1: Install System Audio Libraries

On Linux, the requirement is `apt-get install -y libsndfile1 sox`. On macOS, use Homebrew:

```bash
brew install libsndfile sox
```

### Step 2: Install Python Environment with uv

Sync the environment excluding `--extra cuda`:

```bash
uv sync --extra codec --extra serving --extra test
```

This installs:
- CPython 3.12 (pinned in `.python-version`)
- PyTorch with Apple Silicon MPS and ARM64 optimizations
- `qwen-tts`, `torchaudio`, and `soundfile`
- `fastapi`, `uvicorn`, `websockets`
- `pytest`, `ruff`

### Step 3: Run the Test Suite

Run all 858 tests to verify the setup:

```bash
uv run pytest
```

Output:
```
858 passed, 1 warning in ~57s
```

---

## 5. Running the Local macOS Server

The macOS server runs the real **Qwen3-TTS** model directly on Apple Silicon using Metal Performance Shaders (`mps`):

```bash
uv run python scripts/run_mac_dev_server.py --port 8000
```

> [!TIP]
> **Mock Mode:** If you just want to test API contracts, HTTP routing, or WebSocket client logic without loading the neural network weights, pass the `--mock` flag:
> ```bash
> uv run python scripts/run_mac_dev_server.py --port 8000 --mock
> ```

### Endpoints Available:
- `GET http://127.0.0.1:8000/health`: Check service liveness
- `GET http://127.0.0.1:8000/ready`: Check engine readiness
- `GET http://127.0.0.1:8000/v1/models`: List served models
- `POST http://127.0.0.1:8000/v1/audio/speech`: Synthesize speech (WAV / PCM)
- `WS ws://127.0.0.1:8000/v1/audio/speech/ws`: WebSocket live text-to-speech stream

### Testing with curl:

```bash
# Check health
curl http://127.0.0.1:8000/health

# Check readiness
curl http://127.0.0.1:8000/ready

# Synthesize audio (WAV)
curl http://127.0.0.1:8000/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
    "input": "Hello from Nari Labs on Mac.",
    "voice": "ryan",
    "language": "english",
    "response_format": "wav",
    "stream": false
  }' \
  --output speech.wav
```

---

## 6. Running Real Speech Synthesis on Apple Silicon (MPS / CPU)

To generate actual speech audio using the Qwen3-TTS model on Apple Silicon:

```bash
uv run python scripts/synthesize_mac.py \
  --text "Hello! This is Qwen3 TTS running locally on Apple Silicon." \
  --speaker "Ryan" \
  --output output.wav
```

### Options:
- `--model`: Hugging Face model repository (default: `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`)
- `--speaker`: Speaker name (e.g. `Ryan`, `Aiden`)
- `--language`: Language (e.g. `English`, `Chinese`)
- `--instruct`: Optional style/emotion guidance (e.g. `in an excited tone`)
- `--device`: `auto` (uses MPS on Apple Silicon, fallback to CPU), `mps`, or `cpu`
- `--output`: Path to output WAV file

#!/usr/bin/env python3
"""macOS server for Nari Qwen3-TTS with real Apple Silicon (MPS / CPU) speech synthesis.

This server provides the complete Nari Qwen3-TTS API surface:
- GET /health
- GET /ready
- GET /v1/models
- POST /v1/audio/speech (Real WAV and PCM audio generation)
- WS /v1/audio/speech/ws (WebSocket live streaming)

Usage:
    # Run with real synthesis on Apple Silicon (MPS):
    uv run python scripts/run_mac_dev_server.py --port 8000

    # Run in fast mock mode (for protocol / client testing without GPU):
    uv run python scripts/run_mac_dev_server.py --port 8000 --mock
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Add src and tests to sys.path
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "tests"))
sys.path.insert(0, str(REPO_ROOT / "src"))

import numpy as np
import torch
import uvicorn
from nari_qwen3_tts.api.app import create_app
from nari_qwen3_tts.config import ApiConfig, DEFAULT_MODEL_ID
from server.fakes import (
    FakeEngine,
    FakeEngineBackend,
    FakeRequestState,
    engine_config,
    request,
)


def _normalize_markdown(text: str) -> str:
    """Normalize markdown symbols for natural speech synthesis."""
    # 1. Remove markdown heading symbols (# Heading -> Heading)
    text = re.sub(r"^(#+)\s*", "", text, flags=re.MULTILINE)
    # 2. Strip code backticks (`code` -> code)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # 3. Convert arrows (-> to 'to')
    text = re.sub(r"->", "to", text)
    # 4. Strip CLI flag dashes (--flag -> flag)
    text = re.sub(r"--([a-zA-Z0-9_-]+)", r"\1", text)
    # 5. Clean trailing slashes in identifiers (engine/ -> engine)
    text = re.sub(r"([a-zA-Z0-9_]+)/", r"\1", text)
    return text.strip()


class RealMacEngineBackend(FakeEngineBackend):
    """Real Qwen3-TTS neural speech synthesis backend running on Apple Silicon (MPS) or CPU."""

    def __init__(self, model_id: str, device: str = "auto"):
        super().__init__()
        from qwen_tts import Qwen3TTSModel

        if device == "auto":
            self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        else:
            self.device = device

        dtype = torch.bfloat16 if self.device == "mps" else torch.float32
        print(f"Loading Qwen3-TTS model ({model_id}) onto device '{self.device}' with {dtype}...")
        self.qwen_model = Qwen3TTSModel.from_pretrained(
            model_id,
            device_map=self.device,
            dtype=dtype,
        )
        self.supported_speakers = {
            s.lower(): s for s in self.qwen_model.get_supported_speakers()
        }
        print(f"Model loaded. Supported speakers: {list(self.supported_speakers.values())}")

    def admit(
        self,
        request_id: str,
        req,
        *,
        admitted_at_s: float,
        live: bool = False,
        input_finished: bool = True,
    ) -> None:
        del admitted_at_s, live
        speaker = self.supported_speakers.get((req.voice or "").lower(), "ryan")
        language = req.language or "English"

        # Normalize markdown formatting so # is not spoken as hashtag
        normalized_text = _normalize_markdown(req.text)
        # Split multi-paragraph text to ensure natural pacing and avoid model context degradation
        paragraphs = [p.strip() for p in normalized_text.split("\n\n") if p.strip()]
        if not paragraphs:
            paragraphs = [normalized_text]

        print(f"Synthesizing [{request_id}] ({len(paragraphs)} paragraph(s), voice: {speaker}, lang: {language})")

        all_audio = []
        sample_rate = 24000
        pause = np.zeros(int(sample_rate * 0.35), dtype=np.float32)

        for p in paragraphs:
            try:
                wavs, sr = self.qwen_model.generate_custom_voice(
                    text=p,
                    speaker=speaker,
                    language=language,
                )
                sample_rate = sr
                all_audio.append(wavs[0])
                if len(paragraphs) > 1:
                    all_audio.append(pause)
            except Exception as err:
                print(f"Error during synthesis for {request_id}: {err}", file=sys.stderr)

        if all_audio:
            combined = np.concatenate(all_audio)
            audio = np.clip(combined, -1.0, 1.0)
            pcm = (audio * 32767).astype(np.int16).tobytes()
        else:
            pcm = b"\0" * 480

        # Chunk audio into 1920-sample frames (3840 bytes) for smooth streaming
        chunk_size = 3840
        chunks = tuple(pcm[i : i + chunk_size] for i in range(0, len(pcm), chunk_size))
        self.requests[request_id] = FakeRequestState(chunks, input_finished=input_finished)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Nari Qwen3-TTS macOS Server (Apple Silicon MPS / CPU)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind")
    parser.add_argument("--model", default=DEFAULT_MODEL_ID, help="Served model ID")
    parser.add_argument(
        "--device",
        choices=["auto", "mps", "cpu"],
        default="auto",
        help="Device to use for synthesis ('auto' selects mps if available)",
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Run in mock mode without neural model loading (for fast protocol testing)",
    )
    parser.add_argument(
        "--startup-timeout-seconds",
        type=float,
        default=60.0,
        help="Timeout in seconds for initial readiness probe",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    print("\n" + "=" * 60)
    print("  Nari Qwen3-TTS: Starting macOS Server")
    print("=" * 60)

    if args.mock:
        print("Running in MOCK mode (test harness backend).")
        backend = FakeEngineBackend()
    else:
        backend = RealMacEngineBackend(model_id=args.model, device=args.device)

    cfg = engine_config()
    engine = FakeEngine(backend, config=cfg)

    # Perform readiness warm-up
    print("Starting engine and verifying readiness probe...")
    engine.start(request("engine ready"), timeout_s=args.startup_timeout_seconds)

    app = create_app(
        engine,
        text_frontend=engine.model.text,
        config=ApiConfig(
            command_timeout_s=300.0,
            startup_timeout_s=args.startup_timeout_seconds,
        ),
        model_id=args.model,
    )

    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    web_dir = REPO_ROOT / "web"
    if web_dir.is_dir():
        app.mount("/static", StaticFiles(directory=str(web_dir)), name="static")

        @app.get("/")
        def serve_index():
            return FileResponse(web_dir / "index.html")

    print("\n" + "=" * 60)
    print("  Nari Qwen3-TTS macOS Server is READY")
    print("=" * 60)
    print(f"  URL:         http://{args.host}:{args.port}")
    print(f"  Health:      http://{args.host}:{args.port}/health")
    print(f"  Readiness:   http://{args.host}:{args.port}/ready")
    print(f"  Models:      http://{args.host}:{args.port}/v1/models")
    print(f"  HTTP TTS:    POST http://{args.host}:{args.port}/v1/audio/speech")
    print(f"  WS TTS:      ws://{args.host}:{args.port}/v1/audio/speech/ws")
    print("=" * 60 + "\n")

    try:
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    finally:
        print("Stopping engine gracefully...")
        engine.stop(timeout_s=10.0)


if __name__ == "__main__":
    main()

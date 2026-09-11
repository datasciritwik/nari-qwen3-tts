#!/usr/bin/env python3
"""Run real speech synthesis on macOS (Apple Silicon MPS or CPU) using qwen-tts.

Usage example:
    uv run python scripts/synthesize_mac.py \
        --text "Hello, this is Qwen3 TTS running locally on Apple Silicon." \
        --speaker "Ryan" \
        --output output.wav
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import soundfile as sf
import torch


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Qwen3-TTS Local Speech Synthesis for macOS",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--model",
        default="Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        help="HuggingFace model ID or local directory path",
    )
    parser.add_argument(
        "--text",
        default="Hello from Qwen3 TTS running on Apple Silicon!",
        help="Text to synthesize",
    )
    parser.add_argument(
        "--speaker",
        default="Ryan",
        help="Speaker voice (e.g. Ryan, Aiden, etc.)",
    )
    parser.add_argument(
        "--language",
        default="English",
        help="Language (e.g. English, Chinese, etc.)",
    )
    parser.add_argument(
        "--instruct",
        default=None,
        help="Optional style or emotion instruction",
    )
    parser.add_argument(
        "--device",
        choices=["mps", "cpu", "auto"],
        default="auto",
        help="Device to use for synthesis ('auto' selects mps if available)",
    )
    parser.add_argument(
        "--output",
        default="output.wav",
        type=Path,
        help="Output WAV file path",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.device == "auto":
        target_device = "mps" if torch.backends.mps.is_available() else "cpu"
    else:
        target_device = args.device

    print(f"Loading Qwen3-TTS model: {args.model}")
    print(f"Device: {target_device} | Text: {args.text!r}")

    try:
        from qwen_tts import Qwen3TTSModel
    except ImportError as error:
        print(f"Error: qwen-tts is required. Run: uv sync --extra codec", file=sys.stderr)
        sys.exit(1)

    # Load model with PyTorch
    dtype = torch.bfloat16 if target_device == "mps" else torch.float32
    print("Loading model weights (first run will download checkpoint from Hugging Face)...")
    model = Qwen3TTSModel.from_pretrained(
        args.model,
        device_map=target_device,
        dtype=dtype,
    )

    print("Generating speech...")
    kwargs = {
        "text": args.text,
        "language": args.language,
        "speaker": args.speaker,
    }
    if args.instruct:
        kwargs["instruct"] = args.instruct

    wavs, sr = model.generate_custom_voice(**kwargs)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(args.output), wavs[0], sr)
    print(f"Synthesis successful! Audio saved to: {args.output.resolve()} (Sample Rate: {sr} Hz)")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Nari Qwen3-TTS — System-Wide CLI Tool for macOS (Apple Silicon MPS)
Run neural speech synthesis, instant playback, and studio controls from anywhere.

Examples:
    qwen-tts "Hello from anywhere in my Mac!" -p
    qwen-tts -v ryan -t "Neural speech synthesis on Apple Silicon" -o speech.wav -p
    pbpaste | qwen-tts -p
    qwen-tts voices
    qwen-tts studio
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Paths
REPO_DIR = Path(__file__).resolve().parent.parent
VENV_PYTHON = REPO_DIR / ".venv" / "bin" / "python"
SERVER_URL = "http://127.0.0.1:8000"

VOICE_CATALOG = {
    "serena": {"name": "Serena", "gender": "Female", "tone": "Warm Narrative, Expressive Storytelling"},
    "ryan": {"name": "Ryan", "gender": "Male", "tone": "Natural & Expressive Narrative"},
    "aiden": {"name": "Aiden", "gender": "Male", "tone": "Deep Resonant Baritone"},
    "vivian": {"name": "Vivian", "gender": "Female", "tone": "Bright, Clear & Dynamic"},
    "eric": {"name": "Eric", "gender": "Male", "tone": "Casual, Friendly & Conversational"},
    "dylan": {"name": "Dylan", "gender": "Male", "tone": "Calm, Meditative & Smooth"},
    "sohee": {"name": "Sohee", "gender": "Female", "tone": "Refined, Crisp & Clear"},
    "ono_anna": {"name": "Ono Anna", "gender": "Female", "tone": "Melodic, Japanese Polyglot"},
    "uncle_fu": {"name": "Uncle Fu", "gender": "Male", "tone": "Authoritative & Grounded"},
}


def print_banner() -> None:
    print("\033[1;35m⚡ Nari Qwen3-TTS\033[0m \033[2m— Apple Silicon Neural Voice Engine\033[0m")


def is_server_online() -> bool:
    try:
        req = urllib.request.Request(f"{SERVER_URL}/health", headers={"User-Agent": "qwen-tts-cli"})
        with urllib.request.urlopen(req, timeout=0.35) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode())
                return bool(data.get("alive"))
    except Exception:
        return False
    return False


def synthesize_via_api(
    text: str,
    voice: str,
    language: str,
    pace: float,
    temp: float,
    output_path: Path,
) -> bool:
    url = f"{SERVER_URL}/v1/audio/speech"
    payload = json.dumps({
        "model": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        "input": text,
        "voice": voice,
        "language": language,
        "speed": pace,
        "temperature": temp,
        "subtalker_temperature": temp,
        "response_format": "wav",
        "stream": False,
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "qwen-tts-cli"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            if resp.status == 200:
                wav_bytes = resp.read()
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_bytes(wav_bytes)
                return True
    except Exception as err:
        print(f"\033[33m[API Fallback Notice]\033[0m Server request failed ({err}). Falling back to native in-process engine...")
    return False


def synthesize_via_local(
    text: str,
    voice: str,
    language: str,
    pace: float,
    temp: float,
    instruct: str | None,
    output_path: Path,
) -> bool:
    cmd = [
        str(VENV_PYTHON),
        str(REPO_DIR / "scripts" / "synthesize_mac.py"),
        "--text", text,
        "--speaker", voice,
        "--language", language,
        "--temperature", str(temp),
        "--pace", str(pace),
        "--output", str(output_path),
    ]
    if instruct:
        cmd.extend(["--instruct", instruct])

    res = subprocess.run(cmd, cwd=str(REPO_DIR))
    return res.returncode == 0


def play_audio(audio_path: Path) -> None:
    if not audio_path.exists():
        print(f"\033[31mError: Audio file not found at {audio_path}\033[0m", file=sys.stderr)
        return
    print(f"\033[36m▶ Playing audio via afplay...\033[0m")
    try:
        subprocess.run(["afplay", str(audio_path)], check=True)
    except KeyboardInterrupt:
        print("\n\033[2mPlayback stopped.\033[0m")
    except Exception as err:
        print(f"\033[31mPlayback error: {err}\033[0m", file=sys.stderr)


def cmd_voices() -> None:
    print_banner()
    print("\n\033[1mAvailable Neural Speaker Voices (9 Total):\033[0m\n")
    print(f"  {'Key':<12} {'Speaker':<12} {'Gender':<10} {'Tone & Style'}")
    print("  " + "─" * 68)
    for key, info in VOICE_CATALOG.items():
        marker = "★" if key == "serena" else " "
        print(f" {marker} \033[1;36m{key:<12}\033[0m {info['name']:<12} {info['gender']:<10} \033[2m{info['tone']}\033[0m")
    print("\n  \033[2mUse with: qwen-tts -v <key> \"Your text here\"\033[0m\n")


def cmd_status() -> None:
    print_banner()
    online = is_server_online()
    status_str = "\033[1;32mOnline (localhost:8000)\033[0m" if online else "\033[1;33mOffline (standby)\033[0m"
    print(f"\n  • Serving Backend: {status_str}")
    print(f"  • Repository Root: \033[2m{REPO_DIR}\033[0m")
    print(f"  • Python Runtime:  \033[2m{VENV_PYTHON}\033[0m")
    print(f"  • Hardware Target: \033[1;35mApple Silicon (MPS / Metal Performance Shaders)\033[0m")
    print(f"  • Audio Codec:     24kHz 16-bit Float PCM\n")


def cmd_studio() -> None:
    print_banner()
    if not is_server_online():
        print("\033[36mStarting Nari Qwen3-TTS server on http://127.0.0.1:8000 in the background...\033[0m")
        subprocess.Popen(
            [str(VENV_PYTHON), str(REPO_DIR / "scripts" / "run_mac_dev_server.py"), "--port", "8000"],
            cwd=str(REPO_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        time.sleep(2.0)

    print("\033[1;32mOpening Neural Acoustic Studio in your browser...\033[0m")
    subprocess.run(["open", "http://127.0.0.1:8000/"])


def cmd_serve(port: int = 8000) -> None:
    print_banner()
    print(f"\033[1;32mStarting server in foreground on port {port}...\033[0m")
    try:
        subprocess.run(
            [str(VENV_PYTHON), str(REPO_DIR / "scripts" / "run_mac_dev_server.py"), "--port", str(port)],
            cwd=str(REPO_DIR),
        )
    except KeyboardInterrupt:
        print("\nServer stopped.")


def main() -> None:
    # Handle standalone subcommands cleanly without interfering with positional text
    subcmds = {"voices", "status", "studio", "serve"}
    if len(sys.argv) > 1 and sys.argv[1] in subcmds:
        subcmd = sys.argv[1]
        if subcmd == "voices":
            cmd_voices()
            return
        elif subcmd == "status":
            cmd_status()
            return
        elif subcmd == "studio":
            cmd_studio()
            return
        elif subcmd == "serve":
            port = 8000
            if "--port" in sys.argv:
                try:
                    port = int(sys.argv[sys.argv.index("--port") + 1])
                except Exception:
                    pass
            cmd_serve(port=port)
            return

    parser = argparse.ArgumentParser(
        prog="qwen-tts",
        description="⚡ Nari Qwen3-TTS — Studio-Grade Speech Synthesis on Apple Silicon\n\n"
                    "Subcommands:\n"
                    "  qwen-tts voices             List available neural speaker voices\n"
                    "  qwen-tts status             Show server and engine status\n"
                    "  qwen-tts studio             Launch web studio in browser\n"
                    "  qwen-tts serve [--port N]   Run FastAPI server in foreground",
        formatter_class=argparse.RawTextHelpFormatter,
    )

    # Core generation options
    parser.add_argument("text", nargs="?", default=None, help="Text to synthesize (or pipe via stdin)")
    parser.add_argument("-t", "--text-arg", dest="text_flag", default=None, help="Text to synthesize")
    parser.add_argument("-v", "--voice", "--speaker", default="serena", help="Speaker voice (e.g. serena, ryan, aiden)")
    parser.add_argument("-l", "--lang", "--language", default="english", help="Synthesis language (default: english)")
    parser.add_argument("-p", "--play", action="store_true", help="Play audio immediately after generation")
    parser.add_argument("-o", "--output", default="speech.wav", help="Output WAV file path (default: speech.wav)")
    parser.add_argument("--pace", "--speed", type=float, default=1.05, help="Speech cadence/pace (default: 1.05)")
    parser.add_argument("--temp", "--temperature", type=float, default=0.68, help="Sampling temperature (default: 0.68)")
    parser.add_argument("-i", "--instruct", default=None, help="Vocal tone/emotion instruction")
    parser.add_argument("--local", action="store_true", help="Force standalone local synthesis without server")
    parser.add_argument("--api", action="store_true", help="Force synthesis via local API server")

    args = parser.parse_args()

    # Determine input text
    input_text = args.text or args.text_flag
    if not input_text:
        # Check stdin pipe
        if not sys.stdin.isatty():
            input_text = sys.stdin.read().strip()

    if not input_text:
        print_banner()
        parser.print_help()
        sys.exit(0)

    input_text = input_text.strip()
    voice_key = args.voice.lower().replace(" ", "_")
    output_path = Path(args.output).expanduser().resolve()

    print_banner()
    v_info = VOICE_CATALOG.get(voice_key, {"name": args.voice, "tone": "Custom"})
    print(f"\n  • Speaker:     \033[1;36m{v_info['name']}\033[0m ({v_info['tone']})")
    print(f"  • Settings:    Pace \033[1;32m{args.pace:.2f}x\033[0m | Temp \033[1;35m{args.temp:.2f}\033[0m | Lang \033[1;34m{args.lang}\033[0m")
    print(f"  • Input:       \033[2m\"{input_text[:64]}{'...' if len(input_text) > 64 else ''}\"\033[0m ({len(input_text)} chars)")
    print(f"  • Destination: \033[2m{output_path}\033[0m")

    t0 = time.time()
    success = False

    # Decide API vs Local
    use_api = False
    if not args.local:
        if args.api or is_server_online():
            use_api = True

    if use_api:
        print("  • Mode:        \033[1;32mFast API Server (Warm MPS Engine)\033[0m")
        success = synthesize_via_api(
            text=input_text,
            voice=voice_key,
            language=args.lang,
            pace=args.pace,
            temp=args.temp,
            output_path=output_path,
        )

    if not success:
        if not use_api:
            print("  • Mode:        \033[1;35mDirect In-Process MPS Synthesis\033[0m")
        success = synthesize_via_local(
            text=input_text,
            voice=voice_key,
            language=args.lang,
            pace=args.pace,
            temp=args.temp,
            instruct=args.instruct,
            output_path=output_path,
        )

    duration = time.time() - t0

    if success and output_path.exists():
        size_kb = output_path.stat().st_size / 1024
        print(f"\n\033[1;32m✔ Synthesis Complete!\033[0m Saved \033[1m{output_path.name}\033[0m ({size_kb:.1f} KB in {duration:.2f}s)")
        if args.play:
            play_audio(output_path)
    else:
        print(f"\n\033[31m✖ Synthesis failed.\033[0m", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

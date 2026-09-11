import json
import urllib.request
import io
import soundfile as sf
import numpy as np

# 1. Natural Spoken Version (Markdown converted to clear, natural spoken prose)
NATURAL_SECTIONS = [
    "One call to the cheap model, with the three defences its quirks require.",
    "The function ask, taking prompt, schema equals None, model equals FLASH, returning Answer.",
    "agy, the Antigravity CLI on the Google AI Pro subscription, is the generation half of this project: it writes content, and the engine — which has no judgment by design — renders it. Claude is not in this path; it is for introspection and debugging, which is the whole point of the split.",
    "Three things about agy are load-bearing and were each found by it going wrong, so none of them may be quietly removed.",
    "Number one: It is an agent, not a completion endpoint. Left alone it tries to run shell commands, gets denied, and spends its only turn doing it — returning an empty response with status SUCCESS. NO_TOOLS is prepended to every prompt.",
    "Number two: The json-schema flag is not enforcement; it is implemented as a tool call. The response is prose that may contain several concatenated JSON objects — a draft, then the tool payloads — and the payloads carry toolAction and toolSummary keys that are in nobody's schema. The objects function pulls them all out and ask keeps the last one that actually validates.",
    "Number three: It repairs a schema violation by mutilating the content. Asked for three items it drafted four, then dropped one and changed initialCapacity 4 to 3 so the array lab lost the free slot it exists to show. Schema-valid, wrong. Hence check equals: a caller passes the semantic rule the schema cannot state, and a violation is a raised error, not a warning nobody reads."
]

# 2. Raw Markdown Version
RAW_SECTIONS = [
    "# One call to the cheap model, with the three defences its quirks require.",
    "ask(prompt, schema=None, model=FLASH) -> Answer",
    "`agy` (Antigravity CLI, on the Google AI Pro subscription) is the generation half of this project: it writes content, and `engine/` — which has no judgment by design — renders it. Claude is not in this path; it is for introspection and debugging, which is the whole point of the split.",
    "Three things about `agy` are load-bearing and were each found by it going wrong, so none of them may be quietly removed:",
    "1. It is an AGENT, not a completion endpoint. Left alone it tries to run shell commands, gets denied, and spends its only turn doing it — returning an EMPTY response with status SUCCESS. NO_TOOLS is prepended to every prompt.",
    "2. `--json-schema` is not enforcement; it is implemented as a tool call. The response is prose that may contain SEVERAL concatenated JSON objects — a draft, then the tool payloads — and the payloads carry `toolAction` and `toolSummary` keys that are in nobody's schema. `objects()` pulls them all out and `ask` keeps the last one that actually validates.",
    "3. It \"repairs\" a schema violation by mutilating the content. Asked for three items it drafted four, then dropped one AND changed `initialCapacity` 4 -> 3 so the array lab lost the free slot it exists to show. Schema-valid, wrong. Hence `check=`: a caller passes the semantic rule the schema cannot state, and a violation is a raised error, not a warning nobody reads."
]

def call_tts_api(text: str, voice="ryan") -> bytes:
    req_data = json.dumps({
        "model": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        "input": text,
        "voice": voice,
        "language": "english",
        "response_format": "wav"
    }).encode("utf-8")
    req = urllib.request.Request(
        "http://127.0.0.1:8000/v1/audio/speech",
        data=req_data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return resp.read()

def synthesize_sections(sections, output_file, voice="ryan"):
    all_audio = []
    sr = 24000
    pause = np.zeros(int(sr * 0.40), dtype=np.float32) # 400ms natural breathing pause

    print(f"\nSynthesizing {len(sections)} sections into {output_file} (voice: {voice})...")
    for idx, text in enumerate(sections):
        print(f"  [{idx+1}/{len(sections)}] {text[:65]}...")
        wav_bytes = call_tts_api(text, voice=voice)
        data, file_sr = sf.read(io.BytesIO(wav_bytes))
        all_audio.append(data)
        all_audio.append(pause)
        sr = file_sr

    combined = np.concatenate(all_audio)
    sf.write(output_file, combined, sr)
    duration = len(combined) / sr
    print(f"-> Saved: {output_file} ({duration:.2f}s, {len(combined)} samples)")
    return duration

if __name__ == "__main__":
    print("=== Generating Natural Spoken Speech for Blog ===")
    d1 = synthesize_sections(NATURAL_SECTIONS, "/Users/ritwiksingh/Desktop/extra/blog_spoken_natural.wav", voice="ryan")

    print("\n=== Generating Raw Markdown Speech for Blog ===")
    d2 = synthesize_sections(RAW_SECTIONS, "/Users/ritwiksingh/Desktop/extra/blog_raw_markdown.wav", voice="ryan")

    print("\nSUCCESS! Both audio files are ready for comparison.")

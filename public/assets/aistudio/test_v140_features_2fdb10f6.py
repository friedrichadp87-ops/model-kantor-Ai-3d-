import os, sys, tempfile, base64, io, time
from pathlib import Path
from PIL import Image

TEMP = Path(tempfile.mkdtemp(prefix="aicf-v140-feature-test-"))
os.environ["LOCALAPPDATA"] = str(TEMP / "local")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
import worker

# OAuth target channel selection must never silently pick the wrong channel.
candidate_a = {"id": "UC_A", "snippet": {"title": "Bible Stories 3D"}}
candidate_b = {"id": "UC_B", "snippet": {"title": "Daily Faith"}}
assert worker.select_youtube_channel_for_slot([candidate_a], "Bible Stories 3D")["id"] == "UC_A"
assert worker.select_youtube_channel_for_slot([candidate_a, candidate_b], "Bible Stories 3D")["id"] == "UC_A"
try:
    worker.select_youtube_channel_for_slot([candidate_a, candidate_b], "Bible Facts")
    raise AssertionError("Ambiguous channel selection should fail closed")
except RuntimeError as exc:
    assert "mencegah salah upload" in str(exc)

# A stale OAuth flow becomes retryable and its old flow ID is invalidated.
channel = "bible-stories-3d"
worker.connections[channel] = {"status": "connecting", "ownerUid": "owner-1", "flowId": "old-flow"}
worker.active_flows[channel] = {"ownerUid": "owner-1", "flowId": "old-flow", "startedAt": time.time() - 900}
assert worker.expire_stale_oauth_flow(channel) is True
assert worker.connections[channel]["status"] == "expired"
assert channel not in worker.active_flows

# Multi-Agent Hybrid Edition: Ollama remains primary; optional providers are disabled by default.
assert worker.CONFIG.get("ttsProvider") == "elevenlabs"
assert worker.CONFIG.get("imageProvider") in ("hybrid", "openverse", "comfyui")
assert hasattr(worker, "call_ollama_json")
assert not hasattr(worker, "make_gemini_voiceover")
assert not hasattr(worker, "run_gemini_image_generation")

# Exercise the actual FFmpeg scene renderer and the new subtle pan/zoom filter.
import math, struct, wave
audio_path = TEMP / "render-voice.wav"
sample_rate = 16000
with wave.open(str(audio_path), "wb") as wav_file:
    wav_file.setnchannels(1); wav_file.setsampwidth(2); wav_file.setframerate(sample_rate)
    frames = b"".join(struct.pack("<h", int(5000 * math.sin(2 * math.pi * 330 * i / sample_rate)))
                      for i in range(sample_rate * 24))
    wav_file.writeframes(frames)
render_dir = TEMP / "render-test"; render_dir.mkdir()
rendered_path = render_dir / "shorts.mp4"
scenes = [
    {"visualTitle": "Adegan pertama", "caption": "Cerita pertama", "narrationSegment": "Cerita pertama tentang keberanian."},
    {"visualTitle": "Adegan kedua", "caption": "Cerita kedua", "narrationSegment": "Cerita kedua mengajarkan iman."},
    {"visualTitle": "Adegan ketiga", "caption": "Penutup", "narrationSegment": "Tetap percaya kepada Tuhan."}
]
render_info = worker.render_short(scenes, [], audio_path, rendered_path, render_dir)
probe = worker.inspect_video_file(rendered_path, render_info)
assert probe["passed"] is True, probe
print(" - FFmpeg render with subtle scene movement and 720x1280/30fps QC")

print("FEATURE REGRESSION TEST: PASS")
print(" - exact / single-channel OAuth selection, ambiguous selection blocked")
print(" - stale OAuth flow expires and releases slot")
print(" - Ollama local provider configured; cloud Gemini endpoints removed")

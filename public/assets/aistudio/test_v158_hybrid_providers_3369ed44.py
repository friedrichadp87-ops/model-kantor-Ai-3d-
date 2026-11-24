import importlib.util
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("aicf_worker_v158", ROOT / "worker" / "worker.py")
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class HybridProviderTests(unittest.TestCase):
    def test_version_and_provider_defaults(self):
        self.assertEqual(worker.APP_VERSION, "1.6.5")
        self.assertEqual(worker.CONFIG.get("ollamaModel"), "qwen3:4b")
        self.assertEqual(worker.CONFIG.get("ttsProvider"), "elevenlabs")
        self.assertIn(worker.CONFIG.get("elevenLabsModel"), ("eleven_v4", "eleven_multilingual_v2"))
        self.assertIn(worker.CONFIG.get("imageProvider"), ("hybrid", "comfyui", "openverse"))
        self.assertIn(worker.CONFIG.get("whisperModel"), ("tiny", "base", "small"))

    def test_channel_voice_profiles_use_channel_override_then_default(self):
        with patch.dict(worker.CONFIG, {
            "elevenLabsVoiceId": "DefaultVoice12345",
            "elevenLabsVoiceIds": {"bible-stories-3d": "StoryVoice12345"}
        }):
            self.assertEqual(worker.configured_elevenlabs_voice_for_channel("bible-stories-3d"), "StoryVoice12345")
            self.assertEqual(worker.configured_elevenlabs_voice_for_channel("daily-faith-inspiration"), "DefaultVoice12345")
        with self.assertRaises(ValueError):
            worker.validate_elevenlabs_voice_id("invalid voice id")

    def test_local_service_rejects_non_local_host(self):
        self.assertEqual(worker.local_service_base_url("http://127.0.0.1:8188", "http://127.0.0.1:8188"), "http://127.0.0.1:8188")
        with self.assertRaises(ValueError):
            worker.local_service_base_url("https://example.com:8188", "http://127.0.0.1:8188")

    def test_groq_review_is_not_called_when_disabled(self):
        with patch.dict(worker.CONFIG, {"groqEnabled": False}):
            with patch.object(worker.requests, "post") as post:
                result = worker.call_groq_review("naskah", "judul", 45)
        self.assertFalse(result["used"])
        post.assert_not_called()

    def test_subtitle_chunks_follow_narration_not_scene_count(self):
        narration = " ".join(["Firman Tuhan menguatkan kita untuk hidup dalam kasih dan pengharapan."] * 10)
        with tempfile.TemporaryDirectory() as tmp:
            result = worker.write_subtitle_and_credit_files(
                [{"caption": "satu"} for _ in range(3)], 60, [], Path(tmp), narration
            )
            srt = Path(result["subtitleFile"]).read_text(encoding="utf-8-sig")
        cues = re.findall(r"\d+\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n(.+)", srt)
        self.assertGreater(len(cues), 3)
        def sec(stamp):
            h, m, tail = stamp.split(":")
            s, ms = tail.split(",")
            return int(h)*3600 + int(m)*60 + int(s) + int(ms)/1000
        self.assertTrue(all(sec(end)-sec(start) <= 12.01 for start, end, _ in cues))

    def test_dashboard_exposes_hybrid_provider_controls_and_transcription(self):
        html = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
        for element_id in ("groqEnabled", "elevenLabsApiKey", "elevenLabsModel", "elevenLabsVoiceId", "elevenVoiceBibleStories", "elevenVoiceDailyFaith", "elevenVoiceBibleFacts", "elevenVoiceGkin", "testElevenLabsButton", "imageProvider", "comfyuiBaseUrl", "whisperModel", "churchShortsTranscribe"):
            self.assertIn(f'id="{element_id}"', html)
        self.assertIn("/api/church-shorts/transcribe", html)
        self.assertIn("/api/providers/settings", html)
        self.assertIn("https://elevenlabs.io/app/settings/api-keys", html)
        self.assertNotIn('id="azureSpeechKey"', html)

    def test_worker_parses_provider_settings_before_handler(self):
        source = (ROOT / "worker" / "worker.py").read_text(encoding="utf-8")
        early = source.index('early_json_paths = {')
        handler = source.index('if path == "/api/providers/settings":', early)
        parsed = source.index('payload = json.loads(self.rfile.read(length).decode("utf-8"))', early)
        self.assertLess(parsed, handler)


if __name__ == "__main__":
    unittest.main()

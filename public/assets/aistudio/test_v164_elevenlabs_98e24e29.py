from pathlib import Path
import importlib.util
import re
import tempfile
import unittest
import wave
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("aicf_worker_v164_elevenlabs", ROOT / "worker" / "worker.py")
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class ElevenLabsVoiceArtistTests(unittest.TestCase):
    def test_version_defaults_and_secret_location(self):
        self.assertEqual(worker.APP_VERSION, "1.6.5")
        self.assertEqual(worker.CONFIG.get("ttsProvider"), "elevenlabs")
        self.assertEqual(worker.CONFIG.get("elevenLabsModel"), "eleven_v4")
        self.assertIn("elevenLabsApiKey", worker.PROVIDER_SECRET_FILES)
        self.assertEqual(worker.PROVIDER_SECRET_FILES["elevenLabsApiKey"].name, "elevenlabs-api-key.dpapi")

    def test_channel_voice_override_and_default(self):
        with patch.dict(worker.CONFIG, {
            "elevenLabsVoiceId": "DefaultVoice12345",
            "elevenLabsVoiceIds": {"bible-stories-3d": "StoryVoice12345"}
        }):
            self.assertEqual(worker.configured_elevenlabs_voice_for_channel("bible-stories-3d"), "StoryVoice12345")
            self.assertEqual(worker.configured_elevenlabs_voice_for_channel("daily-faith-inspiration"), "DefaultVoice12345")

    def test_voice_id_validation(self):
        self.assertEqual(worker.validate_elevenlabs_voice_id("Voice_Id-12345"), "Voice_Id-12345")
        self.assertEqual(worker.validate_elevenlabs_voice_id(""), "")
        with self.assertRaises(ValueError):
            worker.validate_elevenlabs_voice_id("bad voice id")

    def test_missing_api_key_fails_without_network_fallback(self):
        with patch.object(worker, "load_provider_secret", return_value=""):
            with patch.object(worker.requests, "post") as post:
                with self.assertRaisesRegex(RuntimeError, "ElevenLabs API Key belum dipasang"):
                    worker.elevenlabs_speech_to_wav("Halo dunia", Path("unused.wav"), "bible-stories-3d")
                post.assert_not_called()

    def test_real_mp3_to_wav_conversion_and_elevenlabs_request_shape(self):
        import imageio_ffmpeg
        import subprocess
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as temp:
            temp_dir = Path(temp)
            mp3_fixture = temp_dir / "fixture.mp3"
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
            generated = worker.run_media_command([
                ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                "-i", "sine=frequency=440:duration=1.2", "-q:a", "5", str(mp3_fixture)
            ], timeout=45)
            self.assertEqual(generated.returncode, 0, generated.stderr)
            mp3_bytes = mp3_fixture.read_bytes()
            self.assertGreater(len(mp3_bytes), 1000)

            response = SimpleNamespace(
                status_code=200,
                content=mp3_bytes,
                text="",
                raise_for_status=lambda: None,
            )
            output_wav = temp_dir / "narration.wav"
            config_patch = patch.dict(worker.CONFIG, {
                "elevenLabsModel": "eleven_v4",
                "elevenLabsVoiceId": "VoiceDefault12345",
                "elevenLabsVoiceIds": {},
            })
            with config_patch, patch.object(worker, "load_provider_secret", return_value="secret-test-key"), \
                 patch.object(worker.requests, "post", return_value=response) as post:
                info = worker.elevenlabs_speech_to_wav("Halo, ini uji narator Bahasa Indonesia.", output_wav, "daily-faith-inspiration")

            self.assertTrue(output_wav.exists())
            self.assertGreater(output_wav.stat().st_size, 2048)
            with wave.open(str(output_wav), "rb") as wav:
                self.assertEqual(wav.getframerate(), 24000)
                self.assertEqual(wav.getsampwidth(), 2)
                self.assertEqual(wav.getnchannels(), 1)
            self.assertEqual(info["provider"], "ElevenLabs")
            self.assertEqual(info["model"], "eleven_v4")
            self.assertEqual(info["voiceId"], "VoiceDefault12345")
            self.assertGreater(info["durationSeconds"], 0.5)
            args, kwargs = post.call_args
            self.assertIn("/v1/text-to-speech/VoiceDefault12345", args[0])
            self.assertEqual(kwargs["headers"]["xi-api-key"], "secret-test-key")
            self.assertEqual(kwargs["params"]["output_format"], "mp3_44100_128")
            self.assertEqual(kwargs["json"]["model_id"], "eleven_v4")
            self.assertEqual(kwargs["json"]["language_code"], "id")


    def test_long_narration_is_split_and_generated_sequentially(self):
        import imageio_ffmpeg
        with tempfile.TemporaryDirectory() as temp:
            temp_dir = Path(temp)
            mp3_fixture = temp_dir / "fixture.mp3"
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
            generated = worker.run_media_command([
                ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                "-i", "sine=frequency=520:duration=0.8", "-q:a", "5", str(mp3_fixture)
            ], timeout=45)
            self.assertEqual(generated.returncode, 0, generated.stderr)
            mp3_bytes = mp3_fixture.read_bytes()
            narration = ("Ini adalah kalimat uji untuk narasi panjang. " * 260).strip()
            chunks = worker.split_elevenlabs_narration(narration, 9000)
            self.assertGreaterEqual(len(chunks), 2)
            self.assertTrue(all(len(chunk) <= 9000 for chunk in chunks))
            normalized_source = re.sub(r"\s+", " ", narration).strip()
            normalized_chunks = " ".join(chunks)
            self.assertEqual(normalized_chunks, normalized_source)

            from types import SimpleNamespace
            response = SimpleNamespace(status_code=200, content=mp3_bytes, text="", raise_for_status=lambda: None)
            output_wav = temp_dir / "long-narration.wav"
            with patch.object(worker, "load_provider_secret", return_value="secret-test-key"), \
                 patch.dict(worker.CONFIG, {
                     "elevenLabsModel": "eleven_v4",
                     "elevenLabsVoiceId": "VoiceDefault12345",
                     "elevenLabsVoiceIds": {},
                 }), \
                 patch.object(worker.requests, "post", return_value=response) as post:
                info = worker.elevenlabs_speech_to_wav(narration, output_wav, "bible-stories-3d")

            self.assertEqual(post.call_count, len(chunks))
            self.assertEqual(info["chunks"], len(chunks))
            self.assertEqual(info["characters"], len(narration))
            with wave.open(str(output_wav), "rb") as wav:
                self.assertGreater(wav.getnframes(), int(24000 * 0.8 * len(chunks) * 0.8))

    def test_429_reports_quota_and_does_not_fallback(self):
        from types import SimpleNamespace
        response = SimpleNamespace(status_code=429, content=b"", text="quota", raise_for_status=lambda: None)
        with patch.object(worker, "load_provider_secret", return_value="secret"), \
             patch.dict(worker.CONFIG, {"elevenLabsVoiceId": "VoiceDefault12345", "elevenLabsVoiceIds": {}}), \
             patch.object(worker.requests, "post", return_value=response):
            with self.assertRaisesRegex(RuntimeError, "Batas kredit/permintaan ElevenLabs"):
                worker.elevenlabs_speech_to_wav("Halo", Path("unused.wav"), "bible-stories-3d")

    def test_dashboard_links_api_key_and_voice_library_and_has_only_elevenlabs_voice_controls(self):
        html = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="https://elevenlabs.io/app/settings/api-keys"', html)
        self.assertIn('href="https://elevenlabs.io/app/voice-library"', html)
        for control in ("elevenLabsApiKey", "elevenLabsModel", "elevenLabsVoiceId", "elevenVoiceBibleStories", "elevenVoiceDailyFaith", "elevenVoiceBibleFacts", "elevenVoiceGkin", "testElevenLabsButton"):
            self.assertIn(f'id="{control}"', html)
        self.assertNotIn('id="azureSpeechKey"', html)
        self.assertNotIn('id="azureSpeechVoice"', html)

    def test_worker_settings_and_test_routes_use_elevenlabs_only(self):
        source = (ROOT / "worker" / "worker.py").read_text(encoding="utf-8")
        self.assertIn('"/api/providers/test-elevenlabs-tts"', source)
        self.assertIn('if path == "/api/providers/test-elevenlabs-tts":', source)
        self.assertIn('early_json_paths = {"/api/providers/settings", "/api/providers/test-elevenlabs-tts"', source)
        self.assertIn('CONFIG.update({"ttsProvider":"elevenlabs"', source)
        self.assertIn('return elevenlabs_speech_to_wav(text, output_wav, channel_id, alignment_output=alignment_output)', source)


if __name__ == "__main__":
    unittest.main()

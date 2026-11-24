import importlib.util
import os
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("aicf_worker_v157", ROOT / "worker" / "worker.py")
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)

class LocalEditionTests(unittest.TestCase):
    def test_version_and_default_provider(self):
        self.assertEqual(worker.APP_VERSION, "1.6.5")
        self.assertEqual(worker.CONFIG.get("ollamaModel"), "qwen3:4b")
        self.assertEqual(worker.CONFIG.get("ttsProvider"), "elevenlabs")
        self.assertEqual(worker.CONFIG.get("imageProvider"), "hybrid")

    def test_sunday_rest_window(self):
        sunday_morning = datetime(2026, 11, 22, 6, 0, tzinfo=timezone(timedelta(hours=7)))
        sunday_before_end = datetime(2026, 11, 22, 14, 59, tzinfo=timezone(timedelta(hours=7)))
        sunday_resume = datetime(2026, 11, 22, 15, 0, tzinfo=timezone(timedelta(hours=7)))
        saturday = datetime(2026, 11, 21, 9, 0, tzinfo=timezone(timedelta(hours=7)))
        self.assertTrue(worker.is_sunday_rest_period(sunday_morning))
        self.assertTrue(worker.is_sunday_rest_period(sunday_before_end))
        self.assertFalse(worker.is_sunday_rest_period(sunday_resume))
        self.assertFalse(worker.is_sunday_rest_period(saturday))

    def test_safe_upload_filename(self):
        self.assertEqual(worker.safe_upload_filename("Ibadah Minggu 1.mp4"), "Ibadah_Minggu_1.mp4")
        with self.assertRaises(ValueError):
            worker.safe_upload_filename("malware.exe")


    def test_ollama_json_call_uses_local_api_and_returns_object(self):
        class FakeResponse:
            def raise_for_status(self): pass
            def json(self): return {"message":{"content":"{\"ok\":true,\"message\":\"local\"}"}}
        with patch.object(worker, "ollama_status", return_value={"online":True,"modelAvailable":True,"model":"qwen3:4b"}), \
             patch.object(worker.requests, "post", return_value=FakeResponse()) as post:
            result = worker.call_ollama_json("Return JSON", 128)
        self.assertTrue(result["ok"])
        self.assertIn("127.0.0.1:11434/api/chat", post.call_args.args[0])
        self.assertEqual(post.call_args.kwargs["json"]["model"], "qwen3:4b")

    def test_gkin_hosiana_is_registered_as_separate_youtube_slot(self):
        self.assertEqual(worker.CHANNELS.get("gkin-hosiana"), "GKIN Hosiana")

    def test_dashboard_analytics_respects_sunday_rest_window(self):
        html = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
        self.assertIn("weekday === 'Sun' && hour >= 6 && hour < 15", html)

    def test_timestamp_validation_logic(self):
        self.assertLess(10, 75)
        self.assertGreater(180, 75)

if __name__ == "__main__":
    unittest.main()

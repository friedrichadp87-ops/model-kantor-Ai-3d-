import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("aicf_worker_v162", ROOT / "worker" / "worker.py")
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class ReliabilityV162Tests(unittest.TestCase):
    def test_version_and_firestore_guardian_policy(self):
        self.assertEqual(worker.APP_VERSION, "1.6.5")
        rules = (ROOT / "firestore.rules").read_text(encoding="utf-8")
        self.assertIn("'operationalMode']", rules)
        self.assertIn("optionalString(data, 'operationalMode', 40)", rules)
        for agent in ("theological-guardian", "pastoral-sensitivity", "community-prayer-manager"):
            self.assertIn(f"'{agent}'", rules)
        for task_type in ("theological_review", "pastoral_sensitivity"):
            self.assertIn(f"'{task_type}'", rules)

    def test_cloudflare_pages_origin_is_allowed(self):
        self.assertTrue(worker.allowed_origin("https://kantor-ai.pages.dev"))
        self.assertTrue(worker.allowed_origin("https://team-123.pages.dev"))
        self.assertTrue(worker.allowed_origin("https://officecontent.netlify.app"))
        self.assertFalse(worker.allowed_origin("https://kantor-ai.netlify.app"))
        self.assertFalse(worker.allowed_origin("https://pages.dev.evil.example"))

    def test_bible_parser_returns_repaired_payload(self):
        source = '[{"kitab":"Kejadian","pasal":1,"ayat":1,"teks":"Pada mulanya"}'
        rows, repaired, stats, payload = worker._parse_local_bible_json(source)
        self.assertTrue(repaired)
        self.assertEqual(len(rows), 1)
        self.assertIsInstance(payload, list)
        self.assertEqual(payload[0]["kitab"], "Kejadian")
        self.assertEqual(stats["invalidRowCount"], 0)

    def test_inspirational_script_without_explicit_verse_is_not_blocked_only_for_missing_citation(self):
        model_result = {
            "status": "LULUS", "versesChecked": [], "fatalErrors": [], "problems": [],
            "suggestions": [], "manualVerification": [], "pastoralNote": "Nada menguatkan.",
            "summary": "Tidak ada masalah teologis yang terdeteksi."
        }
        with patch.object(worker, "tb_production_source_ready", return_value=False), \
             patch.object(worker, "call_ollama_json", return_value=model_result):
            result = worker.run_theological_guardian(
                "Ketika hari terasa berat, tetaplah memiliki pengharapan dan berdoa.",
                title="Renungan pagi", channel_id="daily-faith-inspiration"
            )
        self.assertEqual(result["status"], "LULUS")
        self.assertEqual(result["fatalErrors"], [])
        self.assertTrue(result["manualVerification"])

    def test_ollama_context_is_at_least_8192(self):
        class FakeResponse:
            def raise_for_status(self):
                pass
            def json(self):
                return {"message": {"content": '{"ok": true}'}}
        with patch.object(worker, "ollama_status", return_value={"online": True, "modelAvailable": True}), \
             patch.object(worker, "assert_working_day"), \
             patch.object(worker.requests, "post", return_value=FakeResponse()) as post:
            worker.call_ollama_json("Prompt uji", max_output_tokens=256)
        body = post.call_args.kwargs["json"]
        self.assertGreaterEqual(body["options"]["num_ctx"], 8192)

    def test_worker_render_analytics_and_upload_safety_fixes_are_present(self):
        source = (ROOT / "worker" / "worker.py").read_text(encoding="utf-8")
        self.assertIn('DASHBOARD_URL = "https://officecontent.netlify.app/"', source)
        self.assertIn(r"https://[A-Za-z0-9-]+\.pages\.dev", source)
        self.assertIn('item for item in channel_items if str(item.get("id") or "") == expected_channel_id', source)
        self.assertIn('days = int(payload.get("days") or 30)', source)
        self.assertIn('combined_filter = f"[0:v]{video_filter}[vout];{audio_filter}"', source)
        self.assertIn('"-filter_complex", combined_filter', source)
        self.assertIn('"-map", "[vout]", "-map", "[aout]"', source)
        self.assertIn('"ffmpegSubtitlesFilterAvailable": ffmpeg_status["subtitlesFilterAvailable"]', source)
        self.assertIn('if guardian_status == "DITOLAK":', source)
        self.assertIn('path.as_posix()', source)

    def test_dashboard_fixups_are_present(self):
        html = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
        default_settings = html.split("const DEFAULT_SETTINGS = {", 1)[1].split("};", 1)[0]
        self.assertNotIn("operationalMode", default_settings)
        self.assertIn("() => syncAllAnalytics()", html)
        self.assertIn("${CHANNELS.length} channel tersinkronisasi", html)
        self.assertIn("bibleSeriesPollTimer = null", html)
        self.assertIn("data-wf-manual-upload", html)
        self.assertIn("manualOverride: true", html)
        self.assertIn("guardianStatus !== 'DITOLAK'", html)
        worker_source = (ROOT / "worker" / "worker.py").read_text(encoding="utf-8")
        self.assertIn('if guardian_status == "DITOLAK":', worker_source)
        self.assertIn('days = int(payload.get("days") or 30)', worker_source)
        self.assertIn('path.as_posix()', worker_source)
        self.assertIn('"ffmpegSubtitlesFilterAvailable"', worker_source)
        for select_id in ("wfChannel", "bibleSeriesChannel", "guardianChannel", "communityChannel", "jobChannel"):
            select = re_search_select(html, select_id)
            self.assertIn('value="gkin-hosiana"', select)
        for agent_id in ("theological-guardian", "pastoral-sensitivity", "community-prayer-manager"):
            self.assertIn(f'"{agent_id}"', html)


def re_search_select(html, select_id):
    import re
    match = re.search(r'<select id="' + re.escape(select_id) + r'">(.*?)</select>', html, re.S)
    if not match:
        raise AssertionError(f"Select {select_id} not found")
    return match.group(1)


if __name__ == "__main__":
    unittest.main()

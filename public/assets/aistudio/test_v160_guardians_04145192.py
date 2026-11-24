import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("aicf_worker_v160", ROOT / "worker" / "worker.py")
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class GuardianAgentTests(unittest.TestCase):
    def test_version_and_agent_registry(self):
        self.assertEqual(worker.APP_VERSION, "1.6.5")
        ids = [row[0] for row in worker.AGENT_META]
        self.assertIn("theological-guardian", ids)
        self.assertIn("pastoral-sensitivity", ids)
        self.assertIn("community-prayer-manager", ids)

    def test_extracts_indonesian_bible_references(self):
        references = worker.extract_guardian_references(
            "Baca Keluaran 14:21-31 dan 1 Samuel 17:4–7. Bandingkan juga Mazmur 23.",
            "Yohanes 3:16"
        )
        self.assertEqual(references, ["Keluaran 14:21-31", "1 Samuel 17:4-7", "Mazmur 23", "Yohanes 3:16"])

    def _local_bible_fixture(self, directory: str) -> Path:
        path = Path(directory) / "uploaded-bible.json"
        payload = {
            "report": {"sourceName": "fixture TB", "sourceMetadata": {"name": "Terjemahan Baru"}},
            "verses": [
                {"bookId": "kejadian", "chapter": 1, "verse": 1, "text": "Pada mulanya Allah menciptakan langit dan bumi."},
                {"bookId": "kejadian", "chapter": 1, "verse": 2, "text": "Bumi belum berbentuk dan kosong."},
                {"bookId": "kejadian", "chapter": 1, "verse": 3, "text": "Berfirmanlah Allah: Jadilah terang."},
            ],
        }
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        return path

    def test_fetches_verse_range_and_whole_chapter_from_local_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._local_bible_fixture(tmp)
            with patch.object(worker, "LOCAL_BIBLE_JSON_FILE", path), patch.dict(worker.CONFIG, {"localBibleTermsAcknowledged": True}):
                worker._LOCAL_BIBLE_INDEX = None
                worker._LOCAL_BIBLE_CACHE_MTIME = None
                passage = worker.fetch_guardian_tb_reference("Kejadian 1:1-2")
                chapter = worker.fetch_guardian_tb_reference("Kejadian 1")
            self.assertEqual(passage["verseCount"], 2)
            self.assertIn("Pada mulanya Allah", passage["text"])
            self.assertEqual(chapter["verseCount"], 3)

    def test_missing_tb_source_forces_manual_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing.json"
            with patch.object(worker, "LOCAL_BIBLE_JSON_FILE", missing), patch.dict(worker.CONFIG, {"localBibleTermsAcknowledged": False}):
                with patch.object(worker, "call_ollama_json", return_value={"status": "LULUS", "versesChecked": [], "fatalErrors": [], "problems": [], "suggestions": [], "manualVerification": [], "summary": "Tidak ditemukan masalah."}):
                    result = worker.run_theological_guardian("Cerita ini merujuk Kejadian 1:1.", "Uji")
            self.assertEqual(result["status"], "PERLU REVISI")
            self.assertTrue(result["manualVerification"])

    def test_theological_guardian_uses_local_verse_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._local_bible_fixture(tmp)
            llm_result = {"status": "LULUS", "versesChecked": [{"reference": "Kejadian 1:1-2", "verdict": "Isi sesuai sumber", "correction": ""}], "fatalErrors": [], "problems": [], "suggestions": [], "manualVerification": [], "summary": "Rujukan sesuai."}
            with patch.object(worker, "LOCAL_BIBLE_JSON_FILE", path), patch.dict(worker.CONFIG, {"localBibleTermsAcknowledged": True}):
                worker._LOCAL_BIBLE_INDEX = None
                worker._LOCAL_BIBLE_CACHE_MTIME = None
                with patch.object(worker, "call_ollama_json", return_value=llm_result) as call:
                    result = worker.run_theological_guardian("Kejadian 1:1-2 mengajar bahwa Allah menciptakan.", "Penciptaan")
            self.assertEqual(result["status"], "LULUS")
            self.assertEqual(result["referencesDetected"], ["Kejadian 1:1-2"])
            self.assertIn("Pada mulanya Allah", call.call_args.args[0])

    def test_sensitivity_findings_prevent_lulus(self):
        with patch.object(worker, "call_ollama_json", return_value={
            "status": "LULUS",
            "findings": [{"original": "Kamu sakit karena dosa", "problem": "Menghakimi orang sakit", "safeReplacement": "Kiranya Tuhan menguatkanmu."}],
            "summary": "Perlu perbaikan."
        }):
            result = worker.run_pastoral_sensitivity_checker("Kamu sakit karena dosa.", "Naskah uji")
        self.assertEqual(result["status"], "PERLU REVISI")
        self.assertEqual(len(result["findings"]), 1)

    def test_community_reply_is_limited_to_three_sentences(self):
        with patch.object(worker, "call_ollama_json", return_value={
            "reply": "Kami turut mendoakan. Tuhan menguatkan. Tetap semangat. Ada harapan. Amin.",
            "careFlag": "normal", "note": "Tinjau sebelum dikirim."
        }):
            result = worker.generate_community_prayer_reply("Tolong doakan saya", "daily-faith-inspiration")
        self.assertLessEqual(len([x for x in result["reply"].split(".") if x.strip()]), 3)

    def test_review_history_is_saved_to_local_sqlite(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "guardian-test.sqlite3"
            with patch.object(worker, "TASK_DB", db_path):
                worker.init_workforce_db()
                review_id = worker.save_guardian_review("owner-1", "daily-faith-inspiration", "Uji", "sensitivity", "Naskah", {"status": "LULUS", "summary": "Aman"})
                items = worker.list_guardian_reviews("owner-1")
            self.assertTrue(review_id)
            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]["review_type"], "sensitivity")
            self.assertEqual(items[0]["status"], "LULUS")

    def test_dashboard_has_guardian_and_community_controls(self):
        html = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
        for element_id in ("guardians", "guardianScript", "runBothGuardians", "theologicalResult", "sensitivityResult", "communityComment", "generateCommunityReply", "guardianHistory"):
            self.assertIn(f'id="{element_id}"', html)
        self.assertIn("/api/guardians/theological", html)
        self.assertIn("/api/guardians/sensitivity", html)
        self.assertIn("/api/community/reply", html)

    def test_worker_has_local_review_routes_and_pipeline_gate(self):
        source = (ROOT / "worker" / "worker.py").read_text(encoding="utf-8")
        self.assertIn('"/api/guardians/theological"', source)
        self.assertIn('"/api/guardians/sensitivity"', source)
        self.assertIn('"/api/community/reply"', source)
        self.assertIn('qc_passed = ai_passed and bool(technical_qc.get("passed", False)) and guardian_gate_passed', source)
        self.assertIn('"guardianGatePassed": guardian_gate_passed', source)


if __name__ == "__main__":
    unittest.main()

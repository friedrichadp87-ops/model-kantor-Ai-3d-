import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from contextlib import closing
from unittest.mock import patch

TEST_ROOT = Path(tempfile.mkdtemp(prefix="aicf-v155-tests-"))
os.environ["LOCALAPPDATA"] = str(TEST_ROOT / "localappdata")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
import worker


class BibleSeriesV155Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="aicf-v155-case-")
        self.base = Path(self.temp.name)
        self.owner = "owner-" + self.base.name
        self.local_file = self.base / "uploaded-bible.json"
        self.patches = [
            patch.object(worker, "LOCAL_BIBLE_JSON_FILE", self.local_file),
            patch.object(worker, "TASK_DB", self.base / "tasks.sqlite3"),
            patch.dict(worker.CONFIG, {"localBibleTermsAcknowledged": False}),
        ]
        for item in self.patches:
            item.start()
        worker._LOCAL_BIBLE_INDEX = None
        worker._LOCAL_BIBLE_CACHE_MTIME = None
        worker.init_workforce_db()

    def tearDown(self):
        worker._LOCAL_BIBLE_INDEX = None
        worker._LOCAL_BIBLE_CACHE_MTIME = None
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def _write_source(self, verses, metadata=None):
        payload = {
            "metadata": metadata or {"name": "Terjemahan Baru", "module": "indo_tb", "year": "1994"},
            "report": {"sourceName": "indo_tb.json", "sourceMetadata": metadata or {"name": "Terjemahan Baru", "year": "1994"}},
            "verses": verses,
        }
        self.local_file.parent.mkdir(parents=True, exist_ok=True)
        self.local_file.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        worker._LOCAL_BIBLE_INDEX = None
        worker._LOCAL_BIBLE_CACHE_MTIME = None
        return payload

    def _create_test_series(self, auto_queue=False):
        selected, label, scope_id = worker.bible_scope_books("book", book_id="kejadian")
        return worker.db_create_bible_series(
            self.owner,
            {"scopeType": "book", "channelId": "bible-stories-3d", "title": "Seri Kejadian", "autoQueue": auto_queue},
            selected, label, scope_id,
        )

    def _insert_episode(self, series_id, episode_id, sequence, reference, title=None, book_id="kejadian", book_name="Kejadian"):
        book = worker.BIBLE_BOOK_INDEX[book_id]
        now = worker.time.time() + sequence / 1000
        row = (
            episode_id, series_id, self.owner, sequence, book_id, book_name,
            book["testament"], book["groupId"], title or f"Episode {sequence}",
            "Ringkasan", reference, "Tema", "Pesan", "Hook", "planned", 45,
            None, json.dumps({}), now, now,
        )
        with worker.task_db_connection() as con:
            con.execute(
                """INSERT INTO bible_episodes(
                    episode_id,series_id,owner_uid,sequence_no,book_id,book_name,testament,group_id,
                    title,summary,reference,central_theme,teaching_point,hook,status,target_duration_seconds,
                    task_id,payload_json,created_at,updated_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", row
            )
            con.execute("UPDATE bible_series SET status='planned' WHERE series_id=?", (series_id,))
            con.commit()

    def test_protestant_catalog_has_66_books_and_1189_chapters(self):
        catalog = worker.bible_catalog_payload()
        self.assertEqual(catalog["oldTestamentCount"], 39)
        self.assertEqual(catalog["newTestamentCount"], 27)
        self.assertEqual(catalog["totalBooks"], 66)
        self.assertEqual(catalog["totalChapters"], 1189)
        self.assertEqual(len(catalog["groups"]), 10)

    def test_bible_reference_parser_and_canonical_custom_scope(self):
        parsed = worker.parse_bible_reference("1 Samuel 17:4-11")
        self.assertEqual(parsed["bookId"], "1-samuel")
        self.assertEqual(parsed["chapter"], 17)
        selected, _, _ = worker.bible_scope_books("custom", selected_ids=["wahyu", "markus", "kejadian"])
        self.assertEqual([book["id"] for book in selected], ["kejadian", "markus", "wahyu"])

    def test_imports_native_indo_tb_json_metadata_verses_shape(self):
        raw = {
            "metadata": {
                "name": "Terjemahan Baru", "shortname": "Indonesian TB", "module": "indo_tb",
                "year": "1994", "publisher": "Lembaga Alkitab Indonesia",
                "owner": "Lembaga Alkitab Indonesia", "copyright_statement":
                "Copyright Lembaga Alkitab Indonesia, 1994. Released for non-profit scholarly and personal use. Not to be sold for profit.",
                "official": 1, "research": 1,
            },
            "verses": [
                {"book_name": "Kejadian", "book": 1, "chapter": 1, "verse": 1, "text": "Pada mulanya Allah menciptakan langit dan bumi."},
                {"book_name": "Kejadian", "book": 1, "chapter": 1, "verse": 2, "text": "Bumi belum berbentuk dan kosong."},
                {"book_name": "Kisah Rasul-rasul", "book": 44, "chapter": 1, "verse": 1, "text": "Hai Teofilus..."},
            ],
        }
        rows, repaired, stats, payload = worker._parse_local_bible_json(json.dumps(raw, ensure_ascii=False))
        self.assertFalse(repaired)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[2]["bookId"], worker._BIBLE_BOOK_ID_BY_NUMBER[44])
        self.assertEqual(rows[2]["bookName"], "Kisah Para Rasul")
        self.assertEqual(stats["invalidRowCount"], 0)
        report = worker.import_local_bible_json(json.dumps(raw, ensure_ascii=False).encode("utf-8"), "indo_tb.json")
        self.assertEqual(report["indexedVerseCount"], 3)
        self.assertEqual(report["sourceMetadata"]["module"], "indo_tb")
        self.assertIn("Not to be sold for profit", report["sourceTermsNotice"])
        stored = json.loads(self.local_file.read_text(encoding="utf-8"))
        self.assertEqual(stored["source"], "user-uploaded-bible-json")
        self.assertEqual(len(stored["verses"]), 3)

    def test_importer_still_accepts_legacy_webpresenter_rows(self):
        raw = json.dumps([
            {"kitab": "Kejadian", "pasal": 1, "ayat": 1, "teks": "Pada mulanya"},
            {"kitab": "Keluaran", "pasal": 1, "ayat": 1, "teks": "Musa"},
        ], ensure_ascii=False)
        rows, repaired, stats, payload = worker._parse_local_bible_json(raw)
        self.assertFalse(repaired)
        self.assertEqual([row["bookId"] for row in rows], ["kejadian", "keluaran"])
        self.assertEqual(stats["invalidRowCount"], 0)

    def test_uploaded_json_is_the_only_production_source(self):
        self.assertFalse(worker.tb_production_source_ready())
        self._write_source([{"bookId": "kejadian", "chapter": 1, "verse": 1, "text": "Ayat satu"}])
        self.assertFalse(worker.tb_production_source_ready())
        worker.CONFIG["localBibleTermsAcknowledged"] = True
        self.assertTrue(worker.tb_production_source_ready())
        self.assertEqual(worker.bible_source_status_payload()["sourceProvider"], "File JSON diunggah · Terjemahan Baru")

    def test_local_passage_requires_every_verse_in_the_reference(self):
        self._write_source([
            {"bookId": "kejadian", "chapter": 1, "verse": 1, "text": "Ayat satu"},
            {"bookId": "kejadian", "chapter": 1, "verse": 2, "text": "Ayat dua"},
        ])
        passage = worker.fetch_local_tb_passage("Kejadian 1:1-2")
        self.assertIn("Ayat satu", passage["text"])
        self.assertIn("Ayat dua", passage["text"])
        with self.assertRaisesRegex(RuntimeError, "tidak memiliki ayat"):
            worker.fetch_local_tb_passage("Kejadian 1:1-3")

    def test_series_defaults_to_waiting_for_uploaded_json(self):
        series_id = self._create_test_series(auto_queue=True)
        series = worker.db_get_bible_series(series_id, self.owner)
        self.assertTrue(series["autoQueue"])
        self.assertEqual(series["source_status"], "pending_local_json")

    def test_queue_waits_for_uploaded_json_and_terms_acknowledgement(self):
        series_id = self._create_test_series(auto_queue=False)
        self._insert_episode(series_id, "episode-1", 1, "Kejadian 1:1-2")
        with patch.object(worker, "assert_working_day", return_value=None):
            with self.assertRaisesRegex(worker.BibleQueueBlockedError, "unggah indo_tb.json"):
                worker.queue_bible_series_episodes(series_id, self.owner)
        self._write_source([
            {"bookId": "kejadian", "chapter": 1, "verse": 1, "text": "Ayat satu"},
            {"bookId": "kejadian", "chapter": 1, "verse": 2, "text": "Ayat dua"},
        ])
        with patch.object(worker, "assert_working_day", return_value=None):
            with self.assertRaisesRegex(worker.BibleQueueBlockedError, "unggah indo_tb.json"):
                worker.queue_bible_series_episodes(series_id, self.owner)
        worker.CONFIG["localBibleTermsAcknowledged"] = True
        with patch.object(worker, "assert_working_day", return_value=None), \
             patch.object(worker.requests, "get", side_effect=AssertionError("Tidak boleh memanggil API eksternal")):
            queued = worker.queue_bible_series_episodes(series_id, self.owner)
        self.assertEqual(queued["queued"], 1)
        self.assertEqual(queued["episodes"][0]["episodeId"], "episode-1")

    def test_queue_preflight_blocks_all_episodes_without_partial_tasks(self):
        series_id = self._create_test_series(auto_queue=False)
        self._insert_episode(series_id, "episode-1", 1, "Kejadian 1:1-3", "Episode Satu")
        self._insert_episode(series_id, "episode-2", 2, "Kejadian 2:1-2", "Episode Dua")
        self._write_source([
            {"bookId": "kejadian", "chapter": 1, "verse": 1, "text": "Ayat satu"},
        ])
        worker.CONFIG["localBibleTermsAcknowledged"] = True
        with patch.object(worker, "assert_working_day", return_value=None):
            with self.assertRaises(worker.BibleQueueBlockedError) as caught:
                worker.queue_bible_series_episodes(series_id, self.owner)
        self.assertEqual(caught.exception.code, "BIBLE_REFERENCES_INCOMPLETE")
        self.assertEqual(len(caught.exception.blocked), 2)
        with closing(sqlite3.connect(worker.TASK_DB)) as con:
            count = con.execute("SELECT COUNT(*) FROM tasks WHERE owner_uid=?", (self.owner,)).fetchone()[0]
        self.assertEqual(count, 0)

    def test_planner_auto_queues_only_after_uploaded_file_is_ready(self):
        series_id = self._create_test_series(auto_queue=True)
        book = worker.BIBLE_BOOK_INDEX["kejadian"]
        mock_plan = {"overview": "Rencana uji", "episodes": [{
            "title": "Penciptaan", "summary": "Ringkasan", "reference": "Kejadian 1:1-2",
            "centralTheme": "Penciptaan", "teachingPoint": "Allah Pencipta", "hook": "Bagaimana?", "storyArc": "Awal",
        }]}
        self._write_source([
            {"bookId": "kejadian", "chapter": 1, "verse": 1, "text": "Ayat satu"},
            {"bookId": "kejadian", "chapter": 1, "verse": 2, "text": "Ayat dua"},
        ])
        worker.CONFIG["localBibleTermsAcknowledged"] = True
        with patch.object(worker, "_plan_one_bible_book", return_value=mock_plan), \
             patch.object(worker, "assert_working_day", return_value=None), \
             patch.object(worker.time, "sleep", return_value=None):
            worker.run_bible_series_planner(series_id, self.owner, {"durationSeconds": 45, "autoQueue": True}, [book])
        series = worker.db_get_bible_series(series_id, self.owner)
        self.assertEqual(series["status"], "queued")
        self.assertEqual(series["queued_episodes"], 1)
        self.assertEqual(series["episodes"][0]["status"], "queued")

    def test_planner_keeps_plan_as_draft_until_json_is_uploaded(self):
        series_id = self._create_test_series(auto_queue=True)
        book = worker.BIBLE_BOOK_INDEX["kejadian"]
        mock_plan = {"overview": "Rencana uji", "episodes": [{
            "title": "Penciptaan", "summary": "Ringkasan", "reference": "Kejadian 1:1-2",
            "centralTheme": "Penciptaan", "teachingPoint": "Allah Pencipta", "hook": "Bagaimana?", "storyArc": "Awal",
        }]}
        with patch.object(worker, "_plan_one_bible_book", return_value=mock_plan), \
             patch.object(worker, "assert_working_day", return_value=None), \
             patch.object(worker.time, "sleep", return_value=None):
            worker.run_bible_series_planner(series_id, self.owner, {"durationSeconds": 45, "autoQueue": True}, [book])
        series = worker.db_get_bible_series(series_id, self.owner)
        self.assertEqual(series["status"], "planned")
        self.assertEqual(series["episodes"][0]["status"], "planned")
        self.assertIn("menunggu file JSON Alkitab", series["error_message"])

    def test_no_lai_api_or_access_request_feature_remains(self):
        source_root = Path(__file__).resolve().parents[1]
        worker_source = (source_root / "worker" / "worker.py").read_text(encoding="utf-8")
        html_source = (source_root / "app" / "index.html").read_text(encoding="utf-8")
        manifest = json.loads((source_root / "package-manifest.json").read_text(encoding="utf-8"))
        self.assertNotIn("bible-api.alkitab.or.id", worker_source)
        self.assertNotIn("def fetch_lai_tb_passage", worker_source)
        self.assertNotIn("/api/setup/lai-bible-api", worker_source)
        self.assertNotIn("saveLaiBibleApiToken", html_source)
        self.assertNotIn("laiBibleApiToken", html_source)
        self.assertFalse(any("LAI API token" in item for item in manifest["features"]))

    def test_dashboard_upload_controls_and_metadata_notice_exist(self):
        source_root = Path(__file__).resolve().parents[1]
        html = (source_root / "app" / "index.html").read_text(encoding="utf-8")
        rules = (source_root / "firestore.rules").read_text(encoding="utf-8")
        self.assertIn('id="localBibleJsonFile"', html)
        self.assertIn('id="localBibleTermsAcknowledged"', html)
        self.assertIn('id="localBibleMetadataNotice"', html)
        self.assertIn("indo_tb.json", html)
        self.assertIn("data.autoQueue is bool", rules)
        self.assertIn("'local_json'", rules)
        self.assertIn("'pending_local_json'", rules)
        self.assertIn("data.sourceVersion is string", rules)

    @unittest.skipUnless(Path("/mnt/data/indo_tb.json").exists(), "Uploaded source file is only available in this build session")
    def test_full_uploaded_indo_tb_file_audits_as_66_books_and_1189_chapters(self):
        raw = Path("/mnt/data/indo_tb.json").read_text(encoding="utf-8-sig")
        parsed, repaired, stats, payload = worker._parse_local_bible_json(raw)
        self.assertFalse(repaired)
        self.assertEqual(len(parsed), 31102)
        self.assertEqual(stats["invalidRowCount"], 0)
        keys = {(row["bookId"], row["chapter"]) for row in parsed}
        self.assertEqual(len({row["bookId"] for row in parsed}), 66)
        self.assertEqual(len(keys), 1189)
        self.assertEqual(stats["bookNumberNameMismatchRowCount"], 0)
        self.assertEqual(stats["bookNameVariantRowCount"], 1007)


if __name__ == "__main__":
    unittest.main(verbosity=2)

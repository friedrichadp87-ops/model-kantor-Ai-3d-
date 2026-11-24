import os, sys, tempfile, unittest
from pathlib import Path
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
TMP = Path(tempfile.mkdtemp(prefix="aicf-157-schedule-tests-"))
os.environ["LOCALAPPDATA"] = str(TMP / "local")
sys.path.insert(0, str(ROOT / "worker"))
import worker

class SundayRestTests(unittest.TestCase):
    def setUp(self):
        worker.WORKER_STOP.clear()
    def tearDown(self):
        worker.WORKER_STOP.clear()
    def test_sunday_pause_starts_at_six_and_ends_at_fifteen_wib(self):
        tz=timezone(timedelta(hours=7))
        self.assertTrue(worker.is_sunday_rest_period(datetime(2026,11,22,6,0,tzinfo=tz)))
        self.assertTrue(worker.is_sunday_rest_period(datetime(2026,11,22,14,59,tzinfo=tz)))
        self.assertFalse(worker.is_sunday_rest_period(datetime(2026,11,22,15,0,tzinfo=tz)))
    def test_non_sunday_is_working_all_day(self):
        tz=timezone(timedelta(hours=7))
        self.assertFalse(worker.is_sunday_rest_period(datetime(2026,11,21,8,0,tzinfo=tz)))
        self.assertFalse(worker.is_sunday_rest_period(datetime(2026,11,23,8,0,tzinfo=tz)))
    def test_rest_period_blocks_new_work(self):
        tz=timezone(timedelta(hours=7))
        with patch.object(worker, "jakarta_now", return_value=datetime(2026,11,22,8,0,tzinfo=tz)):
            with self.assertRaises(worker.OperationPausedError):
                worker.assert_working_day()
    def test_worker_shutdown_still_blocks_work(self):
        worker.WORKER_STOP.set()
        with self.assertRaises(worker.OperationPausedError):
            worker.assert_working_day()
    def test_config_is_local_ollama(self):
        self.assertEqual(worker.CONFIG.get("operationalMode"), "local_ollama")
        self.assertEqual(worker.CONFIG.get("ollamaModel"), "qwen3:4b")
    def test_queue_loop_has_pause_gate_and_auto_resume(self):
        import inspect
        source=inspect.getsource(worker.workforce_queue_loop)
        self.assertIn("is_sunday_rest_period()", source)
        self.assertIn("unload_ollama_model()", source)
        self.assertIn("Dilanjutkan otomatis setelah istirahat Minggu", source)

if __name__ == "__main__":
    unittest.main(verbosity=2)

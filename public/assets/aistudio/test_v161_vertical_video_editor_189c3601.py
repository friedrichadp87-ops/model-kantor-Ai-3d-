import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("aicf_worker_v161", ROOT / "worker" / "worker.py")
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class VerticalVideoEditorTests(unittest.TestCase):
    def test_version_is_162(self):
        self.assertEqual(worker.APP_VERSION, "1.6.5")

    def test_project_id_must_be_32_hex_characters(self):
        valid = "a" * 32
        self.assertEqual(worker.validate_video_editor_project_id(valid), valid)
        with self.assertRaises(ValueError):
            worker.validate_video_editor_project_id("../../outside")

    def test_bitrate_calculator_reserves_audio_and_container_space(self):
        bitrate = worker.calculate_vertical_video_bitrate(60)
        self.assertGreater(bitrate, 100_000)
        expected_upper = ((worker.VIDEO_EDITOR_TARGET_BYTES - 1_000_000) * 8 / 60) - worker.VIDEO_EDITOR_AUDIO_BITRATE
        self.assertLessEqual(bitrate, expected_upper)

    def test_extreme_duration_is_rejected_instead_of_fake_quality_claim(self):
        with self.assertRaises(ValueError):
            worker.calculate_vertical_video_bitrate(24 * 3600)

    def test_upload_extensions_are_restricted_by_asset_kind(self):
        self.assertIn(".mp4", worker.VIDEO_EDITOR_INPUT_RULES["background"]["extensions"])
        self.assertIn(".mp3", worker.VIDEO_EDITOR_INPUT_RULES["voice"]["extensions"])
        self.assertIn(".mp3", worker.VIDEO_EDITOR_INPUT_RULES["music"]["extensions"])
        self.assertEqual(worker.VIDEO_EDITOR_INPUT_RULES["subtitle"]["extensions"], {".srt"})

    def test_srt_upload_is_saved_only_inside_owner_project_folder(self):
        srt = b"1\n00:00:00,000 --> 00:00:02,000\nTeks uji\n"
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(worker, "VIDEO_EDITOR_ROOT", Path(tmp)):
                result = worker.save_video_editor_upload("owner-123", "b" * 32, "subtitle", "sub.srt", io.BytesIO(srt), len(srt))
                saved = worker.video_editor_project_dir("owner-123", "b" * 32) / "subtitle.srt"
                self.assertTrue(saved.exists())
                self.assertEqual(saved.read_bytes(), srt)
                self.assertEqual(result["kind"], "subtitle")
                self.assertEqual(result["sizeBytes"], len(srt))
                other_owner = worker.video_editor_project_dir("owner-456", "b" * 32)
                self.assertNotEqual(saved.parent, other_owner)

    def test_dashboard_exposes_video_editor_inputs_and_actions(self):
        html = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
        for element_id in ("videoEditorBackground", "videoEditorVoice", "videoEditorSubtitle", "videoEditorMusic", "videoEditorRenderButton", "videoEditorResult"):
            self.assertIn(f'id="{element_id}"', html)
        self.assertIn("/api/video-editor/upload", html)
        self.assertIn("/api/video-editor/render", html)
        self.assertIn("/api/video-editor/download", html)

    def test_worker_exposes_upload_render_and_download_routes(self):
        source = (ROOT / "worker" / "worker.py").read_text(encoding="utf-8")
        self.assertIn('"/api/video-editor/upload"', source)
        self.assertIn('"/api/video-editor/render"', source)
        self.assertIn('parsed.path == "/api/video-editor/download"', source)
        self.assertIn('"verticalVideoEditorAvailable": True', source)


if __name__ == "__main__":
    unittest.main()

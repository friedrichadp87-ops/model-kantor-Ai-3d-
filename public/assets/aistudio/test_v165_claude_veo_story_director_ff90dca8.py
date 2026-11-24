from pathlib import Path
import importlib.util
import json
import tempfile
import unittest
import wave
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("aicf_worker_v165_story_director", ROOT / "worker" / "worker.py")
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class ClaudeVeoStoryDirectorTests(unittest.TestCase):
    def test_version_and_thirteen_agent_registry_are_preserved(self):
        self.assertEqual(worker.APP_VERSION, "1.6.5")
        html = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
        self.assertIn("const AGENTS = [", html)
        start = html.index("const AGENTS = [")
        end = html.index("\n];", start)
        agent_block = html[start:end]
        self.assertEqual(agent_block.count("['"), 13)
        self.assertIn("claude-sonnet-5-5", worker.CONFIG.get("claudeModel", "claude-sonnet-5-5"))

    def test_claude_structured_output_request_uses_api_secret_and_schema(self):
        response = SimpleNamespace(
            status_code=200,
            text="",
            json=lambda: {"content": [{"type": "text", "text": '{"summary":"SIAP"}'}]},
            raise_for_status=lambda: None,
        )
        schema = {"type": "object", "properties": {"summary": {"type": "string"}},
                  "required": ["summary"], "additionalProperties": False}
        with patch.object(worker, "load_provider_secret", return_value="claude-test-key"), \
             patch.object(worker.requests, "post", return_value=response) as post:
            result = worker.call_claude_json("Uji Script Director", schema, max_output_tokens=256)
        self.assertEqual(result["summary"], "SIAP")
        args, kwargs = post.call_args
        self.assertEqual(args[0], "https://api.anthropic.com/v1/messages")
        self.assertEqual(kwargs["headers"]["x-api-key"], "claude-test-key")
        self.assertEqual(kwargs["json"]["output_config"]["format"]["type"], "json_schema")
        self.assertEqual(kwargs["json"]["model"], "claude-sonnet-5-5")

    def test_veo_request_is_portrait_video_only_and_uses_character_reference_task(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "scene.mp4"
            credentials = SimpleNamespace(token="google-test-token")
            operation_start = SimpleNamespace(status_code=200, json=lambda: {"name": "operations/test-123"}, raise_for_status=lambda: None)
            operation_done = SimpleNamespace(status_code=200, json=lambda: {
                "done": True, "response": {"videos": [{"gcsUri": "gs://aicf-bucket/test/scene.mp4"}]}
            }, raise_for_status=lambda: None)
            cfg = {"location": "us-central1", "projectId": "aicf-test-123", "model": "veo-3.1-fast-generate-001",
                   "storageUri": "gs://aicf-bucket/output/", "resolution": "720p"}
            with patch.object(worker, "_veo_validate_settings", return_value=cfg), \
                 patch.object(worker, "_veo_google_credentials", return_value=credentials), \
                 patch.object(worker, "_veo_reference_image", return_value={"mimeType": "image/jpeg", "bytesBase64Encoded": "ZmFrZQ=="}), \
                 patch.object(worker.requests, "post", side_effect=[operation_start, operation_done]) as post, \
                 patch.object(worker, "_download_gcs_video", side_effect=lambda c, p, uri, out: out.write_bytes(b"x" * 30000)), \
                 patch.object(worker, "_record_veo_usage") as record, \
                 patch.object(worker, "assert_working_day"), patch.object(worker.time, "sleep"):
                result = worker._generate_veo_scene("Cinematic Bible scene", [Path("character.jpg")], output,
                                                    "task-1", 1, "owner-1", 120, 4)
            request = post.call_args_list[0].kwargs["json"]
            self.assertEqual(request["parameters"]["aspectRatio"], "9:16")
            self.assertEqual(request["parameters"]["durationSeconds"], 4)
            self.assertFalse(request["parameters"]["generateAudio"])
            self.assertEqual(request["parameters"]["personGeneration"], "allow_all")
            self.assertNotIn("task", request["parameters"])
            self.assertEqual(len(request["instances"][0]["referenceImages"]), 1)
            self.assertEqual(result["aspectRatio"], "9:16")
            record.assert_called_once()
            self.assertTrue(output.exists())

    def test_veo_standard_with_subject_reference_uses_eight_seconds(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "scene.mp4"
            credentials = SimpleNamespace(token="google-test-token")
            operation_start = SimpleNamespace(status_code=200, json=lambda: {"name": "operations/test-std"}, raise_for_status=lambda: None)
            operation_done = SimpleNamespace(status_code=200, json=lambda: {
                "done": True, "response": {"videos": [{"gcsUri": "gs://aicf-bucket/test/standard.mp4"}]}
            }, raise_for_status=lambda: None)
            cfg = {"location": "us-central1", "projectId": "aicf-test-123", "model": "veo-3.1-generate-001",
                   "storageUri": "gs://aicf-bucket/output/", "resolution": "720p"}
            with patch.object(worker, "_veo_validate_settings", return_value=cfg), \
                 patch.object(worker, "_veo_google_credentials", return_value=credentials), \
                 patch.object(worker, "_veo_reference_image", return_value={"mimeType": "image/jpeg", "bytesBase64Encoded": "ZmFrZQ=="}), \
                 patch.object(worker.requests, "post", side_effect=[operation_start, operation_done]) as post, \
                 patch.object(worker, "_download_gcs_video", side_effect=lambda c, p, uri, out: out.write_bytes(b"x" * 30000)), \
                 patch.object(worker, "_record_veo_usage"), patch.object(worker, "assert_working_day"), patch.object(worker.time, "sleep"):
                result = worker._generate_veo_scene("Bible scene", [Path("character.jpg")], output, "task-2", 1, "owner-1", 120, 4)
            request = post.call_args_list[0].kwargs["json"]
            self.assertEqual(request["parameters"]["durationSeconds"], 8)
            self.assertEqual(request["parameters"]["personGeneration"], "allow_all")

    def test_veo_price_estimate_matches_video_only_counts(self):
        self.assertEqual(worker._veo_estimated_clip_cost("veo-3.1-fast-generate-001", "720p"), 0.08)
        self.assertEqual(worker._veo_estimated_clip_cost("veo-3.1-fast-generate-001", "1080p"), 0.10)
        self.assertEqual(worker._veo_estimated_clip_cost("veo-3.1-generate-001", "720p"), 0.20)

    def test_audio_alignment_generates_scene_cut_points(self):
        with tempfile.TemporaryDirectory() as temp:
            alignment_path = Path(temp) / "alignment.json"
            chars = list("Halo dunia. Selamat pagi.")
            starts = [i * 0.1 for i in range(len(chars))]
            ends = [x + 0.08 for x in starts]
            alignment_path.write_text(json.dumps({"characters": chars, "characterStartTimesSeconds": starts,
                                                  "characterEndTimesSeconds": ends}), encoding="utf-8")
            scenes = [{"narrationSegment": "Halo dunia."}, {"narrationSegment": "Selamat pagi."}]
            info = worker.assign_scene_timestamps_from_alignment(scenes, alignment_path, 4.0)
        self.assertEqual(info["source"], "ElevenLabs character-level alignment")
        self.assertEqual(info["matchedScenes"], 2)
        self.assertEqual(scenes[0]["startSeconds"], 0.0)
        self.assertGreater(scenes[1]["startSeconds"], scenes[0]["endSeconds"] - 0.2)
        self.assertEqual(scenes[1]["timingSource"], "elevenlabs-character-alignment")

    def test_qc_rebuild_generates_new_voice_timeline_before_visual_regeneration(self):
        source = (ROOT / "worker" / "worker.py").read_text(encoding="utf-8")
        voice_at = source.index('"Voice Artist — Revisi QC"')
        alignment_at = source.index("assign_scene_timestamps_from_alignment(scenes, alignment_file, actual_audio_duration)", voice_at)
        visual_at = source.index("visual_result = collect_assets()", alignment_at)
        self.assertLess(voice_at, alignment_at)
        self.assertLess(alignment_at, visual_at)

    def test_dashboard_identifies_claude_as_primary_scriptwriter(self):
        html = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
        self.assertIn("Claude adalah Script Director utama", html)
        self.assertNotIn("Ollama tetap menjadi mesin naskah utama", html)
        self.assertIn("personGeneration allow_all", html)

    def test_story_pipeline_uses_claude_elevenlabs_timestamps_and_vertical_output(self):
        source = (ROOT / "worker" / "worker.py").read_text(encoding="utf-8")
        self.assertIn("call_claude_json(", source)
        self.assertIn("alignment_output=alignment_file", source)
        self.assertIn("assign_scene_timestamps_from_alignment(scenes, alignment_file", source)
        self.assertIn('"aspectRatio": "9:16"', source)
        self.assertIn('"generateAudio": False', source)
        self.assertIn('"videoSource":"Veo / Google Flow + FFmpeg"', source)
        self.assertIn("VEO_PROJECT_LOCK.acquire", source)
        self.assertIn("maxClipsPerProject", source)
        html = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
        self.assertIn("Google Flow", html)
        self.assertIn("flow-import", html)
        self.assertIn("/api/workforce/flow-import", source)


if __name__ == "__main__":
    unittest.main()

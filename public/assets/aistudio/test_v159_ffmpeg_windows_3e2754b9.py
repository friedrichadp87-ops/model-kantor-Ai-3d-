import ast
import importlib.util
import inspect
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("aicf_worker_v159", ROOT / "worker" / "worker.py")
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class FFmpegWindowsLaunchTests(unittest.TestCase):
    def test_windows_media_command_sets_create_no_window_and_captures_logs(self):
        fake_os = SimpleNamespace(name="nt")
        completed = SimpleNamespace(returncode=0, stdout="ok", stderr="ffmpeg diagnostic")
        with patch.object(worker, "os", fake_os):
            with patch.object(worker.subprocess, "run", return_value=completed) as run:
                result = worker.run_media_command(["ffmpeg", "-version"], timeout=7)
        self.assertIs(result, completed)
        args, kwargs = run.call_args
        self.assertEqual(args[0], ["ffmpeg", "-version"])
        self.assertEqual(kwargs["creationflags"] & 0x08000000, 0x08000000)
        self.assertTrue(kwargs["capture_output"])
        self.assertTrue(kwargs["text"])
        self.assertEqual(kwargs["encoding"], "utf-8")
        self.assertEqual(kwargs["errors"], "replace")
        self.assertFalse(kwargs["shell"])
        self.assertEqual(kwargs["timeout"], 7)

    def test_non_windows_media_command_does_not_add_windows_flag(self):
        fake_os = SimpleNamespace(name="posix")
        with patch.object(worker, "os", fake_os):
            with patch.object(worker.subprocess, "run", return_value=SimpleNamespace(returncode=0)) as run:
                worker.run_media_command(["ffmpeg", "-version"])
        self.assertNotIn("creationflags", run.call_args.kwargs)

    def test_ffmpeg_execution_sites_use_the_media_helper(self):
        source = inspect.getsource(worker)
        tree = ast.parse(source)
        direct_ffmpeg_runs = []
        helper_calls = 0
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.value.id == "subprocess" and func.attr == "run":
                arg_text = ast.get_source_segment(source, node) or ""
                if "ffmpeg" in arg_text.lower() or "command" in arg_text.lower():
                    direct_ffmpeg_runs.append(arg_text[:180])
            if isinstance(func, ast.Name) and func.id == "run_media_command":
                helper_calls += 1
        self.assertEqual(direct_ffmpeg_runs, [])
        self.assertGreaterEqual(helper_calls, 6)

    def test_version_is_161(self):
        self.assertEqual(worker.APP_VERSION, "1.6.5")


if __name__ == "__main__":
    unittest.main()

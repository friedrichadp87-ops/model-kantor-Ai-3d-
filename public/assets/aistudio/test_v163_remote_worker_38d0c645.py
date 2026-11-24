from pathlib import Path
import re
import unittest
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
WORKER = (ROOT / "worker" / "worker.py").read_text(encoding="utf-8")
HTML = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
SPEC = importlib.util.spec_from_file_location("aicf_worker_v163_remote", ROOT / "worker" / "worker.py")
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)

class RemoteWorkerTunnelTests(unittest.TestCase):
    def test_dashboard_domain_is_production_domain(self):
        self.assertIn('DASHBOARD_URL = "https://officecontent.netlify.app/"', WORKER)

    def test_worker_stays_loopback_bound(self):
        self.assertIn('ThreadingHTTPServer(("127.0.0.1", PORT), Handler)', WORKER)

    def test_public_netlify_origin_cannot_be_mistaken_for_loopback_pairing(self):
        self.assertTrue(worker.is_trusted_loopback_request("127.0.0.1", "localhost:8765", "http://localhost:8765"))
        self.assertFalse(worker.is_trusted_loopback_request("127.0.0.1", "localhost:8765", "https://officecontent.netlify.app"))
        self.assertFalse(worker.is_trusted_loopback_request("127.0.0.1", "localhost:8765", None, "machine.tailnet.ts.net"))

    def test_netlify_origin_is_explicitly_allowed(self):
        self.assertIn('"https://officecontent.netlify.app"', WORKER)

    def test_first_owner_pairing_is_local_only_and_locks_uid(self):
        import tempfile
        from unittest.mock import patch
        original_owner = worker.CONFIG.get("ownerUid", "")
        original_path = worker.CONFIG_FILE
        try:
            with tempfile.TemporaryDirectory() as temp:
                worker.CONFIG_FILE = Path(temp) / "worker_config.json"
                worker.CONFIG["ownerUid"] = ""
                with self.assertRaises(PermissionError):
                    worker.enforce_worker_owner({"uid": "remote-user"}, False)
                worker.enforce_worker_owner({"uid": "owner-123"}, True)
                self.assertEqual(worker.CONFIG["ownerUid"], "owner-123")
                self.assertTrue(worker.CONFIG_FILE.exists())
                worker.enforce_worker_owner({"uid": "owner-123"}, False)
                with self.assertRaises(PermissionError):
                    worker.enforce_worker_owner({"uid": "other-user"}, True)
        finally:
            worker.CONFIG["ownerUid"] = original_owner
            worker.CONFIG_FILE = original_path

    def test_startup_opens_local_dashboard_until_owner_pairing(self):
        original_owner = worker.CONFIG.get("ownerUid", "")
        try:
            worker.CONFIG["ownerUid"] = ""
            self.assertEqual(worker.startup_dashboard_url(), "http://localhost:8765/")
            worker.CONFIG["ownerUid"] = "paired-owner"
            self.assertEqual(worker.startup_dashboard_url(), "https://officecontent.netlify.app/")
        finally:
            worker.CONFIG["ownerUid"] = original_owner

    def test_remote_health_requires_firebase_identity(self):
        section = WORKER.split('if parsed.path == "/health":', 1)[1].split('if parsed.path == "/api/bible/catalog":', 1)[0]
        self.assertIn('needs_auth = bool(origin) or not self._is_local_request()', section)
        self.assertIn('self._authorized_user()', section)

    def test_remote_worker_dashboard_root_is_blocked(self):
        section = WORKER.split('if parsed.path in ("/", "/index.html"):', 1)[1].split('if parsed.path == "/health":', 1)[0]
        self.assertIn('if not self._is_local_request():', section)

    def test_frontend_uses_configurable_https_worker_url(self):
        self.assertIn("WORKER_TUNNEL_STORAGE_KEY = 'acf.workerTunnelUrl.v1'", HTML)
        self.assertIn('function requireWorkerBaseUrl()', HTML)
        self.assertIn("parsed.protocol !== 'https:'", HTML)
        self.assertIn("hostname.endsWith('.ts.net')", HTML)
        self.assertIn("!isTailscaleTunnel", HTML)

    def test_frontend_sends_firebase_token_to_health(self):
        self.assertIn('headers: idToken ? { Authorization: `Bearer ${idToken}` } : {}', HTML)

    def test_dashboard_domain_and_settings_controls_exist(self):
        self.assertIn('https://officecontent.netlify.app', HTML)
        self.assertIn('id="workerTunnelUrl"', HTML)
        self.assertIn('id="saveWorkerTunnelUrl"', HTML)
        self.assertIn('id="testWorkerTunnelUrl"', HTML)

    def test_tunnel_helper_scripts_exist(self):
        self.assertTrue((ROOT / "START-WORKER-TUNNEL.bat").is_file())
        self.assertTrue((ROOT / "STOP-WORKER-TUNNEL.bat").is_file())

if __name__ == "__main__":
    unittest.main()

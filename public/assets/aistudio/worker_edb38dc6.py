#!/usr/bin/env python3
"""AI Content Factory Windows One-Click Host + YouTube OAuth Worker.

Serves the single-file dashboard locally, verifies Firebase Google sessions,
handles Desktop OAuth, and stores per-channel OAuth credentials using Windows DPAPI.
"""
from __future__ import annotations

import ctypes
import json
import base64
import csv
import io
import sqlite3
import tempfile
import uuid
import subprocess
import wave
import math
import queue
import requests
from datetime import datetime, timedelta, timezone
import logging
import os
import re
import shutil
import hashlib
import html as html_lib
import statistics
import socket
import sys
import threading
import time
from contextlib import contextmanager
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import importlib.util
from xml.sax.saxutils import escape as xml_escape
from ctypes import wintypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

APP_VERSION = "1.6.5"
PORT_DEFAULT = 8765
DASHBOARD_URL = "https://officecontent.netlify.app/"

# PyInstaller --onefile extracts bundled resources under sys._MEIPASS.
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    RESOURCE_DIR = Path(sys._MEIPASS)
else:
    RESOURCE_DIR = Path(__file__).resolve().parents[1]
APP_HTML_FILE = RESOURCE_DIR / "app" / "index.html"

LOCAL_APP_DATA = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "AIContentFactory"
SECRETS_DIR = LOCAL_APP_DATA / "secrets"
TOKEN_DIR = LOCAL_APP_DATA / "youtube-tokens"
LOG_DIR = LOCAL_APP_DATA / "logs"
CONFIG_FILE = LOCAL_APP_DATA / "worker_config.json"
OAUTH_CLIENT_FILE = SECRETS_DIR / "desktop-oauth-client.json"
CONNECTIONS_FILE = LOCAL_APP_DATA / "youtube-connections.json"
BIBLE_SOURCE_DIR = LOCAL_APP_DATA / "bible-sources"
LOCAL_BIBLE_JSON_FILE = BIBLE_SOURCE_DIR / "uploaded-bible-normalized.json"
BIBLE_SOURCE_DIR.mkdir(parents=True, exist_ok=True)
TASK_DB = LOCAL_APP_DATA / "workforce.sqlite3"
OUTPUT_DIR = LOCAL_APP_DATA / "produced"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
VIDEO_EDITOR_ROOT = LOCAL_APP_DATA / "video-editor"
VIDEO_EDITOR_ROOT.mkdir(parents=True, exist_ok=True)
VIDEO_EDITOR_RENDER_LOCK = threading.Lock()
for directory in (LOCAL_APP_DATA, SECRETS_DIR, TOKEN_DIR, LOG_DIR):
    directory.mkdir(parents=True, exist_ok=True)

_log_handlers = [logging.FileHandler(LOG_DIR / "worker.log", encoding="utf-8")]
if sys.stdout is not None:
    _log_handlers.append(logging.StreamHandler(sys.stdout))
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=_log_handlers,
)
log = logging.getLogger("aicf-worker")


def run_media_command(args, **kwargs):
    """Run FFmpeg/FFprobe without opening a Windows console window.

    stdout/stderr are captured by default so callers can continue to inspect
    FFmpeg diagnostics and write them to the existing Worker log/error flow.
    On non-Windows systems this behaves like subprocess.run.
    """
    kwargs.setdefault("capture_output", True)
    kwargs.setdefault("text", True)
    kwargs.setdefault("encoding", "utf-8")
    kwargs.setdefault("errors", "replace")
    kwargs.setdefault("shell", False)
    if os.name == "nt":
        # CREATE_NO_WINDOW prevents a new console window for console child apps.
        # Keep caller-supplied flags while ensuring the no-window bit is set.
        no_window = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        kwargs["creationflags"] = int(kwargs.get("creationflags", 0)) | int(no_window)
    return subprocess.run(args, **kwargs)

CHANNELS = {
    "bible-stories-3d": "Bible Stories 3D",
    "daily-faith-inspiration": "Daily Faith & Inspiration",
    "bible-facts-mysteries": "Bible Facts & Mysteries",
    "gkin-hosiana": "GKIN Hosiana",
}


# Protestant 66-book canon (Indonesian TB book names). Chapter counts are used
# for planning/validation only; no copyrighted Bible text is bundled here.
BIBLE_GROUPS = {
    "ot_torah": {"id":"ot_torah","testament":"old","label":"Taurat","count":5},
    "ot_history": {"id":"ot_history","testament":"old","label":"Kitab Sejarah","count":12},
    "ot_wisdom": {"id":"ot_wisdom","testament":"old","label":"Puisi & Hikmat","count":5},
    "ot_major_prophets": {"id":"ot_major_prophets","testament":"old","label":"Nabi Besar","count":5},
    "ot_minor_prophets": {"id":"ot_minor_prophets","testament":"old","label":"Nabi Kecil","count":12},
    "nt_gospels": {"id":"nt_gospels","testament":"new","label":"Injil","count":4},
    "nt_acts": {"id":"nt_acts","testament":"new","label":"Kisah Para Rasul","count":1},
    "nt_pauline_letters": {"id":"nt_pauline_letters","testament":"new","label":"Surat-surat Paulus","count":13},
    "nt_general_letters": {"id":"nt_general_letters","testament":"new","label":"Surat-surat Umum","count":8},
    "nt_revelation": {"id":"nt_revelation","testament":"new","label":"Kitab Wahyu","count":1},
}

# id, canonical Indonesian display name, group id, chapter count
BIBLE_BOOKS = [
    ("kejadian","Kejadian","ot_torah",50), ("keluaran","Keluaran","ot_torah",40),
    ("imamat","Imamat","ot_torah",27), ("bilangan","Bilangan","ot_torah",36),
    ("ulangan","Ulangan","ot_torah",34),
    ("yosua","Yosua","ot_history",24), ("hakim-hakim","Hakim-hakim","ot_history",21),
    ("rut","Rut","ot_history",4), ("1-samuel","1 Samuel","ot_history",31),
    ("2-samuel","2 Samuel","ot_history",24), ("1-raja-raja","1 Raja-raja","ot_history",22),
    ("2-raja-raja","2 Raja-raja","ot_history",25), ("1-tawarikh","1 Tawarikh","ot_history",29),
    ("2-tawarikh","2 Tawarikh","ot_history",36), ("ezra","Ezra","ot_history",10),
    ("nehemia","Nehemia","ot_history",13), ("ester","Ester","ot_history",10),
    ("ayub","Ayub","ot_wisdom",42), ("mazmur","Mazmur","ot_wisdom",150),
    ("amsal","Amsal","ot_wisdom",31), ("pengkhotbah","Pengkhotbah","ot_wisdom",12),
    ("kidung-agung","Kidung Agung","ot_wisdom",8),
    ("yesaya","Yesaya","ot_major_prophets",66), ("yeremia","Yeremia","ot_major_prophets",52),
    ("ratapan","Ratapan","ot_major_prophets",5), ("yehezkiel","Yehezkiel","ot_major_prophets",48),
    ("daniel","Daniel","ot_major_prophets",12),
    ("hosea","Hosea","ot_minor_prophets",14), ("yoel","Yoel","ot_minor_prophets",3),
    ("amos","Amos","ot_minor_prophets",9), ("obaja","Obaja","ot_minor_prophets",1),
    ("yunus","Yunus","ot_minor_prophets",4), ("mikha","Mikha","ot_minor_prophets",7),
    ("nahum","Nahum","ot_minor_prophets",3), ("habakuk","Habakuk","ot_minor_prophets",3),
    ("zefanya","Zefanya","ot_minor_prophets",3), ("hagai","Hagai","ot_minor_prophets",2),
    ("zakharia","Zakharia","ot_minor_prophets",14), ("maleakhi","Maleakhi","ot_minor_prophets",4),
    ("matius","Matius","nt_gospels",28), ("markus","Markus","nt_gospels",16),
    ("lukas","Lukas","nt_gospels",24), ("yohanes","Yohanes","nt_gospels",21),
    ("kisah-para-rasul","Kisah Para Rasul","nt_acts",28),
    ("roma","Roma","nt_pauline_letters",16), ("1-korintus","1 Korintus","nt_pauline_letters",16),
    ("2-korintus","2 Korintus","nt_pauline_letters",13), ("galatia","Galatia","nt_pauline_letters",6),
    ("efesus","Efesus","nt_pauline_letters",6), ("filipi","Filipi","nt_pauline_letters",4),
    ("kolose","Kolose","nt_pauline_letters",4), ("1-tesalonika","1 Tesalonika","nt_pauline_letters",5),
    ("2-tesalonika","2 Tesalonika","nt_pauline_letters",3), ("1-timotius","1 Timotius","nt_pauline_letters",6),
    ("2-timotius","2 Timotius","nt_pauline_letters",4), ("titus","Titus","nt_pauline_letters",3),
    ("filemon","Filemon","nt_pauline_letters",1),
    ("ibrani","Ibrani","nt_general_letters",13), ("yakobus","Yakobus","nt_general_letters",5),
    ("1-petrus","1 Petrus","nt_general_letters",5), ("2-petrus","2 Petrus","nt_general_letters",3),
    ("1-yohanes","1 Yohanes","nt_general_letters",5), ("2-yohanes","2 Yohanes","nt_general_letters",1),
    ("3-yohanes","3 Yohanes","nt_general_letters",1), ("yudas","Yudas","nt_general_letters",1),
    ("wahyu","Wahyu","nt_revelation",22),
]
BIBLE_BOOK_INDEX = {
    item[0]: {"id":item[0],"name":item[1],"groupId":item[2],"testament":"old" if item[2].startswith("ot_") else "new","chapterCount":item[3],"canonicalOrder":index+1}
    for index, item in enumerate(BIBLE_BOOKS)
}
BIBLE_BOOK_ALIASES = {
    re.sub(r"[^a-z0-9]", "", book[1].lower()): book[0] for book in BIBLE_BOOKS
}
BIBLE_BOOK_ALIASES.update({
    "mazmurs": "mazmur", "psalm":"mazmur", "psalms":"mazmur", "songofsolomon":"kidung-agung",
    "kidungsalomo":"kidung-agung", "kidungsalomon":"kidung-agung", "1sam":"1-samuel", "2sam":"2-samuel",
    "1raja":"1-raja-raja", "2raja":"2-raja-raja", "1taw":"1-tawarikh", "2taw":"2-tawarikh",
    "kisah":"kisah-para-rasul", "acts":"kisah-para-rasul", "revelation":"wahyu", "apocalypse":"wahyu",
})

def bible_catalog_payload() -> dict[str, Any]:
    groups = []
    for group in BIBLE_GROUPS.values():
        groups.append({**group, "books":[b for b in BIBLE_BOOK_INDEX.values() if b["groupId"] == group["id"]]})
    return {"canon":"Protestant", "oldTestamentCount":39, "newTestamentCount":27,
            "totalBooks":66, "totalChapters":sum(b["chapterCount"] for b in BIBLE_BOOK_INDEX.values()),
            "groups":groups, "books":list(BIBLE_BOOK_INDEX.values())}

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]
CLIENT_ID_PATTERN = re.compile(r"^[0-9]+(?:-[A-Za-z0-9_-]+)?\.apps\.googleusercontent\.com$")


def extract_firebase_api_key() -> str:
    if not APP_HTML_FILE.exists():
        raise RuntimeError(f"Dashboard tidak ditemukan: {APP_HTML_FILE}")
    source = APP_HTML_FILE.read_text(encoding="utf-8")
    match = re.search(r"\bapiKey\s*:\s*['\"]([^'\"]+)['\"]", source)
    if not match:
        raise RuntimeError("Firebase Web API Key tidak ditemukan di konfigurasi index.html.")
    return match.group(1)


def load_config() -> dict[str, Any]:
    default = {
        "firebaseApiKey": extract_firebase_api_key(),
        "ollamaBaseUrl": "http://127.0.0.1:11434",
        "ollamaModel": "qwen3:4b",
        "localBibleTermsAcknowledged": False,
        "ttsProvider": "elevenlabs",
        "elevenLabsModel": "eleven_v4",
        "elevenLabsVoiceId": "",
        "elevenLabsVoiceIds": {
            "bible-stories-3d": "",
            "daily-faith-inspiration": "",
            "bible-facts-mysteries": "",
            "gkin-hosiana": "",
        },
        "claudeModel": "claude-sonnet-5-5",
        "veoProjectId": "",
        "veoLocation": "us-central1",
        "veoModel": "veo-3.1-fast-generate-001",
        "veoStorageUri": "",
        "veoResolution": "720p",
        "veoDailyBudgetUsd": 5.0,
        "veoMaxClipsPerProject": 16,
        "veoVisualMode": "veo",
        "veoOperationTimeoutSeconds": 900,
        "azureSpeechRegion": "southeastasia",
        "azureSpeechVoice": "id-ID-GadisNeural",
        "azureSpeechVoices": {
            "bible-stories-3d": "id-ID-GadisNeural",
            "daily-faith-inspiration": "id-ID-GadisNeural",
            "bible-facts-mysteries": "id-ID-ArdiNeural",
            "gkin-hosiana": "id-ID-ArdiNeural",
        },
        "imageProvider": "hybrid",
        "comfyuiBaseUrl": "http://127.0.0.1:8188",
        "comfyuiCheckpoint": "v1-5-pruned-emaonly.safetensors",
        "groqEnabled": False,
        "groqModel": "openai/gpt-oss-20b",
        "whisperModel": "base",
        "port": PORT_DEFAULT,
        "ownerUid": "",
        "autoDailyProduction": False,
        "dailyHour": 6,
        "operationalMode": "local_ollama",
        "sundayPauseEnabled": True,
        "sundayPauseStart": 6,
        "sundayPauseEnd": 15,
        "dailyPerChannel": 1,
        "autoUploadAfterQC": False,
        "autoAnalyticsSync": False,
        "includeMonetaryAnalytics": False,
        "privacyStatus": "private",
        "allowedOrigins": [
            "https://officecontent.netlify.app",
            f"http://127.0.0.1:{PORT_DEFAULT}",
            f"http://localhost:{PORT_DEFAULT}",
            "http://127.0.0.1:5500",
            "http://localhost:5500",
        ],
    }
    if not CONFIG_FILE.exists():
        CONFIG_FILE.write_text(json.dumps(default, indent=2), encoding="utf-8")
        return default
    try:
        current = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        if not isinstance(current, dict):
            raise ValueError("Format konfigurasi bukan object JSON.")
        # Keep the public Firebase API key aligned with the bundled dashboard.
        current["firebaseApiKey"] = default["firebaseApiKey"]
        current["ollamaBaseUrl"] = "http://127.0.0.1:11434"
        current.setdefault("ollamaModel", "qwen3:4b")
        current.pop("geminiModel", None)
        current.pop("geminiTtsModel", None)
        current.pop("geminiTtsVoice", None)
        current.pop("geminiImageModel", None)
        current.pop("laiBibleApiBaseUrl", None)
        current.pop("laiBibleLicenseConfirmed", None)
        current.pop("localBibleLicenseConfirmed", None)
        current.setdefault("localBibleTermsAcknowledged", False)
        current["ttsProvider"] = "elevenlabs"
        current.setdefault("elevenLabsModel", "eleven_v4")
        current.setdefault("elevenLabsVoiceId", "")
        current.setdefault("elevenLabsVoiceIds", {"bible-stories-3d": "", "daily-faith-inspiration": "", "bible-facts-mysteries": "", "gkin-hosiana": ""})
        current.setdefault("claudeModel", "claude-sonnet-5-5")
        current.setdefault("veoProjectId", "")
        current.setdefault("veoLocation", "us-central1")
        current.setdefault("veoModel", "veo-3.1-fast-generate-001")
        current.setdefault("veoStorageUri", "")
        current.setdefault("veoResolution", "720p")
        current.setdefault("veoDailyBudgetUsd", 5.0)
        current.setdefault("veoMaxClipsPerProject", 16)
        current.setdefault("veoVisualMode", "veo")
        current.setdefault("veoOperationTimeoutSeconds", 900)
        current.setdefault("claudeModel", "claude-sonnet-5-5")
        current.setdefault("veoProjectId", "")
        current.setdefault("veoLocation", "us-central1")
        current.setdefault("veoModel", "veo-3.1-fast-generate-001")
        current.setdefault("veoStorageUri", "")
        current.setdefault("veoResolution", "720p")
        current.setdefault("veoDailyBudgetUsd", 5.0)
        current.setdefault("veoMaxClipsPerProject", 16)
        current.setdefault("veoVisualMode", "veo")
        current.setdefault("veoOperationTimeoutSeconds", 900)
        current.setdefault("azureSpeechRegion", "southeastasia")
        current.setdefault("azureSpeechVoice", "id-ID-GadisNeural")
        current.setdefault("azureSpeechVoices", {
            "bible-stories-3d": "id-ID-GadisNeural",
            "daily-faith-inspiration": "id-ID-GadisNeural",
            "bible-facts-mysteries": "id-ID-ArdiNeural",
            "gkin-hosiana": "id-ID-ArdiNeural",
        })
        current.setdefault("imageProvider", "hybrid")
        current.setdefault("comfyuiBaseUrl", "http://127.0.0.1:8188")
        current.setdefault("comfyuiCheckpoint", "v1-5-pruned-emaonly.safetensors")
        current.setdefault("groqEnabled", False)
        current.setdefault("groqModel", "openai/gpt-oss-20b")
        current.setdefault("whisperModel", "base")
        current.setdefault("port", PORT_DEFAULT)
        current.setdefault("ownerUid", "")
        existing_origins = current.get("allowedOrigins", [])
        if not isinstance(existing_origins, list):
            existing_origins = []
        current["allowedOrigins"] = sorted({str(item).rstrip("/") for item in existing_origins if isinstance(item, str)} | set(default["allowedOrigins"]))
        current.setdefault("autoDailyProduction", False)
        current.setdefault("dailyHour", 6)
        # v1.5.7 local-only AI migration; retain user content and existing local databases.
        current["operationalMode"] = "local_ollama"
        current["ollamaBaseUrl"] = "http://127.0.0.1:11434"
        current.setdefault("ollamaModel", "qwen3:4b")
        current.pop("geminiModel", None)
        current.pop("geminiTtsModel", None)
        current.pop("geminiTtsVoice", None)
        current.pop("geminiImageModel", None)
        current["ttsProvider"] = "elevenlabs"
        current.setdefault("elevenLabsModel", "eleven_v4")
        current.setdefault("elevenLabsVoiceId", "")
        current.setdefault("elevenLabsVoiceIds", {"bible-stories-3d": "", "daily-faith-inspiration": "", "bible-facts-mysteries": "", "gkin-hosiana": ""})
        current.setdefault("claudeModel", "claude-sonnet-5-5")
        current.setdefault("veoProjectId", "")
        current.setdefault("veoLocation", "us-central1")
        current.setdefault("veoModel", "veo-3.1-fast-generate-001")
        current.setdefault("veoStorageUri", "")
        current.setdefault("veoResolution", "720p")
        current.setdefault("veoDailyBudgetUsd", 5.0)
        current.setdefault("veoMaxClipsPerProject", 16)
        current.setdefault("veoVisualMode", "veo")
        current.setdefault("veoOperationTimeoutSeconds", 900)
        current.setdefault("claudeModel", "claude-sonnet-5-5")
        current.setdefault("veoProjectId", "")
        current.setdefault("veoLocation", "us-central1")
        current.setdefault("veoModel", "veo-3.1-fast-generate-001")
        current.setdefault("veoStorageUri", "")
        current.setdefault("veoResolution", "720p")
        current.setdefault("veoDailyBudgetUsd", 5.0)
        current.setdefault("veoMaxClipsPerProject", 16)
        current.setdefault("veoVisualMode", "veo")
        current.setdefault("veoOperationTimeoutSeconds", 900)
        current.setdefault("azureSpeechRegion", "southeastasia")
        current.setdefault("azureSpeechVoice", "id-ID-GadisNeural")
        current.setdefault("azureSpeechVoices", {
            "bible-stories-3d": "id-ID-GadisNeural",
            "daily-faith-inspiration": "id-ID-GadisNeural",
            "bible-facts-mysteries": "id-ID-ArdiNeural",
            "gkin-hosiana": "id-ID-ArdiNeural",
        })
        current.setdefault("imageProvider", "hybrid")
        current.setdefault("comfyuiBaseUrl", "http://127.0.0.1:8188")
        current.setdefault("comfyuiCheckpoint", "v1-5-pruned-emaonly.safetensors")
        current.setdefault("groqEnabled", False)
        current.setdefault("groqModel", "openai/gpt-oss-20b")
        current.setdefault("whisperModel", "base")
        current.setdefault("sundayPauseEnabled", True)
        current["sundayPauseStart"] = 6
        current["sundayPauseEnd"] = 15
        current.pop("pauseSunday", None)
        current.setdefault("dailyPerChannel", 1)
        current.setdefault("autoUploadAfterQC", False)
        current.setdefault("autoAnalyticsSync", False)
        current.setdefault("includeMonetaryAnalytics", False)
        current.setdefault("privacyStatus", "private")
        CONFIG_FILE.write_text(json.dumps(current, indent=2), encoding="utf-8")
        return current
    except Exception as exc:
        raise RuntimeError(f"worker_config.json tidak valid: {exc}") from exc


CONFIG = load_config()
PORT = int(CONFIG.get("port", PORT_DEFAULT))
FIREBASE_API_KEY = str(CONFIG["firebaseApiKey"])
OWNER_LOCK = threading.Lock()


def enforce_worker_owner(user: dict[str, str], is_local_request: bool) -> dict[str, str]:
    """Bind this local Worker to one Firebase UID, claimed only from loopback.

    A public tunnel must never let the first random Google-authenticated visitor
    claim the Worker. The owner performs the first login on the local dashboard;
    subsequent local and remote requests must match the persisted UID.
    """
    uid = str(user.get("uid", "")).strip()
    if not uid:
        raise PermissionError("UID Firebase tidak ditemukan pada sesi login.")
    with OWNER_LOCK:
        owner_uid = str(CONFIG.get("ownerUid") or "").strip()
        if owner_uid:
            if uid != owner_uid:
                raise PermissionError("Akun Google ini bukan pemilik Windows Worker AI Content Factory.")
            return user
        if not is_local_request:
            raise PermissionError("Worker belum dipasangkan dengan pemilik. Buka http://localhost:8765 di komputer Worker, login dengan akun Google pemilik, lalu muat ulang dashboard Netlify.")
        CONFIG["ownerUid"] = uid
        temp_path = CONFIG_FILE.with_suffix(".tmp")
        temp_path.write_text(json.dumps(CONFIG, ensure_ascii=False, indent=2), encoding="utf-8")
        temp_path.replace(CONFIG_FILE)
        log.info("Windows Worker berhasil dipasangkan ke Firebase UID pemilik.")
        return user


def is_trusted_loopback_request(remote_addr: str, host: str, origin: str | None = None,
                                 forwarded_host: str | None = None) -> bool:
    """Return true only for direct loopback browser/API traffic, never a public-origin proxy."""
    local_hosts = {f"127.0.0.1:{PORT}", f"localhost:{PORT}", f"[::1]:{PORT}"}
    if remote_addr not in ("127.0.0.1", "::1") or host.lower() not in local_hosts:
        return False
    if origin:
        local_origins = {f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"}
        if origin.rstrip("/") not in local_origins:
            return False
    if forwarded_host:
        forwarded_host = forwarded_host.strip().lower()
        forwarded_hostname = forwarded_host.split(":", 1)[0].strip("[]")
        if forwarded_hostname not in {"127.0.0.1", "localhost", "::1"}:
            return False
    return True


def allowed_origin(origin: str | None) -> bool:
    if not origin:
        return False
    normalized = origin.rstrip("/")
    exact = set(CONFIG.get("allowedOrigins", []))
    # Production Netlify dashboard. Other custom origins must be explicitly configured.
    exact.add("https://officecontent.netlify.app")
    if normalized in exact:
        return True
    # Retain Cloudflare Pages preview support; Netlify origins are explicitly allowlisted.
    return bool(re.fullmatch(r"https://[A-Za-z0-9-]+\.pages\.dev", normalized))


def verify_firebase_google_user(id_token: str) -> dict[str, str]:
    endpoint = (
        "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="
        + urllib.parse.quote(FIREBASE_API_KEY)
    )
    payload = json.dumps({"idToken": id_token}).encode("utf-8")
    request = urllib.request.Request(
        endpoint, data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        raise PermissionError(f"Firebase menolak sesi login. Silakan login ulang. ({detail})") from exc
    except Exception as exc:
        raise RuntimeError(f"Tidak dapat memverifikasi login Firebase: {exc}") from exc
    users = data.get("users") or []
    if not users:
        raise PermissionError("Sesi Firebase tidak ditemukan. Silakan login ulang.")
    user = users[0]
    providers = {item.get("providerId") for item in (user.get("providerUserInfo") or [])}
    if "google.com" not in providers:
        raise PermissionError("Worker hanya menerima sesi kantor AI yang login menggunakan Google.")
    return {"uid": user.get("localId", ""), "email": user.get("email", "")}


class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def _make_blob(raw: bytes):
    buffer = ctypes.create_string_buffer(raw)
    blob = DATA_BLOB(len(raw), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    return blob, buffer


def dpapi_protect(raw: bytes) -> bytes:
    if os.name != "nt":
        raise RuntimeError("Penyimpanan token terenkripsi DPAPI hanya tersedia di Windows.")
    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    crypt32.CryptProtectData.argtypes = [
        ctypes.POINTER(DATA_BLOB), wintypes.LPCWSTR, ctypes.c_void_p,
        ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(DATA_BLOB)
    ]
    crypt32.CryptProtectData.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    in_blob, keepalive = _make_blob(raw)
    out_blob = DATA_BLOB()
    ok = crypt32.CryptProtectData(
        ctypes.byref(in_blob), "AI Content Factory YouTube token", None, None, None, 0,
        ctypes.byref(out_blob),
    )
    if not ok:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def save_encrypted_credentials(channel_key: str, credentials) -> None:
    encrypted = dpapi_protect(credentials.to_json().encode("utf-8"))
    path = TOKEN_DIR / f"{channel_key}.dpapi"
    temporary = path.with_suffix(".tmp")
    temporary.write_bytes(encrypted)
    temporary.replace(path)


def load_connections() -> dict[str, Any]:
    if not CONNECTIONS_FILE.exists():
        return {}
    try:
        data = json.loads(CONNECTIONS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        log.exception("Gagal membaca metadata koneksi lokal")
        return {}


connections_lock = threading.RLock()
connections: dict[str, Any] = load_connections()
# A process restart destroys local OAuth threads. Never leave a stale "connecting"
# status indefinitely after Windows reboot or application exit.
for _channel_key, _saved_connection in list(connections.items()):
    if isinstance(_saved_connection, dict) and _saved_connection.get("status") == "connecting":
        _saved_connection.update({
            "status": "interrupted",
            "message": "Worker dimulai ulang sebelum login Google selesai. Silakan hubungkan ulang channel.",
            "updatedAt": int(time.time()),
        })
        _saved_connection.pop("flowId", None)
active_flows: dict[str, dict[str, Any]] = {}
OAUTH_FLOW_TIMEOUT_SECONDS = 360

def expire_stale_oauth_flow(channel_key: str) -> bool:
    """Release an OAuth flow that never returned from the browser.

    Old threads are invalidated by flow_id and cannot overwrite a newer connection.
    The Google local-server flow has its own 300-second timeout as a second guard.
    """
    with connections_lock:
        entry = active_flows.get(channel_key)
        if not entry:
            return False
        started = float(entry.get("startedAt", 0) or 0)
        if time.time() - started <= OAUTH_FLOW_TIMEOUT_SECONDS:
            return False
        active_flows.pop(channel_key, None)
        current = dict(connections.get(channel_key) or {})
        if current.get("flowId") == entry.get("flowId") and current.get("status") == "connecting":
            current.update({
                "status": "expired",
                "message": "Sesi OAuth kedaluwarsa karena tidak selesai. Klik Login & Hubungkan Google untuk mencoba lagi.",
                "updatedAt": int(time.time()),
            })
            current.pop("flowId", None)
            connections[channel_key] = current
            save_connections()
        return True



def save_connections() -> None:
    temporary = CONNECTIONS_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(connections, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(CONNECTIONS_FILE)


# Persist interrupted OAuth states only after the save function exists.
try:
    if any(isinstance(value, dict) and value.get("status") == "interrupted" for value in connections.values()):
        save_connections()
except Exception:
    log.exception("Tidak dapat menormalkan status OAuth setelah Worker dimulai ulang")


def validate_desktop_client(client_doc: Any, expected_client_id: str = "") -> dict[str, Any]:
    if not isinstance(client_doc, dict) or not isinstance(client_doc.get("installed"), dict):
        raise ValueError("JSON OAuth harus berasal dari Desktop app dan memiliki bagian 'installed'.")
    installed = client_doc["installed"]
    client_id = str(installed.get("client_id", ""))
    client_secret = str(installed.get("client_secret", ""))
    if not CLIENT_ID_PATTERN.fullmatch(client_id):
        raise ValueError("Client ID dalam file JSON tidak valid.")
    if expected_client_id and client_id != expected_client_id:
        raise ValueError("Client ID dalam file JSON berbeda dari Client ID yang disimpan di dashboard.")
    if not client_secret:
        raise ValueError("File OAuth Desktop tidak memiliki client_secret.")
    if installed.get("auth_uri") != "https://accounts.google.com/o/oauth2/auth":
        raise ValueError("Auth URI tidak sesuai dengan Google OAuth.")
    if installed.get("token_uri") != "https://oauth2.googleapis.com/token":
        raise ValueError("Token URI tidak sesuai dengan Google OAuth.")
    return client_doc


def store_oauth_client_file(client_doc: dict[str, Any]) -> None:
    # Desktop OAuth client files are local app configuration, never written to Firestore.
    raw = json.dumps(client_doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    protected = dpapi_protect(raw)
    path = SECRETS_DIR / "desktop-oauth-client.dpapi"
    temporary = path.with_suffix(".tmp")
    temporary.write_bytes(protected)
    temporary.replace(path)


def load_oauth_client_file() -> dict[str, Any] | None:
    path = SECRETS_DIR / "desktop-oauth-client.dpapi"
    if not path.exists():
        return None
    if os.name != "nt":
        return None
    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    crypt32.CryptUnprotectData.argtypes = [
        ctypes.POINTER(DATA_BLOB), ctypes.c_void_p, ctypes.c_void_p,
        ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(DATA_BLOB)
    ]
    crypt32.CryptUnprotectData.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    encrypted = path.read_bytes()
    in_blob, keepalive = _make_blob(encrypted)
    out_blob = DATA_BLOB()
    ok = crypt32.CryptUnprotectData(
        ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob)
    )
    if not ok:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        raw = ctypes.string_at(out_blob.pbData, out_blob.cbData)
        parsed = json.loads(raw.decode("utf-8"))
        return validate_desktop_client(parsed)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def select_youtube_channel_for_slot(items: list[dict[str, Any]], channel_name: str) -> dict[str, Any]:
    """Select only an exact channel-name match, or the sole channel returned by Google."""
    if not items:
        raise RuntimeError("Akun Google yang dipilih tidak memiliki channel YouTube yang dapat diakses.")
    normalized_target = re.sub(r"[^a-z0-9]+", "", channel_name.lower())
    exact_matches = [
        candidate for candidate in items
        if re.sub(
            r"[^a-z0-9]+", "",
            str((candidate.get("snippet") or {}).get("title", "")).lower()
        ) == normalized_target
    ]
    if len(exact_matches) == 1:
        return exact_matches[0]
    if len(items) == 1:
        return items[0]
    visible = [
        str((candidate.get("snippet") or {}).get("title", "(tanpa nama)"))[:80]
        for candidate in items[:10]
    ]
    raise RuntimeError(
        "Akun Gmail ini memiliki beberapa channel YouTube dan tidak ada nama yang cocok persis "
        f"dengan slot {channel_name}. Tidak ada channel yang dipilih untuk mencegah salah upload. "
        "Samakan nama channel yang dituju atau gunakan akun yang hanya mengelola channel tersebut. "
        "Channel yang ditemukan: " + ", ".join(visible)
    )


def run_channel_oauth(channel_key: str, channel_name: str, client_id: str, owner_uid: str, flow_id: str) -> None:
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
        from google.auth.transport.requests import AuthorizedSession

        client_doc = load_oauth_client_file()
        if not client_doc:
            raise RuntimeError("File OAuth Desktop JSON belum dipasang. Buka Pengaturan dan pilih file JSON OAuth Desktop.")
        installed = client_doc["installed"]
        if installed.get("client_id") != client_id:
            raise RuntimeError("Client ID di dashboard berbeda dengan file OAuth Desktop yang dipasang.")

        log.info("Memulai OAuth untuk %s", channel_key)
        requested_scopes = list(SCOPES)
        if bool(CONFIG.get("includeMonetaryAnalytics", False)):
            requested_scopes.append(MONETARY_ANALYTICS_SCOPE)
        flow = InstalledAppFlow.from_client_config(client_doc, scopes=requested_scopes)
        credentials = flow.run_local_server(
            host="127.0.0.1", port=0, open_browser=True, access_type="offline",
            prompt="consent select_account",
            authorization_prompt_message="Pilih akun Google pemilik channel. Jika browser tidak terbuka, buka URL: {url}",
            success_message="Akun Google berhasil diotorisasi. Kamu dapat menutup tab ini dan kembali ke AI Content Factory.",
            timeout_seconds=300,
        )
        if not credentials.refresh_token:
            raise RuntimeError("Google tidak mengirim refresh token. Cabut akses aplikasi pada akun Google itu lalu ulangi proses koneksi.")

        youtube = build("youtube", "v3", credentials=credentials, cache_discovery=False)
        response = youtube.channels().list(part="snippet,statistics", mine=True, maxResults=10).execute()
        items = response.get("items") or []
        if not items:
            raise RuntimeError("Akun Google yang dipilih tidak memiliki channel YouTube yang dapat diakses.")
        item = select_youtube_channel_for_slot(items, channel_name)
        snippet = item.get("snippet", {})
        statistics = item.get("statistics", {})
        userinfo_response = AuthorizedSession(credentials).get(
            "https://www.googleapis.com/oauth2/v2/userinfo", timeout=15
        )
        userinfo_response.raise_for_status()
        email = userinfo_response.json().get("email", "")
        try:
            subscriber_count = int(statistics.get("subscriberCount")) if statistics.get("subscriberCount") is not None else None
        except (TypeError, ValueError):
            subscriber_count = None
        thumbnails = snippet.get("thumbnails") or {}
        thumbnail = (thumbnails.get("high") or thumbnails.get("medium") or thumbnails.get("default") or {}).get("url", "")
        result = {
            "channelKey": channel_key,
            "status": "connected",
            "ownerUid": owner_uid,
            "youtubeChannelId": item.get("id", ""),
            "youtubeChannelName": snippet.get("title", channel_name),
            "connectedGoogleEmail": email,
            "handle": snippet.get("customUrl", ""),
            "customUrl": snippet.get("customUrl", ""),
            "thumbnailUrl": thumbnail,
            "subscriberCount": subscriber_count,
            "connectedAt": int(time.time()),
            "message": "Channel berhasil dihubungkan.",
        }
        with connections_lock:
            active = active_flows.get(channel_key)
            if not active or active.get("flowId") != flow_id:
                log.warning("Hasil OAuth lama diabaikan untuk %s karena flow sudah dibatalkan/kedaluwarsa.", channel_key)
                return
            save_encrypted_credentials(channel_key, credentials)
            result["flowId"] = flow_id
            connections[channel_key] = result
            save_connections()
        log.info("OAuth berhasil: %s -> %s (%s)", channel_key, result["youtubeChannelId"], email)
    except Exception as exc:
        log.exception("OAuth gagal untuk %s", channel_key)
        with connections_lock:
            active = active_flows.get(channel_key)
            if active and active.get("flowId") == flow_id:
                connections[channel_key] = {
                    "channelKey": channel_key,
                    "status": "error",
                    "ownerUid": owner_uid,
                    "message": str(exc)[:700],
                    "updatedAt": int(time.time()),
                }
                save_connections()
    finally:
        with connections_lock:
            active = active_flows.get(channel_key)
            if active and active.get("flowId") == flow_id:
                active_flows.pop(channel_key, None)



# -------------------- AI WORKFORCE ENGINE v1.0 --------------------
# Ollama is the primary text engine. Optional Groq is an editorial reviewer;
# ElevenLabs provides Indonesian neural TTS; ComfyUI generates local images;
# Openverse is a curated-image fallback; faster-whisper transcribes locally.
# FFmpeg assembles the final visual story. Provider/model limits and licenses apply.

WORKER_STOP = threading.Event()
TASK_LOCK = threading.RLock()
OLLAMA_REQUEST_LOCK = threading.Lock()
SCHEDULER_LAST_RUN_FILE = LOCAL_APP_DATA / "scheduler-last-run.txt"
AUTO_TOPIC_SEEDS = {
    "bible-stories-3d": [
        ("Daud dan Goliat", "1 Samuel 17"), ("Nuh dan bahtera", "Kejadian 6–9"),
        ("Daniel di gua singa", "Daniel 6"), ("Yunus dan ikan besar", "Yunus 1–4"),
        ("Musa memimpin Israel keluar dari Mesir", "Keluaran 12–14"),
        ("Ester berani membela bangsanya", "Ester 4–7"),
        ("Yesus meredakan angin ribut", "Markus 4:35–41"),
    ],
    "daily-faith-inspiration": [
        ("Tetap berharap ketika keadaan sulit", "Roma 5:1–5"),
        ("Belajar mengampuni", "Matius 18:21–35"),
        ("Berani melakukan kebaikan", "Lukas 10:25–37"),
        ("Bersyukur dalam segala keadaan", "1 Tesalonika 5:16–18"),
        ("Jangan kuatir tentang hari esok", "Matius 6:25–34"),
        ("Melayani dengan kasih", "Yohanes 13:1–17"),
    ],
    "bible-facts-mysteries": [
        ("Mengapa Daud memilih lima batu licin?", "1 Samuel 17:40"),
        ("Apa arti perumpamaan tentang penabur?", "Matius 13:1–23"),
        ("Siapakah Debora dalam Alkitab?", "Hakim-hakim 4–5"),
        ("Mengapa kota Yerikho penting?", "Yosua 6"),
        ("Apa tugas orang Samaria yang baik hati?", "Lukas 10:25–37"),
        ("Mengapa murid-murid disebut rasul?", "Markus 3:13–19"),
    ],
}
ANALYTICS_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly"
MONETARY_ANALYTICS_SCOPE = "https://www.googleapis.com/auth/yt-analytics-monetary.readonly"
REACH_REPORT_TYPE_ID = "channel_reach_basic_a1"


def _word_shingles(text: str, width: int = 3) -> set[str]:
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    if len(words) < width:
        return set(words)
    return {" ".join(words[i:i + width]) for i in range(len(words) - width + 1)}


def script_similarity_against_history(narration: str, task_id: str, channel_key: str) -> dict[str, Any]:
    current = _word_shingles(narration)
    if not current:
        return {"maxSimilarity": 0.0, "compared": 0, "matchedTaskId": ""}
    compared = 0
    best = 0.0
    best_id = ""
    try:
        with task_db_connection() as con:
            rows = con.execute(
                "SELECT task_id,result_json FROM tasks WHERE channel_id=? AND task_id<>? AND status IN ('completed','ready_to_upload') ORDER BY created_at DESC LIMIT 40",
                (channel_key, task_id),
            ).fetchall()
        for other_id, result_json in rows:
            try:
                result = json.loads(result_json or "{}")
                other_text = str(result.get("narration") or (result.get("script") or {}).get("narration") or "")
                other = _word_shingles(other_text)
                if not other:
                    continue
                score = len(current & other) / max(1, len(current | other))
                compared += 1
                if score > best:
                    best, best_id = score, str(other_id)
            except Exception:
                continue
    except Exception as exc:
        log.warning("Pemeriksaan kemiripan riwayat tidak tersedia: %s", exc)
    return {"maxSimilarity": round(best, 4), "compared": compared, "matchedTaskId": best_id}


def inspect_audio_file(audio_path: Path) -> dict[str, Any]:
    result = {"exists": audio_path.exists(), "validWave": False, "durationSeconds": 0.0,
              "sampleRate": 0, "channels": 0, "rms": 0.0, "peak": 0.0,
              "clippingRatio": 0.0, "nearSilenceRatio": 0.0, "passed": False, "issues": [], "warnings": []}
    if not audio_path.exists():
        result["issues"].append("File audio narasi tidak ditemukan.")
        return result
    try:
        import array
        with wave.open(str(audio_path), "rb") as wav:
            channels = wav.getnchannels()
            sample_rate = wav.getframerate()
            width = wav.getsampwidth()
            frames = wav.getnframes()
            duration = frames / float(sample_rate or 1)
            if width != 2:
                raise ValueError(f"Audio harus PCM 16-bit, saat ini {width * 8}-bit.")
            raw = wav.readframes(min(frames, sample_rate * 60))
            samples = array.array("h")
            samples.frombytes(raw)
            if not samples:
                raise ValueError("Audio tidak berisi sampel suara.")
            # Windows WAV is little-endian. Convert defensively on big-endian hosts.
            if os.sys.byteorder != "little":
                samples.byteswap()
            absolute = [abs(x) for x in samples]
            peak = max(absolute) / 32768.0
            rms = math.sqrt(sum(x * x for x in samples) / len(samples)) / 32768.0
            clipped = sum(1 for x in absolute if x >= 32700) / len(absolute)
            silence_ratio = sum(1 for x in absolute if x < 150) / len(absolute)
            result.update({"validWave": True, "durationSeconds": round(duration, 2),
                           "sampleRate": sample_rate, "channels": channels,
                           "rms": round(rms, 5), "peak": round(peak, 5),
                           "clippingRatio": round(clipped, 6), "nearSilenceRatio": round(silence_ratio, 5)})
            if duration < 5:
                result["issues"].append("Durasi audio kurang dari 5 detik.")
            if rms < 0.004 or peak < 0.02:
                result["issues"].append("Level suara terlalu rendah atau hampir senyap.")
            if clipped > 0.01:
                result["issues"].append("Lebih dari 1% sampel audio mendekati clipping.")
            if silence_ratio > 0.95:
                result["issues"].append("Lebih dari 95% sampel audio hampir senyap; narasi mungkin tidak terdengar.")
            elif silence_ratio > 0.80:
                result["warnings"].append("Sebagian besar sampel audio berada dekat level senyap; dengarkan hasil narasi.")
            result["passed"] = not result["issues"]
    except Exception as exc:
        result["issues"].append(f"Audio tidak dapat diperiksa: {exc}")
    return result


def inspect_subtitle_file(subtitle_path: Path, expected_scenes: int, video_duration_seconds: float = 0.0,
                          narration: str = "") -> dict[str, Any]:
    result = {"exists": subtitle_path.exists(), "cueCount": 0, "validCues": 0,
              "overlapCount": 0, "durationSeconds": 0.0, "passed": False, "issues": [], "warnings": [],
              "narrationWordCoverage": None}
    if not subtitle_path.exists():
        result["issues"].append("File subtitle SRT tidak ditemukan.")
        return result
    try:
        content = subtitle_path.read_text(encoding="utf-8-sig", errors="replace")
        blocks = re.split(r"\r?\n\s*\r?\n", content.strip())
        valid = 0
        previous_end = -1
        max_end = 0
        overlaps = 0

        def to_ms(value: str) -> int:
            hh, mm, rest = value.split(":")
            ss, millis = rest.split(",")
            return ((int(hh) * 60 + int(mm)) * 60 + int(ss)) * 1000 + int(millis)

        for block in blocks:
            lines = [line.strip() for line in block.splitlines() if line.strip()]
            if len(lines) < 3:
                continue
            timing = re.match(r"^(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})$", lines[1])
            text = " ".join(lines[2:]).strip()
            if not timing or not text:
                continue
            begin, finish = to_ms(timing.group(1)), to_ms(timing.group(2))
            if begin >= finish:
                continue
            valid += 1
            max_end = max(max_end, finish)
            if previous_end >= 0 and begin < previous_end - 80:
                overlaps += 1
            previous_end = max(previous_end, finish)
            if len(text) > 220:
                result["warnings"].append(f"Cue {valid} panjang ({len(text)} karakter); periksa keterbacaan subtitle.")
            if finish - begin > 12000:
                result["issues"].append(f"Cue {valid} tampil lebih dari 12 detik; pecah cue atau rapikan timing subtitle.")

        result["cueCount"] = len(blocks)
        result["validCues"] = valid
        result["overlapCount"] = overlaps
        result["durationSeconds"] = round(max_end / 1000, 2)
        if narration.strip():
            subtitle_text = " ".join(
                line.strip() for block in blocks for line in block.splitlines()[2:] if line.strip()
            )
            narration_words = set(re.findall(r"[a-z0-9]+", narration.casefold()))
            subtitle_words = set(re.findall(r"[a-z0-9]+", subtitle_text.casefold()))
            coverage = len(narration_words & subtitle_words) / max(1, len(narration_words))
            result["narrationWordCoverage"] = round(coverage, 3)
            if coverage < 0.35:
                result["warnings"].append("Kecocokan kata subtitle dengan naskah relatif rendah; periksa apakah subtitle merangkum narasi secara tepat.")
        minimum = max(3, min(expected_scenes, 7))
        if valid < minimum:
            result["issues"].append(f"Subtitle valid hanya {valid}; target minimal {minimum} cue.")
        if overlaps:
            result["issues"].append(f"Ditemukan {overlaps} cue subtitle saling tumpang-tindih.")
        if video_duration_seconds and max_end / 1000 > video_duration_seconds + 0.35:
            result["issues"].append("Waktu akhir subtitle melebihi durasi video.")
        result["passed"] = not result["issues"]
    except Exception as exc:
        result["issues"].append(f"SRT tidak dapat dibaca: {exc}")
    return result


def inspect_video_file(video_path: Path, video_info: dict[str, Any]) -> dict[str, Any]:
    result = {"exists": video_path.exists(), "sizeBytes": 0, "decodePassed": False,
              "audioStreamPresent": False, "blackSegments": 0,
              "width": int(video_info.get("width", 0) or 0),
              "height": int(video_info.get("height", 0) or 0),
              "fps": float(video_info.get("fps", 0) or 0),
              "durationSeconds": float(video_info.get("durationSeconds", 0) or 0),
              "passed": False, "issues": [], "warnings": []}
    if not video_path.exists():
        result["issues"].append("File MP4 tidak ditemukan.")
        return result
    result["sizeBytes"] = video_path.stat().st_size
    if result["sizeBytes"] < 30000:
        result["issues"].append("Ukuran MP4 terlalu kecil untuk hasil Shorts yang valid.")
    try:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        # ffmpeg prints stream metadata while decoding. This verifies real media metadata,
        # instead of trusting only the renderer's in-memory return object.
        probe = run_media_command([ffmpeg, "-hide_banner", "-i", str(video_path), "-f", "null", "-"],
                               capture_output=True, text=True, timeout=180)
        metadata = (probe.stderr or "")
        video_line = next((line for line in metadata.splitlines() if "Video:" in line), "")
        audio_line = next((line for line in metadata.splitlines() if "Audio:" in line), "")
        result["audioStreamPresent"] = bool(audio_line)
        video_codec_match = re.search(r"\bVideo:\s*([^,\s]+)", video_line, re.IGNORECASE)
        audio_codec_match = re.search(r"\bAudio:\s*([^,\s]+)", audio_line, re.IGNORECASE)
        result["videoCodec"] = (video_codec_match.group(1) if video_codec_match else "")[:40]
        result["audioCodec"] = (audio_codec_match.group(1) if audio_codec_match else "")[:40]
        resolution = re.search(r"\b(\d{2,5})x(\d{2,5})\b", video_line)
        if resolution:
            result["width"], result["height"] = int(resolution.group(1)), int(resolution.group(2))
        fps = re.search(r"(?:^|,\s*)(\d+(?:\.\d+)?)\s+fps\b", video_line)
        if fps:
            result["fps"] = float(fps.group(1))
        duration = re.search(r"Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)", metadata)
        if duration:
            hh, mm, ss = duration.groups()
            result["durationSeconds"] = int(hh) * 3600 + int(mm) * 60 + float(ss)
        if not video_line:
            result["issues"].append("FFmpeg tidak menemukan stream video yang dapat dibaca.")
        if not result["audioStreamPresent"]:
            result["issues"].append("Stream audio tidak ditemukan di dalam MP4.")
        if "h264" not in result["videoCodec"].lower():
            result["issues"].append(f"Codec video aktual bukan H.264 (terdeteksi: {result['videoCodec'] or 'tidak diketahui'}).")
        if "aac" not in result["audioCodec"].lower():
            result["issues"].append(f"Codec audio aktual bukan AAC (terdeteksi: {result['audioCodec'] or 'tidak diketahui'}).")
        if result["width"] != 720 or result["height"] != 1280:
            result["issues"].append("Resolusi aktual MP4 tidak sesuai target portrait 720x1280.")
        if not (29.0 <= result["fps"] <= 31.0):
            result["issues"].append("Frame rate aktual video tidak mendekati 30 FPS.")
        if not (20 <= result["durationSeconds"] <= 60):
            result["issues"].append("Durasi aktual video berada di luar target internal 20–60 detik.")
        decode = run_media_command([ffmpeg, "-hide_banner", "-v", "error", "-i", str(video_path),
                                 "-map", "0:v:0", "-map", "0:a:0?", "-f", "null", "-"],
                                capture_output=True, text=True, timeout=240)
        decode_errors = (decode.stderr or "").strip()
        result["decodePassed"] = decode.returncode == 0 and not decode_errors
        if not result["decodePassed"]:
            result["issues"].append("FFmpeg menemukan error saat mendekode video/audio penuh." + (" " + decode_errors[-500:] if decode_errors else ""))
        # Reject long black frames; short fades/transitions remain allowed.
        black = run_media_command([ffmpeg, "-hide_banner", "-loglevel", "info", "-i", str(video_path),
                                "-vf", "blackdetect=d=1.5:pix_th=0.08", "-an", "-f", "null", "-"],
                               capture_output=True, text=True, timeout=240)
        black_text = (black.stderr or "")
        black_matches = re.findall(r"black_duration:([0-9.]+)", black_text)
        long_black = [float(value) for value in black_matches if float(value) >= 1.5]
        result["blackSegments"] = len(long_black)
        if long_black:
            result["issues"].append(f"Ditemukan {len(long_black)} segmen layar hampir hitam berdurasi minimal 1,5 detik.")
        if black.returncode != 0:
            result["warnings"].append("Deteksi layar hitam tidak dapat dijalankan; hasil decode utama tetap diperiksa.")
    except Exception as exc:
        result["issues"].append(f"Pemeriksaan metadata/decode FFmpeg gagal: {exc}")
    result["passed"] = not result["issues"]
    return result


def inspect_asset_licenses(assets: list[dict[str, Any]]) -> dict[str, Any]:
    checked = 0
    external_checked = 0
    generated_checked = 0
    issues: list[str] = []
    warnings: list[str] = []
    seen_hashes: dict[str, int] = {}
    for index, asset in enumerate(assets):
        local_file = str(asset.get("localFile", ""))
        if not local_file:
            # Locally generated graphic cards do not contain third-party image files.
            continue
        checked += 1
        license_code = str(asset.get("license", "")).upper()
        source = str(asset.get("sourceUrl", ""))
        creator = str(asset.get("creator", "")).strip()
        license_url = str(asset.get("licenseUrl", ""))
        provider_name = str(asset.get("provider", "")).lower()
        is_generated = bool(asset.get("synthetic")) and (provider_name.startswith("local-ai") or provider_name.startswith("google veo") or provider_name.startswith("google flow"))
        if is_generated:
            generated_checked += 1
            warnings.append(
                f"Aset {index + 1}: gambar dibuat AI ({asset.get('model', 'model lokal')}); "
                "review label konten sintetis YouTube untuk visual yang tampak realistis."
            )
        else:
            external_checked += 1
            if license_code not in ("CC0", "BY"):
                issues.append(f"Aset {index + 1}: lisensi tidak termasuk CC0/CC-BY.")
            if not source.startswith("https://"):
                issues.append(f"Aset {index + 1}: URL sumber tidak tersedia atau tidak aman.")
            if license_code == "BY" and (not creator or creator.casefold() in {"unknown", "unknown creator", "n/a"}):
                issues.append(f"Aset {index + 1}: lisensi CC-BY memerlukan nama pembuat yang jelas untuk atribusi.")
            if license_code == "BY" and not license_url.startswith("https://"):
                issues.append(f"Aset {index + 1}: tautan lisensi CC-BY tidak tersedia untuk atribusi.")
        path = Path(local_file)
        if not path.exists():
            issues.append(f"Aset {index + 1}: file aset lokal hilang.")
            continue
        if path.stat().st_size < 1024:
            issues.append(f"Aset {index + 1}: file gambar/video terlalu kecil atau kosong.")
            continue
        if str(asset.get("mediaType", "image")) == "video":
            try:
                duration = probe_video_editor_duration(shutil.which("ffmpeg") or __import__("imageio_ffmpeg").get_ffmpeg_exe(), path)
                if duration < 1:
                    issues.append(f"Aset {index + 1}: klip video terlalu pendek.")
                if not is_generated:
                    warnings.append(f"Aset video {index + 1} diimpor dari luar; pemilik tetap harus memeriksa hak pakai dan kandungannya.")
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                if digest in seen_hashes:
                    warnings.append(f"Aset {index + 1} sama persis dengan aset {seen_hashes[digest]}; periksa variasi visual.")
                else:
                    seen_hashes[digest] = index + 1
                continue
            except Exception as exc:
                issues.append(f"Aset video {index + 1}: tidak dapat diputar ({str(exc)[:140]}).")
                continue
        try:
            from PIL import Image
            with Image.open(path) as image:
                image.verify()
            with Image.open(path) as image:
                width, height = image.size
                if width < 240 or height < 240:
                    issues.append(f"Aset {index + 1}: resolusi gambar terlalu rendah ({width}x{height}).")
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest in seen_hashes:
                warnings.append(f"Aset {index + 1} sama persis dengan aset {seen_hashes[digest]}; periksa variasi visual.")
            else:
                seen_hashes[digest] = index + 1
        except Exception as exc:
            issues.append(f"Aset {index + 1}: gambar tidak dapat didekode ({str(exc)[:140]}).")
    if external_checked:
        warnings.append("Metadata lisensi aset eksternal diperiksa otomatis, tetapi pemilik tetap harus membuka sumber asli untuk memastikan hak penggunaan dan atribusi.")
    if generated_checked:
        warnings.append("Aset AI generatif tidak memiliki atribusi Openverse; periksa syarat model dan kewajiban pengungkapan konten sintetis sebelum publikasi.")
    if not checked:
        warnings.append("Tidak ada gambar eksternal/AI yang berhasil digunakan; adegan memakai kartu grafis lokal. Pertimbangkan menambahkan aset asli agar visual lebih kaya.")
    return {
        "checkedAssets": checked,
        "externalAssetsChecked": external_checked,
        "generatedAssetsChecked": generated_checked,
        "issues": issues,
        "warnings": warnings,
        "passed": not issues,
    }


def run_advanced_quality_checks(video_path: Path, audio_path: Path, subtitle_path: Path,
                                video_info: dict[str, Any], scenes: list[dict[str, Any]],
                                assets: list[dict[str, Any]], narration: str,
                                task_id: str, channel_key: str) -> dict[str, Any]:
    video = inspect_video_file(video_path, video_info)
    audio = inspect_audio_file(audio_path)
    subtitle = inspect_subtitle_file(subtitle_path, len(scenes), float(video.get("durationSeconds", 0) or 0), narration)
    licensing = inspect_asset_licenses(assets)
    similarity = script_similarity_against_history(narration, task_id, channel_key)
    duration_delta = abs(float(video.get("durationSeconds", 0) or 0) - float(audio.get("durationSeconds", 0) or 0))
    audio_video_sync = {"durationDeltaSeconds": round(duration_delta, 2), "passed": duration_delta <= 2.5, "issues": []}
    if not audio_video_sync["passed"]:
        audio_video_sync["issues"].append(f"Selisih durasi audio/video {duration_delta:.1f} detik; periksa sinkronisasi.")
    similarity_issues = []
    similarity_warnings = []
    if similarity["maxSimilarity"] >= 0.86:
        similarity_issues.append(f"Naskah sangat mirip dengan tugas sebelumnya ({similarity['maxSimilarity']:.0%}); perlu ditulis ulang.")
    elif similarity["maxSimilarity"] >= 0.70:
        similarity_warnings.append(f"Kemiripan naskah cukup tinggi ({similarity['maxSimilarity']:.0%}); periksa orisinalitas.")
    actual_visual_assets = sum(1 for asset in assets if asset.get("localFile") and Path(str(asset.get("localFile"))).exists())
    visual_coverage = actual_visual_assets / max(1, len(scenes))
    visual_issues = []
    if visual_coverage < 0.5:
        visual_issues.append(f"Visual layak baru tersedia untuk {actual_visual_assets}/{len(scenes)} adegan. Minimal 50% adegan harus memakai gambar/ilustrasi nyata; kartu grafis saja belum cukup untuk upload.")
    checks = [
        {"id": "video", "label": "Integritas & format video", "passed": video["passed"], "score": 100 if video["passed"] else 0, "issues": video["issues"]},
        {"id": "visuals", "label": "Kecukupan visual adegan", "passed": not visual_issues, "score": round(visual_coverage*100), "issues": visual_issues},
        {"id": "audio", "label": "Audio & level suara", "passed": audio["passed"] and audio_video_sync["passed"], "score": 100 if audio["passed"] and audio_video_sync["passed"] else 0, "issues": audio["issues"] + audio_video_sync["issues"]},
        {"id": "subtitle", "label": "Subtitle SRT", "passed": subtitle["passed"], "score": 100 if subtitle["passed"] else 0, "issues": subtitle["issues"]},
        {"id": "license", "label": "Atribusi & lisensi aset", "passed": licensing["passed"], "score": 100 if licensing["passed"] else 0, "issues": licensing["issues"]},
        {"id": "originality", "label": "Kemiripan naskah internal", "passed": not similarity_issues, "score": round((1-similarity["maxSimilarity"])*100), "issues": similarity_issues + similarity_warnings},
    ]
    blockers = [issue for item in checks if not item["passed"] for issue in item["issues"]]
    warnings = licensing["warnings"] + similarity_warnings + audio.get("warnings", []) + subtitle.get("warnings", [])
    checks_passed = sum(1 for item in checks if item["passed"])
    return {
        "passed": not blockers,
        "score": round(sum(item["score"] for item in checks) / max(1, len(checks))),
        "checks": checks,
        "video": video,
        "audio": audio,
        "audioVideoSync": audio_video_sync,
        "subtitle": subtitle,
        "license": licensing,
        "originality": similarity,
        "blockers": blockers,
        "warnings": warnings,
        "checksPassed": checks_passed,
        "checksTotal": len(checks),
        "summary": f"{checks_passed}/{len(checks)} pemeriksaan teknis/editorial lulus; {len(blockers)} masalah penghambat.",
    }


def write_subtitle_and_credit_files(scenes: list[dict[str, Any]], duration_seconds: float,
                                    credits: list[str], work_dir: Path, narration: str = "",
                                    alignment_path: Path | None = None) -> dict[str, Any]:
    def stamp(sec: float) -> str:
        total_ms = max(0, int(round(sec * 1000)))
        hh, rem = divmod(total_ms, 3600000)
        mm, rem = divmod(rem, 60000)
        ss, ms = divmod(rem, 1000)
        return f"{hh:02d}:{mm:02d}:{ss:02d},{ms:03d}"

    text = re.sub(r"\s+", " ", str(narration or "")).strip()
    chunks: list[str] = []
    if text:
        sentences = re.split(r"(?<=[.!?])\s+", text)
        for sentence in sentences:
            words = sentence.split()
            while words:
                take = min(9, len(words))
                if len(words) > 9:
                    for pos in range(min(9, len(words)), 4, -1):
                        if words[pos - 1].endswith((",", ";", ":")):
                            take = pos
                            break
                chunks.append(" ".join(words[:take]))
                words = words[take:]
    if not chunks:
        for scene in scenes:
            part = str(scene.get("narrationSegment") or scene.get("caption") or "").strip()
            if part:
                words = part.split()
                chunks.extend(" ".join(words[i:i+9]) for i in range(0, len(words), 9))
    if not chunks:
        chunks = [str(scene.get("visualTitle") or "") for scene in scenes if str(scene.get("visualTitle") or "").strip()]
    if not chunks:
        chunks = ["" for _ in range(max(3, len(scenes)))]

    alignment = {}
    if alignment_path and Path(alignment_path).exists():
        try:
            alignment = json.loads(Path(alignment_path).read_text(encoding="utf-8"))
        except Exception:
            alignment = {}
    chars = alignment.get("characters") or []
    starts = alignment.get("characterStartTimesSeconds") or []
    ends = alignment.get("characterEndTimesSeconds") or []
    aligned_text = "".join(str(x) for x in chars).casefold()
    cursor_char = 0
    timed = []
    matched = 0
    weights = [max(1, len(re.findall(r"\S+", chunk))) for chunk in chunks]
    total_weight = sum(weights) or len(chunks)
    proportional_cursor = 0.0
    for index, (chunk, weight) in enumerate(zip(chunks, weights), 1):
        needle = chunk.casefold()
        pos = aligned_text.find(needle, cursor_char) if needle else -1
        if pos >= 0 and pos < len(starts) and pos + len(needle) - 1 < len(ends):
            begin = max(0.0, float(starts[pos] or 0))
            finish = min(duration_seconds, max(begin + 0.12, float(ends[pos + len(needle) - 1] or begin + 0.12)))
            cursor_char = pos + len(needle)
            matched += 1
            source = "elevenlabs-character-alignment"
        else:
            begin = duration_seconds * proportional_cursor / total_weight
            proportional_cursor += weight
            finish = duration_seconds if index == len(chunks) else duration_seconds * proportional_cursor / total_weight
            source = "proportional-fallback"
        timed.append((chunk, begin, finish, source))

    if matched < max(1, int(len(chunks) * 0.7)):
        timed = []
        proportional_cursor = 0.0
        for index, (chunk, weight) in enumerate(zip(chunks, weights), 1):
            begin = duration_seconds * proportional_cursor / total_weight
            proportional_cursor += weight
            finish = duration_seconds if index == len(chunks) else duration_seconds * proportional_cursor / total_weight
            timed.append((chunk, begin, finish, "proportional-fallback"))

    srt_lines = []
    cursor_time = 0.0
    for index, (chunk, begin, finish, _source) in enumerate(timed, 1):
        start_time = max(cursor_time, min(duration_seconds, begin))
        end_time = max(start_time + 0.12, min(duration_seconds, finish))
        if index == len(timed):
            end_time = duration_seconds
        if end_time <= start_time:
            continue
        srt_lines.extend([str(index), f"{stamp(start_time)} --> {stamp(end_time)}", chunk, ""])
        cursor_time = end_time
    subtitle_path = work_dir / "subtitles.srt"
    subtitle_path.write_text("\n".join(srt_lines), encoding="utf-8-sig")
    credits_path = work_dir / "asset-credits.txt"
    credits_path.write_text("\n".join(credits) if credits else "Tidak ada aset eksternal.", encoding="utf-8")
    timing_source = "ElevenLabs character-level alignment" if matched >= max(1, int(len(chunks) * 0.7)) else "proportional fallback"
    return {"subtitleFile": str(subtitle_path), "creditsFile": str(credits_path), "cueCount": len(srt_lines)//4,
            "timingSource": timing_source, "matchedCues": matched, "totalCues": len(chunks)}


def _parse_report_date(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
    except Exception:
        return raw[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", raw) else ""


def _report_timestamp(value: str | None) -> float:
    raw = str(value or "").strip()
    if not raw:
        return 0.0
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except Exception:
        return 0.0


def sync_youtube_reach_reporting(channel_key: str, credentials, start_date, end_date) -> dict[str, Any]:
    """Import daily Reach Basic CSV reports without double-counting backfills.

    The Reporting API generates daily reports asynchronously (often up to 24 h).
    Imported report IDs are recorded even for empty CSV files. The current cache
    uses one row per channel/date/video so a replacement/backfilled file replaces
    that day's previous values rather than adding duplicate impressions.
    """
    result = {
        "status": "pending", "impressions": None, "ctrPercent": None,
        "byVideo": [], "reportsImported": 0, "rowsImported": 0, "warning": ""
    }
    try:
        from googleapiclient.discovery import build
        from google.auth.transport.requests import AuthorizedSession
    except Exception as exc:
        result["status"] = "unavailable"
        result["warning"] = f"Library YouTube Reporting API belum tersedia: {str(exc)[:180]}"
        return result

    try:
        reporting = build("youtubereporting", "v1", credentials=credentials, cache_discovery=False)
        types_response = reporting.reportTypes().list().execute()
        types = types_response.get("reportTypes") or []
        if not any(str(item.get("id")) == REACH_REPORT_TYPE_ID for item in types):
            result["status"] = "unavailable"
            result["warning"] = "Reach Basic belum tersedia untuk channel ini. Pastikan YouTube Reporting API aktif dan akun memberi izin yt-analytics.readonly."
            return result

        jobs_response = reporting.jobs().list().execute()
        jobs = jobs_response.get("jobs") or []
        job = next((item for item in jobs if item.get("reportTypeId") == REACH_REPORT_TYPE_ID), None)
        if not job:
            try:
                job = reporting.jobs().create(body={
                    "reportTypeId": REACH_REPORT_TYPE_ID,
                    "name": f"AI Content Factory Reach Basic {channel_key}"
                }).execute()
            except Exception as create_exc:
                # A second sync may race to create the same report job.
                jobs_response = reporting.jobs().list().execute()
                jobs = jobs_response.get("jobs") or []
                job = next((item for item in jobs if item.get("reportTypeId") == REACH_REPORT_TYPE_ID), None)
                if not job:
                    raise create_exc

        job_id = str(job.get("id") or "")
        if not job_id:
            raise RuntimeError("YouTube Reporting API tidak mengembalikan Job ID.")

        start_filter = datetime.combine(start_date - timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        end_filter = datetime.combine(end_date + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        session = AuthorizedSession(credentials)
        page_token = None
        imported_reports = 0
        imported_rows = 0
        pages = 0
        while pages < 10:
            params = {"jobId": job_id, "startTimeAtOrAfter": start_filter, "startTimeBefore": end_filter, "pageSize": 50}
            if page_token:
                params["pageToken"] = page_token
            page = reporting.jobs().reports().list(**params).execute()
            reports = page.get("reports") or []
            # Older reports are processed first; a later replacement can then win.
            reports.sort(key=lambda item: (_report_timestamp(item.get("createTime")), _report_timestamp(item.get("startTime"))))
            for report in reports:
                report_id = str(report.get("id") or "")
                if not report_id:
                    continue
                with task_db_connection() as con:
                    exists = con.execute(
                        "SELECT 1 FROM reach_reporting_imports WHERE channel_key=? AND report_id=? LIMIT 1",
                        (channel_key, report_id),
                    ).fetchone()
                if exists:
                    continue
                download_url = str(report.get("downloadUrl") or "")
                parsed_url = urllib.parse.urlparse(download_url)
                host = (parsed_url.hostname or "").lower()
                allowed_host = host == "googleapis.com" or host.endswith(".googleapis.com") or host.endswith(".googleusercontent.com")
                if parsed_url.scheme != "https" or not allowed_host:
                    raise RuntimeError("URL unduhan Reporting API tidak menggunakan domain Google HTTPS yang diizinkan.")
                response = session.get(download_url, timeout=(15, 90), stream=True)
                response.raise_for_status()
                chunks = []
                size = 0
                for chunk in response.iter_content(chunk_size=1024 * 128):
                    if not chunk:
                        continue
                    size += len(chunk)
                    if size > 50 * 1024 * 1024:
                        raise RuntimeError("File laporan Reach melebihi batas aman 50 MB.")
                    chunks.append(chunk)
                raw_csv = b"".join(chunks).decode("utf-8-sig", errors="replace")
                reader = csv.DictReader(io.StringIO(raw_csv))
                rows_to_save = []
                report_create_time = _report_timestamp(report.get("createTime")) or time.time()
                report_dates = set()
                for row in reader:
                    report_date = _parse_report_date(row.get("date", ""))
                    video_id = str(row.get("video_id") or "").strip()
                    if not report_date or not (start_date.isoformat() <= report_date <= end_date.isoformat()) or not video_id:
                        continue
                    try:
                        impressions = max(0, int(float(row.get("video_thumbnail_impressions") or 0)))
                        ctr_percent = max(0.0, min(100.0, float(row.get("video_thumbnail_impressions_ctr") or 0)))
                    except (ValueError, TypeError):
                        continue
                    report_dates.add(report_date)
                    rows_to_save.append((channel_key, report_date, video_id, impressions, ctr_percent, report_id, report_create_time, time.time()))

                # Atomic import: replace all rows for dates represented in this
                # complete report, then mark even an empty report as imported.
                with task_db_connection() as con:
                    for report_date in report_dates:
                        con.execute(
                            "DELETE FROM reach_reporting_current_rows WHERE channel_key=? AND report_date=?",
                            (channel_key, report_date),
                        )
                    if rows_to_save:
                        con.executemany(
                            "INSERT OR REPLACE INTO reach_reporting_current_rows(channel_key,report_date,video_id,impressions,ctr_percent,report_id,source_create_time,imported_at) VALUES(?,?,?,?,?,?,?,?)",
                            rows_to_save,
                        )
                    con.execute(
                        "INSERT OR IGNORE INTO reach_reporting_imports(channel_key,report_id,start_time,end_time,create_time,imported_at,rows_count) VALUES(?,?,?,?,?,?,?)",
                        (channel_key, report_id, str(report.get("startTime", ""))[:40], str(report.get("endTime", ""))[:40], report_create_time, time.time(), len(rows_to_save)),
                    )
                    con.commit()
                imported_reports += 1
                imported_rows += len(rows_to_save)
            page_token = page.get("nextPageToken")
            pages += 1
            if not page_token:
                break

        with task_db_connection() as con:
            rows = con.execute(
                "SELECT report_date,video_id,impressions,ctr_percent FROM reach_reporting_current_rows WHERE channel_key=? AND report_date>=? AND report_date<=?",
                (channel_key, start_date.isoformat(), end_date.isoformat()),
            ).fetchall()
        by_video: dict[str, dict[str, Any]] = {}
        total_impressions = 0
        ctr_weighted = 0.0
        for report_date, video_id, impressions, ctr_percent in rows:
            impressions = max(0, int(impressions or 0))
            ctr_percent = max(0.0, min(100.0, float(ctr_percent or 0)))
            total_impressions += impressions
            ctr_weighted += impressions * ctr_percent
            item = by_video.setdefault(video_id, {"videoId": video_id, "impressions": 0, "weightedCtr": 0.0})
            item["impressions"] += impressions
            item["weightedCtr"] += impressions * ctr_percent
        result["reportsImported"] = imported_reports
        result["rowsImported"] = imported_rows
        if total_impressions > 0:
            result.update({
                "status": "ready", "impressions": total_impressions,
                "ctrPercent": round(ctr_weighted / total_impressions, 4),
                "byVideo": [
                    {"videoId": item["videoId"], "impressions": item["impressions"],
                     "ctrPercent": round(item["weightedCtr"] / item["impressions"], 4) if item["impressions"] else None}
                    for item in sorted(by_video.values(), key=lambda value: value["impressions"], reverse=True)[:50]
                ],
            })
        else:
            result["status"] = "pending"
            result["warning"] = "Job Reach Basic sudah disiapkan. Laporan harian pertama dapat memerlukan hingga 24 jam; angka CTR belum tersedia dan tidak dianggap nol."
        return result
    except Exception as exc:
        text = str(exc)
        result["status"] = "unavailable"
        if "403" in text or "insufficient" in text.lower():
            result["warning"] = "Reach Reporting API memerlukan scope yt-analytics.readonly, API aktif, dan otorisasi ulang channel jika scope baru ditambahkan. " + text[:220]
        else:
            result["warning"] = f"Reach Reporting API belum berhasil diambil: {text[:260]}"
        return result


def sync_youtube_analytics(channel_key: str, owner_uid: str, days: int = 28) -> dict[str, Any]:
    if channel_key not in CHANNELS:
        raise ValueError("Channel tidak dikenal.")
    connection = dict(connections.get(channel_key) or {})
    if connection.get("ownerUid") != owner_uid or connection.get("status") != "connected":
        raise RuntimeError("Channel ini belum terhubung pada workspace yang sedang login.")
    try:
        from googleapiclient.discovery import build
    except Exception as exc:
        raise RuntimeError("Library Google API belum tersedia. Jalankan ulang installer Windows.") from exc
    credentials = get_saved_youtube_credentials(channel_key)
    youtube = build("youtube", "v3", credentials=credentials, cache_discovery=False)
    analytics = build("youtubeAnalytics", "v2", credentials=credentials, cache_discovery=False)
    channel_response = youtube.channels().list(part="id,snippet,statistics,contentDetails", mine=True, maxResults=10).execute()
    channel_items = channel_response.get("items") or []
    if not channel_items:
        raise RuntimeError("Google OAuth tidak mengembalikan channel YouTube.")
    expected_channel_id = str(connection.get("youtubeChannelId") or "")
    channel = next((item for item in channel_items if str(item.get("id") or "") == expected_channel_id), None)
    if channel is None:
        raise RuntimeError("Channel yang tersimpan tidak ditemukan pada akun Google yang sedang terautentikasi. Periksa koneksi dan pilih channel yang benar.")
    today = jakarta_now().date()
    end_date = today - timedelta(days=1)  # API analytics may lag; yesterday avoids querying a partial current day.
    days = max(1, min(90, int(days)))
    start_date = end_date - timedelta(days=days - 1)
    start_text, end_text = start_date.isoformat(), end_date.isoformat()
    metrics = "views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost"
    try:
        aggregate_response = analytics.reports().query(
            ids="channel==MINE", startDate=start_text, endDate=end_text, metrics=metrics
        ).execute()
        daily_response = analytics.reports().query(
            ids="channel==MINE", startDate=start_text, endDate=end_text, metrics=metrics,
            dimensions="day", sort="day", maxResults=100
        ).execute()
    except Exception as exc:
        text = str(exc)
        if "insufficientPermissions" in text or "insufficient authentication scopes" in text.lower() or "403" in text:
            raise RuntimeError("Akun channel perlu dihubungkan ulang agar memberi izin YouTube Analytics (yt-analytics.readonly). OAuth Client ID tidak berubah; login ulang setiap channel.") from exc
        raise RuntimeError(f"YouTube Analytics API gagal: {text[:700]}") from exc

    def header_rows(response):
        headers = [item.get("name", "") for item in response.get("columnHeaders", [])]
        return [dict(zip(headers, row)) for row in response.get("rows", [])]
    aggregate_rows = header_rows(aggregate_response)
    raw_summary = aggregate_rows[0] if aggregate_rows else {}
    numeric = lambda key: float(raw_summary.get(key, 0) or 0)
    summary = {
        "views": int(numeric("views")),
        "engagedViews": int(numeric("engagedViews")),
        "watchTimeMinutes": round(numeric("estimatedMinutesWatched"), 2),
        "averageViewDurationSeconds": round(numeric("averageViewDuration"), 2),
        "averageViewPercentage": round(numeric("averageViewPercentage"), 2),
        "likes": int(numeric("likes")),
        "comments": int(numeric("comments")),
        "shares": int(numeric("shares")),
        "subscribersGained": int(numeric("subscribersGained")),
        "subscribersLost": int(numeric("subscribersLost")),
        "netSubscribers": int(numeric("subscribersGained") - numeric("subscribersLost")),
    }
    daily_rows = []
    for row in header_rows(daily_response):
        daily_rows.append({
            "date": str(row.get("day", "")),
            "views": int(float(row.get("views", 0) or 0)),
            "engagedViews": int(float(row.get("engagedViews", 0) or 0)),
            "watchTimeMinutes": round(float(row.get("estimatedMinutesWatched", 0) or 0), 2),
            "averageViewDurationSeconds": round(float(row.get("averageViewDuration", 0) or 0), 2),
            "averageViewPercentage": round(float(row.get("averageViewPercentage", 0) or 0), 2),
            "likes": int(float(row.get("likes", 0) or 0)),
            "comments": int(float(row.get("comments", 0) or 0)),
            "shares": int(float(row.get("shares", 0) or 0)),
            "subscribersGained": int(float(row.get("subscribersGained", 0) or 0)),
            "subscribersLost": int(float(row.get("subscribersLost", 0) or 0)),
        })

    traffic_sources = []
    top_countries = []
    warnings: list[str] = []
    device_breakdown = []
    operating_systems = []
    try:
        traffic_response = analytics.reports().query(
            ids="channel==MINE", startDate=start_text, endDate=end_text,
            metrics="views,engagedViews,estimatedMinutesWatched",
            dimensions="insightTrafficSourceType", sort="-views", maxResults=20
        ).execute()
        for row in header_rows(traffic_response):
            traffic_sources.append({
                "sourceType": str(row.get("insightTrafficSourceType", "UNKNOWN")),
                "views": int(float(row.get("views", 0) or 0)),
                "engagedViews": int(float(row.get("engagedViews", 0) or 0)),
                "watchTimeMinutes": round(float(row.get("estimatedMinutesWatched", 0) or 0), 2),
            })
    except Exception as exc:
        warnings.append(f"Breakdown sumber traffic tidak tersedia: {str(exc)[:180]}")
    try:
        country_response = analytics.reports().query(
            ids="channel==MINE", startDate=start_text, endDate=end_text,
            metrics="views,engagedViews,estimatedMinutesWatched",
            dimensions="country", sort="-views", maxResults=15
        ).execute()
        for row in header_rows(country_response):
            top_countries.append({
                "countryCode": str(row.get("country", "ZZ")),
                "views": int(float(row.get("views", 0) or 0)),
                "engagedViews": int(float(row.get("engagedViews", 0) or 0)),
                "watchTimeMinutes": round(float(row.get("estimatedMinutesWatched", 0) or 0), 2),
            })
    except Exception as exc:
        warnings.append(f"Breakdown negara penonton tidak tersedia: {str(exc)[:180]}")

    # Device and operating-system reports help compare audience viewing behavior.
    try:
        device_response = analytics.reports().query(
            ids="channel==MINE", startDate=start_text, endDate=end_text,
            metrics="views,engagedViews,estimatedMinutesWatched",
            dimensions="deviceType", sort="-views", maxResults=20
        ).execute()
        for row in header_rows(device_response):
            device_breakdown.append({
                "deviceType": str(row.get("deviceType", "UNKNOWN")),
                "views": int(float(row.get("views", 0) or 0)),
                "engagedViews": int(float(row.get("engagedViews", 0) or 0)),
                "watchTimeMinutes": round(float(row.get("estimatedMinutesWatched", 0) or 0), 2),
            })
    except Exception as exc:
        warnings.append(f"Breakdown perangkat tidak tersedia: {str(exc)[:180]}")
    try:
        os_response = analytics.reports().query(
            ids="channel==MINE", startDate=start_text, endDate=end_text,
            metrics="views,engagedViews,estimatedMinutesWatched",
            dimensions="operatingSystem", sort="-views", maxResults=20
        ).execute()
        for row in header_rows(os_response):
            operating_systems.append({
                "operatingSystem": str(row.get("operatingSystem", "UNKNOWN")),
                "views": int(float(row.get("views", 0) or 0)),
                "engagedViews": int(float(row.get("engagedViews", 0) or 0)),
                "watchTimeMinutes": round(float(row.get("estimatedMinutesWatched", 0) or 0), 2),
            })
    except Exception as exc:
        warnings.append(f"Breakdown sistem operasi tidak tersedia: {str(exc)[:180]}")

    upload_playlist = (((channel.get("contentDetails") or {}).get("relatedPlaylists") or {}).get("uploads"))
    uploaded_ids = []
    if upload_playlist:
        playlist_response = youtube.playlistItems().list(part="contentDetails", playlistId=upload_playlist, maxResults=50).execute()
        uploaded_ids = [str(item.get("contentDetails", {}).get("videoId", "")) for item in playlist_response.get("items", [])]
        uploaded_ids = [item for item in uploaded_ids if item][:50]
    video_items = []
    if uploaded_ids:
        video_response = youtube.videos().list(part="snippet,statistics,contentDetails", id=",".join(uploaded_ids)).execute()
        video_items = video_response.get("items", [])
    top_videos = []
    for item in video_items:
        vid = item.get("id", "")
        snip = item.get("snippet") or {}
        stats = item.get("statistics") or {}
        current_stats = {
            "views": int(stats.get("viewCount", 0) or 0),
            "likes": int(stats.get("likeCount", 0) or 0),
            "comments": int(stats.get("commentCount", 0) or 0),
        }
        top_videos.append({
            "videoId": vid, "title": str(snip.get("title", ""))[:120],
            "publishedAt": str(snip.get("publishedAt", "")),
            "watchUrl": f"https://www.youtube.com/watch?v={vid}",
            "currentPublicStats": current_stats,
            "periodMetrics": None,
            "retentionCurve": [],
        })
    # Query detailed period metrics for the five videos with the highest current view counts.
    top_videos.sort(key=lambda item: item["currentPublicStats"]["views"], reverse=True)
    for video in top_videos[:5]:
        try:
            detailed = analytics.reports().query(
                ids="channel==MINE", startDate=start_text, endDate=end_text,
                metrics="views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares",
                filters=f"video=={video['videoId']}"
            ).execute()
            rows = header_rows(detailed)
            if rows:
                row = rows[0]
                video["periodMetrics"] = {
                    "views": int(float(row.get("views", 0) or 0)),
                    "engagedViews": int(float(row.get("engagedViews", 0) or 0)),
                    "watchTimeMinutes": round(float(row.get("estimatedMinutesWatched", 0) or 0), 2),
                    "averageViewDurationSeconds": round(float(row.get("averageViewDuration", 0) or 0), 2),
                    "averageViewPercentage": round(float(row.get("averageViewPercentage", 0) or 0), 2),
                    "likes": int(float(row.get("likes", 0) or 0)),
                    "comments": int(float(row.get("comments", 0) or 0)),
                    "shares": int(float(row.get("shares", 0) or 0)),
                }
        except Exception as exc:
            warnings.append(f"Analytics per video {video['videoId']} tidak tersedia: {str(exc)[:180]}")
        try:
            retention = analytics.reports().query(
                ids="channel==MINE", startDate=start_text, endDate=end_text,
                metrics="audienceWatchRatio,relativeRetentionPerformance",
                dimensions="elapsedVideoTimeRatio", filters=f"video=={video['videoId']}", sort="elapsedVideoTimeRatio"
            ).execute()
            video["retentionCurve"] = [
                {"elapsedVideoTimeRatio": float(row[0]), "audienceWatchRatio": float(row[1]),
                 "relativeRetentionPerformance": float(row[2]) if len(row) > 2 else None}
                for row in retention.get("rows", [])[:24]
            ]
        except Exception:
            # Retention reports are not available for every video/date range; keep other analytics.
            pass
    # Reach Basic is available only through the daily bulk Reporting API.
    reach = sync_youtube_reach_reporting(channel_key, credentials, start_date, end_date)
    if reach.get("warning"):
        warnings.append(str(reach["warning"]))
    reach_by_video = {item["videoId"]: item for item in (reach.get("byVideo") or [])}
    for video in top_videos:
        reach_row = reach_by_video.get(video.get("videoId"))
        if reach_row:
            video["thumbnailImpressions"] = reach_row.get("impressions")
            video["thumbnailCtrPercent"] = reach_row.get("ctrPercent")
    summary["thumbnailImpressions"] = reach.get("impressions")
    summary["thumbnailCtrPercent"] = reach.get("ctrPercent")

    # Revenue is strictly opt-in because it requests a separate monetary OAuth scope.
    revenue_status = "not_requested"
    revenue_currency = "IDR"
    if bool(CONFIG.get("includeMonetaryAnalytics", False)):
        saved_scopes = set(getattr(credentials, "_aicf_granted_scopes", []) or [])
        if MONETARY_ANALYTICS_SCOPE not in saved_scopes:
            revenue_status = "reauthorization_required"
            warnings.append("Laporan pendapatan diaktifkan, tetapi token channel belum memberi scope yt-analytics-monetary.readonly. Hubungkan ulang channel dan setujui izin tambahan.")
        else:
            try:
                money_response = analytics.reports().query(
                    ids="channel==MINE", startDate=start_text, endDate=end_text,
                    metrics="estimatedRevenue,estimatedAdRevenue,grossRevenue,adImpressions,monetizedPlaybacks,playbackBasedCpm,cpm",
                    currency=revenue_currency,
                ).execute()
                money_rows = header_rows(money_response)
                money_row = money_rows[0] if money_rows else {}
                summary["estimatedRevenue"] = round(float(money_row.get("estimatedRevenue", 0) or 0), 2)
                summary["estimatedAdRevenue"] = round(float(money_row.get("estimatedAdRevenue", 0) or 0), 2)
                summary["grossRevenue"] = round(float(money_row.get("grossRevenue", 0) or 0), 2)
                summary["adImpressions"] = int(float(money_row.get("adImpressions", 0) or 0))
                summary["monetizedPlaybacks"] = int(float(money_row.get("monetizedPlaybacks", 0) or 0))
                summary["playbackBasedCpm"] = round(float(money_row.get("playbackBasedCpm", 0) or 0), 2)
                summary["cpm"] = round(float(money_row.get("cpm", 0) or 0), 2)
                summary["revenueCurrency"] = revenue_currency
                revenue_status = "available"
            except Exception as exc:
                revenue_status = "unavailable_or_not_eligible"
                warnings.append("Laporan pendapatan tidak tersedia. Periksa status YPP, scope moneter, dan izin API: " + str(exc)[:220])

    stats_channel = channel.get("statistics") or {}
    subscriber_count = None
    if "subscriberCount" in stats_channel:
        try: subscriber_count = int(stats_channel["subscriberCount"])
        except (TypeError, ValueError): subscriber_count = None
    return {
        "channelId": channel_key,
        "youtubeChannelId": channel.get("id", ""),
        "channelName": (channel.get("snippet") or {}).get("title", CHANNELS[channel_key]),
        "connectedGoogleEmail": connection.get("connectedGoogleEmail", ""),
        "periodStart": start_text, "periodEnd": end_text, "periodDays": days,
        "summary": summary, "channelSubscriberCount": subscriber_count,
        "dailyRows": daily_rows, "topVideos": top_videos[:10],
        "trafficSources": traffic_sources[:20], "topCountries": top_countries[:15],
        "deviceBreakdown": device_breakdown[:20], "operatingSystems": operating_systems[:20],
        "reach": reach, "revenueStatus": revenue_status,
        "warnings": warnings,
        "source": "YouTube Analytics API v2 + YouTube Reporting API + YouTube Data API v3",
        "fetchedAt": int(time.time()),
        "note": "Data Analytics dapat mengalami keterlambatan pemrosesan. Views/likes/comments pada video adalah statistik publik saat sinkronisasi, sedangkan summary dan periodMetrics mengikuti rentang tanggal yang dipilih.",
    }


AGENT_META = [
    ("ceo-manager", "CEO Agent", "Koordinasi, pemeriksaan mutu akhir, dan laporan", "👔"),
    ("trend-researcher", "Trend Researcher", "Sudut cerita dan ide audiens (bukan tren live)", "📡"),
    ("bible-researcher", "Bible Researcher", "Konteks dan rujukan Alkitab", "📚"),
    ("scriptwriter", "Scriptwriter", "Hook, narasi, dan penutup", "✍️"),
    ("theological-guardian", "Theological Guardian", "Memeriksa ayat TB, konteks, doktrin, dan fakta sejarah", "📖"),
    ("pastoral-sensitivity", "Pastoral Sensitivity Checker", "Memeriksa bahasa agar tidak menghakimi atau melukai penonton", "💛"),
    ("storyboard-artist", "Storyboard Artist", "Adegan dan arahan visual", "🎬"),
    ("image-generator", "Image Generator", "ComfyUI lokal dengan fallback Openverse berlisensi", "🖼️"),
    ("voice-artist", "Voice Artist", "ElevenLabs Neural TTS Bahasa Indonesia", "🎙️"),
    ("video-generator", "Video Generator", "Membuat video vertikal dari visual dan audio", "🎞️"),
    ("video-editor", "Video Editor", "Subtitle, kredit, dan hasil akhir", "✂️"),
    ("seo-publisher", "SEO & Publisher", "Metadata, upload, dan pencatatan", "📈"),
    ("community-prayer-manager", "Community / Prayer Manager", "Menyusun draf balasan komentar dan permintaan doa", "🙏"),
]


def dpapi_unprotect(raw: bytes) -> bytes:
    if os.name != "nt":
        raise RuntimeError("DPAPI hanya tersedia di Windows.")
    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    crypt32.CryptUnprotectData.argtypes = [
        ctypes.POINTER(DATA_BLOB), ctypes.c_void_p, ctypes.c_void_p,
        ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(DATA_BLOB)
    ]
    crypt32.CryptUnprotectData.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    in_blob, keepalive = _make_blob(raw)
    out_blob = DATA_BLOB()
    ok = crypt32.CryptUnprotectData(ctypes.byref(in_blob), None, None, None, None, 0, ctypes.byref(out_blob))
    if not ok:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


PROVIDER_SECRET_FILES = {
    "groqApiKey": SECRETS_DIR / "groq-api-key.dpapi",
    "azureSpeechKey": SECRETS_DIR / "azure-speech-key.dpapi",
    "elevenLabsApiKey": SECRETS_DIR / "elevenlabs-api-key.dpapi",
    "claudeApiKey": SECRETS_DIR / "claude-api-key.dpapi",
    "veoServiceAccountJson": SECRETS_DIR / "veo-service-account-json.dpapi",
}


def save_provider_secret(name: str, value: str) -> None:
    """Store provider keys encrypted with Windows DPAPI; never put keys in dashboard/Firestore config."""
    if name not in PROVIDER_SECRET_FILES:
        raise ValueError("Nama secret provider tidak dikenal.")
    cleaned = str(value or "").strip()
    if not cleaned:
        return
    if os.name != "nt":
        raise RuntimeError("Penyimpanan kunci layanan cloud secara terenkripsi memerlukan Windows DPAPI.")
    encrypted = dpapi_protect(cleaned.encode("utf-8"))
    path = PROVIDER_SECRET_FILES[name]
    temp = path.with_suffix(".tmp")
    temp.write_bytes(encrypted)
    temp.replace(path)


def clear_provider_secret(name: str) -> None:
    if name not in PROVIDER_SECRET_FILES:
        raise ValueError("Nama secret provider tidak dikenal.")
    PROVIDER_SECRET_FILES[name].unlink(missing_ok=True)


def load_provider_secret(name: str) -> str:
    if name not in PROVIDER_SECRET_FILES:
        return ""
    path = PROVIDER_SECRET_FILES[name]
    if path.exists():
        try:
            return dpapi_unprotect(path.read_bytes()).decode("utf-8")
        except Exception:
            log.exception("Tidak dapat membuka secret provider %s", name)
            return ""
    env_name = {"groqApiKey": "GROQ_API_KEY", "azureSpeechKey": "AZURE_SPEECH_KEY", "elevenLabsApiKey": "ELEVENLABS_API_KEY", "claudeApiKey": "ANTHROPIC_API_KEY", "veoServiceAccountJson": "VEO_SERVICE_ACCOUNT_JSON"}.get(name, "")
    return os.environ.get(env_name, "") if env_name else ""


def local_service_base_url(value: str, default: str) -> str:
    raw = str(value or default).strip().rstrip("/")
    parsed = urllib.parse.urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("Alamat layanan lokal harus berupa URL http/https yang valid.")
    if parsed.hostname.casefold() not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("Untuk keamanan, AI Content Factory hanya menerima ComfyUI yang berjalan pada komputer ini.")
    return raw


def comfyui_status() -> dict[str, Any]:
    base = str(CONFIG.get("comfyuiBaseUrl", "http://127.0.0.1:8188")).rstrip("/")
    try:
        response = requests.get(base + "/system_stats", timeout=(2, 5))
        response.raise_for_status()
        stats = response.json()
        checkpoints = []
        try:
            info = requests.get(base + "/object_info/CheckpointLoaderSimple", timeout=(2, 8)).json()
            inputs = (((info.get("CheckpointLoaderSimple") or {}).get("input") or {}).get("required") or {})
            choices = inputs.get("ckpt_name") or []
            if choices and isinstance(choices[0], list):
                checkpoints = [str(x) for x in choices[0]]
        except Exception:
            pass
        checkpoint = str(CONFIG.get("comfyuiCheckpoint", "v1-5-pruned-emaonly.safetensors"))
        return {"online": True, "baseUrl": base, "checkpoint": checkpoint,
                "checkpointAvailable": checkpoint in checkpoints if checkpoints else None,
                "availableCheckpoints": checkpoints[:30], "system": stats}
    except Exception as exc:
        return {"online": False, "baseUrl": base, "checkpoint": str(CONFIG.get("comfyuiCheckpoint", "")),
                "checkpointAvailable": False, "availableCheckpoints": [], "message": str(exc)[:240]}


def provider_status_payload() -> dict[str, Any]:
    comfy = comfyui_status()
    return {
        "ollama": ollama_status(),
        "groq": {"enabled": bool(CONFIG.get("groqEnabled", False)),
                 "configured": bool(load_provider_secret("groqApiKey")),
                 "model": str(CONFIG.get("groqModel", "openai/gpt-oss-20b"))},
        "speech": {"provider": "elevenlabs",
                   "configured": bool(load_provider_secret("elevenLabsApiKey")),
                   "model": str(CONFIG.get("elevenLabsModel", "eleven_v4")),
                   "voiceId": str(CONFIG.get("elevenLabsVoiceId", "")),
                   "voicesByChannel": CONFIG.get("elevenLabsVoiceIds", {})},
        "scriptDirector": {"provider": "claude", "configured": bool(load_provider_secret("claudeApiKey")),
                           "model": str(CONFIG.get("claudeModel", "claude-sonnet-5-5"))},
        "veo": {"provider": "google-vertex-ai", "configured": bool(load_provider_secret("veoServiceAccountJson")) and bool(CONFIG.get("veoProjectId")) and bool(CONFIG.get("veoStorageUri")),
                "projectId": str(CONFIG.get("veoProjectId", "")), "location": str(CONFIG.get("veoLocation", "us-central1")),
                "storageUri": str(CONFIG.get("veoStorageUri", "")),
                "model": str(CONFIG.get("veoModel", "veo-3.1-fast-generate-001")), "resolution": str(CONFIG.get("veoResolution", "720p")),
                "dailyBudgetUsd": float(CONFIG.get("veoDailyBudgetUsd", 5.0) or 5.0),
                "maxClipsPerProject": int(CONFIG.get("veoMaxClipsPerProject", 16) or 16),
                "visualMode": str(CONFIG.get("veoVisualMode", "veo")),
                "usageToday": veo_usage_today_payload()},
        "visual": {"provider": str(CONFIG.get("imageProvider", "hybrid")),
                   "comfyui": comfy},
        "transcription": {"localWhisperInstalled": importlib.util.find_spec("faster_whisper") is not None,
                          "model": str(CONFIG.get("whisperModel", "base"))},
    }


def call_groq_review(narration: str, title: str, target_seconds: int) -> dict[str, Any]:
    """Optional editorial review only. Scripture truth remains grounded in the user's local Bible source."""
    if not bool(CONFIG.get("groqEnabled", False)):
        return {"used": False, "reason": "Groq reviewer tidak diaktifkan."}
    key = load_provider_secret("groqApiKey")
    if not key:
        return {"used": False, "reason": "Groq API key belum dipasang."}
    model = str(CONFIG.get("groqModel", "openai/gpt-oss-20b"))
    prompt = (
        "Tinjau naskah YouTube Shorts berbahasa Indonesia berikut sebagai editor bahasa. "
        "Jangan menambah fakta, peristiwa, kutipan ayat, atau klaim teologis baru. Jangan mengubah rujukan. "
        "Pertahankan makna dan kesetiaan pada ringkasan lokal yang sudah diperiksa. "
        f"Target durasi {target_seconds} detik; usahakan {max(35,int(target_seconds*1.45))}-{int(target_seconds*2.0)+4} kata. "
        "Perbaiki alur, hook, kealamian bahasa, dan pengulangan. Kembalikan JSON: "
        "{\"approved\":boolean,\"revisedNarration\":string,\"notes\":array}."
        f"\nJudul: {title}\nNaskah: {narration}"
    )
    try:
        response = requests.post("https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": model, "messages": [{"role": "user", "content": prompt}],
                  "temperature": 0.2, "max_tokens": 1800,
                  "response_format": {"type": "json_object"}}, timeout=(10, 75))
        if response.status_code == 429:
            retry = response.headers.get("retry-after", "")
            raise RuntimeError("Groq mencapai batas penggunaan (HTTP 429)." + (f" Coba lagi setelah {retry} detik." if retry.isdigit() else ""))
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        data = json.loads(content)
        revised = str(data.get("revisedNarration", "")).strip()
        if not revised:
            return {"used": True, "approved": bool(data.get("approved")), "notes": data.get("notes", []), "revisedNarration": narration}
        return {"used": True, "approved": bool(data.get("approved")), "notes": data.get("notes", []), "revisedNarration": revised[:12000]}
    except Exception as exc:
        log.warning("Groq editorial review dilewati: %s", exc)
        return {"used": False, "reason": str(exc)[:300]}


def configured_voice_for_channel(channel_id: str | None = None) -> str:
    voices = CONFIG.get("azureSpeechVoices") or {}
    selected = voices.get(str(channel_id or "")) if isinstance(voices, dict) else None
    selected = selected or CONFIG.get("azureSpeechVoice", "id-ID-GadisNeural")
    return str(selected) if str(selected) in ("id-ID-GadisNeural", "id-ID-ArdiNeural") else "id-ID-GadisNeural"


def azure_speech_to_wav(text: str, output_wav: Path, voice_override: str | None = None) -> dict[str, Any]:
    key = load_provider_secret("azureSpeechKey")
    region = re.sub(r"[^a-z0-9-]", "", str(CONFIG.get("azureSpeechRegion", "southeastasia")).lower())
    voice = str(voice_override or configured_voice_for_channel())
    if not key:
        raise RuntimeError("Azure Speech belum dikonfigurasi. Masukkan resource key di Pengaturan Provider AI.")
    if voice not in ("id-ID-GadisNeural", "id-ID-ArdiNeural"):
        raise ValueError("Suara Azure Indonesia tidak dikenali. Pilih GadisNeural atau ArdiNeural.")
    endpoint = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    safe_text = xml_escape(str(text))
    ssml = ("<speak version='1.0' xml:lang='id-ID'>"
            f"<voice xml:lang='id-ID' name='{voice}'><prosody rate='-5%'>{safe_text}</prosody></voice>"
            "</speak>")
    response = requests.post(endpoint,
        headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                 "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm", "User-Agent": "AIContentFactory/1.6.3"},
        data=ssml.encode("utf-8"), timeout=(10, 180))
    if response.status_code == 429:
        raise RuntimeError("Azure Speech membatasi permintaan (HTTP 429). Periksa kuota Speech F0.")
    response.raise_for_status()
    if len(response.content) < 2048 or not response.content[:4] == b"RIFF":
        raise RuntimeError("Azure Speech tidak mengembalikan file WAV PCM yang valid.")
    output_wav.write_bytes(response.content)
    with wave.open(str(output_wav), "rb") as wav:
        duration = wav.getnframes() / float(wav.getframerate())
        if wav.getsampwidth() != 2:
            raise RuntimeError("Azure Speech menghasilkan format WAV selain PCM 16-bit.")
    return {"provider": "Azure AI Speech Neural", "voice": voice, "durationSeconds": round(duration, 2),
            "indonesianVoiceDetected": True, "locale": "id-ID"}



CLAUDE_SCRIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "titleIdea": {"type": "string"}, "hook": {"type": "string"},
        "narration": {"type": "string"}, "closing": {"type": "string"},
        "onScreenText": {"type": "array", "items": {"type": "string"}},
        "reference": {"type": "string"}, "summary": {"type": "string"}
    },
    "required": ["titleIdea", "hook", "narration", "closing", "onScreenText", "reference", "summary"],
    "additionalProperties": False
}
CLAUDE_STORYBOARD_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "characterBible": {"type": "array", "items": {
            "type": "object", "properties": {
                "characterId": {"type": "string"}, "name": {"type": "string"},
                "visualDescription": {"type": "string"}, "wardrobe": {"type": "string"},
                "distinguishingFeatures": {"type": "string"}
            }, "required": ["characterId", "name", "visualDescription", "wardrobe", "distinguishingFeatures"],
            "additionalProperties": False
        }},
        "scenes": {"type": "array", "items": {
            "type": "object", "properties": {
                "visualTitle": {"type": "string"}, "visualQuery": {"type": "string"},
                "veoPrompt": {"type": "string"}, "caption": {"type": "string"},
                "narrationSegment": {"type": "string"}, "characters": {"type": "array", "items": {"type": "string"}},
                "cameraMovement": {"type": "string"}, "mood": {"type": "string"}
            }, "required": ["visualTitle", "visualQuery", "veoPrompt", "caption", "narrationSegment", "characters", "cameraMovement", "mood"],
            "additionalProperties": False
        }}
    },
    "required": ["summary", "characterBible", "scenes"],
    "additionalProperties": False
}

VEO_PROJECT_LOCK = threading.Lock()


def call_claude_json(prompt: str, schema: dict[str, Any], max_output_tokens: int = 7000) -> dict[str, Any]:
    """Call Claude Messages API with schema-constrained JSON output for Script Director."""
    key = load_provider_secret("claudeApiKey")
    if not key:
        raise RuntimeError("Claude API Key belum dipasang. Buka Pengaturan → Claude Script Director dan simpan API Key.")
    model = str(CONFIG.get("claudeModel", "claude-sonnet-5-5"))
    body = {
        "model": model,
        "max_tokens": max(1000, min(int(max_output_tokens), 12000)),
        "messages": [{"role": "user", "content": str(prompt)}],
        "output_config": {"format": {"type": "json_schema", "schema": schema}},
    }
    try:
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json=body, timeout=(15, 240)
        )
    except requests.RequestException as exc:
        raise RuntimeError("Tidak dapat menghubungi Claude API: " + str(exc)[:280]) from exc
    if response.status_code == 401:
        raise RuntimeError("Claude API Key ditolak (HTTP 401). Periksa API Key Anthropic.")
    if response.status_code == 429:
        raise RuntimeError("Batas penggunaan Claude API tercapai (HTTP 429). Periksa billing dan rate limit Anthropic.")
    if response.status_code in (400, 403):
        raise RuntimeError(f"Claude API menolak permintaan (HTTP {response.status_code}): {str(response.text or '')[:450]}")
    response.raise_for_status()
    content = response.json().get("content", [])
    text_blocks = [str(block.get("text", "")) for block in content if isinstance(block, dict) and block.get("type") == "text"]
    if not text_blocks:
        raise RuntimeError("Claude tidak mengembalikan blok teks JSON.")
    try:
        parsed = json.loads("\n".join(text_blocks))
    except json.JSONDecodeError as exc:
        raise RuntimeError("Claude mengembalikan JSON yang tidak dapat dibaca: " + str(exc)) from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("Hasil Claude harus berupa object JSON.")
    return parsed


def _veo_google_credentials():
    raw = load_provider_secret("veoServiceAccountJson")
    if not raw:
        raise RuntimeError("Kredensial Google Cloud untuk Veo belum dipasang. Masukkan JSON service account di Pengaturan → Google Veo.")
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request as GoogleAuthRequest
        info = json.loads(raw)
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        credentials.refresh(GoogleAuthRequest())
        return credentials
    except Exception as exc:
        raise RuntimeError("Service account Google Cloud tidak valid atau tidak dapat memperoleh token: " + str(exc)[:300]) from exc


def _veo_validate_settings() -> dict[str, Any]:
    project = str(CONFIG.get("veoProjectId", "")).strip()
    location = str(CONFIG.get("veoLocation", "us-central1")).strip()
    model = str(CONFIG.get("veoModel", "veo-3.1-fast-generate-001")).strip()
    storage_uri = str(CONFIG.get("veoStorageUri", "")).strip().rstrip("/") + "/"
    resolution = str(CONFIG.get("veoResolution", "720p")).strip()
    budget = float(CONFIG.get("veoDailyBudgetUsd", 5.0) or 5.0)
    max_clips = int(CONFIG.get("veoMaxClipsPerProject", 16) or 16)
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", project):
        raise RuntimeError("Google Cloud Project ID Veo belum valid (6–30 karakter, huruf kecil/angka/tanda hubung).")
    if location != "us-central1":
        raise RuntimeError("Integrasi Veo 3.1 saat ini dikonfigurasi untuk region us-central1.")
    if model not in ("veo-3.1-fast-generate-001", "veo-3.1-generate-001"):
        raise RuntimeError("Model Veo harus veo-3.1-fast-generate-001 atau veo-3.1-generate-001.")
    if not re.fullmatch(r"gs://[a-z0-9._-]{3,222}(?:/[A-Za-z0-9._/-]*)?", storage_uri.rstrip("/")):
        raise RuntimeError("Output Cloud Storage harus berupa URI gs://bucket/prefix yang valid.")
    if resolution not in ("720p", "1080p"):
        raise RuntimeError("Resolusi Veo harus 720p atau 1080p.")
    if not (0.1 <= budget <= 500):
        raise RuntimeError("Batas anggaran Veo harian harus antara US$0,10 dan US$500.")
    if not (1 <= max_clips <= 30):
        raise RuntimeError("Batas klip per project harus antara 1 dan 30.")
    return {"projectId": project, "location": location, "model": model, "storageUri": storage_uri,
            "resolution": resolution, "dailyBudgetUsd": budget, "maxClipsPerProject": max_clips}


def _ensure_veo_usage_table() -> None:
    with task_db_connection() as con:
        con.execute("CREATE TABLE IF NOT EXISTS veo_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, usage_day TEXT NOT NULL, owner_uid TEXT NOT NULL, task_id TEXT NOT NULL, scene_no INTEGER NOT NULL, model TEXT NOT NULL, estimated_usd REAL NOT NULL, created_at REAL NOT NULL, UNIQUE(task_id, scene_no))")
        con.commit()


def veo_usage_today_payload() -> dict[str, Any]:
    _ensure_veo_usage_table()
    day = datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")
    with task_db_connection() as con:
        row = con.execute("SELECT COUNT(*) AS clips, COALESCE(SUM(estimated_usd),0) AS cost FROM veo_usage WHERE usage_day=?", (day,)).fetchone()
    budget = float(CONFIG.get("veoDailyBudgetUsd", 5.0) or 5.0)
    return {"date": day, "clips": int(row[0] or 0), "estimatedUsd": round(float(row[1] or 0), 4), "dailyBudgetUsd": budget,
            "remainingUsd": round(max(0.0, budget - float(row[1] or 0)), 4)}


def _veo_estimated_clip_cost(model: str, resolution: str) -> float:
    # This Worker explicitly sets generateAudio=False. Vertex AI's published
    # per-video (video-only) rates are used here: Standard $0.20/count;
    # Fast $0.08/count at 720p and $0.10/count at 1080p. These are estimates,
    # not billing guarantees; Google Cloud billing remains authoritative.
    if model == "veo-3.1-generate-001":
        return 0.20
    return 0.10 if resolution == "1080p" else 0.08


def _record_veo_usage(owner_uid: str, task_id: str, scene_no: int, model: str, estimated_usd: float) -> None:
    _ensure_veo_usage_table()
    day = datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")
    with task_db_connection() as con:
        con.execute("INSERT OR IGNORE INTO veo_usage(usage_day,owner_uid,task_id,scene_no,model,estimated_usd,created_at) VALUES(?,?,?,?,?,?,?)",
                    (day, owner_uid, task_id, int(scene_no), model, float(estimated_usd), time.time()))
        con.commit()


def _veo_reference_image(path: Path) -> dict[str, str] | None:
    if not path.exists():
        return None
    from PIL import Image
    with Image.open(path) as source:
        image = source.convert("RGB")
        image.thumbnail((720, 1280), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=88, optimize=True)
    return {"mimeType": "image/jpeg", "bytesBase64Encoded": base64.b64encode(output.getvalue()).decode("ascii")}


def generate_character_reference_assets(character_bible: list[dict[str, Any]], work_dir: Path) -> dict[str, str]:
    """Create consistent portrait reference cards for Veo using local ComfyUI, serially under the GPU lock."""
    characters = [x for x in character_bible if isinstance(x, dict) and str(x.get("characterId", "")).strip()][:8]
    if not characters:
        return {}
    status = comfyui_status()
    if not status.get("online") or status.get("checkpointAvailable") is False:
        log.warning("ComfyUI tidak siap; Veo akan menggunakan prompt deskriptif tanpa referensi karakter visual.")
        return {}
    refs: dict[str, str] = {}
    OLLAMA_REQUEST_LOCK.acquire()
    try:
        unload_ollama_for_visual_generation()
        for item in characters:
            assert_working_day()
            char_id = re.sub(r"[^A-Za-z0-9_-]", "_", str(item.get("characterId")))[:50]
            out = work_dir / "character_references" / f"{char_id}.jpg"
            out.parent.mkdir(parents=True, exist_ok=True)
            prompt = (
                "Create a single clean full-body character reference portrait for a vertical animated film. "
                "Neutral simple ancient-world background, standing pose, entire body visible, consistent face and anatomy, no text, no watermark. "
                + str(item.get("visualDescription", "")) + ". Clothing: " + str(item.get("wardrobe", ""))
                + ". Distinguishing features: " + str(item.get("distinguishingFeatures", ""))
                + ". High quality cinematic 3D animated film character model sheet, realistic proportions, tasteful respectful depiction."
            )[:1750]
            generated = generate_comfyui_image(prompt, out, 512, 768)
            if generated and out.exists():
                refs[str(item.get("characterId"))] = str(out)
    finally:
        OLLAMA_REQUEST_LOCK.release()
    return refs


def _download_gcs_video(credentials, project_id: str, gs_uri: str, output_path: Path) -> None:
    match = re.fullmatch(r"gs://([^/]+)/(.+)", str(gs_uri or ""))
    if not match:
        raise RuntimeError("Veo mengembalikan URI Cloud Storage yang tidak valid.")
    try:
        from google.cloud import storage
        client = storage.Client(project=project_id, credentials=credentials)
        blob = client.bucket(match.group(1)).blob(match.group(2))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(str(output_path), timeout=300)
    except Exception as exc:
        raise RuntimeError("Klip Veo berhasil dibuat tetapi gagal diunduh dari Google Cloud Storage: " + str(exc)[:400]) from exc
    if not output_path.exists() or output_path.stat().st_size < 20000:
        raise RuntimeError("Video Veo yang diunduh kosong atau terlalu kecil.")


def _generate_veo_scene(prompt: str, reference_paths: list[Path], output_path: Path, task_id: str,
                        scene_no: int, owner_uid: str, operation_timeout: int = 900,
                        duration_seconds: int = 8) -> dict[str, Any]:
    cfg = _veo_validate_settings()
    credentials = _veo_google_credentials()
    references = []
    for path in reference_paths[:3]:
        reference = _veo_reference_image(path)
        if reference:
            references.append({"image": reference, "referenceType": "asset"})
    instance = {"prompt": str(prompt)[:1800] + " Portrait 9:16 vertical composition. No subtitles, no logos, no watermarks."
    }
    if references:
        instance["referenceImages"] = references
    url = (f"https://{cfg['location']}-aiplatform.googleapis.com/v1/projects/{cfg['projectId']}"
           f"/locations/{cfg['location']}/publishers/google/models/{cfg['model']}:predictLongRunning")
    output_prefix = cfg["storageUri"].rstrip("/") + f"/{task_id}/scene_{scene_no:03d}/"
    clip_duration = int(duration_seconds)
    if clip_duration not in (4, 6, 8):
        clip_duration = 8
    # The Standard model only returns 8-second clips when subject reference
    # images are supplied. Fast supports 4/6/8 second choices with references.
    if references and cfg["model"] == "veo-3.1-generate-001":
        clip_duration = 8
    body = {"instances": [instance], "parameters": {
        "aspectRatio": "9:16", "durationSeconds": clip_duration, "storageUri": output_prefix,
        "sampleCount": 1, "resolution": cfg["resolution"], "personGeneration": "allow_all",
        "generateAudio": False
    }}
    response = requests.post(url, headers={"Authorization": f"Bearer {credentials.token}", "Content-Type": "application/json"}, json=body, timeout=(20, 120))
    if response.status_code in (401, 403):
        raise RuntimeError(f"Google Cloud Veo ditolak (HTTP {response.status_code}). Periksa IAM service account dan akses Vertex AI.")
    if response.status_code == 429:
        raise RuntimeError("Batas kuota Veo tercapai (HTTP 429). Project lain tetap menunggu antrean.")
    response.raise_for_status()
    operation_name = str(response.json().get("name", ""))
    if not operation_name:
        raise RuntimeError("Veo tidak mengembalikan nama operasi untuk dipantau.")
    poll_url = (f"https://{cfg['location']}-aiplatform.googleapis.com/v1/projects/{cfg['projectId']}"
                f"/locations/{cfg['location']}/publishers/google/models/{cfg['model']}:fetchPredictOperation")
    deadline = time.time() + max(120, int(operation_timeout))
    operation = None
    while time.time() < deadline:
        assert_working_day()
        poll = requests.post(poll_url, headers={"Authorization": f"Bearer {credentials.token}", "Content-Type": "application/json"},
                             json={"operationName": operation_name}, timeout=(15, 45))
        poll.raise_for_status()
        operation = poll.json()
        if operation.get("done"):
            break
        time.sleep(12)
    if not operation or not operation.get("done"):
        raise TimeoutError("Veo belum selesai dalam batas waktu 15 menit. Operasi dapat diperiksa di Google Cloud Console.")
    if operation.get("error"):
        raise RuntimeError("Veo gagal: " + json.dumps(operation.get("error"), ensure_ascii=False)[:600])
    videos = ((operation.get("response") or {}).get("videos") or [])
    if not videos or not videos[0].get("gcsUri"):
        raise RuntimeError("Veo tidak menghasilkan URI video. Periksa filter keselamatan dan billing Google Cloud.")
    # Record usage as soon as Google confirms a generated output. A later
    # GCS download failure must not make our internal budget undercount a billable clip.
    cost = _veo_estimated_clip_cost(cfg["model"], cfg["resolution"])
    _record_veo_usage(owner_uid, task_id, scene_no, cfg["model"], cost)
    _download_gcs_video(credentials, cfg["projectId"], videos[0]["gcsUri"], output_path)
    return {"filePath": str(output_path), "gcsUri": str(videos[0]["gcsUri"]), "model": cfg["model"],
            "resolution": cfg["resolution"], "aspectRatio": "9:16", "generatedCostEstimateUsd": cost,
            "operationName": operation_name}


def _flow_import_dir(task_id: str) -> Path:
    return OUTPUT_DIR / str(task_id) / "flow_import"


def _find_flow_import(task_id: str, scene_no: int) -> Path | None:
    folder = _flow_import_dir(task_id)
    candidates = [folder / f"scene_{scene_no:03d}.mp4", folder / f"scene_{scene_no:03d}.mov"]
    return next((p for p in candidates if p.exists() and p.stat().st_size > 20000), None)


def wait_for_flow_imports(task_id: str, owner_uid: str, scenes: list[dict[str, Any]], work_dir: Path,
                          timeout_hours: float = 12.0) -> list[dict[str, Any]]:
    folder = _flow_import_dir(task_id)
    folder.mkdir(parents=True, exist_ok=True)
    result_hint = {"storyboard": {"scenes": scenes}, "visualMode": "google_flow_manual"}
    db_update_task(task_id, status="paused", stage=f"Menunggu klip Google Flow: 0/{len(scenes)} adegan telah diimpor", progress=68,
                   result_json=json.dumps(result_hint, ensure_ascii=False))
    deadline = time.time() + timeout_hours * 3600
    last_report = 0.0
    while time.time() < deadline:
        assert_working_day()
        clips = [_find_flow_import(task_id, i + 1) for i in range(len(scenes))]
        complete = sum(1 for p in clips if p)
        if complete == len(scenes):
            db_update_task(task_id, status="running", stage="Klip Google Flow lengkap; FFmpeg menyiapkan render", progress=73)
            return [{"title": str(scene.get("visualTitle") or f"Scene {i+1}"), "provider": "Google Flow (manual import)",
                     "license": "Owner-supplied generated video", "mediaType": "video", "localFile": str(clips[i]),
                     "synthetic": True, "licenseReviewRequired": True, "sceneNo": i + 1}
                    for i, scene in enumerate(scenes)]
        if time.time() - last_report >= 15:
            db_update_task(task_id, status="paused", stage=f"Menunggu klip Google Flow: {complete}/{len(scenes)} adegan telah diimpor", progress=68 + int(5 * complete / max(1, len(scenes))))
            last_report = time.time()
        time.sleep(3)
    raise TimeoutError("Waktu menunggu impor klip Google Flow habis setelah 12 jam. Buat project baru atau pilih Veo otomatis.")


def generate_story_visual_clips(scenes: list[dict[str, Any]], work_dir: Path, task_id: str, owner_uid: str,
                                 character_references: dict[str, str], visual_mode: str = "veo", generation_round: int = 1) -> dict[str, Any]:
    if visual_mode == "google_flow_manual":
        assets = wait_for_flow_imports(task_id, owner_uid, scenes, work_dir)
        return {"assets": assets, "summary": f"{len(assets)} klip Google Flow berhasil diimpor dan siap dirakit FFmpeg.", "warnings": []}
    cfg = _veo_validate_settings()
    if not load_provider_secret("veoServiceAccountJson"):
        raise RuntimeError("Kredensial Google Cloud untuk Veo belum dipasang. Gunakan mode Google Flow manual sementara atau isi pengaturan Veo.")
    while not VEO_PROJECT_LOCK.acquire(timeout=15):
        assert_working_day()
        db_update_task(task_id, status="queued", stage="Menunggu giliran antrean Veo (satu project aktif)", progress=68)
    try:
        usage = veo_usage_today_payload()
        clip_cost = _veo_estimated_clip_cost(cfg["model"], cfg["resolution"])
        with task_db_connection() as _con:
            project_clip_count = int(_con.execute("SELECT COUNT(*) FROM veo_usage WHERE task_id=?", (task_id,)).fetchone()[0] or 0)
        if project_clip_count + len(scenes) > cfg["maxClipsPerProject"]:
            raise RuntimeError(
                f"Project ini membutuhkan {project_clip_count + len(scenes)} klip total, "
                f"melebihi batas project {cfg['maxClipsPerProject']}. Naikkan batas project "
                "atau pilih Google Flow untuk impor klip manual sebelum produksi dimulai."
            )
        if usage["estimatedUsd"] + len(scenes) * clip_cost > cfg["dailyBudgetUsd"]:
            raise RuntimeError(f"Anggaran Veo harian tidak cukup. Terpakai sekitar US${usage['estimatedUsd']:.2f}; kebutuhan project sekitar US${len(scenes)*clip_cost:.2f}; batas US${cfg['dailyBudgetUsd']:.2f}. Project dihentikan sebelum membuat klip.")
        assets = []
        warnings = []
        for index, scene in enumerate(scenes, start=1):
            assert_working_day()
            imported = _find_flow_import(task_id, index)
            if imported:
                video_path = imported
                provider = "Google Flow (manual import)"
                meta = {"provider": provider, "filePath": str(video_path), "generatedCostEstimateUsd": 0.0}
            else:
                video_path = work_dir / "veo_clips" / f"scene_{index:03d}_round_{generation_round:02d}.mp4"
                video_path.parent.mkdir(parents=True, exist_ok=True)
                ids = [str(x) for x in (scene.get("characters") or [])]
                # Veo asset reference images should depict the same subject; choose only the lead character.
                lead_reference = next((Path(character_references[x]) for x in ids if x in character_references), None)
                ref_paths = [lead_reference] if lead_reference else []
                prompt = str(scene.get("veoPrompt") or scene.get("visualQuery") or scene.get("visualTitle") or "").strip()
                if not prompt:
                    raise RuntimeError(f"Adegan {index} tidak memiliki prompt video Veo.")
                metering_scene_no = index + (max(1, int(generation_round)) - 1) * 100
                desired_seconds = max(0.15, float(scene.get("durationSeconds") or 8))
                clip_seconds = 4 if desired_seconds <= 4 else (6 if desired_seconds <= 6 else 8)
                meta = _generate_veo_scene(prompt, ref_paths, video_path, task_id, metering_scene_no, owner_uid,
                                            int(CONFIG.get("veoOperationTimeoutSeconds", 900) or 900), clip_seconds)
                provider = "Google Veo 3.1"
            assets.append({"title": str(scene.get("visualTitle") or f"Scene {index}"), "provider": provider,
                           "license": "AI-generated", "mediaType": "video", "localFile": str(video_path),
                           "synthetic": True, "licenseReviewRequired": True, "sceneNo": index,
                           "veo": meta})
        if not character_references and any(scene.get("characters") for scene in scenes):
            warnings.append("ComfyUI tidak menghasilkan referensi karakter; Veo menggunakan deskripsi tekstual. Konsistensi karakter mungkin lebih rendah.")
        return {"assets": assets, "summary": f"{len(assets)} klip video vertikal berhasil disiapkan berurutan oleh Veo/Google Flow.",
                "warnings": warnings, "usage": veo_usage_today_payload()}
    finally:
        VEO_PROJECT_LOCK.release()


def assign_scene_timestamps_from_alignment(scenes: list[dict[str, Any]], alignment_path: Path, duration: float) -> dict[str, Any]:
    alignment = {}
    if alignment_path and Path(alignment_path).exists():
        try:
            alignment = json.loads(Path(alignment_path).read_text(encoding="utf-8"))
        except Exception:
            alignment = {}
    chars = alignment.get("characters") or []
    starts = alignment.get("characterStartTimesSeconds") or []
    ends = alignment.get("characterEndTimesSeconds") or []
    aligned = "".join(str(x) for x in chars)
    lowered = aligned.casefold()
    cursor = 0
    matched = 0
    for scene in scenes:
        segment = re.sub(r"\s+", " ", str(scene.get("narrationSegment") or "")).strip()
        search = segment.casefold()
        position = lowered.find(search, cursor) if search else -1
        if position < 0 and search:
            position = lowered.find(search)
        if position >= 0 and position < len(starts) and position + len(search) - 1 < len(ends):
            start = max(0.0, float(starts[position] or 0))
            end = max(start + 0.15, float(ends[position + len(search) - 1] or start + 0.15))
            cursor = position + len(search)
            matched += 1
            scene["timingSource"] = "elevenlabs-character-alignment"
        else:
            scene["timingSource"] = "proportional-fallback"
            start = end = 0.0
        scene["startSeconds"] = round(start, 3)
        scene["endSeconds"] = round(end, 3)
        scene["durationSeconds"] = round(max(0.15, end - start), 3)
    if matched < max(1, int(len(scenes) * 0.7)):
        # If only some exact segments match, use a consistent word-weighted timeline for all scenes.
        weights = [max(1, len(re.findall(r"\S+", str(x.get("narrationSegment") or "")))) for x in scenes]
        total = sum(weights) or len(scenes)
        cursor_time = 0.0
        for index, (scene, weight) in enumerate(zip(scenes, weights)):
            start = duration * cursor_time / total
            cursor_time += weight
            end = duration if index == len(scenes) - 1 else duration * cursor_time / total
            scene.update({"startSeconds": round(start, 3), "endSeconds": round(end, 3),
                          "durationSeconds": round(max(0.15, end - start), 3), "timingSource": "proportional-fallback"})
    else:
        # Bound overlaps and place the final edge within actual audio duration.
        previous_end = 0.0
        for index, scene in enumerate(scenes):
            start = max(previous_end, min(float(scene.get("startSeconds", 0)), duration))
            end = max(start + 0.15, min(float(scene.get("endSeconds", start + 0.15)), duration))
            scene["startSeconds"] = round(start, 3)
            scene["endSeconds"] = round(end, 3)
            scene["durationSeconds"] = round(end - start, 3)
            previous_end = end
    return {"source": "ElevenLabs character-level alignment" if matched >= max(1, int(len(scenes) * 0.7)) else "proportional fallback",
            "matchedScenes": matched, "totalScenes": len(scenes), "audioDurationSeconds": round(float(duration), 3),
            "scenes": [{"sceneNo": i + 1, "startSeconds": x["startSeconds"], "endSeconds": x["endSeconds"],
                        "durationSeconds": x["durationSeconds"], "timingSource": x["timingSource"]} for i, x in enumerate(scenes)]}


def validate_elevenlabs_voice_id(value: str, allow_empty: bool = True) -> str:
    voice_id = str(value or "").strip()
    if not voice_id and allow_empty:
        return ""
    if not re.fullmatch(r"[A-Za-z0-9_-]{5,100}", voice_id):
        raise ValueError("Voice ID ElevenLabs tidak valid. Salin Voice ID dari Voice Library ElevenLabs.")
    return voice_id


def configured_elevenlabs_voice_for_channel(channel_id: str | None = None) -> str:
    voices = CONFIG.get("elevenLabsVoiceIds") or {}
    selected = voices.get(str(channel_id or "")) if isinstance(voices, dict) else None
    selected = selected or CONFIG.get("elevenLabsVoiceId", "")
    return validate_elevenlabs_voice_id(str(selected or ""), allow_empty=True)


def split_elevenlabs_narration(text: str, max_chars: int = 9000) -> list[str]:
    """Split long Indonesian narration at sentence/paragraph boundaries without dropping text."""
    source = str(text or "").strip()
    if not source:
        return []
    limit = max(1000, min(int(max_chars), 9500))
    # Keep paragraph boundaries as natural pause points, then split oversized paragraphs
    # on sentence endings and, only when necessary, at whitespace boundaries.
    units: list[str] = []
    for paragraph in re.split(r"\n\s*\n+", source):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        sentences = re.split(r"(?<=[.!?…])\s+", paragraph)
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            while len(sentence) > limit:
                cut = sentence.rfind(" ", 0, limit + 1)
                if cut < int(limit * 0.55):
                    cut = limit
                units.append(sentence[:cut].strip())
                sentence = sentence[cut:].strip()
            if sentence:
                units.append(sentence)

    chunks: list[str] = []
    current = ""
    for unit in units:
        candidate = (current + (" " if current else "") + unit).strip()
        if len(candidate) <= limit:
            current = candidate
        else:
            if current:
                chunks.append(current)
            current = unit
    if current:
        chunks.append(current)
    if not chunks or "".join(chunks).replace(" ", "") == "":
        raise ValueError("Naskah tidak dapat dipecah menjadi bagian voice-over yang valid.")
    if any(len(chunk) > limit for chunk in chunks):
        raise ValueError("Pemecahan naskah ElevenLabs menghasilkan potongan yang terlalu panjang.")
    return chunks


def elevenlabs_speech_to_wav(text: str, output_wav: Path, channel_id: str | None = None, alignment_output: Path | None = None) -> dict[str, Any]:
    """Generate Indonesian narration sequentially with ElevenLabs and merge PCM WAV chunks."""
    key = load_provider_secret("elevenLabsApiKey")
    if not key:
        raise RuntimeError("ElevenLabs API Key belum dipasang. Buka Pengaturan → Narator ElevenLabs dan simpan API Key.")
    narration = str(text or "").strip()
    if not narration:
        raise ValueError("Teks voice-over kosong.")
    voice_id = configured_elevenlabs_voice_for_channel(channel_id)
    if not voice_id:
        raise RuntimeError("Voice ID ElevenLabs belum diatur. Isi Voice ID utama atau Voice ID khusus channel pada Pengaturan.")
    model = str(CONFIG.get("elevenLabsModel", "eleven_v4"))
    if model not in ("eleven_v4", "eleven_multilingual_v2"):
        model = "eleven_v4"

    # Keep a small margin below ElevenLabs' 10,000-character API ceiling.
    chunks = split_elevenlabs_narration(narration, 9000)
    voice_settings = {"stability": 0.52, "similarity_boost": 0.78}
    if model == "eleven_multilingual_v2":
        voice_settings.update({"style": 0.15, "use_speaker_boost": True})
    base_url = "https://api.elevenlabs.io/v1/text-to-speech/" + urllib.parse.quote(voice_id, safe="")
    url = base_url + ("/with-timestamps" if alignment_output else "")

    try:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:
        raise RuntimeError("FFmpeg tidak tersedia untuk mengubah audio ElevenLabs menjadi WAV.") from exc

    output_wav = Path(output_wav)
    output_wav.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="elevenlabs_voice_", dir=str(output_wav.parent)) as temp_name:
        temp_dir = Path(temp_name)
        wav_parts: list[Path] = []
        alignment_chars: list[str] = []
        alignment_starts: list[float] = []
        alignment_ends: list[float] = []
        timeline_offset = 0.0
        for index, chunk in enumerate(chunks, start=1):
            body = {"text": chunk, "model_id": model, "voice_settings": voice_settings}
            if model == "eleven_v4":
                body["language_code"] = "id"
            try:
                response = requests.post(
                    url,
                    params={"output_format": "mp3_44100_128"},
                    headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
                    json=body,
                    timeout=(15, 240),
                )
            except requests.RequestException as exc:
                raise RuntimeError("Tidak dapat menghubungi ElevenLabs pada potongan " + str(index) + ". Periksa internet Worker: " + str(exc)[:220]) from exc

            if response.status_code == 429:
                raise RuntimeError("Batas kredit/permintaan ElevenLabs tercapai (HTTP 429) pada potongan " + str(index) + ". Periksa sisa kredit dan batas concurrency akun Anda.")
            if response.status_code == 401:
                raise RuntimeError("ElevenLabs API Key ditolak (HTTP 401). Periksa atau buat ulang API Key.")
            if response.status_code == 403:
                raise RuntimeError("Akses ElevenLabs ditolak (HTTP 403). Pastikan API Key memiliki izin Text to Speech dan tidak dibatasi IP yang salah.")
            if response.status_code == 404:
                raise RuntimeError("Voice ID tidak ditemukan atau tidak tersedia pada akun ElevenLabs ini. Periksa Voice ID.")
            if response.status_code in (400, 422):
                detail = str(getattr(response, "text", "") or "")[:350]
                raise RuntimeError("Parameter ElevenLabs tidak diterima (HTTP " + str(response.status_code) + "): " + detail)
            try:
                response.raise_for_status()
            except requests.HTTPError as exc:
                detail = str(getattr(response, "text", "") or "")[:350]
                raise RuntimeError("ElevenLabs gagal menghasilkan suara: " + detail) from exc

            alignment_payload = None
            if alignment_output:
                try:
                    response_data = response.json()
                    encoded_audio = response_data.get("audio_base64") or response_data.get("audioBase64")
                    if not encoded_audio:
                        raise RuntimeError("ElevenLabs tidak mengembalikan audio_base64 pada endpoint with-timestamps.")
                    audio_bytes = base64.b64decode(encoded_audio)
                    alignment_payload = response_data.get("alignment") or response_data.get("normalized_alignment") or {}
                except Exception as exc:
                    raise RuntimeError("Respons ElevenLabs with-timestamps tidak valid: " + str(exc)[:250]) from exc
            else:
                audio_bytes = bytes(response.content or b"")
            if len(audio_bytes) < 1000:
                raise RuntimeError("ElevenLabs mengembalikan audio kosong pada potongan " + str(index) + ".")
            temporary_mp3 = temp_dir / f"chunk_{index:04d}.mp3"
            chunk_wav = temp_dir / f"chunk_{index:04d}.wav"
            temporary_mp3.write_bytes(audio_bytes)
            conversion = run_media_command([
                ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(temporary_mp3),
                "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(chunk_wav)
            ], timeout=240)
            temporary_mp3.unlink(missing_ok=True)
            if conversion.returncode != 0 or not chunk_wav.exists() or chunk_wav.stat().st_size < 2048:
                detail = (conversion.stderr or conversion.stdout or "Konversi WAV gagal.")[-500:]
                raise RuntimeError("Konversi audio ElevenLabs gagal pada potongan " + str(index) + ": " + detail)
            wav_parts.append(chunk_wav)
            with wave.open(str(chunk_wav), "rb") as chunk_audio:
                chunk_duration = chunk_audio.getnframes() / float(chunk_audio.getframerate())
            if alignment_output and isinstance(alignment_payload, dict):
                char_values = alignment_payload.get("characters") or []
                start_values = alignment_payload.get("character_start_times_seconds") or alignment_payload.get("characterStartTimesSeconds") or []
                end_values = alignment_payload.get("character_end_times_seconds") or alignment_payload.get("characterEndTimesSeconds") or []
                if len(char_values) == len(start_values) == len(end_values):
                    alignment_chars.extend([str(x) for x in char_values])
                    alignment_starts.extend([timeline_offset + float(x or 0) for x in start_values])
                    alignment_ends.extend([timeline_offset + float(x or 0) for x in end_values])
            timeline_offset += chunk_duration

        # Join PCM frames without re-encoding; all chunks are normalized to identical WAV format.
        with wave.open(str(output_wav), "wb") as merged:
            expected = None
            for part in wav_parts:
                with wave.open(str(part), "rb") as source:
                    params = source.getparams()
                    signature = (params.nchannels, params.sampwidth, params.framerate, params.comptype)
                    if expected is None:
                        expected = signature
                        merged.setnchannels(params.nchannels)
                        merged.setsampwidth(params.sampwidth)
                        merged.setframerate(params.framerate)
                        merged.setcomptype(params.comptype, params.compname)
                    elif signature != expected:
                        raise RuntimeError("Format audio antar-potongan ElevenLabs tidak konsisten.")
                    while True:
                        frames = source.readframes(65536)
                        if not frames:
                            break
                        merged.writeframesraw(frames)

    with wave.open(str(output_wav), "rb") as wav:
        duration = wav.getnframes() / float(wav.getframerate())
        if wav.getsampwidth() != 2 or wav.getframerate() != 24000 or wav.getnchannels() != 1:
            raise RuntimeError("Audio ElevenLabs tidak berhasil dikonversi ke PCM mono 16-bit 24 kHz.")
    if alignment_output:
        alignment_path = Path(alignment_output)
        alignment_path.parent.mkdir(parents=True, exist_ok=True)
        alignment_path.write_text(json.dumps({
            "characters": alignment_chars,
            "characterStartTimesSeconds": alignment_starts,
            "characterEndTimesSeconds": alignment_ends,
            "durationSeconds": round(duration, 3),
            "source": "ElevenLabs /with-timestamps",
            "chunks": len(chunks),
        }, ensure_ascii=False), encoding="utf-8")
    return {
        "provider": "ElevenLabs",
        "model": model,
        "voiceId": voice_id,
        "durationSeconds": round(duration, 2),
        "chunks": len(chunks),
        "characters": len(narration),
        "indonesianVoiceDetected": True,
        "locale": "id-ID",
        "alignmentAvailable": bool(alignment_output and alignment_chars),
        "alignmentCharacters": len(alignment_chars),
    }

def unload_ollama_for_visual_generation() -> None:
    """Free VRAM before image rendering on a 6 GB GPU; the next Ollama call reloads the model."""
    try:
        base = str(CONFIG.get("ollamaBaseUrl", "http://127.0.0.1:11434")).rstrip("/")
        model = str(CONFIG.get("ollamaModel", "qwen3:4b"))
        requests.post(base + "/api/generate", json={"model": model, "prompt": "", "keep_alive": 0}, timeout=(2, 12))
        log.info("Model Ollama dilepas sementara dari VRAM untuk ComfyUI.")
    except Exception as exc:
        log.warning("Tidak dapat melepas model Ollama sebelum visual: %s", exc)


def generate_comfyui_image(prompt_text: str, output_path: Path, width: int = 512, height: int = 768) -> dict[str, Any] | None:
    status = comfyui_status()
    if not status.get("online") or status.get("checkpointAvailable") is False:
        return None
    base = str(CONFIG.get("comfyuiBaseUrl", "http://127.0.0.1:8188")).rstrip("/")
    checkpoint = str(CONFIG.get("comfyuiCheckpoint", "v1-5-pruned-emaonly.safetensors"))
    width, height = max(384, min(int(width), 768)), max(512, min(int(height), 1024))
    workflow = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": checkpoint}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": str(prompt_text)[:1800], "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": "low quality, blurry, distorted face, extra fingers, text, watermark, logo, modern clothing, modern objects", "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {"seed": int(time.time_ns() % 2147483647), "steps": 20, "cfg": 6.5, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0, "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0]}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": "AIContentFactory/scene", "images": ["6", 0]}},
    }
    try:
        queued = requests.post(base + "/prompt", json={"prompt": workflow}, timeout=(10, 30))
        queued.raise_for_status()
        prompt_id = str(queued.json().get("prompt_id", ""))
        if not prompt_id:
            return None
        deadline = time.time() + 240
        image_meta = None
        while time.time() < deadline:
            assert_working_day()
            history_response = requests.get(base + "/history/" + prompt_id, timeout=(5, 15))
            history_response.raise_for_status()
            history = history_response.json().get(prompt_id, {})
            outputs = history.get("outputs", {}) if isinstance(history, dict) else {}
            for node in outputs.values():
                images = node.get("images", []) if isinstance(node, dict) else []
                if images:
                    image_meta = images[0]
                    break
            if image_meta:
                break
            time.sleep(2)
        if not image_meta:
            raise TimeoutError("ComfyUI tidak menyelesaikan gambar dalam 4 menit.")
        view = requests.get(base + "/view", params={"filename": image_meta.get("filename", ""),
                             "subfolder": image_meta.get("subfolder", ""), "type": image_meta.get("type", "output")}, timeout=(10, 60))
        view.raise_for_status()
        if len(view.content) < 1024:
            raise RuntimeError("Hasil gambar ComfyUI kosong.")
        from PIL import Image
        with Image.open(io.BytesIO(view.content)) as img:
            img.convert("RGB").save(output_path, "JPEG", quality=92, optimize=True)
        return {"title": "Ilustrasi AI adegan", "creator": "Dibuat lokal dengan ComfyUI", "license": "AI-GENERATED",
                "licenseVersion": "", "licenseUrl": "", "sourceUrl": "", "provider": "local-ai-comfyui",
                "model": checkpoint, "localFile": str(output_path), "synthetic": True, "licenseReviewRequired": True}
    except OperationPausedError:
        raise
    except Exception as exc:
        log.warning("ComfyUI gagal menghasilkan visual: %s", exc)
        return None


def parse_bible_reference(reference: str) -> dict[str, Any]:
    """Parse one TB reference of the form 'Kejadian 1:1-5'. One chapter per episode."""
    text = str(reference or "").strip().replace("–", "-").replace("—", "-")
    match = re.match(r"^(.+?)\s+(\d{1,3})\s*:\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?$", text, re.I)
    if not match:
        raise ValueError("Rujukan harus satu rentang dalam satu pasal, contoh: Kejadian 1:1-5.")
    raw_book, chapter_s, start_s, end_s = match.groups()
    alias = re.sub(r"[^a-z0-9]", "", raw_book.lower())
    book_id = BIBLE_BOOK_ALIASES.get(alias)
    if not book_id:
        raise ValueError(f"Nama kitab pada rujukan tidak dikenali: {raw_book}.")
    book = BIBLE_BOOK_INDEX[book_id]
    chapter = int(chapter_s); start_verse = int(start_s); end_verse = int(end_s or start_s)
    if chapter < 1 or chapter > book["chapterCount"]:
        raise ValueError(f"Pasal {chapter} tidak valid untuk kitab {book['name']}.")
    if start_verse < 1 or end_verse < start_verse or end_verse > 200:
        raise ValueError("Rentang ayat tidak valid (1–200).")
    return {"bookId":book_id,"bookName":book["name"],"chapter":chapter,
            "startVerse":start_verse,"endVerse":end_verse,"reference":f"{book['name']} {chapter}:{start_verse}-{end_verse}"}


_LOCAL_BIBLE_INDEX: dict[tuple[str, int, int], str] | None = None
_LOCAL_BIBLE_CACHE_MTIME: float | None = None
_LOCAL_BIBLE_LOCK = threading.RLock()


def _book_id_from_local_name(value: Any) -> str | None:
    raw = str(value or "").strip()
    alias = re.sub(r"[^a-z0-9]", "", raw.lower())
    return BIBLE_BOOK_ALIASES.get(alias)


_BIBLE_BOOK_ID_BY_NUMBER = {book["canonicalOrder"]: book_id for book_id, book in BIBLE_BOOK_INDEX.items()}


def _plain_source_text(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"<\s*br\s*/?\s*>", "\n", text, flags=re.I)
    text = re.sub(r"</\s*p\s*>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]*>", " ", text)
    text = html_lib.unescape(text)
    return re.sub(r"[ \t]+", " ", text).strip()


def _extract_uploaded_bible_metadata(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    metadata = payload.get("metadata") or payload.get("translation") or payload.get("header") or {}
    if not isinstance(metadata, dict):
        return {}
    copyright_statement = _plain_source_text(
        metadata.get("copyright_statement") or metadata.get("copyrightStatement") or metadata.get("description")
    )
    description = _plain_source_text(metadata.get("description") or "")
    return {
        "name": str(metadata.get("name") or metadata.get("title") or "Alkitab dari file JSON")[:120],
        "shortName": str(metadata.get("shortname") or metadata.get("shortName") or metadata.get("module") or "")[:80],
        "module": str(metadata.get("module") or "")[:80],
        "year": str(metadata.get("year") or "")[:30],
        "publisher": str(metadata.get("publisher") or "")[:180],
        "owner": str(metadata.get("owner") or "")[:180],
        "description": description[:1600],
        "copyrightStatement": copyright_statement[:1600],
        "language": str(metadata.get("language") or metadata.get("lang") or metadata.get("lang_short") or "")[:50],
        "moduleVersion": str(metadata.get("module_version") or "")[:50],
        "metadataOfficialFlag": metadata.get("official"),
        "metadataResearchFlag": metadata.get("research"),
    }


def _parse_local_bible_json(raw_text: str) -> tuple[list[dict[str, Any]], bool, dict[str, int], Any]:
    """Parse uploaded Bible JSON, especially Bible Analyzer's {metadata, verses[]} format.

    Supported verse rows include book_name/book/chapter/verse/text and WebPresenter's
    kitab/pasal/ayat/teks. Numeric canonical book IDs are authoritative when supplied.
    """
    try:
        payload = json.loads(raw_text)
        repaired = False
    except json.JSONDecodeError as original_error:
        candidate = raw_text.rstrip()
        if candidate.lstrip().startswith("["):
            try:
                payload = json.loads(candidate + "]")
                repaired = True
            except json.JSONDecodeError:
                raise ValueError(f"JSON tidak valid; perbaikan penutup array otomatis tidak berhasil (baris {original_error.lineno}, kolom {original_error.colno}).") from original_error
        else:
            raise ValueError(f"JSON tidak valid pada baris {original_error.lineno}, kolom {original_error.colno}.") from original_error

    rows: list[dict[str, Any]] = []
    invalid_rows = 0
    seen_rows = 0
    empty_text_rows = 0
    book_name_variant_rows = 0
    book_number_name_mismatch_rows = 0

    def add_row(book_name: Any, chapter_value: Any, verse_value: Any, verse_text: Any,
                reference: Any = "", book_number: Any = None) -> None:
        nonlocal invalid_rows, seen_rows, empty_text_rows
        nonlocal book_name_variant_rows, book_number_name_mismatch_rows
        seen_rows += 1
        numeric_book_id = None
        if book_number not in (None, ""):
            try:
                numeric_book_id = _BIBLE_BOOK_ID_BY_NUMBER.get(int(book_number))
            except (TypeError, ValueError):
                numeric_book_id = None
        name_book_id = _book_id_from_local_name(book_name)
        # Bible Analyzer's numeric `book` field follows the Protestant 1..66 order.
        # Trust the numeric ID when valid, even if book_name uses a legacy spelling.
        book_id = numeric_book_id or name_book_id
        if numeric_book_id and book_name and not name_book_id:
            book_name_variant_rows += 1
        elif numeric_book_id and name_book_id and numeric_book_id != name_book_id:
            book_number_name_mismatch_rows += 1
        try:
            chapter = int(chapter_value)
            verse = int(verse_value)
        except (TypeError, ValueError):
            invalid_rows += 1
            return
        text = str(verse_text or "").strip()
        if not text:
            empty_text_rows += 1
        if not book_id or chapter < 1 or verse < 1 or not text:
            invalid_rows += 1
            return
        book = BIBLE_BOOK_INDEX[book_id]
        if chapter > book["chapterCount"] or verse > 200:
            invalid_rows += 1
            return
        rows.append({"bookId":book_id,"bookName":book["name"],"chapter":chapter,"verse":verse,
                     "reference":str(reference or f"{book['name']} {chapter}:{verse}")[:120],"text":text})

    def walk(node: Any, inherited_book: str | None = None, inherited_chapter: int | None = None) -> None:
        if isinstance(node, list):
            if inherited_book and inherited_chapter:
                for index, verse_text in enumerate(node, start=1):
                    if isinstance(verse_text, str):
                        add_row(inherited_book, inherited_chapter, index, verse_text)
                    elif isinstance(verse_text, dict):
                        book_value = verse_text.get("book")
                        book_number = book_value if isinstance(book_value, (int, float)) or str(book_value or "").isdigit() else None
                        add_row(verse_text.get("kitab") or verse_text.get("book_name") or verse_text.get("bookName") or inherited_book,
                                verse_text.get("pasal") or verse_text.get("chapter") or inherited_chapter,
                                verse_text.get("ayat") or verse_text.get("verse") or verse_text.get("verseNumber") or index,
                                verse_text.get("teks") or verse_text.get("text") or verse_text.get("verseText"),
                                verse_text.get("referensi") or verse_text.get("reference"), book_number)
            else:
                for child in node:
                    walk(child, inherited_book, inherited_chapter)
            return
        if not isinstance(node, dict):
            return
        has_book = any(key in node for key in ("kitab", "book", "bookName", "book_name"))
        has_text = any(key in node for key in ("teks", "text", "verseText"))
        has_chapter = any(key in node for key in ("pasal", "chapter"))
        has_verse = any(key in node for key in ("ayat", "verse", "verseNumber"))
        if has_book and has_text and has_chapter and has_verse:
            book_value = node.get("book")
            book_number = book_value if isinstance(book_value, (int, float)) or str(book_value or "").isdigit() else None
            add_row(node.get("kitab") or node.get("book_name") or node.get("bookName") or (book_value if book_number is None else ""),
                    node.get("pasal") or node.get("chapter"),
                    node.get("ayat") or node.get("verse") or node.get("verseNumber"),
                    node.get("teks") or node.get("text") or node.get("verseText"),
                    node.get("referensi") or node.get("reference"), book_number)
            return
        for key, child in node.items():
            if inherited_book is None:
                mapped_book = _book_id_from_local_name(key)
                if mapped_book:
                    walk(child, mapped_book, None)
                elif isinstance(child, (dict, list)) and key.lower() not in ("metadata", "translation", "header"):
                    walk(child, None, None)
            elif inherited_chapter is None:
                if str(key).isdigit():
                    walk(child, inherited_book, int(key))
                elif isinstance(child, (dict, list)):
                    walk(child, inherited_book, None)
            elif isinstance(child, (dict, list)):
                walk(child, inherited_book, inherited_chapter)

    if isinstance(payload, dict) and isinstance(payload.get("verses"), list):
        walk(payload["verses"])
    else:
        walk(payload)
    if not rows:
        raise ValueError("Tidak ditemukan ayat. Format yang didukung: indo_tb.json (metadata + verses: book_name/book/chapter/verse/text), WebPresenter (kitab/pasal/ayat/teks), atau Kitab → Pasal → Ayat.")
    return rows, repaired, {
        "parsedRowCount":seen_rows,
        "invalidRowCount":invalid_rows,
        "emptyTextRowCount":empty_text_rows,
        "bookNameVariantRowCount":book_name_variant_rows,
        "bookNumberNameMismatchRowCount":book_number_name_mismatch_rows,
    }, payload


def import_local_bible_json(raw_bytes: bytes, source_name: str = "Alkitab JSON") -> dict[str, Any]:
    """Import an uploaded Bible JSON; original verse text is stored only on this PC."""
    if not raw_bytes or len(raw_bytes) > 20 * 1024 * 1024:
        raise ValueError("Ukuran file kosong atau melebihi batas 20 MB.")
    try:
        raw_text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("File harus menggunakan encoding UTF-8.") from exc
    parsed_rows, repaired, parse_stats, original_payload = _parse_local_bible_json(raw_text)
    source_metadata = _extract_uploaded_bible_metadata(original_payload)

    grouped: dict[tuple[str, int, int], set[str]] = {}
    original_counts: dict[tuple[str, int, int], int] = {}
    for row in parsed_rows:
        key = (row["bookId"], row["chapter"], row["verse"])
        normalized_text = re.sub(r"\s+", " ", row["text"]).strip()
        grouped.setdefault(key, set()).add(normalized_text)
        original_counts[key] = original_counts.get(key, 0) + 1

    conflict_keys = {key for key, texts in grouped.items() if len(texts) > 1}
    indexable = []
    for key, texts in grouped.items():
        if key in conflict_keys:
            continue
        text = next(iter(texts))
        if not text:
            continue
        book_id, chapter, verse = key
        indexable.append({"bookId":book_id,"chapter":chapter,"verse":verse,"text":text})
    indexable.sort(key=lambda row: (BIBLE_BOOK_INDEX[row["bookId"]]["canonicalOrder"], row["chapter"], row["verse"]))

    chapters_by_book: dict[str, set[int]] = {book_id:set() for book_id in BIBLE_BOOK_INDEX}
    books_present: set[str] = set()
    for row in indexable:
        chapters_by_book[row["bookId"]].add(row["chapter"])
        books_present.add(row["bookId"])
    missing_books = [book["name"] for book in BIBLE_BOOK_INDEX.values() if book["id"] not in books_present]
    missing_chapters = []
    for book in BIBLE_BOOK_INDEX.values():
        missing = [chapter for chapter in range(1, book["chapterCount"] + 1) if chapter not in chapters_by_book[book["id"]]]
        if missing:
            missing_chapters.append({"book":book["name"],"chapters":missing})
    chapter_count = sum(len(values) for values in chapters_by_book.values())
    duplicate_reference_count = sum(1 for count in original_counts.values() if count > 1)
    duplicate_extra_rows = sum(count - 1 for count in original_counts.values() if count > 1)
    rights_text = source_metadata.get("copyrightStatement") or source_metadata.get("description") or ""
    report = {
        "sourceName":str(source_name or "Alkitab JSON")[:180],
        "sourceMetadata":source_metadata,
        "importedAt":int(time.time()),
        "rawEntryCount":parse_stats["parsedRowCount"],
        "acceptedRowCount":len(parsed_rows),
        "invalidRowCount":parse_stats["invalidRowCount"],
        "emptyTextRowCount":parse_stats["emptyTextRowCount"],
        "bookNameVariantRowCount":parse_stats["bookNameVariantRowCount"],
        "bookNumberNameMismatchRowCount":parse_stats["bookNumberNameMismatchRowCount"],
        "uniqueReferenceCount":len(grouped),
        "indexedVerseCount":len(indexable),
        "duplicateReferenceCount":duplicate_reference_count,
        "duplicateExtraRows":duplicate_extra_rows,
        "conflictingReferenceCount":len(conflict_keys),
        "missingBookCount":len(missing_books),
        "missingBooks":missing_books,
        "chapterCount":chapter_count,
        "expectedChapterCount":1189,
        "missingChapterCount":sum(len(item["chapters"]) for item in missing_chapters),
        "missingChapters":missing_chapters,
        "arrayCloseRepaired":repaired,
        "bookAndChapterCoverageComplete":len(books_present) == 66 and chapter_count == 1189,
        "hasConflictingReferences":bool(conflict_keys),
        "verseCompletenessNote":"Jumlah pasal menunjukkan pasal yang memiliki setidaknya satu ayat terindeks; setiap rentang episode tetap diperiksa ayat demi ayat sebelum antrean.",
        "sourceTermsNotice":rights_text[:1600],
        "notice":"Teks disimpan hanya pada komputer ini. Metadata hak cipta/penggunaan dari file ditampilkan apa adanya; aplikasi tidak mengesahkan keaslian atau lisensi file secara otomatis.",
    }
    envelope = {"schemaVersion":2,"source":"user-uploaded-bible-json","report":report,"verses":indexable}
    temporary = LOCAL_BIBLE_JSON_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(envelope, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(LOCAL_BIBLE_JSON_FILE)
    global _LOCAL_BIBLE_INDEX, _LOCAL_BIBLE_CACHE_MTIME
    with _LOCAL_BIBLE_LOCK:
        _LOCAL_BIBLE_INDEX = {(row["bookId"],row["chapter"],row["verse"]):row["text"] for row in indexable}
        _LOCAL_BIBLE_CACHE_MTIME = LOCAL_BIBLE_JSON_FILE.stat().st_mtime
    return report


def local_bible_source_status() -> dict[str, Any]:
    acknowledged = bool(CONFIG.get("localBibleTermsAcknowledged", False))
    if not LOCAL_BIBLE_JSON_FILE.exists():
        return {"configured":False,"termsAcknowledged":acknowledged,"coverage":None,"sourceMetadata":{}}
    try:
        envelope = json.loads(LOCAL_BIBLE_JSON_FILE.read_text(encoding="utf-8"))
        report = envelope.get("report") or {}
        return {"configured":True,"termsAcknowledged":acknowledged,"coverage":report,
                "sourceMetadata":report.get("sourceMetadata") or {}}
    except Exception as exc:
        log.warning("Metadata sumber Alkitab yang diunggah tidak dapat dibaca: %s", exc)
        return {"configured":False,"termsAcknowledged":acknowledged,"coverage":None,"sourceMetadata":{}}


def fetch_local_tb_passage(reference: str) -> dict[str, Any]:
    parsed = parse_bible_reference(reference)
    if not LOCAL_BIBLE_JSON_FILE.exists():
        raise RuntimeError("File JSON Alkitab belum diunggah. Buka Pengaturan → Sumber Alkitab dari File JSON lalu unggah indo_tb.json.")
    global _LOCAL_BIBLE_INDEX, _LOCAL_BIBLE_CACHE_MTIME
    with _LOCAL_BIBLE_LOCK:
        current_mtime = LOCAL_BIBLE_JSON_FILE.stat().st_mtime
        envelope = None
        if _LOCAL_BIBLE_INDEX is None or _LOCAL_BIBLE_CACHE_MTIME != current_mtime:
            envelope = json.loads(LOCAL_BIBLE_JSON_FILE.read_text(encoding="utf-8"))
            _LOCAL_BIBLE_INDEX = {(row["bookId"],int(row["chapter"]),int(row["verse"])):str(row["text"])
                                  for row in envelope.get("verses", [])}
            _LOCAL_BIBLE_CACHE_MTIME = current_mtime
        selected = []
        missing = []
        for verse_no in range(parsed["startVerse"], parsed["endVerse"] + 1):
            value = _LOCAL_BIBLE_INDEX.get((parsed["bookId"],parsed["chapter"],verse_no))
            if value:
                selected.append(value)
            else:
                missing.append(verse_no)
        if envelope is None:
            envelope = json.loads(LOCAL_BIBLE_JSON_FILE.read_text(encoding="utf-8"))
        report = envelope.get("report") or {}
    if missing:
        raise RuntimeError(f"File JSON yang diunggah tidak memiliki ayat {parsed['bookName']} {parsed['chapter']}:{','.join(map(str,missing))}. Unggah file yang lengkap atau periksa rujukan AI.")
    source_meta = report.get("sourceMetadata") or {}
    return {"reference":parsed["reference"],"text":"\n".join(selected),"bookId":parsed["bookId"],"chapter":parsed["chapter"],
            "fetchedAt":int(time.time()),"source":"File JSON yang diunggah: " + str(report.get("sourceName") or "Alkitab JSON"),
            "version":str(source_meta.get("name") or "Alkitab dari JSON lokal"),
            "publisher":str(source_meta.get("publisher") or source_meta.get("owner") or "Tidak tercantum pada metadata file"),
            "official":None,"verified":False,"verificationStatus":"metadata_unverified","sourceMetadata":source_meta}


def bible_source_status_payload() -> dict[str, Any]:
    local = local_bible_source_status()
    local_ready = bool(local["configured"] and local["termsAcknowledged"])
    metadata = local.get("sourceMetadata") or {}
    source_name = str(metadata.get("name") or (local.get("coverage") or {}).get("sourceName") or "File JSON Alkitab")
    provider = f"File JSON diunggah · {source_name}" if local["configured"] else "Belum ada file Alkitab yang diunggah"
    return {"localBibleJsonConfigured":bool(local["configured"]),
            "localBibleTermsAcknowledged":bool(local["termsAcknowledged"]),
            "localBibleCoverage":local["coverage"],
            "sourceMetadata":metadata,
            "productionReady":local_ready,
            "sourceVersion":source_name,
            "sourceProvider":provider,
            "productionRequiresUploadedJson":True}


def tb_production_source_ready() -> bool:
    status = bible_source_status_payload()
    return bool(status["productionReady"])


def fetch_tb_passage(reference: str) -> dict[str, Any]:
    if not tb_production_source_ready():
        raise RuntimeError("Sumber Alkitab belum siap. Unggah file JSON Alkitab dan baca/akui ketentuan penggunaan yang tercantum pada metadata file.")
    return fetch_local_tb_passage(reference)


@contextmanager
def task_db_connection():
    """SQLite connection with explicit commit/rollback and deterministic close."""
    connection = sqlite3.connect(TASK_DB, timeout=30)
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_workforce_db() -> None:
    with task_db_connection() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS tasks (
            task_id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, job_id TEXT NOT NULL,
            channel_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
            stage TEXT NOT NULL, progress INTEGER NOT NULL, payload_json TEXT NOT NULL,
            result_json TEXT, error_message TEXT, created_at REAL NOT NULL, updated_at REAL NOT NULL
        )""")
        con.execute("""CREATE TABLE IF NOT EXISTS agent_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, agent_id TEXT NOT NULL,
            agent_name TEXT NOT NULL, task_type TEXT NOT NULL, status TEXT NOT NULL,
            summary TEXT NOT NULL, started_at REAL NOT NULL, finished_at REAL NOT NULL,
            duration_ms INTEGER NOT NULL, output_json TEXT
        )""")
        con.execute("""CREATE TABLE IF NOT EXISTS guardian_reviews (
            review_id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, channel_id TEXT NOT NULL DEFAULT '',
            project_title TEXT NOT NULL DEFAULT '', review_type TEXT NOT NULL,
            source_text TEXT NOT NULL, result_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT '', created_at REAL NOT NULL
        )""")
        con.execute("CREATE INDEX IF NOT EXISTS idx_guardian_reviews_owner ON guardian_reviews(owner_uid, created_at DESC)")
        con.execute("""CREATE TABLE IF NOT EXISTS bible_series (
            series_id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, title TEXT NOT NULL,
            scope_type TEXT NOT NULL, scope_id TEXT NOT NULL, scope_label TEXT NOT NULL,
            channel_id TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
            total_books INTEGER NOT NULL DEFAULT 0, completed_books INTEGER NOT NULL DEFAULT 0,
            total_episodes INTEGER NOT NULL DEFAULT 0, queued_episodes INTEGER NOT NULL DEFAULT 0,
            target_duration_seconds INTEGER NOT NULL DEFAULT 45, audience TEXT NOT NULL,
            auto_queue INTEGER NOT NULL DEFAULT 1, source_version TEXT NOT NULL DEFAULT 'TB', source_status TEXT NOT NULL DEFAULT 'pending_local_json',
            selected_books_json TEXT NOT NULL, completed_book_ids_json TEXT NOT NULL DEFAULT '[]',
            error_message TEXT, created_at REAL NOT NULL, updated_at REAL NOT NULL
        )""")
        con.execute("""CREATE TABLE IF NOT EXISTS bible_episodes (
            episode_id TEXT PRIMARY KEY, series_id TEXT NOT NULL, owner_uid TEXT NOT NULL,
            sequence_no INTEGER NOT NULL, book_id TEXT NOT NULL, book_name TEXT NOT NULL,
            testament TEXT NOT NULL, group_id TEXT NOT NULL, title TEXT NOT NULL,
            summary TEXT NOT NULL, reference TEXT NOT NULL, central_theme TEXT NOT NULL,
            teaching_point TEXT NOT NULL, hook TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned',
            target_duration_seconds INTEGER NOT NULL DEFAULT 45, task_id TEXT,
            payload_json TEXT NOT NULL, created_at REAL NOT NULL, updated_at REAL NOT NULL,
            UNIQUE(series_id, sequence_no)
        )""")
        # Additive migration: retain existing v1.5.0 series while enabling the
        # owner's requested automatic sequential queue after full planning.
        bible_series_columns = {row[1] for row in con.execute("PRAGMA table_info(bible_series)").fetchall()}
        if "auto_queue" not in bible_series_columns:
            con.execute("ALTER TABLE bible_series ADD COLUMN auto_queue INTEGER NOT NULL DEFAULT 0")
        con.execute("CREATE INDEX IF NOT EXISTS idx_bible_series_owner ON bible_series(owner_uid, created_at DESC)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_bible_episode_series ON bible_episodes(series_id, sequence_no)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_bible_episode_owner_status ON bible_episodes(owner_uid, status)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_uid, created_at DESC)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, created_at)")
        con.execute("""CREATE TABLE IF NOT EXISTS reach_reporting_rows (
            channel_key TEXT NOT NULL, report_id TEXT NOT NULL, report_date TEXT NOT NULL,
            video_id TEXT NOT NULL, impressions INTEGER NOT NULL, ctr_percent REAL NOT NULL,
            imported_at REAL NOT NULL, PRIMARY KEY(channel_key, report_id, report_date, video_id)
        )""")
        con.execute("CREATE INDEX IF NOT EXISTS idx_reach_channel_date ON reach_reporting_rows(channel_key, report_date)")
        con.execute("""CREATE TABLE IF NOT EXISTS reach_reporting_imports (
            channel_key TEXT NOT NULL, report_id TEXT NOT NULL, start_time TEXT NOT NULL,
            end_time TEXT NOT NULL, create_time REAL NOT NULL, imported_at REAL NOT NULL,
            rows_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(channel_key, report_id)
        )""")
        con.execute("""CREATE TABLE IF NOT EXISTS reach_reporting_current_rows (
            channel_key TEXT NOT NULL, report_date TEXT NOT NULL, video_id TEXT NOT NULL,
            impressions INTEGER NOT NULL, ctr_percent REAL NOT NULL, report_id TEXT NOT NULL,
            source_create_time REAL NOT NULL, imported_at REAL NOT NULL,
            PRIMARY KEY(channel_key, report_date, video_id)
        )""")
        con.execute("CREATE INDEX IF NOT EXISTS idx_reach_current_channel_date ON reach_reporting_current_rows(channel_key, report_date)")
        con.execute("""CREATE TABLE IF NOT EXISTS church_shorts_sources (
            source_id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, file_name TEXT NOT NULL,
            file_path TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at REAL NOT NULL
        )""")
        con.execute("""CREATE TABLE IF NOT EXISTS church_shorts_clips (
            clip_id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, source_id TEXT NOT NULL,
            source_file_name TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
            channel_id TEXT NOT NULL, start_seconds REAL NOT NULL, end_seconds REAL NOT NULL,
            aspect_mode TEXT NOT NULL, privacy_status TEXT NOT NULL DEFAULT 'private',
            output_path TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ready',
            youtube_video_id TEXT, created_at REAL NOT NULL, updated_at REAL NOT NULL
        )""")
        con.execute("CREATE INDEX IF NOT EXISTS idx_church_shorts_owner ON church_shorts_clips(owner_uid, created_at DESC)")
        con.execute("""CREATE TABLE IF NOT EXISTS transcription_jobs (
            job_id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, source_id TEXT NOT NULL,
            status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, stage TEXT NOT NULL,
            model_size TEXT NOT NULL DEFAULT 'base', transcript_path TEXT, subtitle_path TEXT, error_message TEXT,
            created_at REAL NOT NULL, updated_at REAL NOT NULL
        )""")
        transcription_columns = {row[1] for row in con.execute("PRAGMA table_info(transcription_jobs)").fetchall()}
        if "model_size" not in transcription_columns:
            con.execute("ALTER TABLE transcription_jobs ADD COLUMN model_size TEXT NOT NULL DEFAULT 'base'")
        con.execute("CREATE INDEX IF NOT EXISTS idx_transcription_owner ON transcription_jobs(owner_uid, created_at DESC)")
        con.execute("UPDATE transcription_jobs SET status='interrupted',stage='Worker ditutup sebelum transkripsi selesai' WHERE status='running'")
        # Migrate the previous cache only once; the new table deduplicates by
        # channel/date/video so replacement daily reports cannot double-count.
        current_count = con.execute("SELECT COUNT(*) FROM reach_reporting_current_rows").fetchone()[0]
        if current_count == 0:
            old_rows = con.execute("SELECT channel_key,report_id,report_date,video_id,impressions,ctr_percent,imported_at FROM reach_reporting_rows ORDER BY imported_at ASC").fetchall()
            for channel_key, report_id, report_date, video_id, impressions, ctr_percent, imported_at in old_rows:
                con.execute("INSERT OR REPLACE INTO reach_reporting_current_rows(channel_key,report_date,video_id,impressions,ctr_percent,report_id,source_create_time,imported_at) VALUES(?,?,?,?,?,?,?,?)", (channel_key,report_date,video_id,impressions,ctr_percent,report_id,float(imported_at or 0),float(imported_at or 0)))
            con.execute("""INSERT OR IGNORE INTO reach_reporting_imports(channel_key,report_id,start_time,end_time,create_time,imported_at,rows_count)
                         SELECT channel_key,report_id,'','',MAX(imported_at),MAX(imported_at),COUNT(*) FROM reach_reporting_rows GROUP BY channel_key,report_id""")
        # v1.5.5 uses uploaded JSON only; keep prior series metadata but migrate old source labels.
        current_source_state = "local_json" if (LOCAL_BIBLE_JSON_FILE.exists() and bool(CONFIG.get("localBibleTermsAcknowledged", False))) else "pending_local_json"
        con.execute("UPDATE bible_series SET source_status=? WHERE source_status IN ('pending_lai_api','configured','unavailable','verified')", (current_source_state,))
        # Recover work interrupted by a previous app shutdown/crash.
        con.execute("UPDATE tasks SET status='queued', stage='Dilanjutkan setelah worker dibuka kembali', updated_at=? WHERE status='running'", (time.time(),))
        con.commit()


init_workforce_db()


def db_create_task(owner_uid: str, payload: dict[str, Any]) -> str:
    task_id = uuid.uuid4().hex
    now = time.time()
    with task_db_connection() as con:
        con.execute(
            "INSERT INTO tasks(task_id,owner_uid,job_id,channel_id,title,status,stage,progress,payload_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (task_id, owner_uid, str(payload.get("jobId", "")), payload["channelId"], payload["title"], "queued", "Menunggu antrean", 0, json.dumps(payload, ensure_ascii=False), now, now),
        )
        con.commit()
    return task_id


def db_update_task(task_id: str, **fields) -> None:
    allowed = {"status", "stage", "progress", "result_json", "error_message"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return
    updates["updated_at"] = time.time()
    assignments = ",".join(f"{k}= ?" for k in updates)
    values = list(updates.values()) + [task_id]
    with task_db_connection() as con:
        con.execute(f"UPDATE tasks SET {assignments} WHERE task_id=?", values)
        con.commit()


def db_add_agent_log(task_id: str, agent_id: str, agent_name: str, task_type: str,
                     status: str, summary: str, started: float, finished: float, output: Any = None) -> None:
    with task_db_connection() as con:
        con.execute(
            "INSERT INTO agent_logs(task_id,agent_id,agent_name,task_type,status,summary,started_at,finished_at,duration_ms,output_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (task_id, agent_id, agent_name, task_type, status, summary[:7900], started, finished,
             max(0, int((finished-started)*1000)), json.dumps(output, ensure_ascii=False) if output is not None else None),
        )
        con.commit()


def db_get_task(task_id: str, owner_uid: str) -> dict[str, Any] | None:
    with task_db_connection() as con:
        con.row_factory = sqlite3.Row
        row = con.execute("SELECT * FROM tasks WHERE task_id=? AND owner_uid=?", (task_id, owner_uid)).fetchone()
        if not row:
            return None
        logs = con.execute("SELECT * FROM agent_logs WHERE task_id=? ORDER BY id", (task_id,)).fetchall()
    data = dict(row)
    data["payload"] = json.loads(data.pop("payload_json") or "{}")
    data["result"] = json.loads(data.pop("result_json") or "{}")
    data["logs"] = [dict(x) for x in logs]
    for item in data["logs"]:
        item["output"] = json.loads(item.pop("output_json") or "null")
    return data


def db_list_tasks(owner_uid: str, limit: int = 20) -> list[dict[str, Any]]:
    with task_db_connection() as con:
        con.row_factory = sqlite3.Row
        rows = con.execute("SELECT task_id FROM tasks WHERE owner_uid=? ORDER BY created_at DESC LIMIT ?", (owner_uid, max(1, min(50, limit)))).fetchall()
    return [db_get_task(row["task_id"], owner_uid) for row in rows]




def bible_scope_books(scope_type: str, group_id: str = "", book_id: str = "", selected_ids: list[str] | None = None) -> tuple[list[dict[str, Any]], str, str]:
    books = list(BIBLE_BOOK_INDEX.values())
    scope_type = str(scope_type or "").strip()
    scope_id = ""
    if scope_type == "canon":
        selected = books; label = "Seluruh Alkitab Protestan (66 kitab)"; scope_id = "protestant-66"
    elif scope_type == "old_testament":
        selected = [b for b in books if b["testament"] == "old"]; label = "Perjanjian Lama (39 kitab)"; scope_id = "old-testament"
    elif scope_type == "new_testament":
        selected = [b for b in books if b["testament"] == "new"]; label = "Perjanjian Baru (27 kitab)"; scope_id = "new-testament"
    elif scope_type == "group":
        if group_id not in BIBLE_GROUPS: raise ValueError("Kelompok kitab tidak dikenal.")
        selected = [b for b in books if b["groupId"] == group_id]; label = BIBLE_GROUPS[group_id]["label"]; scope_id = group_id
    elif scope_type == "book":
        if book_id not in BIBLE_BOOK_INDEX: raise ValueError("Kitab tidak dikenal.")
        selected = [BIBLE_BOOK_INDEX[book_id]]; label = BIBLE_BOOK_INDEX[book_id]["name"]; scope_id = book_id
    elif scope_type == "custom":
        wanted = list(dict.fromkeys(str(x) for x in (selected_ids or []) if str(x) in BIBLE_BOOK_INDEX))
        if not wanted: raise ValueError("Pilih minimal satu kitab pada daftar pilihan.")
        if len(wanted) > 66: raise ValueError("Maksimal 66 kitab dalam satu seri.")
        # Normalize user-provided custom selections to Protestant canon order.
        # This guarantees sequence_no and the eventual production queue remain canonical,
        # even if a caller submits book IDs in a different order.
        wanted_set = set(wanted)
        selected = [book for book in books if book["id"] in wanted_set]
        label = f"Pilihan kitab ({len(selected)} kitab)"; scope_id = "custom-" + str(len(selected))
    else:
        raise ValueError("Jenis cakupan seri Alkitab tidak valid.")
    return selected, label, scope_id


def db_series_from_row(row: sqlite3.Row) -> dict[str, Any]:
    data = dict(row)
    data["selectedBookIds"] = json.loads(data.pop("selected_books_json") or "[]")
    data["completedBookIds"] = json.loads(data.pop("completed_book_ids_json") or "[]")
    data["autoQueue"] = bool(data.get("auto_queue", 1))
    for key in ("created_at", "updated_at"):
        data[key] = int(data[key] or 0)
    return data


def db_create_bible_series(owner_uid: str, payload: dict[str, Any], selected_books: list[dict[str, Any]], scope_label: str, scope_id: str) -> str:
    series_id = uuid.uuid4().hex
    now = time.time()
    title = str(payload.get("title") or f"Seri {scope_label}").strip()[:160]
    with task_db_connection() as con:
        source_status = "local_json" if (LOCAL_BIBLE_JSON_FILE.exists() and bool(CONFIG.get("localBibleTermsAcknowledged", False))) else "pending_local_json"
        local_source_meta = (local_bible_source_status().get("sourceMetadata") or {})
        source_version = str(local_source_meta.get("name") or "File JSON belum diunggah")[:120]
        con.execute("""INSERT INTO bible_series(series_id,owner_uid,title,scope_type,scope_id,scope_label,channel_id,status,progress,total_books,completed_books,total_episodes,queued_episodes,target_duration_seconds,audience,auto_queue,source_version,source_status,selected_books_json,completed_book_ids_json,created_at,updated_at)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (series_id,owner_uid,title,payload["scopeType"],scope_id,scope_label,payload["channelId"],"planning",0,len(selected_books),0,0,0,
                      int(payload.get("durationSeconds",45)),str(payload.get("audience","Keluarga dan semua umur"))[:120],1 if payload.get("autoQueue",True) else 0,source_version,source_status,
                      json.dumps([b["id"] for b in selected_books]),"[]",now,now))
        con.commit()
    return series_id


def db_get_bible_series(series_id: str, owner_uid: str) -> dict[str, Any] | None:
    with task_db_connection() as con:
        con.row_factory = sqlite3.Row
        row = con.execute("SELECT * FROM bible_series WHERE series_id=? AND owner_uid=?",(series_id,owner_uid)).fetchone()
        if not row: return None
        episode_rows = con.execute("SELECT * FROM bible_episodes WHERE series_id=? AND owner_uid=? ORDER BY sequence_no",(series_id,owner_uid)).fetchall()
    data = db_series_from_row(row)
    episodes=[]
    for item in episode_rows:
        ep=dict(item); ep["payload"] = json.loads(ep.pop("payload_json") or "{}")
        ep["created_at"] = int(ep.get("created_at") or 0); ep["updated_at"] = int(ep.get("updated_at") or 0)
        episodes.append(ep)
    data["episodes"] = episodes
    return data


def db_list_bible_series(owner_uid: str, limit: int = 20) -> list[dict[str, Any]]:
    with task_db_connection() as con:
        con.row_factory = sqlite3.Row
        rows = con.execute("SELECT * FROM bible_series WHERE owner_uid=? ORDER BY created_at DESC LIMIT ?",(owner_uid,max(1,min(50,limit)))).fetchall()
    output=[]
    for row in rows:
        item=db_series_from_row(row)
        with task_db_connection() as con:
            counts=con.execute("SELECT status,COUNT(*) FROM bible_episodes WHERE series_id=? GROUP BY status",(item["series_id"],)).fetchall()
        item["episodeCounts"]={status:count for status,count in counts}
        output.append(item)
    return output


def db_update_bible_series(series_id: str, owner_uid: str, **fields) -> None:
    allowed={"status","progress","completed_books","total_episodes","queued_episodes","completed_book_ids_json","error_message","source_status"}
    updates={key:value for key,value in fields.items() if key in allowed}
    if not updates: return
    updates["updated_at"]=time.time()
    sql=",".join(f"{key}=?" for key in updates)
    with task_db_connection() as con:
        con.execute(f"UPDATE bible_series SET {sql} WHERE series_id=? AND owner_uid=?",(*updates.values(),series_id,owner_uid)); con.commit()


def db_update_bible_episode(episode_id: str, owner_uid: str, **fields) -> None:
    allowed={"status","task_id","payload_json"}
    updates={key:value for key,value in fields.items() if key in allowed}
    if not updates: return
    updates["updated_at"]=time.time()
    sql=",".join(f"{key}=?" for key in updates)
    with task_db_connection() as con:
        con.execute(f"UPDATE bible_episodes SET {sql} WHERE episode_id=? AND owner_uid=?",(*updates.values(),episode_id,owner_uid)); con.commit()


def db_update_episode_for_task(task_id: str, status: str) -> None:
    with task_db_connection() as con:
        con.row_factory=sqlite3.Row
        row=con.execute("SELECT owner_uid,payload_json FROM tasks WHERE task_id=?",(task_id,)).fetchone()
        if not row: return
        payload=json.loads(row["payload_json"] or "{}")
        episode_id=payload.get("bibleEpisodeId"); series_id=payload.get("bibleSeriesId"); owner_uid=row["owner_uid"]
        if not episode_id or not series_id: return
        con.execute("UPDATE bible_episodes SET status=?,updated_at=? WHERE episode_id=? AND owner_uid=? AND series_id=?",(status,time.time(),episode_id,owner_uid,series_id))
        counts=con.execute("SELECT status,COUNT(*) FROM bible_episodes WHERE series_id=? GROUP BY status",(series_id,)).fetchall()
        countmap={s:c for s,c in counts}
        total=con.execute("SELECT COUNT(*) FROM bible_episodes WHERE series_id=?",(series_id,)).fetchone()[0]
        queued=sum(countmap.get(k,0) for k in ("queued","producing")); complete=countmap.get("completed",0)
        if total and complete == total: series_status="completed"
        elif queued: series_status="producing"
        elif countmap.get("failed",0): series_status="partial"
        elif countmap.get("needs_review",0): series_status="needs_review"
        else: series_status="planned"
        con.execute("UPDATE bible_series SET status=?,queued_episodes=?,updated_at=? WHERE series_id=? AND owner_uid=?",(series_status,queued,time.time(),series_id,owner_uid))
        con.commit()


def _recommended_episode_count(chapters: int) -> int:
    return max(1, min(12, int(math.ceil(chapters / 4))))


def _validate_planned_reference(reference: str, book: dict[str, Any]) -> str:
    parsed=parse_bible_reference(reference)
    if parsed["bookId"] != book["id"]:
        raise ValueError("Rujukan episode menunjuk kitab yang berbeda dari kitab yang sedang direncanakan.")
    if parsed["chapter"] > book["chapterCount"]:
        raise ValueError("Pasal rujukan melebihi jumlah pasal kitab.")
    return parsed["reference"]


def _plan_one_bible_book(book: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    count=_recommended_episode_count(int(book["chapterCount"]))
    prompt=(
        "Kamu adalah perancang kurikulum seri Shorts Alkitab Kristen Protestan berbahasa Indonesia. "
        "Buat daftar episode komprehensif untuk SATU kitab. Susun rujukan sesuai isi kanon Protestan yang akan diperiksa terhadap satu-satunya sumber teks: file Alkitab JSON yang diunggah pengguna. Jangan mengarang kutipan langsung. "
        "Kamu belum menerima teks Alkitab lengkap pada tahap perencanaan, jadi jangan mengaku telah mencocokkan teks ayat secara verbatim. Usulkan perikop dan rentang rujukan yang wajib divalidasi ayat demi ayat terhadap file JSON yang diunggah sebelum antrean/produksi. "
        "Buat tepat atau sedekat mungkin dengan jumlah episode yang diminta, hindari pengulangan, gunakan rujukan satu kitab dan satu pasal dengan bentuk 'Nama Kitab pasal:ayat-awal-ayat-akhir'. "
        "Jangan memasukkan teks ayat TB secara verbatim; ringkas dan parafrase. Semua episode harus layak sebagai Shorts naratif yang berdiri sendiri, tetapi berurutan secara pedagogis. "
        "Balas JSON valid: {\"overview\":string,\"episodes\":[{\"title\":string,\"summary\":string,\"reference\":string,\"centralTheme\":string,\"teachingPoint\":string,\"hook\":string,\"storyArc\":string}]}"
        f"\nKitab: {book['name']} ({book['testament']} Testament), {book['chapterCount']} pasal."
        f"\nKelompok: {BIBLE_GROUPS[book['groupId']]['label']}."
        f"\nJumlah episode sasaran: {count}. Durasi tiap episode: {payload.get('durationSeconds',45)} detik."
        f"\nAudiens: {payload.get('audience','Keluarga dan semua umur')}."
        "\nCakupan: susun perjalanan kitab dari awal sampai akhir; gabungkan pasal yang berdekatan bila perlu, namun setiap reference harus satu pasal dan satu rentang ayat."
        "\nPenting: Jangan menciptakan kisah untuk kitab yang bukan naratif. Untuk kitab puisi/surat/nabi, susun episode sebagai tema, mazmur, pengajaran, nubuat dalam konteks, atau rangkaian gagasan sesuai jenis kitab. Hindari spekulasi dan klaim sensasional."
    )
    last_error=None
    for attempt in range(2):
        try:
            data=call_ollama_json(prompt if attempt==0 else prompt+"\nPercobaan sebelumnya mengandung rujukan yang tidak valid. Pastikan setiap reference cocok dengan nama kitab dan pasal, berisi rentang ayat numerik satu pasal.", max_output_tokens=7000)
            episodes=data.get("episodes") or []
            if not isinstance(episodes,list) or not episodes: raise RuntimeError("AI tidak mengembalikan daftar episode.")
            clean=[]
            for ep in episodes[:16]:
                if not isinstance(ep,dict): continue
                try: ref=_validate_planned_reference(str(ep.get("reference", "")), book)
                except Exception: continue
                title=str(ep.get("title") or "").strip()[:120]
                if not title: continue
                clean.append({"title":title,"summary":str(ep.get("summary") or "").strip()[:2500],"reference":ref,
                              "centralTheme":str(ep.get("centralTheme") or "").strip()[:300],
                              "teachingPoint":str(ep.get("teachingPoint") or "").strip()[:500],
                              "hook":str(ep.get("hook") or "").strip()[:350],
                              "storyArc":str(ep.get("storyArc") or "").strip()[:600]})
            if not clean: raise RuntimeError("Tidak ada episode dengan rujukan yang valid.")
            return {"overview":str(data.get("overview") or "").strip()[:1800],"episodes":clean}
        except OperationPausedError:
            raise
        except Exception as exc:
            last_error=exc
    raise RuntimeError(f"Perencanaan kitab {book['name']} gagal: {last_error}")


def run_bible_series_planner(series_id: str, owner_uid: str, payload: dict[str, Any], selected_books: list[dict[str, Any]]) -> None:
    try:
        existing=db_get_bible_series(series_id,owner_uid)
        if not existing: return
        completed=set(existing.get("completedBookIds") or [])
        sequence_start=len(existing.get("episodes") or [])
        total_episodes=sequence_start
        for index, book in enumerate(selected_books, start=1):
            if book["id"] in completed: continue
            assert_working_day()
            try:
                planned=_plan_one_bible_book(book,payload)
            except RuntimeError as exc:
                message=str(exc)
                if isinstance(exc, OperationPausedError):
                    db_update_bible_series(series_id,owner_uid,status="paused",progress=int(len(completed)/max(1,len(selected_books))*100),error_message=message[:1200])
                    return
                lower_message = message.lower()
                if "kuota" in lower_message or "429" in message or "batas permintaan" in lower_message:
                    db_update_bible_series(series_id,owner_uid,status="paused_quota",progress=int(len(completed)/max(1,len(selected_books))*100),error_message=message)
                    return
                if any(marker in lower_message for marker in ("http 401", "http 403", "api key not valid", "api_key_invalid", "permission_denied", "model not found")):
                    log.error("Bible planner berhenti karena konfigurasi/akses model lokal: %s", message)
                    db_update_bible_series(series_id,owner_uid,status="failed",error_message=message[:1200])
                    return
                log.exception("Bible plan gagal untuk %s",book["name"])
                db_update_bible_series(series_id,owner_uid,status="partial",error_message=message[:1200])
                # Stop at the first failed book. Continuing would append later books
                # before this one; on resume the missing book would be placed out of
                # canonical order. Resume will retry this book, then continue forward.
                return
            now=time.time()
            with task_db_connection() as con:
                for ep in planned["episodes"]:
                    sequence_start += 1; total_episodes += 1
                    episode_id=uuid.uuid4().hex
                    current_source_meta = local_bible_source_status().get("sourceMetadata") or {}
                    source_version = str(current_source_meta.get("name") or "File JSON Alkitab")[:120]
                    payload_ep={"seriesId":series_id,"bookId":book["id"],"bookName":book["name"],"reference":ep["reference"],"sourceVersion":source_version}
                    con.execute("""INSERT INTO bible_episodes(episode_id,series_id,owner_uid,sequence_no,book_id,book_name,testament,group_id,title,summary,reference,central_theme,teaching_point,hook,status,target_duration_seconds,payload_json,created_at,updated_at)
                                 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                                 (episode_id,series_id,owner_uid,sequence_start,book["id"],book["name"],book["testament"],book["groupId"],ep["title"],ep["summary"],ep["reference"],ep["centralTheme"],ep["teachingPoint"],ep["hook"],"planned",int(payload.get("durationSeconds",45)),json.dumps(payload_ep,ensure_ascii=False),now,now))
                con.commit()
            completed.add(book["id"])
            db_update_bible_series(series_id,owner_uid,completed_books=len(completed),total_episodes=total_episodes,
                                   completed_book_ids_json=json.dumps(sorted(completed)),progress=int(len(completed)/max(1,len(selected_books))*100),
                                   status="planning")
            time.sleep(1.0)
        final=db_get_bible_series(series_id,owner_uid)
        if final:
            status="planned" if len(completed)==len(selected_books) else "partial"
            db_update_bible_series(series_id,owner_uid,status=status,progress=100 if status=="planned" else int(len(completed)/max(1,len(selected_books))*100),
                                   total_episodes=len(final.get("episodes",[])),error_message="" if status=="planned" else (final.get("error_message") or "Sebagian kitab perlu diulang."))
            if status == "planned" and final.get("autoQueue", True):
                if tb_production_source_ready():
                    try:
                        queued_result = queue_bible_series_episodes(series_id, owner_uid)
                        log.info("Bible Series %s selesai direncanakan; %s episode otomatis masuk antrean produksi berurutan.", series_id, queued_result.get("queued", 0))
                    except OperationPausedError as queue_error:
                        # Keep the series in the dedicated Sunday-pause state so the
                        # workforce loop can resume its planner/auto-queue after 15:00.
                        db_update_bible_series(series_id,owner_uid,status="paused",error_message=str(queue_error)[:1200])
                        log.info("Auto-queue Bible Series %s ditunda oleh jadwal istirahat Minggu.", series_id)
                    except Exception as queue_error:
                        db_update_bible_series(series_id,owner_uid,status="planned",error_message=("Rencana selesai, tetapi antrean otomatis belum dimulai: "+str(queue_error))[:1200])
                        log.exception("Auto-queue Bible Series %s gagal", series_id)
                else:
                    db_update_bible_series(series_id,owner_uid,status="planned",error_message="Rencana episode selesai. Antrean otomatis menunggu file JSON Alkitab diunggah dan ketentuan penggunaan pada metadata file dibaca serta diakui.")
    except Exception as exc:
        message=str(exc)
        status="paused" if (WORKER_STOP.is_set() or isinstance(exc, OperationPausedError)) else "failed"
        db_update_bible_series(series_id,owner_uid,status=status,error_message=message[:1500])
        log.exception("Bible Series planner %s berhenti",series_id)


class BibleQueueBlockedError(RuntimeError):
    """A user-correctable preflight failure; no production task has been created."""
    def __init__(self, message: str, blocked: list[dict[str, Any]] | None = None):
        super().__init__(message)
        self.code = "BIBLE_REFERENCES_INCOMPLETE" if blocked else "BIBLE_QUEUE_BLOCKED"
        self.blocked = blocked or []


def queue_bible_series_episodes(series_id: str, owner_uid: str, episode_ids: list[str] | None = None) -> dict[str, Any]:
    assert_working_day()
    if not tb_production_source_ready():
        raise BibleQueueBlockedError("Sumber Alkitab belum siap. Buka Pengaturan → Sumber Alkitab dari File JSON, unggah indo_tb.json, lalu baca dan akui ketentuan penggunaan yang tercantum pada metadata file.")
    series=db_get_bible_series(series_id,owner_uid)
    if not series: raise ValueError("Seri Alkitab tidak ditemukan pada workspace ini.")
    if series["status"] not in ("planned","partial","queued","producing"):
        raise RuntimeError("Seri belum selesai direncanakan. Tunggu hingga status planned atau partial.")
    wanted=set(episode_ids or [])
    episodes=[ep for ep in series["episodes"] if (not wanted or ep["episode_id"] in wanted) and ep["status"] in ("planned","failed","paused")]
    if not episodes: raise BibleQueueBlockedError("Tidak ada episode yang siap dimasukkan ke antrean. Periksa apakah rencana sudah selesai dan episode belum pernah diantrekan.")
    # Uploaded JSON is the only source. Validate every selected reference before
    # inserting any task. A single missing/conflicting verse blocks the whole batch.
    blocked: list[dict[str, Any]] = []
    for ep in episodes:
        try:
            fetch_local_tb_passage(ep["reference"])
        except Exception as exc:
            blocked.append({
                "sequenceNo": int(ep.get("sequence_no") or 0),
                "book": str(ep.get("book_name") or ""),
                "title": str(ep.get("title") or "")[:120],
                "reference": str(ep.get("reference") or "")[:160],
                "reason": str(exc)[:300],
            })
    if blocked:
        preview = "; ".join(
            f"#{item['sequenceNo']} {item['reference']}: {item['reason']}"
            for item in blocked[:5]
        )
        extra = f" dan {len(blocked)-5} rujukan lainnya" if len(blocked) > 5 else ""
        message = (
            f"Antrean dibatalkan: {len(blocked)} dari {len(episodes)} episode belum memiliki rujukan lengkap "
            f"pada file JSON yang diunggah. Tidak ada job produksi yang dibuat. Periksa/unggah ulang file atau koreksi rujukan AI. Contoh: {preview}{extra}"
        )
        raise BibleQueueBlockedError(message, blocked)
    created=[]
    for ep in episodes:
        payload_ep={
            "jobId":f"bible-{series_id[:10]}-{ep['episode_id'][:10]}","channelId":series["channel_id"],
            "title":ep["title"],"format":"YouTube Shorts",
            "notes":("Seri Alkitab: "+series["title"]+". Ringkasan: "+ep["summary"]+". Tema: "+ep["central_theme"]+". Pesan: "+ep["teaching_point"]+". Hook: "+ep["hook"])[:2000],
            "bibleReference":ep["reference"],"durationSeconds":series["target_duration_seconds"],"targetDate":"",
            "autoUploadAfterQC":bool(CONFIG.get("autoUploadAfterQC",False)),"privacyStatus":str(CONFIG.get("privacyStatus","private")),
            "madeForKids":series["channel_id"]=="bible-stories-3d","bibleSeriesId":series_id,"bibleEpisodeId":ep["episode_id"],
            "bibleSourceVersion":str((local_bible_source_status().get("sourceMetadata") or {}).get("name") or "File JSON Alkitab")[:120],"requireBibleSource":True
        }
        task_id=db_create_task(owner_uid,payload_ep)
        db_update_bible_episode(ep["episode_id"],owner_uid,status="queued",task_id=task_id)
        created.append({"episodeId":ep["episode_id"],"taskId":task_id,"sequenceNo":ep["sequence_no"],"title":ep["title"]})
    with task_db_connection() as con:
        queued_total = con.execute(
            "SELECT COUNT(*) FROM bible_episodes WHERE series_id=? AND owner_uid=? AND status IN ('queued','producing')",
            (series_id, owner_uid),
        ).fetchone()[0]
        producing_total = con.execute(
            "SELECT COUNT(*) FROM bible_episodes WHERE series_id=? AND owner_uid=? AND status='producing'",
            (series_id, owner_uid),
        ).fetchone()[0]
    db_update_bible_series(
        series_id, owner_uid,
        status="producing" if producing_total else "queued",
        queued_episodes=int(queued_total),
    )
    return {"queued":len(created),"totalQueued":int(queued_total),"episodes":created}



def jakarta_now() -> datetime:
    return datetime.now(timezone(timedelta(hours=7)))


class OperationPausedError(RuntimeError):
    """Raised at safe work boundaries when the weekly rest window is active."""


def is_sunday_rest_period(now: datetime | None = None) -> bool:
    now = now or jakarta_now()
    if not bool(CONFIG.get("sundayPauseEnabled", True)):
        return False
    start_hour = int(CONFIG.get("sundayPauseStart", 6))
    end_hour = int(CONFIG.get("sundayPauseEnd", 15))
    return now.weekday() == 6 and start_hour <= now.hour < end_hour


def operation_status() -> dict[str, Any]:
    now = jakarta_now()
    paused = is_sunday_rest_period(now)
    if paused:
        resume = now.replace(hour=int(CONFIG.get("sundayPauseEnd", 15)), minute=0, second=0, microsecond=0)
        return {"working": False, "state": "sunday_rest", "label": "Istirahat Minggu", "timezone": "Asia/Jakarta",
                "resumeAt": resume.isoformat(), "hours": "Minggu 06.00–15.00 WIB"}
    return {"working": True, "state": "working", "label": "Kantor AI beroperasi", "timezone": "Asia/Jakarta",
            "resumeAt": None, "hours": "Senin–Sabtu 24 jam; Minggu 15.00–06.00 WIB"}


def is_working_time() -> bool:
    return not is_sunday_rest_period()


def assert_working_day() -> None:
    """Block new/next work during the configured Sunday rest window."""
    if WORKER_STOP.is_set():
        raise OperationPausedError("Worker sedang ditutup. Antrean akan dilanjutkan saat aplikasi dibuka kembali.")
    if is_sunday_rest_period():
        raise OperationPausedError("Kantor AI sedang istirahat hari Minggu pukul 06.00–15.00 WIB. Pekerjaan disimpan dan akan dilanjutkan pukul 15.00.")


def ollama_status() -> dict[str, Any]:
    base_url = str(CONFIG.get("ollamaBaseUrl", "http://127.0.0.1:11434")).rstrip("/")
    model = str(CONFIG.get("ollamaModel", "qwen3:4b"))
    try:
        response = requests.get(base_url + "/api/tags", timeout=(2, 5))
        response.raise_for_status()
        data = response.json()
        models = data.get("models", []) if isinstance(data, dict) else []
        available = [str(item.get("name", "")) for item in models if isinstance(item, dict)]
        matched = any(name == model or name.split(":", 1)[0] == model.split(":", 1)[0] for name in available)
        return {"online": True, "model": model, "modelAvailable": matched, "availableModels": available[:30],
                "baseUrl": base_url, "message": "Ollama terhubung." if matched else f"Ollama aktif, tetapi model {model} belum diunduh."}
    except Exception as exc:
        return {"online": False, "model": model, "modelAvailable": False, "availableModels": [],
                "baseUrl": base_url, "message": f"Ollama belum dapat dihubungi: {str(exc)[:300]}"}


def require_ollama_ready() -> None:
    status = ollama_status()
    if not status.get("online"):
        raise RuntimeError(status.get("message", "Ollama tidak aktif."))
    if not status.get("modelAvailable"):
        raise RuntimeError(status.get("message", "Model Ollama belum diunduh."))


def call_ollama_json(prompt: str, max_output_tokens: int = 4096) -> dict[str, Any]:
    """Call the local Ollama model; no cloud AI provider or API key is used."""
    assert_working_day()
    status = ollama_status()
    if not status.get("online"):
        raise RuntimeError(status.get("message", "Ollama tidak aktif."))
    if not status.get("modelAvailable"):
        raise RuntimeError(status.get("message", "Model Ollama belum diunduh. Jalankan ollama pull qwen3:4b."))
    base_url = str(CONFIG.get("ollamaBaseUrl", "http://127.0.0.1:11434")).rstrip("/")
    model = str(CONFIG.get("ollamaModel", "qwen3:4b"))
    configured_context = CONFIG.get("ollamaNumCtx")
    try:
        context_size = int(configured_context) if configured_context is not None else (16384 if len(str(prompt)) > 18000 else 8192)
    except (TypeError, ValueError):
        context_size = 8192
    context_size = max(8192, min(context_size, 32768))
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": str(prompt)}],
        "stream": False,
        "format": "json",
        "think": False,
        "keep_alive": "30m",
        "options": {"temperature": 0.35, "num_predict": max(256, min(int(max_output_tokens), 8192)), "num_ctx": context_size},
    }
    try:
        with OLLAMA_REQUEST_LOCK:
            assert_working_day()
            response = requests.post(base_url + "/api/chat", json=payload, timeout=(10, 600))
            response.raise_for_status()
            data = response.json()
        text = str((data.get("message") or {}).get("content", "")).strip()
        if not text:
            raise ValueError("Ollama mengembalikan jawaban kosong.")
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I)
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, flags=re.S)
            if not match:
                raise
            parsed = json.loads(match.group(0))
        if not isinstance(parsed, dict):
            raise ValueError("Jawaban Ollama bukan objek JSON.")
        return parsed
    except requests.RequestException as exc:
        raise RuntimeError(f"Tidak dapat menghubungi Ollama lokal: {exc}") from exc
    except Exception as exc:
        raise RuntimeError(f"Ollama menghasilkan jawaban yang tidak dapat dibaca sebagai JSON: {str(exc)[:400]}") from exc


def extract_guardian_references(text: str, extra_reference: str = "") -> list[str]:
    """Extract conventional Indonesian Protestant Bible references from a script."""
    names = sorted({item[1] for item in BIBLE_BOOKS}, key=len, reverse=True)
    names_pattern = "|".join(re.escape(name).replace(r"\ ", r"\s+") for name in names)
    pattern = re.compile(
        rf"(?<![A-Za-z0-9])(?P<book>{names_pattern})\s+(?P<chapter>\d{{1,3}})(?:\s*:\s*(?P<start>\d{{1,3}})(?:\s*[-–—]\s*(?P<end>\d{{1,3}}))?)?",
        re.IGNORECASE,
    )
    candidates = [m.group(0).strip().rstrip(".,;:)") for m in pattern.finditer(str(text or ""))]
    extra = str(extra_reference or "").strip()
    if extra:
        candidates.extend(x.strip() for x in re.split(r"[;\n]+", extra) if x.strip())
    unique = []
    seen = set()
    for raw in candidates:
        normalized = re.sub(r"\s+", " ", raw).replace("–", "-").replace("—", "-")
        key = normalized.casefold()
        if key not in seen:
            seen.add(key)
            unique.append(normalized)
    return unique[:24]


def fetch_guardian_tb_reference(reference: str) -> dict[str, Any]:
    """Resolve verse-range or whole-chapter reference against the local uploaded TB JSON."""
    if not tb_production_source_ready():
        raise RuntimeError("Sumber Alkitab JSON lokal belum siap atau ketentuan sumber belum diakui.")
    raw = str(reference or "").strip().replace("–", "-").replace("—", "-")
    match = re.match(r"^(.+?)\s+(\d{1,3})(?:\s*:\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?$", raw, re.I)
    if not match:
        raise ValueError("Format rujukan belum dikenali; periksa kitab, pasal, dan ayat.")
    raw_book, chapter_s, start_s, end_s = match.groups()
    book_id = BIBLE_BOOK_ALIASES.get(re.sub(r"[^a-z0-9]", "", raw_book.casefold()))
    if not book_id:
        raise ValueError(f"Nama kitab tidak dikenal: {raw_book}.")
    book = BIBLE_BOOK_INDEX[book_id]
    chapter = int(chapter_s)
    if chapter < 1 or chapter > book["chapterCount"]:
        raise ValueError(f"Pasal {chapter} tidak valid untuk kitab {book['name']}.")
    global _LOCAL_BIBLE_INDEX, _LOCAL_BIBLE_CACHE_MTIME
    with _LOCAL_BIBLE_LOCK:
        mtime = LOCAL_BIBLE_JSON_FILE.stat().st_mtime
        if _LOCAL_BIBLE_INDEX is None or _LOCAL_BIBLE_CACHE_MTIME != mtime:
            envelope = json.loads(LOCAL_BIBLE_JSON_FILE.read_text(encoding="utf-8"))
            _LOCAL_BIBLE_INDEX = {(row["bookId"], int(row["chapter"]), int(row["verse"])): str(row["text"])
                                  for row in envelope.get("verses", [])}
            _LOCAL_BIBLE_CACHE_MTIME = mtime
        index = dict(_LOCAL_BIBLE_INDEX)
    if start_s is None:
        chapter_rows = sorted((verse, value) for (bid, chap, verse), value in index.items()
                              if bid == book_id and chap == chapter)
        if not chapter_rows:
            raise RuntimeError(f"Pasal {book['name']} {chapter} tidak ditemukan dalam sumber lokal.")
        selected = chapter_rows
        canonical_ref = f"{book['name']} {chapter}"
    else:
        start_verse = int(start_s); end_verse = int(end_s or start_s)
        if start_verse < 1 or end_verse < start_verse or end_verse > 200:
            raise ValueError("Rentang ayat tidak valid.")
        selected = []
        missing = []
        for verse in range(start_verse, end_verse + 1):
            value = index.get((book_id, chapter, verse))
            if value:
                selected.append((verse, value))
            else:
                missing.append(verse)
        if missing:
            raise RuntimeError(f"Ayat hilang pada sumber lokal: {book['name']} {chapter}:{','.join(map(str, missing))}.")
        canonical_ref = f"{book['name']} {chapter}:{start_verse}" + (f"-{end_verse}" if end_verse != start_verse else "")
    verse_text = "\n".join(f"{canonical_ref.split(':')[0]}:{verse} {value}" for verse, value in selected)
    return {"reference": canonical_ref, "text": verse_text[:10000], "verseCount": len(selected),
            "source": "File JSON Alkitab lokal yang diimpor pemilik", "verifiedAgainstLocalFile": True}


def run_theological_guardian(narration: str, title: str = "", extra_reference: str = "", channel_id: str = "") -> dict[str, Any]:
    """Verify explicit TB references; non-citation notes remain manual and non-fatal."""
    script = str(narration or "").strip()
    if not script:
        raise ValueError("Naskah kosong; tidak dapat diperiksa.")
    references = extract_guardian_references(script, extra_reference)
    source_passages: list[dict[str, Any]] = []
    source_errors: list[dict[str, Any]] = []
    deterministic_fatal: list[str] = []
    manual_verification: list[str] = []
    source_ready = tb_production_source_ready()

    if not references:
        # A devotional/inspirational script does not need an explicit verse citation to pass.
        manual_verification.append(
            "Tidak ada kutipan atau referensi ayat eksplisit. Pemeriksaan kecocokan ayat TB tidak berlaku; "
            "periksa kembali konteks teologis dan fakta sejarah bila naskah memuat klaim khusus."
        )
    elif not source_ready:
        source_errors.append({
            "reference": "; ".join(references[:8]),
            "issue": "File JSON TB lokal belum tersedia/siap atau ketentuan sumber belum diakui.",
            "status": "PERLU VERIFIKASI MANUAL",
        })
        manual_verification.append("Rujukan eksplisit belum dapat dicocokkan karena sumber TB lokal belum siap.")
    else:
        for reference in references:
            try:
                source_passages.append(fetch_guardian_tb_reference(reference))
            except Exception as exc:
                issue = str(exc)
                # With a ready local source, malformed citations and missing verses are fatal.
                fatal_markers = (
                    "Ayat hilang pada sumber lokal", "Pasal ", "Nama kitab tidak dikenal",
                    "Format rujukan belum dikenali", "Rentang ayat tidak valid",
                )
                if any(marker in issue for marker in fatal_markers):
                    deterministic_fatal.append(f"{reference}: {issue}")
                else:
                    source_errors.append({"reference": reference, "issue": issue, "status": "PERLU VERIFIKASI MANUAL"})
                    manual_verification.append(f"{reference}: {issue}")

    # Keep prompt input bounded so core instructions and the requested JSON schema remain in context.
    compact_passages = []
    per_passage_limit = max(350, min(900, 10000 // max(1, len(source_passages))))
    for passage in source_passages:
        compact_passages.append({
            "reference": str(passage.get("reference", ""))[:160],
            "verseCount": int(passage.get("verseCount", 0) or 0),
            "text": str(passage.get("text", ""))[:per_passage_limit],
        })
    source_context = json.dumps(compact_passages, ensure_ascii=False)
    if len(source_context) > 10500:
        source_context = source_context[:10500]
    reference_context = json.dumps(references, ensure_ascii=False)
    error_context = json.dumps(source_errors, ensure_ascii=False)[:2500]
    prompt = (
        "Kamu adalah THEOLOGICAL GUARDIAN, editor teologi senior untuk channel YouTube Rohani Kristen Indonesia: "
        "Bible Stories 3D, Daily Faith & Inspiration, dan Bible Facts & Mysteries.\n\n"
        "TUGAS UTAMA: Verifikasi naskah tanpa mengubah gaya bahasa dan tanpa membuat naskah baru.\n"
        "ATURAN: Gunakan TB lokal untuk rujukan eksplisit; periksa konteks, doktrin, dan fakta sejarah. "
        "Rujukan ayat yang jelas salah/tidak ada dalam sumber TB yang siap adalah FATAL ERROR. "
        "Catatan yang memerlukan sumber eksternal atau pemeriksaan manusia masuk manualVerification, bukan fatalErrors. "
        "Naskah renungan/inspirasi umum yang tidak mengutip ayat secara eksplisit TIDAK boleh dinyatakan gagal hanya karena tidak menyebut ayat; tetap periksa doktrin dan klaimnya. "
        "Jangan mengarang bahwa sejarah telah diverifikasi eksternal.\n\n"
        "Balas JSON saja dengan bentuk: {\"status\":\"LULUS|PERLU REVISI|DITOLAK\","
        "\"versesChecked\":[{\"reference\":string,\"verdict\":string,\"correction\":string}],"
        "\"fatalErrors\":[string],\"problems\":[{\"lineOrQuote\":string,\"reason\":string}],"
        "\"suggestions\":[{\"original\":string,\"replacement\":string}],"
        "\"manualVerification\":[string],\"pastoralNote\":string,\"summary\":string}.\n\n"
        f"CHANNEL: {CHANNELS.get(channel_id, channel_id or 'Tidak ditentukan')}\nJUDUL: {title[:200]}\n"
        "REFERENSI YANG TERDETEKSI: " + reference_context + "\n"
        "HASIL PENCOCOKAN SUMBER TB LOKAL (dipadatkan agar instruksi tetap utuh): " + source_context + "\n"
        "MASALAH AKSES / RUJUKAN: " + error_context + "\n"
        "NASKAH (jangan diubah):\n" + script[:12000]
    )
    result = call_ollama_json(prompt, max_output_tokens=5000)
    model_fatal = result.get("fatalErrors") if isinstance(result.get("fatalErrors"), list) else []
    fatal = [str(item) for item in model_fatal] + deterministic_fatal
    problems = result.get("problems") if isinstance(result.get("problems"), list) else []
    model_manual = result.get("manualVerification") if isinstance(result.get("manualVerification"), list) else []
    manual_verification.extend(str(item) for item in model_manual)
    status = str(result.get("status", "")).upper().strip()
    if fatal:
        status = "DITOLAK"
    elif source_errors or problems:
        if status != "DITOLAK":
            status = "PERLU REVISI"
    elif status not in ("LULUS", "PERLU REVISI", "DITOLAK"):
        status = "LULUS"
    # Manual notes alone never downgrade an otherwise passing general devotional script.
    return {
        "agent": "Theological Guardian", "status": status,
        "referencesDetected": references,
        "versesChecked": result.get("versesChecked", []),
        "fatalErrors": fatal, "problems": problems,
        "suggestions": result.get("suggestions", []),
        "manualVerification": manual_verification[:60],
        "pastoralNote": str(result.get("pastoralNote", ""))[:1200],
        "summary": str(result.get("summary", "Pemeriksaan teologi selesai."))[:1200],
        "source": "Ollama lokal + TB JSON lokal (jika tersedia)", "sourceMatchErrors": source_errors,
    }


def run_pastoral_sensitivity_checker(narration: str, title: str = "", channel_id: str = "") -> dict[str, Any]:
    script = str(narration or "").strip()
    if not script:
        raise ValueError("Naskah kosong; tidak dapat diperiksa.")
    prompt = (
        "Kamu adalah PASTORAL SENSITIVITY CHECKER untuk konten Rohani Kristen di Indonesia.\n"
        "Baca naskah dan cek kata/kalimat yang berpotensi menyinggung, menakuti berlebihan, atau membuat penonton salah paham.\n"
        "Tolak atau sarankan revisi jika naskah: (1) menggunakan kata dikutuk, dihukum Tuhan, masuk neraka secara menghakimi penonton; "
        "(2) mengaitkan penyakit/kemiskinan/musibah dengan dosa penonton secara langsung; "
        "(3) membandingkan denominasi gereja secara negatif; (4) menggunakan bahasa terlalu keras untuk kematian, bunuh diri, perceraian, keguguran; "
        "(5) membuat klaim kesembuhan/mujizat yang pasti terjadi jika penonton melakukan sesuatu.\n"
        "Arahkan penggantian ke bahasa yang menguatkan, penuh kasih, mengajak berdoa, dan tidak menghakimi. "
        "Jangan mengubah keseluruhan naskah.\n"
        "Balas JSON: {\"status\":\"LULUS|PERLU REVISI|DITOLAK\",\"findings\":[{\"original\":string,\"problem\":string,\"safeReplacement\":string}],"
        "\"summary\":string}. Jika tidak ada masalah, findings harus array kosong dan status LULUS.\n"
        f"CHANNEL: {CHANNELS.get(channel_id, channel_id or 'Tidak ditentukan')}\nJUDUL: {title[:200]}\nNASKAH:\n{script[:20000]}"
    )
    result = call_ollama_json(prompt, max_output_tokens=3500)
    findings = result.get("findings") if isinstance(result.get("findings"), list) else []
    status = str(result.get("status", "")).upper().strip()
    if findings and status == "LULUS": status = "PERLU REVISI"
    if status not in ("LULUS", "PERLU REVISI", "DITOLAK"):
        status = "PERLU REVISI" if findings else "LULUS"
    return {"agent": "Pastoral Sensitivity Checker", "status": status,
            "findings": findings[:40], "summary": str(result.get("summary", "Pemeriksaan sensitivitas selesai."))[:1200]}


def generate_community_prayer_reply(comment: str, channel_id: str = "daily-faith-inspiration") -> dict[str, Any]:
    raw = str(comment or "").strip()
    if not raw:
        raise ValueError("Komentar penonton masih kosong.")
    prompt = (
        "Kamu adalah COMMUNITY MANAGER untuk channel Rohani Kristen Daily Faith & Inspiration. "
        "Buat balasan komentar YouTube yang hangat, sopan, empatik, natural, Bahasa Indonesia, maksimal 3 kalimat. "
        "Jangan menghakimi. Jangan memberi nasihat medis atau keuangan spesifik; arahkan ke pendeta/pembimbing rohani atau dokter/tenaga profesional yang tepat. "
        "Jika minta doa, balas dengan doa; jika kesaksian, ucapkan syukur. Akhiri dengan doa singkat dan ajakan tetap semangat jika sesuai, tanpa kalimat kaku/berulang. "
        "Jangan menjanjikan kesembuhan atau mujizat pasti. Jika komentar mengindikasikan bunuh diri, menyakiti diri/orang lain, atau bahaya segera, "
        "prioritaskan keselamatan: minta orang tersebut segera menghubungi layanan darurat setempat dan orang tepercaya di dekatnya; jangan hanya memberi doa. "
        "Balas JSON {\"reply\":string,\"careFlag\":\"normal|needs_human_care|urgent_safety\",\"note\":string}.\n"
        f"Channel: {CHANNELS.get(channel_id, channel_id)}\nKomentar: {raw[:5000]}"
    )
    result = call_ollama_json(prompt, max_output_tokens=700)
    reply = str(result.get("reply", "")).strip()
    if not reply:
        raise RuntimeError("Community Manager tidak menghasilkan balasan.")
    sentences = re.split(r"(?<=[.!?])\s+", reply)
    if len(sentences) > 3:
        reply = " ".join(sentences[:3]).strip()
    care = str(result.get("careFlag", "normal"))
    if care not in ("normal", "needs_human_care", "urgent_safety"):
        care = "needs_human_care"
    return {"agent": "Community / Prayer Manager", "reply": reply, "careFlag": care,
            "note": str(result.get("note", "Periksa konteks komentar sebelum membalas."))[:600]}


def save_guardian_review(owner_uid: str, channel_id: str, title: str, review_type: str,
                         source_text: str, result: dict[str, Any]) -> str:
    review_id = uuid.uuid4().hex
    with task_db_connection() as con:
        con.execute("INSERT INTO guardian_reviews(review_id,owner_uid,channel_id,project_title,review_type,source_text,result_json,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                    (review_id, owner_uid, channel_id[:80], title[:200], review_type[:40], source_text[:20000],
                     json.dumps(result, ensure_ascii=False), str(result.get("status", result.get("careFlag", "")))[:40], time.time()))
        con.commit()
    return review_id


def list_guardian_reviews(owner_uid: str, limit: int = 20) -> list[dict[str, Any]]:
    with task_db_connection() as con:
        con.row_factory = sqlite3.Row
        rows = con.execute("SELECT review_id,channel_id,project_title,review_type,status,created_at,result_json FROM guardian_reviews WHERE owner_uid=? ORDER BY created_at DESC LIMIT ?",
                           (owner_uid, max(1, min(50, int(limit))))).fetchall()
    items=[]
    for row in rows:
        item=dict(row)
        try: item["result"] = json.loads(item.pop("result_json") or "{}")
        except Exception: item["result"] = {}
        items.append(item)
    return items


def run_openverse_search(query_text: str, output_path: Path) -> dict[str, Any] | None:
    url = "https://api.openverse.org/v1/images/"
    params = {"q": query_text[:140], "license": "cc0,by", "page_size": 8, "mature": "false"}
    try:
        response = requests.get(url, params=params, timeout=25, headers={"User-Agent": "AIContentFactory/1.0 (local creator tool)"})
        response.raise_for_status()
        results = response.json().get("results", [])
    except Exception as exc:
        log.warning("Openverse search gagal: %s", exc)
        return None
    for item in results:
        license_code = str(item.get("license", "")).lower()
        if license_code not in ("cc0", "by"):
            continue
        image_url = item.get("url") or item.get("thumbnail")
        if not image_url:
            continue
        try:
            media = requests.get(image_url, timeout=30, headers={"User-Agent": "AIContentFactory/1.0"})
            media.raise_for_status()
            if len(media.content) > 18 * 1024 * 1024:
                continue
            from PIL import Image
            import io
            im = Image.open(io.BytesIO(media.content)).convert("RGB")
            im.thumbnail((1600, 1600))
            im.save(output_path, format="JPEG", quality=88, optimize=True)
            license_version = str(item.get("license_version", "")).strip()[:30]
            default_license_url = (
                f"https://creativecommons.org/licenses/by/{license_version or '4.0'}/"
                if license_code == "by" else
                "https://creativecommons.org/publicdomain/zero/1.0/"
            )
            return {
                "title": str(item.get("title", "Openverse image"))[:300],
                "creator": str(item.get("creator", "Unknown"))[:200],
                "license": license_code.upper(),
                "licenseVersion": license_version,
                "licenseUrl": str(item.get("license_url") or default_license_url)[:500],
                "sourceUrl": str(item.get("foreign_landing_url", ""))[:1000],
                "creatorUrl": str(item.get("creator_url", ""))[:1000],
                "provider": "Openverse",
                "localFile": str(output_path),
                "licenseReviewRequired": True,
            }
        except Exception as exc:
            log.warning("Gagal mengunduh gambar Openverse: %s", exc)
    return None


def make_scene_card(path: Path, scene: dict[str, Any], index: int, total: int, image_path: Path | None = None) -> None:
    from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageEnhance
    width, height = 720, 1280
    if image_path and image_path.exists():
        try:
            bg = Image.open(image_path).convert("RGB")
            bg = ImageOps.fit(bg, (width, height), method=Image.Resampling.LANCZOS)
            bg = ImageEnhance.Brightness(bg).enhance(0.47)
        except Exception:
            bg = Image.new("RGB", (width, height), (17, 31, 51))
    else:
        bg = Image.new("RGB", (width, height), (17, 31, 51))
        draw0 = ImageDraw.Draw(bg)
        for y in range(height):
            shade = int(22 + (y / height) * 32)
            draw0.line((0, y, width, y), fill=(shade, shade + 8, shade + 18))
        draw0.ellipse((-180, 240, 500, 920), outline=(86, 122, 158), width=7)
        draw0.ellipse((320, 560, 910, 1160), outline=(115, 99, 144), width=6)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rectangle((0, 0, width, 220), fill=(5, 12, 23, 145))
    od.rectangle((0, 820, width, height), fill=(5, 12, 23, 205))
    bg = Image.alpha_composite(bg.convert("RGBA"), overlay)
    draw = ImageDraw.Draw(bg)
    font_path = r"C:\Windows\Fonts\arial.ttf"
    bold_path = r"C:\Windows\Fonts\arialbd.ttf"
    try:
        f_small = ImageFont.truetype(font_path, 24)
        f_title = ImageFont.truetype(bold_path, 48)
        f_caption = ImageFont.truetype(bold_path, 38)
    except Exception:
        f_small = f_title = f_caption = ImageFont.load_default()
    draw.text((42, 42), f"AI CONTENT FACTORY  •  ADEGAN {index+1}/{total}", font=f_small, fill=(210, 224, 241, 255))
    headline = str(scene.get("visualTitle") or scene.get("overlayText") or f"Adegan {index+1}")[:100]
    words = headline.split()
    lines, current = [], ""
    for word in words:
        test = (current + " " + word).strip()
        if draw.textbbox((0, 0), test, font=f_title)[2] > 630 and current:
            lines.append(current); current = word
        else:
            current = test
    if current: lines.append(current)
    y = 850
    for line in lines[:3]:
        draw.text((42, y), line, font=f_title, fill=(255, 255, 255, 255), stroke_width=1, stroke_fill=(0,0,0,160))
        y += 62
    caption = str(scene.get("caption") or scene.get("narrationSegment") or "")[:240]
    caption_words = caption.split()
    wrapped, current = [], ""
    for word in caption_words:
        test=(current+" "+word).strip()
        if draw.textbbox((0,0), test, font=f_caption)[2] > 630 and current:
            wrapped.append(current); current=word
        else: current=test
    if current: wrapped.append(current)
    y = min(1050, y + 30)
    for line in wrapped[:3]:
        draw.text((44, y), line, font=f_caption, fill=(238, 244, 252, 255))
        y += 50
    draw.text((42, 1210), "Cerita & refleksi • Mohon periksa sumber dan konteks Alkitab", font=f_small, fill=(220, 230, 242, 235))
    bg.convert("RGB").save(path, quality=92)


def make_windows_voiceover(text: str, output_wav: Path, work_dir: Path) -> dict[str, Any]:
    """Legacy utility retained for old local installs; not used by v1.6.5 Voice Artist."""
    if os.name != "nt":
        raise RuntimeError("Pembuatan suara Windows Speech API hanya tersedia di Windows.")
    text_file = work_dir / "narration.txt"
    ps_file = work_dir / "make-voice.ps1"
    text_file.write_text(text, encoding="utf-8")
    ps = r"""param([string]$TextFile,[string]$OutFile)
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = @($s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo })
$id = $voices | Where-Object { $_.Culture.Name -like 'id*' } | Select-Object -First 1
if ($id) { $s.SelectVoice($id.Name); $selected = $id.Name } else { $selected = $s.Voice.Name }
$s.Rate = 0
$s.Volume = 100
$s.SetOutputToWaveFile($OutFile)
$t = Get-Content -Raw -Encoding UTF8 $TextFile
$s.Speak($t)
$s.Dispose()
Write-Output $selected
"""
    ps_file.write_text(ps, encoding="utf-8")
    powershell = shutil.which("powershell.exe") or shutil.which("powershell")
    if not powershell:
        raise RuntimeError("Windows PowerShell tidak ditemukan. Suara otomatis tidak dapat dibuat.")
    result = subprocess.run([powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps_file), str(text_file), str(output_wav)], capture_output=True, text=True, timeout=180)
    if result.returncode != 0 or not output_wav.exists() or output_wav.stat().st_size < 1000:
        detail = (result.stderr or result.stdout or "Tidak ada suara yang dihasilkan.")[-700:]
        raise RuntimeError(f"Windows Speech API gagal: {detail}")
    with wave.open(str(output_wav), "rb") as wav:
        duration = wav.getnframes() / float(wav.getframerate())
    voice = (result.stdout or "Suara Windows default").strip().splitlines()[-1]
    return {"provider": "Windows Speech API", "voice": voice, "durationSeconds": round(duration, 2),
            "indonesianVoiceDetected": "id" in voice.lower()}


def make_voiceover(text: str, output_wav: Path, work_dir: Path, channel_id: str | None = None,
                   alignment_output: Path | None = None) -> dict[str, Any]:
    """Voice Artist uses ElevenLabs and optionally returns character-level timing alignment."""
    assert_working_day()
    return elevenlabs_speech_to_wav(text, output_wav, channel_id, alignment_output=alignment_output)


def render_short(scenes: list[dict[str, Any]], assets: list[dict[str, Any]], audio_file: Path,
                 output_file: Path, work_dir: Path) -> dict[str, Any]:
    """Compose 9:16 generated/imported clips and still fallbacks to the actual narration duration."""
    try:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:
        raise RuntimeError("FFmpeg tidak tersedia. Pastikan imageio-ffmpeg terpasang dalam paket Windows.") from exc
    with wave.open(str(audio_file), "rb") as wav:
        audio_duration = wav.getnframes() / float(wav.getframerate())
    if audio_duration < 5:
        raise RuntimeError("Durasi narasi terlalu pendek untuk YouTube Shorts.")
    if not scenes:
        raise RuntimeError("Storyboard kosong; tidak ada adegan untuk dirender.")

    segment_dir = work_dir / "render_segments"
    segment_dir.mkdir(parents=True, exist_ok=True)
    total = len(scenes)
    aligned_timeline = all(
        isinstance(scene.get("startSeconds"), (int, float))
        and isinstance(scene.get("endSeconds"), (int, float))
        and float(scene.get("endSeconds", 0)) > float(scene.get("startSeconds", 0))
        for scene in scenes
    )
    if aligned_timeline:
        # Use actual speech-alignment cut points. The first scene starts at zero;
        # each scene remains on screen until the next scene's first spoken character.
        starts = [max(0.0, min(audio_duration, float(scene.get("startSeconds", 0)))) for scene in scenes]
        starts[0] = 0.0
        for idx in range(1, len(starts)):
            starts[idx] = max(starts[idx - 1] + 0.05, starts[idx])
        starts[-1] = min(starts[-1], max(0.0, audio_duration - 0.15))
        durations = [max(0.15, (starts[idx + 1] if idx + 1 < len(starts) else audio_duration) - starts[idx])
                     for idx in range(total)]
        if sum(durations) > audio_duration + 0.25:
            aligned_timeline = False
    if not aligned_timeline:
        raw_durations = [max(0.15, float(scene.get("durationSeconds") or 0)) for scene in scenes]
        raw_total = sum(raw_durations) or float(total)
        durations = [audio_duration * value / raw_total for value in raw_durations]
        durations[-1] += audio_duration - sum(durations)
    segment_files: list[Path] = []

    for idx, scene in enumerate(scenes):
        assert_working_day()
        segment = segment_dir / f"segment_{idx+1:03d}.mp4"
        duration = max(0.15, durations[idx])
        clip_path = Path(str(scene.get("videoFile") or "")) if scene.get("videoFile") else None
        if not clip_path or not clip_path.exists():
            asset_path = None
            if idx < len(assets):
                candidate = Path(str(assets[idx].get("localFile") or ""))
                if candidate.exists() and str(assets[idx].get("mediaType", "image")) != "video":
                    asset_path = candidate
            frame = segment_dir / f"scene_{idx+1:03d}.jpg"
            make_scene_card(frame, scene, idx, total, asset_path)
            cmd = [ffmpeg, "-y", "-loop", "1", "-i", str(frame), "-t", f"{duration:.3f}",
                   "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,setsar=1,format=yuv420p",
                   "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", str(segment)]
        else:
            cmd = [ffmpeg, "-y", "-stream_loop", "-1", "-i", str(clip_path), "-t", f"{duration:.3f}",
                   "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,setsar=1,format=yuv420p",
                   "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", str(segment)]
        proc = run_media_command(cmd, timeout=600)
        if proc.returncode != 0 or not segment.exists() or segment.stat().st_size < 5000:
            raise RuntimeError(f"FFmpeg gagal menyiapkan segmen adegan {idx+1}: " + (proc.stderr or proc.stdout or "")[-700:])
        segment_files.append(segment)

    concat_file = work_dir / "video_segments.txt"
    lines = ["file '" + path.as_posix().replace("'", "'\\''") + "'" for path in segment_files]
    concat_file.write_text("\n".join(lines), encoding="utf-8")
    command = [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file), "-i", str(audio_file),
               "-map", "0:v:0", "-map", "1:a:0", "-t", f"{audio_duration:.3f}", "-r", "30",
               "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30,format=yuv420p",
               "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k",
               "-ar", "48000", "-ac", "2", "-shortest", "-movflags", "+faststart", str(output_file)]
    process = run_media_command(command, timeout=1800)
    if process.returncode != 0 or not output_file.exists() or output_file.stat().st_size < 30000:
        raise RuntimeError("FFmpeg gagal merender video final: " + (process.stderr or process.stdout or "")[-1200:])
    probe = inspect_video_file(output_file, {"width":720, "height":1280, "fps":30, "durationSeconds":audio_duration})
    if not probe.get("audioStreamPresent") or probe.get("width") != 720 or probe.get("height") != 1280:
        raise RuntimeError("Hasil render tidak sesuai 9:16 atau audio narasi tidak ditemukan.")
    return {"fileName":output_file.name,"filePath":str(output_file),"sizeBytes":output_file.stat().st_size,
            "durationSeconds":round(audio_duration,2),"width":720,"height":1280,"fps":30,
            "aspectRatio":"9:16","sceneSegments":len(segment_files),"timelineSource":"ElevenLabs absolute cut points" if aligned_timeline else "proportional fallback",
            "videoSource":"Veo / Google Flow + FFmpeg"}



# ---------------- Dedicated vertical Video Editor Studio ----------------
VIDEO_EDITOR_INPUT_RULES = {
    "background": {"extensions": {".mp4", ".mov", ".mkv", ".m4v", ".webm", ".avi"}, "max_bytes": 2 * 1024 * 1024 * 1024},
    "voice": {"extensions": {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}, "max_bytes": 250 * 1024 * 1024},
    "music": {"extensions": {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}, "max_bytes": 250 * 1024 * 1024},
    "subtitle": {"extensions": {".srt"}, "max_bytes": 5 * 1024 * 1024},
}
VIDEO_EDITOR_TARGET_BYTES = 46_000_000  # keep margin below the 50 MB hard limit
VIDEO_EDITOR_HARD_LIMIT_BYTES = 50_000_000
VIDEO_EDITOR_AUDIO_BITRATE = 128_000


def validate_video_editor_project_id(project_id: str) -> str:
    project_id = str(project_id or "").strip().lower()
    if not re.fullmatch(r"[a-f0-9]{32}", project_id):
        raise ValueError("ID project Video Editor tidak valid. Muat ulang halaman dan coba kembali.")
    return project_id


def video_editor_project_dir(owner_uid: str, project_id: str) -> Path:
    project_id = validate_video_editor_project_id(project_id)
    owner_key = hashlib.sha256(str(owner_uid).encode("utf-8")).hexdigest()[:20]
    directory = VIDEO_EDITOR_ROOT / owner_key / project_id
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def save_video_editor_upload(owner_uid: str, project_id: str, kind: str, filename: str,
                             stream, content_length: int) -> dict[str, Any]:
    if kind not in VIDEO_EDITOR_INPUT_RULES:
        raise ValueError("Jenis file Video Editor tidak dikenal.")
    rule = VIDEO_EDITOR_INPUT_RULES[kind]
    if content_length <= 0 or content_length > int(rule["max_bytes"]):
        raise ValueError(f"Ukuran file {kind} kosong atau melewati batas yang diizinkan.")
    extension = Path(str(filename or "")).suffix.lower()
    if extension not in rule["extensions"]:
        allowed = ", ".join(sorted(rule["extensions"]))
        raise ValueError(f"Format {kind} harus salah satu dari: {allowed}.")
    directory = video_editor_project_dir(owner_uid, project_id)
    final_path = directory / f"{kind}{extension}"
    temp_path = directory / f".{kind}.uploading"
    remaining = content_length
    try:
        with temp_path.open("wb") as target:
            while remaining > 0:
                chunk = stream.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                target.write(chunk)
                remaining -= len(chunk)
        if remaining != 0 or not temp_path.exists() or temp_path.stat().st_size != content_length:
            raise ValueError(f"Upload {kind} tidak lengkap. Silakan unggah ulang file tersebut.")
        if kind == "subtitle":
            try:
                subtitle_text = temp_path.read_text(encoding="utf-8-sig")
            except UnicodeDecodeError as exc:
                raise ValueError("File SRT harus menggunakan teks UTF-8.") from exc
            if "-->" not in subtitle_text or not subtitle_text.strip():
                raise ValueError("File SRT tidak berisi cue subtitle bertanda waktu yang valid.")
        for old in directory.glob(f"{kind}.*"):
            if old != final_path and old.is_file():
                old.unlink(missing_ok=True)
        os.replace(temp_path, final_path)
        return {"kind": kind, "fileName": final_path.name, "sizeBytes": final_path.stat().st_size,
                "projectId": project_id, "uploaded": True}
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


def probe_video_editor_duration(ffmpeg: str, media_path: Path) -> float:
    """Read media duration quickly; use ffprobe when installed, otherwise parse FFmpeg input metadata."""
    ffprobe = shutil.which("ffprobe")
    if ffprobe:
        result = run_media_command([ffprobe, "-v", "error", "-show_entries", "format=duration",
                                    "-of", "default=noprint_wrappers=1:nokey=1", str(media_path)], timeout=60)
        if result.returncode == 0:
            try:
                duration = float((result.stdout or "").strip().splitlines()[0])
                if math.isfinite(duration) and duration > 0:
                    return duration
            except (ValueError, IndexError):
                pass
    result = run_media_command([ffmpeg, "-hide_banner", "-i", str(media_path)], timeout=60)
    metadata = (result.stdout or "") + "\n" + (result.stderr or "")
    match = re.search(r"Duration:\s*(\d{2,}):(\d{2}):(\d{2}(?:\.\d+)?)", metadata)
    if not match:
        raise RuntimeError(f"FFmpeg tidak dapat membaca durasi file {media_path.name}. Periksa format dan kerusakan file.")
    hours, minutes, seconds = match.groups()
    duration = int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    if not math.isfinite(duration) or duration <= 0:
        raise RuntimeError(f"Durasi file {media_path.name} tidak valid.")
    return duration


def calculate_vertical_video_bitrate(duration_seconds: float, target_bytes: int = VIDEO_EDITOR_TARGET_BYTES) -> int:
    if not math.isfinite(float(duration_seconds)) or duration_seconds <= 0:
        raise ValueError("Durasi audio tidak valid.")
    safe_target = min(int(target_bytes), VIDEO_EDITOR_TARGET_BYTES)
    # Reserve 1 MB for MP4/container overhead, and budget 128 kbps for AAC audio.
    available_bps = ((safe_target - 1_000_000) * 8 / float(duration_seconds)) - VIDEO_EDITOR_AUDIO_BITRATE
    bitrate = int(available_bps // 1000) * 1000
    if bitrate < 180_000:
        raise ValueError("Durasi gabungan terlalu panjang untuk target MP4 di bawah 50 MB dengan kualitas minimum yang ditetapkan. Pecah video menjadi beberapa bagian atau naikkan batas ukuran.")
    return bitrate


def render_vertical_video_editor(owner_uid: str, project_id: str) -> dict[str, Any]:
    """Render bg + voice + SRT + music to vertical H.264 MP4 under 50 MB."""
    if not VIDEO_EDITOR_RENDER_LOCK.acquire(blocking=False):
        raise RuntimeError("Video Editor sedang merender project lain. Tunggu sampai render sebelumnya selesai.")
    try:
        assert_working_day()
        directory = video_editor_project_dir(owner_uid, project_id)
        input_files = {}
        for kind in VIDEO_EDITOR_INPUT_RULES:
            candidates = [p for p in directory.glob(f"{kind}.*") if p.is_file()]
            if len(candidates) != 1:
                raise ValueError(f"File {kind} belum diunggah dengan lengkap. Unggah background, voice-over, SRT, dan musik.")
            input_files[kind] = candidates[0]
        background = input_files["background"]
        voice = input_files["voice"]
        music = input_files["music"]
        subtitle = input_files["subtitle"]
        try:
            import imageio_ffmpeg
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception as exc:
            raise RuntimeError("FFmpeg tidak tersedia pada Worker. Periksa paket imageio-ffmpeg.") from exc

        filters = run_media_command([ffmpeg, "-hide_banner", "-filters"], timeout=60)
        filter_listing = (filters.stdout or "") + (filters.stderr or "")
        if "subtitles" not in filter_listing:
            raise RuntimeError("FFmpeg pada komputer ini tidak memiliki filter subtitles/libass. Pasang build FFmpeg lengkap yang mendukung libass, lalu mulai ulang Worker.")

        voice_duration = probe_video_editor_duration(ffmpeg, voice)
        music_duration = probe_video_editor_duration(ffmpeg, music)
        duration = max(voice_duration, music_duration)
        if duration < 1:
            raise ValueError("Durasi audio terlalu pendek untuk dirender.")
        duration_arg = f"{duration:.3f}"
        video_filter = (
            "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,"
            "subtitles=filename=subtitle.srt:force_style='FontName=Arial,FontSize=52,Bold=1,"
            "PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=4,"
            "Shadow=1,Alignment=2,MarginV=170'"
        )
        audio_filter = (
            "[1:a]aformat=sample_rates=48000:channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11[voice];"
            "[2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.10[music];"
            "[voice][music]amix=inputs=2:duration=longest:dropout_transition=2:normalize=0,"
            "alimiter=limit=0.95[aout]"
        )
        output_path = directory / "output_vertical.mp4"
        temp_output = directory / "output_vertical.rendering.mp4"
        passlog = directory / "vertical-passlog"
        null_output = "NUL" if os.name == "nt" else os.devnull

        def execute_two_pass(video_bitrate: int) -> None:
            temp_output.unlink(missing_ok=True)
            common = [ffmpeg, "-hide_banner", "-y", "-stream_loop", "-1", "-i", str(background),
                      "-i", str(voice), "-stream_loop", "-1", "-i", str(music), "-t", duration_arg,
                      "-vf", video_filter, "-r", "30", "-c:v", "libx264", "-preset", "medium",
                      "-b:v", str(video_bitrate), "-pix_fmt", "yuv420p", "-passlogfile", str(passlog)]
            pass1 = common + ["-pass", "1", "-an", "-f", "null", null_output]
            first = run_media_command(pass1, timeout=7200, cwd=str(directory))
            if first.returncode != 0:
                raise RuntimeError("FFmpeg pass 1 gagal: " + (first.stderr or "")[-900:])
            combined_filter = f"[0:v]{video_filter}[vout];{audio_filter}"
            pass2 = [ffmpeg, "-hide_banner", "-y", "-stream_loop", "-1", "-i", str(background),
                     "-i", str(voice), "-stream_loop", "-1", "-i", str(music), "-t", duration_arg,
                     "-filter_complex", combined_filter, "-map", "[vout]", "-map", "[aout]",
                     "-r", "30", "-c:v", "libx264", "-preset", "medium", "-b:v", str(video_bitrate),
                     "-pix_fmt", "yuv420p", "-pass", "2", "-passlogfile", str(passlog),
                     "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
                     "-movflags", "+faststart", "-max_muxing_queue_size", "1024", str(temp_output)]
            second = run_media_command(pass2, timeout=7200, cwd=str(directory))
            if second.returncode != 0 or not temp_output.exists() or temp_output.stat().st_size < 10_000:
                raise RuntimeError("FFmpeg pass 2 gagal: " + (second.stderr or "")[-1200:])

        bitrate = calculate_vertical_video_bitrate(duration)
        execute_two_pass(bitrate)
        # Retry once with a lower bitrate if container overhead or encoder variance approaches the hard cap.
        if temp_output.stat().st_size >= 49_000_000:
            bitrate = int(bitrate * 0.88 // 1000) * 1000
            execute_two_pass(bitrate)
        size_bytes = temp_output.stat().st_size
        if size_bytes >= VIDEO_EDITOR_HARD_LIMIT_BYTES:
            temp_output.unlink(missing_ok=True)
            raise RuntimeError("Ukuran hasil masih 50 MB atau lebih setelah kompresi ulang. Pecah durasi atau kurangi target bitrate.")
        os.replace(temp_output, output_path)
        for item in directory.glob("vertical-passlog*"):
            if item.is_file():
                item.unlink(missing_ok=True)
        return {
            "projectId": project_id, "fileName": output_path.name, "sizeBytes": size_bytes,
            "sizeMB": round(size_bytes / 1_000_000, 2), "durationSeconds": round(duration, 3),
            "voiceDurationSeconds": round(voice_duration, 3), "musicDurationSeconds": round(music_duration, 3),
            "resolution": "1080x1920", "fps": 30, "videoCodec": "H.264", "audioCodec": "AAC",
            "videoBitrate": bitrate, "audioBitrate": VIDEO_EDITOR_AUDIO_BITRATE,
            "musicVolume": 0.10, "subtitleStyle": "Kuning bold, stroke hitam, tengah bawah",
            "downloadUrl": f"/api/video-editor/download?projectId={project_id}",
            "message": "Video vertikal selesai dirender. Durasi mengikuti audio terpanjang dan ukuran file di bawah 50 MB."
        }
    finally:
        VIDEO_EDITOR_RENDER_LOCK.release()


TRANSCRIPTION_OUTPUT_DIR = OUTPUT_DIR / "transcriptions"
TRANSCRIPTION_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def run_local_transcription_job(job_id: str, source_file: str, model_size: str) -> None:
    temp_audio = TRANSCRIPTION_OUTPUT_DIR / f"{job_id}.wav"
    transcript_file = TRANSCRIPTION_OUTPUT_DIR / f"{job_id}.txt"
    subtitle_file = TRANSCRIPTION_OUTPUT_DIR / f"{job_id}.srt"
    def update(status: str, progress: int, stage: str, error: str = "", transcript: str = "", subtitle: str = ""):
        with task_db_connection() as con:
            con.execute("UPDATE transcription_jobs SET status=?,progress=?,stage=?,error_message=?,transcript_path=?,subtitle_path=?,updated_at=? WHERE job_id=?",
                (status,progress,stage,error,transcript or None,subtitle or None,time.time(),job_id))
    try:
        assert_working_day()
        import imageio_ffmpeg
        ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
        update("running",5,"Mengambil audio dari rekaman video")
        extract=run_media_command([ffmpeg,"-y","-hide_banner","-loglevel","error","-i",source_file,"-vn","-ac","1","-ar","16000","-c:a","pcm_s16le",str(temp_audio)],timeout=7200)
        if extract.returncode != 0 or not temp_audio.exists() or temp_audio.stat().st_size < 1024:
            raise RuntimeError("Audio tidak dapat diekstrak dari rekaman: "+(extract.stderr or "")[-400:])
        update("running",20,f"Memuat Whisper lokal ({model_size}) di CPU")
        from faster_whisper import WhisperModel
        cpu_threads=max(2,min(6,(os.cpu_count() or 4)-1))
        model=WhisperModel(model_size,device="cpu",compute_type="int8",cpu_threads=cpu_threads)
        update("running",30,"Mentranskripsikan Bahasa Indonesia; menyiapkan timestamp")
        segments, info=model.transcribe(str(temp_audio),language="id",beam_size=3,vad_filter=True,word_timestamps=False)
        text_parts=[]; srt_parts=[]
        def stamp(sec):
            total_ms=max(0,int(round(sec*1000))); hh,rem=divmod(total_ms,3600000); mm,rem=divmod(rem,60000); ss,ms=divmod(rem,1000)
            return f"{hh:02d}:{mm:02d}:{ss:02d},{ms:03d}"
        count=0
        for segment in segments:
            assert_working_day()
            content=re.sub(r"\s+"," ",str(segment.text or "")).strip()
            if not content: continue
            count+=1; text_parts.append(content)
            srt_parts.extend([str(count),f"{stamp(segment.start)} --> {stamp(segment.end)}",content,""])
            if count % 20 == 0:
                update("running",min(95,30+count//10),f"Transkripsi berjalan · {count} segmen")
        if not text_parts:
            raise RuntimeError("Whisper tidak menemukan ucapan yang dapat ditranskripsikan.")
        transcript_file.write_text(" ".join(text_parts),encoding="utf-8")
        subtitle_file.write_text("\n".join(srt_parts),encoding="utf-8-sig")
        update("completed",100,f"Selesai · {count} segmen",transcript=str(transcript_file),subtitle=str(subtitle_file))
        log.info("Transkripsi lokal selesai: %s (%s segmen)",job_id,count)
    except OperationPausedError as exc:
        update("paused",0,"Dijeda oleh jadwal istirahat Minggu",str(exc))
    except Exception as exc:
        log.exception("Transkripsi lokal gagal: %s",job_id)
        update("failed",0,"Transkripsi gagal",str(exc))
    finally:
        temp_audio.unlink(missing_ok=True)


CHURCH_SHORTS_DIR = LOCAL_APP_DATA / "church-shorts"
CHURCH_SHORTS_SOURCE_DIR = CHURCH_SHORTS_DIR / "sources"
CHURCH_SHORTS_OUTPUT_DIR = OUTPUT_DIR / "church-shorts"
for _directory in (CHURCH_SHORTS_DIR, CHURCH_SHORTS_SOURCE_DIR, CHURCH_SHORTS_OUTPUT_DIR):
    _directory.mkdir(parents=True, exist_ok=True)


def safe_upload_filename(name: str) -> str:
    base = Path(str(name or "rekaman-ibadah.mp4")).name
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._") or "rekaman-ibadah.mp4"
    if Path(base).suffix.lower() not in (".mp4", ".mov", ".mkv", ".m4v", ".webm", ".avi"):
        raise ValueError("Format video harus MP4, MOV, MKV, M4V, WEBM, atau AVI.")
    return base[:140]


def create_church_shorts_source(owner_uid: str, filename: str, file_path: Path) -> dict[str, Any]:
    source_id = uuid.uuid4().hex
    with task_db_connection() as con:
        con.execute("INSERT INTO church_shorts_sources(source_id,owner_uid,file_name,file_path,size_bytes,created_at) VALUES(?,?,?,?,?,?)",
                    (source_id, owner_uid, filename, str(file_path), file_path.stat().st_size, time.time()))
    return {"sourceId": source_id, "fileName": filename, "sizeBytes": file_path.stat().st_size}


def list_church_shorts(owner_uid: str) -> dict[str, Any]:
    with task_db_connection() as con:
        con.row_factory = sqlite3.Row
        sources = [dict(row) for row in con.execute("SELECT source_id,file_name,size_bytes,created_at FROM church_shorts_sources WHERE owner_uid=? ORDER BY created_at DESC LIMIT 20", (owner_uid,)).fetchall()]
        clips = [dict(row) for row in con.execute("SELECT clip_id,source_id,source_file_name,title,description,channel_id,start_seconds,end_seconds,aspect_mode,privacy_status,output_path,status,youtube_video_id,created_at FROM church_shorts_clips WHERE owner_uid=? ORDER BY created_at DESC LIMIT 50", (owner_uid,)).fetchall()]
    for clip in clips:
        clip["durationSeconds"] = round(float(clip["end_seconds"])-float(clip["start_seconds"]), 2)
        clip["fileAvailable"] = Path(clip["output_path"]).exists()
    return {"sources": sources, "clips": clips}


def create_church_shorts_clip(owner_uid: str, payload: dict[str, Any]) -> dict[str, Any]:
    assert_working_day()
    source_id = str(payload.get("sourceId", ""))
    with task_db_connection() as con:
        con.row_factory = sqlite3.Row
        source_row = con.execute("SELECT * FROM church_shorts_sources WHERE source_id=? AND owner_uid=?", (source_id, owner_uid)).fetchone()
    if not source_row:
        raise ValueError("File rekaman belum diunggah atau bukan milik akun ini.")
    source = dict(source_row)
    input_path = Path(source["file_path"])
    if not input_path.exists() or not input_path.is_file():
        raise RuntimeError("File sumber tidak ditemukan di komputer Worker.")
    start_seconds = float(payload.get("startSeconds", 0))
    end_seconds = float(payload.get("endSeconds", 0))
    duration = end_seconds - start_seconds
    if start_seconds < 0 or end_seconds <= start_seconds or duration > 180:
        raise ValueError("Waktu potong tidak valid. Durasi Shorts harus lebih dari 0 dan maksimal 180 detik.")
    title = str(payload.get("title", "Potongan Ibadah")).strip()[:100]
    description = str(payload.get("description", "")).strip()[:4900]
    channel_id = str(payload.get("channelId", ""))
    if not title or channel_id not in CHANNELS:
        raise ValueError("Judul atau channel YouTube tidak valid.")
    aspect_mode = str(payload.get("aspectMode", "vertical"))
    if aspect_mode not in ("vertical", "original"):
        raise ValueError("Mode format video tidak valid.")
    privacy = str(payload.get("privacyStatus", "private"))
    if privacy not in ("private", "unlisted", "public"):
        privacy = "private"
    try:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:
        raise RuntimeError("FFmpeg tidak tersedia pada Worker.") from exc
    clip_id = uuid.uuid4().hex
    output_path = CHURCH_SHORTS_OUTPUT_DIR / f"church-short-{clip_id[:12]}.mp4"
    command = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{start_seconds:.3f}", "-i", str(input_path), "-t", f"{duration:.3f}"]
    if aspect_mode == "vertical":
        command += ["-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"]
    else:
        command += ["-vf", "scale='min(1920,iw)':-2,setsar=1"]
    command += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(output_path)]
    try:
        result = run_media_command(command, timeout=max(300, int(duration*12)))
    except subprocess.TimeoutExpired as exc:
        output_path.unlink(missing_ok=True)
        raise RuntimeError("Pemotongan melewati batas waktu. Coba durasi lebih pendek atau file sumber lebih kecil.") from exc
    if result.returncode != 0 or not output_path.exists() or output_path.stat().st_size < 5000:
        output_path.unlink(missing_ok=True)
        raise RuntimeError("FFmpeg gagal memotong video: " + (result.stderr or "Tidak ada detail.")[-800:])
    now = time.time()
    with task_db_connection() as con:
        con.execute("INSERT INTO church_shorts_clips(clip_id,owner_uid,source_id,source_file_name,title,description,channel_id,start_seconds,end_seconds,aspect_mode,privacy_status,output_path,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (clip_id, owner_uid, source_id, source["file_name"], title, description, channel_id, start_seconds, end_seconds, aspect_mode, privacy, str(output_path), "ready", now, now))
    return {"clipId": clip_id, "title": title, "fileName": output_path.name, "sizeBytes": output_path.stat().st_size,
            "durationSeconds": round(duration, 2), "aspectMode": aspect_mode, "status": "ready", "message": "Potongan video berhasil dibuat. Periksa hasilnya sebelum upload."}


def generate_church_shorts_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    notes = str(payload.get("notes", "")).strip()[:5000]
    if not notes:
        raise ValueError("Isi ringkasan khotbah atau pokok pesan terlebih dahulu agar Ollama dapat membuat metadata yang relevan.")
    return call_ollama_json(
        "Buat metadata YouTube Shorts untuk potongan khotbah gereja. Gunakan bahasa Indonesia yang hangat, tidak sensasional, tidak mengarang isi khotbah, tidak membuat klaim viral. Balas JSON dengan title (maks 90 karakter), description (maks 1000 karakter), hashtags (array maksimal 5). Ringkasan/pokok pesan yang diberikan pemilik: " + notes,
        max_output_tokens=700
    )


def upload_church_shorts_clip(clip_id: str, owner_uid: str, privacy_status: str = "private") -> dict[str, Any]:
    assert_working_day()
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    if privacy_status not in ("private", "unlisted", "public"):
        privacy_status = "private"
    with task_db_connection() as con:
        con.row_factory = sqlite3.Row
        row = con.execute("SELECT * FROM church_shorts_clips WHERE clip_id=? AND owner_uid=?", (clip_id, owner_uid)).fetchone()
    if not row:
        raise RuntimeError("Potongan video tidak ditemukan untuk akun ini.")
    clip = dict(row)
    if clip.get("youtube_video_id"):
        return {"youtubeVideoId": clip["youtube_video_id"], "status": "already_uploaded"}
    channel_key = clip["channel_id"]
    connection = dict(connections.get(channel_key) or {})
    if connection.get("ownerUid") != owner_uid or connection.get("status") != "connected":
        raise RuntimeError("Hubungkan channel YouTube gereja terlebih dahulu pada menu Channel YouTube.")
    video_path = Path(clip["output_path"])
    if not video_path.exists():
        raise RuntimeError("File video hasil potongan tidak ditemukan.")
    credentials = get_saved_youtube_credentials(channel_key)
    youtube = build("youtube", "v3", credentials=credentials, cache_discovery=False)
    channel_response = youtube.channels().list(part="id,snippet", mine=True, maxResults=10).execute()
    owned_ids = {item.get("id") for item in channel_response.get("items", [])}
    if connection.get("youtubeChannelId") not in owned_ids:
        raise RuntimeError("Akun Google pada token tidak cocok dengan channel yang tersimpan. Hubungkan ulang channel yang benar.")
    title = str(clip["title"])[:100]
    description = str(clip["description"] or "")[:4900]
    body = {"snippet": {"title": title, "description": description, "categoryId": "27", "defaultLanguage": "id"},
            "status": {"privacyStatus": privacy_status, "selfDeclaredMadeForKids": False}}
    media = MediaFileUpload(str(video_path), mimetype="video/mp4", chunksize=8*1024*1024, resumable=True)
    try:
        inserted = youtube.videos().insert(part="snippet,status", body=body, media_body=media).execute()
    except Exception as exc:
        raise RuntimeError(f"YouTube menolak upload: {exc}") from exc
    video_id = str(inserted.get("id", ""))
    if not video_id:
        raise RuntimeError("YouTube tidak mengembalikan Video ID.")
    with task_db_connection() as con:
        con.execute("UPDATE church_shorts_clips SET status='uploaded',youtube_video_id=?,privacy_status=?,updated_at=? WHERE clip_id=? AND owner_uid=?",
                    (video_id, privacy_status, time.time(), clip_id, owner_uid))
    return {"youtubeVideoId": video_id, "title": title, "privacyStatus": privacy_status,
            "youtubeUrl": f"https://www.youtube.com/shorts/{video_id}", "status": "uploaded"}

def get_saved_youtube_credentials(channel_key: str):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    path = TOKEN_DIR / f"{channel_key}.dpapi"
    if not path.exists():
        raise RuntimeError(f"Channel {CHANNELS.get(channel_key, channel_key)} belum terhubung ke Gmail pemiliknya.")
    raw = dpapi_unprotect(path.read_bytes())
    info = json.loads(raw.decode("utf-8"))
    granted_scopes = info.get("scopes") if isinstance(info.get("scopes"), list) else SCOPES
    creds = Credentials.from_authorized_user_info(info, scopes=granted_scopes)
    creds._aicf_granted_scopes = list(granted_scopes)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        save_encrypted_credentials(channel_key, creds)
    if not creds.valid:
        raise RuntimeError("Token YouTube tidak valid. Hubungkan ulang akun Google channel ini.")
    return creds


def upload_video_for_task(task_id: str, owner_uid: str, privacy_status: str = "private", manual_override: bool = False) -> dict[str, Any]:
    assert_working_day()
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    if privacy_status not in ("private", "unlisted", "public"):
        raise ValueError("Privacy status tidak valid.")
    task = db_get_task(task_id, owner_uid)
    if not task or task["status"] not in ("completed", "ready_to_upload"):
        raise RuntimeError("Hasil video belum selesai atau tidak ditemukan.")
    result = task.get("result") or {}
    existing_upload = result.get("upload") or {}
    if existing_upload.get("youtubeVideoId"):
        # Avoid duplicate YouTube videos if the browser retries after a lost HTTP response.
        return existing_upload
    quality = result.get("quality") or {}
    video_path = Path(result.get("video", {}).get("filePath", ""))
    if not video_path.is_file() or video_path.suffix.lower() != ".mp4":
        raise RuntimeError("File MP4 hasil render tidak ditemukan atau bukan berformat MP4.")
    if manual_override:
        guardian_status = str((result.get("theologicalGuardian") or {}).get("status", "")).upper().strip()
        if guardian_status == "DITOLAK":
            raise RuntimeError("Upload manual ditolak: Theological Guardian berstatus DITOLAK.")
        advanced = quality.get("advanced") or {}
        if not bool((advanced.get("video") or {}).get("passed")):
            raise RuntimeError("Upload manual ditolak: pemeriksaan teknis video pada QC belum lulus.")
        if not bool((advanced.get("audio") or {}).get("passed")):
            raise RuntimeError("Upload manual ditolak: pemeriksaan teknis audio pada QC belum lulus.")
        # Re-decode the MP4 at upload time; manual override never bypasses media integrity checks.
        fresh_video_check = inspect_video_file(video_path, result.get("video") or {})
        if not fresh_video_check.get("passed"):
            detail = "; ".join(fresh_video_check.get("issues") or [])
            raise RuntimeError("Upload manual ditolak: pemeriksaan ulang MP4 gagal. " + detail[:900])
    elif not quality.get("passed", False):
        raise RuntimeError("Video belum lolos seluruh Quality Control. Gunakan upload manual hanya setelah tinjau pemilik dan jika syarat teknis terpenuhi.")
    channel_key = task["channel_id"]
    connection = dict(connections.get(channel_key) or {})
    if connection.get("ownerUid") != owner_uid or connection.get("status") != "connected":
        raise RuntimeError("Channel YouTube belum terhubung pada workspace ini.")
    credentials = get_saved_youtube_credentials(channel_key)
    youtube = build("youtube", "v3", credentials=credentials, cache_discovery=False)
    channel_response = youtube.channels().list(part="id,snippet", mine=True, maxResults=10).execute()
    owned_ids = {item.get("id") for item in channel_response.get("items", [])}
    if connection.get("youtubeChannelId") not in owned_ids:
        raise RuntimeError("Akun Google pada token tidak cocok dengan Channel ID yang tersimpan. Hubungkan ulang channel yang benar.")
    meta = result.get("seo") or {}
    title = str(meta.get("title") or task["title"])[:100]
    description = str(meta.get("description") or "")[:4900]
    tags = [str(t)[:30] for t in (meta.get("tags") or [])[:20]]
    body = {
        "snippet": {"title": title, "description": description, "tags": tags, "categoryId": "27", "defaultLanguage": "id"},
        "status": {"privacyStatus": privacy_status, "selfDeclaredMadeForKids": bool((task.get("payload") or {}).get("madeForKids", False)),
                   "containsSyntheticMedia": bool((task.get("payload") or {}).get("containsSyntheticMedia", False) or any(asset.get("synthetic") for asset in (result.get("assets") or [])))}
    }
    target_date = str((task.get("payload") or {}).get("targetDate", ""))
    if target_date:
        try:
            schedule_dt = datetime.fromisoformat(target_date[:10] + "T10:00:00+07:00")
            if schedule_dt > jakarta_now():
                body["status"]["privacyStatus"] = "private"
                body["status"]["publishAt"] = schedule_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        except Exception:
            pass
    media = MediaFileUpload(str(video_path), mimetype="video/mp4", chunksize=8*1024*1024, resumable=True)
    try:
        inserted = youtube.videos().insert(part="snippet,status", body=body, media_body=media).execute()
    except Exception as exc:
        raise RuntimeError(f"YouTube menolak upload: {exc}") from exc
    video_id = inserted.get("id", "")
    if not video_id:
        raise RuntimeError("YouTube tidak mengembalikan Video ID setelah upload.")
    try:
        check = youtube.videos().list(part="snippet,status,statistics,processingDetails", id=video_id).execute()
        details = (check.get("items") or [{}])[0]
    except Exception:
        details = inserted
    video_status = (details.get("status") or {}).get("privacyStatus", body["status"]["privacyStatus"])
    uploaded = {
        "channelId": channel_key,
        "manualOverride": bool(manual_override),
        "youtubeChannelId": connection.get("youtubeChannelId", ""),
        "youtubeVideoId": video_id,
        "title": title,
        "description": description,
        "privacyStatus": video_status,
        "status": "scheduled" if body["status"].get("publishAt") else "uploaded",
        "watchUrl": f"https://www.youtube.com/watch?v={video_id}",
        "uploadedAt": int(time.time()),
        "scheduledAt": body["status"].get("publishAt", ""),
        "viewCount": int((details.get("statistics") or {}).get("viewCount", 0) or 0),
        "likeCount": int((details.get("statistics") or {}).get("likeCount", 0) or 0),
        "commentCount": int((details.get("statistics") or {}).get("commentCount", 0) or 0),
    }
    result["upload"] = uploaded
    db_update_task(task_id, status="completed", stage="Video berhasil diunggah ke YouTube", progress=100,
                   result_json=json.dumps(result, ensure_ascii=False))
    return uploaded


def run_workforce_pipeline(task_id: str) -> None:
    task = None
    try:
        with task_db_connection() as con:
            con.row_factory = sqlite3.Row
            row = con.execute("SELECT * FROM tasks WHERE task_id=?", (task_id,)).fetchone()
        if not row:
            return
        task = dict(row)
        payload = json.loads(task["payload_json"])
        assert_working_day()
        owner_uid = task["owner_uid"]
        channel_id = task["channel_id"]
        if channel_id not in CHANNELS:
            raise RuntimeError("Channel tujuan tidak dikenal.")
        result: dict[str, Any] = {"agents": [], "warnings": [], "assets": [], "quality": {"passed": False}}
        work_dir = OUTPUT_DIR / task_id
        work_dir.mkdir(parents=True, exist_ok=True)
        db_update_task(task_id, status="running", stage="CEO Agent menyiapkan pekerjaan", progress=2)
        db_update_episode_for_task(task_id, "producing")

        def log_agent(agent_id: str, task_type: str, name: str, fn):
            assert_working_day()
            started = time.time()
            db_update_task(task_id, stage=f"{name} sedang bekerja", progress=min(94, 5 + len(result["agents"])*9))
            try:
                output = fn()
                summary = output.get("summary") if isinstance(output, dict) else str(output)
                summary = summary or f"{name} menyelesaikan tugas."
                finished = time.time()
                db_add_agent_log(task_id, agent_id, name, task_type, "completed", str(summary), started, finished, output)
                result["agents"].append({"agentId": agent_id, "agentName": name, "status": "completed", "summary": str(summary)[:700], "durationMs": int((finished-started)*1000)})
                result["lastAgentOutput"] = {"agentId": agent_id, "output": output}
                db_update_task(task_id, result_json=json.dumps(result, ensure_ascii=False))
                return output
            except Exception as exc:
                finished = time.time()
                db_add_agent_log(task_id, agent_id, name, task_type, "failed", str(exc), started, finished, {"error": str(exc)})
                result["agents"].append({"agentId": agent_id, "agentName": name, "status": "failed", "summary": str(exc)[:700], "durationMs": int((finished-started)*1000)})
                db_update_task(task_id, result_json=json.dumps(result, ensure_ascii=False))
                raise

        # 1 CEO / manager
        log_agent("ceo-manager", "generate_report", "CEO Agent", lambda: {"summary": "Menerima brief, menetapkan pemeriksaan mutu, dan mengoordinasikan sembilan fungsi produksi.", "goal": task["title"]})

        # 2 Ide/research angle. No live trend claims: no paid search grounding is used.
        research = log_agent("trend-researcher", "research_topic", "Trend Researcher", lambda: call_ollama_json(
            "Kamu adalah peneliti ide Shorts berbahasa Indonesia. Buat sudut cerita orisinal dan menarik, jangan mengaku sedang melihat tren live atau data views. Hindari clickbait menyesatkan. Balas JSON {\"angle\":string,\"audience\":string,\"hookIdea\":string,\"keyPoints\":array,\"uniqueness\":string,\"summary\":string}.\nChannel: " + CHANNELS[channel_id] + "\nTopik: " + task["title"] + "\nCatatan pemilik: " + str(payload.get("notes", ""))
        ))
        result["research"] = research

        # 3 Bible researcher — Bible series episodes require a passage from the uploaded JSON.
        tb_passage = None
        reference_for_research = str(payload.get("bibleReference", "Belum diberikan"))
        if payload.get("requireBibleSource"):
            tb_passage = fetch_local_tb_passage(reference_for_research)
            result["bibleSource"] = {
                "version":tb_passage.get("version", "Terjemahan Baru (label metadata file)"),
                "publisher":tb_passage.get("publisher", "Tidak tercantum pada metadata file"),
                "source":tb_passage.get("source"), "reference":tb_passage["reference"],
                "verified":False, "referenceResolved":True, "fetchedAt":tb_passage["fetchedAt"],
                "verificationNote":"Rujukan dan teks ditemukan pada file JSON yang diunggah; aplikasi tidak mengesahkan keaslian atau lisensi sumber secara independen.",
                "storageNote":"Teks ayat hanya digunakan sementara untuk riset; tidak disinkronkan ke Firestore atau Netlify."
            }
            if payload.get("bibleSeriesId"):
                db_update_bible_series(str(payload["bibleSeriesId"]), owner_uid, source_status="local_json")
        elif tb_production_source_ready() and reference_for_research != "Belum diberikan":
            try:
                tb_passage = fetch_local_tb_passage(reference_for_research)
                result["bibleSource"] = {"version":tb_passage.get("version"),"publisher":tb_passage.get("publisher"),
                    "source":tb_passage.get("source"),"reference":tb_passage["reference"],"verified":False,
                    "referenceResolved":True,"verificationNote":"JSON yang diunggah; tidak diverifikasi independen","fetchedAt":tb_passage["fetchedAt"]}
            except Exception as source_error:
                result["warnings"].append(f"Teks Alkitab dari file JSON yang diunggah tidak dapat diambil; riset berjalan sebagai draf dan perlu pemeriksaan manual: {source_error}")
        bible_prompt = (
            "Kamu asisten riset Alkitab. Bila teks sumber TB disertakan, jadikan teks itu sumber utama dan jangan menambah kejadian yang tidak didukung. "
            "Jangan menyalin ayat secara verbatim; parafrase isi dengan setia. Pisahkan fakta teks, konteks sejarah, dan interpretasi. "
            "Balas JSON {\"reference\":string,\"contextSummary\":string,\"mainEvents\":array,\"historicalNotes\":array,\"cautions\":array,\"summary\":string}.\n"
            "Topik: " + task["title"] + "\nRujukan: " + reference_for_research + "\nSudut cerita: " + str(research.get("angle", "")) +
            "\nCatatan: " + str(payload.get("notes", ""))
        )
        if tb_passage:
            bible_prompt += "\nTEKS RUJUKAN ALKITAB TERJEMAHAN BARU (TB) DARI SUMBER YANG DIKONFIGURASI — GUNAKAN HANYA SEBAGAI SUMBER INTERNAL, JANGAN KELUARKAN KUTIPAN PANJANG:\n" + tb_passage["text"][:18000]
        bible = log_agent("bible-researcher", "verify_bible_context", "Bible Researcher", lambda: call_ollama_json(bible_prompt, max_output_tokens=5000))
        result["bibleResearch"] = bible

        # 4 Scriptwriter
        target_seconds = int(payload.get("durationSeconds", 45))
        min_words = max(35, int(target_seconds * 1.45))
        max_words = int(target_seconds * 2.0) + 4
        script = log_agent("scriptwriter", "write_script", "Scriptwriter — Claude Story Director", lambda: call_claude_json(
            "Bertindak sebagai penulis cerita dan script director profesional YouTube Shorts Bahasa Indonesia. Tulis narasi yang utuh, runtut, emosional, akurat, mudah dibacakan ElevenLabs, dan tepat untuk format vertikal 9:16. "
            "Jika memakai teks Alkitab JSON lokal, jadikan sumber itu otoritas rujukan; jangan menambah kejadian/dialog/fakta yang tidak didukung. "
            "Parafrase setia dan jangan menyalin kutipan panjang. "
            f"Target durasi {target_seconds} detik dengan narasi {min_words}-{max_words} kata. "
            "Hook 1-3 detik, isi runtut, kalimat pendek, penutup/refleksi singkat. "
            "Jangan menyertakan instruksi visual ke dalam narasi. Balas JSON {\"titleIdea\":string,\"hook\":string,\"narration\":string,\"closing\":string,\"onScreenText\":array,\"reference\":string,\"summary\":string}."
            "\nTopik: " + task["title"] + "\nRiset: " + json.dumps(research, ensure_ascii=False) + "\nKonteks Alkitab: " + json.dumps(bible, ensure_ascii=False), CLAUDE_SCRIPT_SCHEMA, max_output_tokens=6500
        ))
        if not script.get("narration"):
            raise RuntimeError("Scriptwriter tidak menghasilkan naskah.")
        narration = str(script.get("narration", "")).strip()
        if script.get("closing") and script["closing"] not in narration:
            narration = narration.rstrip() + " " + str(script["closing"]).strip()
        word_count = len(re.findall(r"\b[\w'-]+\b", narration, flags=re.UNICODE))
        script_quality_warning = []
        if word_count > max_words:
            revised = call_claude_json(
                f"Ringkas ulang naskah ini menjadi {min_words}-{max_words} kata untuk voice-over Shorts {target_seconds} detik, pertahankan judul, hook dan rujukan. "
                "Jaga seluruh fakta dan rujukan yang sudah diberikan; jangan menambah fakta. Keluarkan JSON {\"narration\":string,\"closing\":string}.\n" + narration,
                {"type":"object","properties":{"narration":{"type":"string"},"closing":{"type":"string"},"titleIdea":{"type":"string"},"hook":{"type":"string"},"onScreenText":{"type":"array","items":{"type":"string"}},"reference":{"type":"string"},"summary":{"type":"string"}},"required":["narration","closing","titleIdea","hook","onScreenText","reference","summary"],"additionalProperties":False}, max_output_tokens=3000)
            narration = str(revised.get("narration", "")).strip()
            if revised.get("closing") and revised["closing"] not in narration:
                narration = narration.rstrip() + " " + str(revised["closing"]).strip()
            word_count = len(re.findall(r"\b[\w'-]+\b", narration, flags=re.UNICODE))
        if word_count > max_words:
            # Deterministic last-resort trim at a sentence boundary to protect the requested run time.
            words = narration.split()
            narration = " ".join(words[:max_words]).rstrip(" ,;:") + "."
            word_count = len(re.findall(r"\b[\w'-]+\b", narration, flags=re.UNICODE))
            script_quality_warning.append(f"Naskah dipangkas otomatis ke {max_words} kata untuk menjaga durasi.")
        if word_count < min_words:
            script_quality_warning.append(f"Naskah hanya {word_count} kata; durasi suara mungkin lebih pendek dari target {target_seconds} detik.")
        script["narration"] = narration
        script["wordCount"] = word_count
        script["targetDurationSeconds"] = target_seconds
        # Optional Groq editorial pass. It may improve language but cannot replace local Bible verification.
        groq_review = call_groq_review(narration, task["title"], target_seconds)
        if groq_review.get("used") and groq_review.get("revisedNarration"):
            candidate = groq_review["revisedNarration"].strip()
            candidate_words = len(re.findall(r"\b[\w'-]+\b", candidate, flags=re.UNICODE))
            if min_words <= candidate_words <= max_words:
                narration = candidate
                script["narration"] = narration
                script["wordCount"] = candidate_words
                script["editorialReview"] = {"provider":"Groq", "approved":groq_review.get("approved"), "notes":groq_review.get("notes", [])}
            else:
                script_quality_warning.append("Revisi Groq diabaikan karena di luar rentang kata yang ditetapkan.")
        elif bool(CONFIG.get("groqEnabled", False)) and not groq_review.get("used"):
            script_quality_warning.append("Pemeriksa editorial Groq dilewati: " + str(groq_review.get("reason", "tidak tersedia")))
        result["warnings"].extend(script_quality_warning)
        result["editorialReview"] = script.get("editorialReview", {"provider":"Claude Script Director", "approved":None, "notes":[]})
        if not narration:
            raise RuntimeError("Naskah kosong setelah pemeriksaan durasi.")
        result["script"] = script
        result["narration"] = narration

        # 4b Theological and pastoral safety gates. These reviewers never rewrite the script.
        theological_review = log_agent("theological-guardian", "theological_review", "Theological Guardian", lambda: run_theological_guardian(
            narration, task["title"], str(payload.get("bibleReference", "")), channel_id))
        sensitivity_review = log_agent("pastoral-sensitivity", "pastoral_sensitivity", "Pastoral Sensitivity Checker", lambda: run_pastoral_sensitivity_checker(
            narration, task["title"], channel_id))
        result["theologicalGuardian"] = theological_review
        result["pastoralSensitivity"] = sensitivity_review
        result["guardianGatePassed"] = theological_review.get("status") == "LULUS" and sensitivity_review.get("status") == "LULUS"
        if not result["guardianGatePassed"]:
            result["warnings"].append("Theological Guardian / Pastoral Sensitivity belum LULUS. Video dapat dibuat untuk peninjauan, tetapi QC akan menahan publikasi sampai pemeriksaan dan persetujuan pemilik.")

        # 5 Claude Story Director: create scene map and a reusable visual character bible.
        storyboard = log_agent("storyboard-artist", "create_storyboard", "Storyboard Artist — Claude Story Director", lambda: call_claude_json(
            "Bagi narasi menjadi 6–8 adegan sinematik yang berurutan. Setiap narrationSegment harus merupakan potongan teks PERSIS dan berurutan dari narasi, tidak boleh menulis ulang atau melompati urutan. Adegan harus menggambarkan satu aksi/momen yang disebut dalam narasi. Semua prompt untuk video vertikal 9:16, tanpa teks, subtitle, logo, watermark. Buat characterBible berisi karakter utama yang harus tampak sama di setiap adegan: nama, usia/tampilan visual yang sesuai konteks, wajah, rambut, ciri khas, pakaian/wardrobe dan aksesori yang tidak berubah. Untuk setiap scene isi characters dengan characterId yang sesuai, veoPrompt lengkap berbahasa Inggris, gerak kamera, suasana dan aksi. Pertahankan setting, pakaian, skala dan continuity antar-scene. Jangan membuat fakta Alkitab baru. "
            + "\nCHANNEL: " + CHANNELS[channel_id] + "\nTOPIK: " + task["title"] + "\nNARASI: " + narration + "\nKONTEKS: " + json.dumps(bible, ensure_ascii=False),
            CLAUDE_STORYBOARD_SCHEMA, max_output_tokens=9000
        ))
        scenes = storyboard.get("scenes") or []
        if not isinstance(scenes, list) or len(scenes) < 3:
            raise RuntimeError("Claude Story Director tidak menghasilkan minimal 3 adegan.")
        scenes = scenes[:8]
        for scene in scenes:
            scene.setdefault("characters", [])
            scene.setdefault("veoPrompt", scene.get("visualQuery", scene.get("visualTitle", "")))
            scene["aspectRatio"] = "9:16"
        character_bible = storyboard.get("characterBible") or []
        result["storyboard"] = {"scenes": scenes, "characterBible": character_bible, "summary": storyboard.get("summary", "Storyboard selesai."), "aspectRatio":"9:16"}
        result["visualMode"] = payload.get("visualMode", "veo")
        if groq_review.get("used"):
            result["warnings"].append("Naskah mendapat tinjauan editorial Groq; kesesuaian fakta Alkitab tetap ditentukan oleh sumber Alkitab dan Guardian.")

        # 6 ElevenLabs Voice Artist first; real spoken timestamps drive scene and subtitle timing.
        audio_file = work_dir / "narration.wav"
        alignment_file = work_dir / "narration_alignment.json"
        voice_info = log_agent("voice-artist", "generate_voice", "Voice Artist — ElevenLabs (with timestamps)", lambda: make_voiceover(narration, audio_file, work_dir, channel_id, alignment_output=alignment_file))
        result["voice"] = voice_info
        with wave.open(str(audio_file), "rb") as _voice_wav:
            actual_audio_duration = _voice_wav.getnframes() / float(_voice_wav.getframerate())
        timeline_info = assign_scene_timestamps_from_alignment(scenes, alignment_file, actual_audio_duration)
        result["timeline"] = timeline_info
        result["timelineFile"] = str((work_dir / "story_timeline.json"))
        Path(result["timelineFile"]).write_text(json.dumps(timeline_info, ensure_ascii=False, indent=2), encoding="utf-8")
        result["warnings"].append("Timeline adegan diselaraskan dengan timestamp karakter dari audio ElevenLabs; bila pencocokan teks adegan kurang, sistem menggunakan pembagian proporsional dan menandainya.") if timeline_info.get("source") != "ElevenLabs character-level alignment" else None

        # 7 Character references and visual clips. Only one project can hold the Veo lock at a time.
        character_references: dict[str, str] = {}
        visual_revision = 0
        def collect_assets():
            nonlocal character_references, visual_revision
            visual_revision += 1
            if character_bible and str(payload.get("visualMode", "veo")) == "veo":
                ref_output = log_agent("image-generator", "generate_images", "Visual Curator — Character Reference", lambda: generate_character_reference_assets(character_bible, work_dir))
                character_references = ref_output or {}
            visual_result = log_agent("video-generator", "render_video", "Video Generator — Veo 3.1 / Google Flow Import", lambda: generate_story_visual_clips(
                scenes, work_dir, task_id, owner_uid, character_references, str(payload.get("visualMode", CONFIG.get("veoVisualMode", "veo"))), visual_revision
            ))
            generated_assets = visual_result.get("assets") or []
            for index, scene in enumerate(scenes, start=1):
                match_asset = next((x for x in generated_assets if int(x.get("sceneNo", 0) or 0) == index), None)
                if match_asset and match_asset.get("localFile"):
                    scene["videoFile"] = str(match_asset["localFile"])
            visual_result["characterReferences"] = {key: Path(value).name for key, value in character_references.items()}
            visual_result["summary"] = str(visual_result.get("summary", "")) + f" Character reference: {len(character_references)}. Semua klip disiapkan untuk 9:16."
            return visual_result

        visual_result = collect_assets()
        assets = visual_result["assets"]
        result["assets"] = assets
        result["warnings"].extend(visual_result.get("warnings") or [])
        credits=[]
        for asset in assets:
            if asset.get("sourceUrl"):
                credits.append(f"{asset.get('title','Image')} — {asset.get('creator','Unknown')}, {asset.get('license','CC0')} {asset.get('licenseVersion','')}. Lisensi: {asset.get('licenseUrl','')}. Sumber: {asset.get('sourceUrl')}")
        result["assetCredits"] = credits
        if not any(a.get("localFile") for a in assets):
            result["warnings"].append("Tidak ada klip video yang berhasil disiapkan; render memakai kartu visual cadangan dan tidak boleh dianggap sebagai animasi final.")

        # 8 Video generator
        video_file = work_dir / "shorts.mp4"
        video_info = log_agent("video-generator", "render_video", "Video Generator", lambda: render_short(scenes, assets, audio_file, video_file, work_dir))
        result["video"] = video_info

        # 9 Video editor - output package/SRT/credits
        def finalize_edit():
            files = write_subtitle_and_credit_files(scenes, video_info["durationSeconds"], credits, work_dir, narration, alignment_file)
            return {"summary":"Paket editing, subtitle bertiming mengikuti narasi, dan daftar atribusi aset selesai dibuat.", **files}
        edit_result=log_agent("video-editor", "render_video", "Video Editor", finalize_edit)
        result["editing"] = edit_result

        # 10 SEO & Publisher metadata
        seo = log_agent("seo-publisher", "generate_report", "SEO & Publisher", lambda: call_ollama_json(
            "Buat metadata YouTube Shorts bahasa Indonesia. Judul ringkas maksimal 90 karakter, deskripsi asli dan informatif, tags maksimal 15, hashtags maksimal 5. Masukkan rujukan Alkitab dan atribusi gambar berikut jika ada. Jangan membuat klaim tren/hasil. Balas JSON {\"title\":string,\"description\":string,\"tags\":array,\"hashtags\":array,\"summary\":string}.\nTopik: " + task["title"] + "\nNaskah: " + narration + "\nRujukan: " + str(bible.get("reference", "")) + "\nAtribusi: " + json.dumps(credits, ensure_ascii=False)
        ))
        description = str(seo.get("description", ""))
        if credits:
            description += "\n\nKredit visual / sumber:\n" + "\n".join(credits)
        if seo.get("hashtags"):
            description += "\n\n" + " ".join("#" + str(x).lstrip("#").replace(" ", "") for x in seo["hashtags"][:5])
        seo["description"] = description[:4900]
        result["seo"] = seo

        def run_ai_content_qc():
            return log_agent("ceo-manager", "quality_check", "CEO Agent — AI Content QC", lambda: call_ollama_json(
                "Lakukan pemeriksaan mutu konservatif atas YouTube Shorts berikut. Nilai akurasi rujukan, koherensi, kesesuaian audiens, kejelasan narasi, orisinalitas, dan potensi konten repetitif. Jangan menyatakan telah memverifikasi teks Alkitab secara eksternal. Tolak jika klaim tidak punya rujukan atau naskah tidak koheren. Balas JSON {\"passed\":boolean,\"score\":number,\"issues\":array,\"recommendations\":array,\"summary\":string}.\nNaskah: " + narration + "\nRiset Alkitab: " + json.dumps(bible, ensure_ascii=False) + "\nStoryboard: " + json.dumps(scenes, ensure_ascii=False)
            ))

        qc = run_ai_content_qc()
        technical_qc = run_advanced_quality_checks(video_file, audio_file, Path(edit_result["subtitleFile"]),
                                                   video_info, scenes, assets, narration, task_id, channel_id)
        repair_attempts = []
        script_regenerated = False
        voice_regenerated = False
        assets_regenerated = False

        # One controlled repair pass: rewrite content if the AI review fails; otherwise
        # normalize/regenerate local media and rebuild subtitles before running QC again.
        if not bool(qc.get("passed", False)) or not technical_qc.get("passed", False):
            initial_issues = list(qc.get("issues") or []) + list(technical_qc.get("blockers") or [])
            repair_record = {"attempt": 1, "startedAt": int(time.time()), "issues": initial_issues[:20]}
            script_regenerated = False
            voice_regenerated = False
            assets_regenerated = False
            try:
                assert_working_day()
                originality_failed = float((technical_qc.get("originality") or {}).get("maxSimilarity", 0) or 0) >= 0.86
                if not bool(qc.get("passed", False)) or originality_failed:
                    revised = log_agent("scriptwriter", "write_script", "Scriptwriter — Claude QC Revision", lambda: call_claude_json(
                        "Revisi seluruh naskah tanpa menambah peristiwa, fakta atau rujukan baru; pertahankan inti cerita, perbaiki masalah QC, tetap berbahasa Indonesia. Kembalikan semua field schema.\nMasalah QC: " + json.dumps(initial_issues, ensure_ascii=False) + "\nRujukan: " + str(bible.get("reference", payload.get("bibleReference", ""))) + "\nNaskah lama: " + narration,
                        CLAUDE_SCRIPT_SCHEMA, max_output_tokens=6500
                    ))
                    revised_text = str(revised.get("narration", "")).strip()
                    if revised_text:
                        narration = revised_text
                        script["narration"] = narration
                        script["closing"] = str(revised.get("closing", script.get("closing", "")))
                        result["script"] = script
                        result["narration"] = narration
                        storyboard = log_agent("storyboard-artist", "create_storyboard", "Storyboard Artist — Claude Revisi QC", lambda: call_claude_json(
                            "Buat ulang 6–8 adegan untuk naskah revisi. narrationSegment harus berupa kutipan persis dan urut. Pertahankan characterBible yang sama agar karakter tetap konsisten. Semua prompt untuk video portrait 9:16.\nNaskah: " + narration + "\nCharacter bible lama: " + json.dumps(character_bible, ensure_ascii=False),
                            CLAUDE_STORYBOARD_SCHEMA, max_output_tokens=9000
                        ))
                        revised_scenes = storyboard.get("scenes") or []
                        if not isinstance(revised_scenes, list) or len(revised_scenes) < 3:
                            raise RuntimeError("Storyboard hasil perbaikan tidak valid (minimal 3 adegan). Video lama tidak akan diteruskan dengan narasi baru.")
                        scenes = revised_scenes[:8]
                        for _scene in scenes:
                            _scene.setdefault("characters", [])
                            _scene.setdefault("veoPrompt", _scene.get("visualQuery", _scene.get("visualTitle", "")))
                            _scene["aspectRatio"] = "9:16"
                        character_bible = storyboard.get("characterBible") or character_bible
                        result["storyboard"] = {"scenes": scenes, "characterBible": character_bible, "summary": storyboard.get("summary", "Storyboard direvisi setelah QC."), "aspectRatio":"9:16"}
                        # Regenerate voice first, then derive the new timeline from the actual
                        # ElevenLabs character alignment before asking Veo/Flow for scene clips.
                        voice_info = log_agent("voice-artist", "generate_voice", "Voice Artist — Revisi QC", lambda: make_voiceover(narration, audio_file, work_dir, channel_id, alignment_output=alignment_file))
                        with wave.open(str(audio_file), "rb") as _voice_wav:
                            actual_audio_duration = _voice_wav.getnframes() / float(_voice_wav.getframerate())
                        result["timeline"] = assign_scene_timestamps_from_alignment(scenes, alignment_file, actual_audio_duration)
                        Path(result.get("timelineFile", work_dir / "story_timeline.json")).write_text(json.dumps(result["timeline"], ensure_ascii=False, indent=2), encoding="utf-8")
                        visual_result = collect_assets()
                        assets = visual_result["assets"]
                        result["assets"] = assets
                        result["warnings"].extend(visual_result.get("warnings") or [])
                        credits = [f"{a.get('title','Image')} — {a.get('creator','Unknown')}, {a.get('license','CC0')} {a.get('licenseVersion','')}. Lisensi: {a.get('licenseUrl','')}. Sumber: {a.get('sourceUrl')}" for a in assets if a.get("sourceUrl")]
                        result["assetCredits"] = credits
                        script_regenerated = True
                        voice_regenerated = True
                        assets_regenerated = True
                    elif not bool(qc.get("passed", False)) or originality_failed:
                        raise RuntimeError("Scriptwriter tidak menghasilkan naskah revisi yang valid; QC tetap gagal.")
                if not technical_qc.get("audio", {}).get("passed", False) and not voice_regenerated:
                    voice_info = log_agent("voice-artist", "generate_voice", "Voice Artist — Perbaikan Audio QC", lambda: make_voiceover(narration, audio_file, work_dir, channel_id, alignment_output=alignment_file))
                    with wave.open(str(audio_file), "rb") as _voice_wav:
                        actual_audio_duration = _voice_wav.getnframes() / float(_voice_wav.getframerate())
                    result["timeline"] = assign_scene_timestamps_from_alignment(scenes, alignment_file, actual_audio_duration)
                    Path(result.get("timelineFile", work_dir / "story_timeline.json")).write_text(json.dumps(result["timeline"], ensure_ascii=False, indent=2), encoding="utf-8")
                    voice_regenerated = True
                if not technical_qc.get("license", {}).get("passed", False) and not assets_regenerated:
                    visual_result = collect_assets()
                    assets = visual_result["assets"]
                    result["assets"] = assets
                    result["warnings"].extend(visual_result.get("warnings") or [])
                    credits = [f"{a.get('title','Image')} — {a.get('creator','Unknown')}, {a.get('license','CC0')} {a.get('licenseVersion','')}. Lisensi: {a.get('licenseUrl','')}. Sumber: {a.get('sourceUrl')}" for a in assets if a.get("sourceUrl")]
                    result["assetCredits"] = credits
                    assets_regenerated = True
                # Regenerate a clean MP4 once from the latest scenes/audio. This also repairs
                # subtitle timing and container/codec issues from the first render.
                video_info = log_agent("video-generator", "render_video", "Video Generator — Render Ulang QC", lambda: render_short(scenes, assets, audio_file, video_file, work_dir))
                edit_result = log_agent("video-editor", "render_video", "Video Editor — Rebuild Subtitle QC", lambda: {
                    "summary": "Video dan subtitle dibuat ulang setelah QC.",
                    **write_subtitle_and_credit_files(scenes, video_info["durationSeconds"], credits, work_dir, narration, alignment_file)
                })
                qc = run_ai_content_qc()
                technical_qc = run_advanced_quality_checks(video_file, audio_file, Path(edit_result["subtitleFile"]),
                                                           video_info, scenes, assets, narration, task_id, channel_id)
                if script_regenerated:
                    seo = log_agent("seo-publisher", "generate_report", "SEO & Publisher — Metadata Revisi QC", lambda: call_ollama_json(
                        "Perbarui metadata YouTube Shorts berdasarkan naskah hasil perbaikan QC terbaru. Judul maksimal 90 karakter, deskripsi informatif, tags maksimal 15, hashtags maksimal 5. Jangan membuat klaim tren atau hasil. Balas JSON {\"title\":string,\"description\":string,\"tags\":array,\"hashtags\":array,\"summary\":string}.\nTopik: " + task["title"] + "\nNaskah terbaru: " + narration + "\nRujukan: " + str(bible.get("reference", "")) + "\nAtribusi: " + json.dumps(credits, ensure_ascii=False)
                    ))
                    updated_description = str(seo.get("description", ""))
                    if credits:
                        updated_description += "\n\nKredit visual / sumber:\n" + "\n".join(credits)
                    if seo.get("hashtags"):
                        updated_description += "\n\n" + " ".join("#" + str(x).lstrip("#").replace(" ", "") for x in seo["hashtags"][:5])
                    seo["description"] = updated_description[:4900]
                    result["seo"] = seo
                repair_record["completed"] = True
                repair_record["result"] = "lulus" if qc.get("passed") and technical_qc.get("passed") else "masih_gagal"
            except Exception as repair_exc:
                repair_record["completed"] = False
                repair_record["error"] = str(repair_exc)[:700]
                result["warnings"].append(f"Perbaikan otomatis QC gagal: {repair_exc}")
            repair_record["finishedAt"] = int(time.time())
            repair_attempts.append(repair_record)

        if script_regenerated:
            theological_review = log_agent("theological-guardian", "theological_review", "Theological Guardian — Pemeriksaan Ulang", lambda: run_theological_guardian(
                narration, task["title"], str(payload.get("bibleReference", "")), channel_id))
            sensitivity_review = log_agent("pastoral-sensitivity", "pastoral_sensitivity", "Pastoral Sensitivity Checker — Pemeriksaan Ulang", lambda: run_pastoral_sensitivity_checker(
                narration, task["title"], channel_id))
            result["theologicalGuardian"] = theological_review
            result["pastoralSensitivity"] = sensitivity_review
            result["guardianGatePassed"] = theological_review.get("status") == "LULUS" and sensitivity_review.get("status") == "LULUS"
        guardian_gate_passed = bool(result.get("guardianGatePassed", False))
        ai_passed = bool(qc.get("passed", False)) and float(qc.get("score", 0) or 0) >= 70
        qc_passed = ai_passed and bool(technical_qc.get("passed", False)) and guardian_gate_passed
        combined_score = round((float(qc.get("score", 0) or 0) * 0.45) + (float(technical_qc.get("score", 0) or 0) * 0.55))
        issues = list(qc.get("issues") or []) + list(technical_qc.get("blockers") or [])
        if not guardian_gate_passed:
            issues.append("Theological Guardian dan Pastoral Sensitivity harus berstatus LULUS sebelum publikasi.")
            for finding in (theological_review.get("fatalErrors") or []): issues.append("Teologi: " + str(finding))
            for finding in (theological_review.get("problems") or []): issues.append("Teologi: " + str(finding.get("reason", finding)))
            for finding in (sensitivity_review.get("findings") or []): issues.append("Sensitivitas: " + str(finding.get("problem", finding)))
        result["quality"] = {
            "passed": qc_passed,
            "score": combined_score,
            "aiScore": float(qc.get("score", 0) or 0),
            "technicalScore": float(technical_qc.get("score", 0) or 0),
            "issues": issues[:40],
            "recommendations": list(qc.get("recommendations") or [])[:20],
            "summary": str(qc.get("summary", "")) + " " + str(technical_qc.get("summary", "")),
            "fileValid": bool(technical_qc.get("video", {}).get("passed")),
            "advanced": technical_qc,
            "guardianGatePassed": guardian_gate_passed,
            "theologicalGuardian": theological_review,
            "pastoralSensitivity": sensitivity_review,
            "repairAttempts": repair_attempts,
            "checkedAt": int(time.time()),
        }
        result["qualityReviewRequired"] = not qc_passed
        result["video"] = video_info
        result["voice"] = voice_info
        result["editing"] = edit_result
        if technical_qc.get("warnings"):
            result["warnings"].extend(technical_qc["warnings"])
        if not qc_passed:
            result["warnings"].append("Quality Control lanjutan belum lulus. Upload diblokir sampai masalah diperbaiki atau diperiksa pemilik.")
        result["title"] = str(seo.get("title") or task["title"])
        final_description = str(seo.get("description") or "")
        if result.get("bibleSource", {}).get("verified"):
            tb_credit = f"\n\nReferensi Alkitab: {result['bibleSource']['reference']} (Terjemahan Baru [TB], Lembaga Alkitab Indonesia). Isi disampaikan kembali dengan parafrasa, bukan kutipan teks lengkap."
            if tb_credit.strip() not in final_description:
                final_description = (final_description + tb_credit)[:4900]
        elif result.get("bibleSource", {}).get("referenceResolved"):
            local_credit = f"\n\nReferensi Alkitab: {result['bibleSource']['reference']} (sumber JSON lokal yang diimpor pengguna; label terjemahan dan hak penggunaan belum diverifikasi oleh aplikasi)."
            if local_credit.strip() not in final_description:
                final_description = (final_description + local_credit)[:4900]
        result["description"] = final_description
        result["channelId"] = channel_id
        result["completedAt"] = int(time.time())
        result["localReviewNote"] = "QC otomatis mencakup konten AI, decode/format video, audio WAV, SRT, lisensi/atribusi aset, dan kemiripan naskah pada riwayat lokal. Periksa sumber Alkitab dan lisensi akhir sebelum publikasi."

        # Auto-upload remains opt-in and only runs after both AI and deterministic QC pass.
        if qc_passed and bool(payload.get("autoUploadAfterQC", False)):
            try:
                assert_working_day()
                db_update_task(task_id, status="completed", stage="QC lanjutan lulus — menyiapkan upload", progress=98,
                               result_json=json.dumps(result, ensure_ascii=False))
                privacy = payload.get("privacyStatus", "private")
                uploaded = upload_video_for_task(task_id, owner_uid, privacy)
                result["upload"] = uploaded
            except Exception as upload_exc:
                result["warnings"].append(f"Video selesai tetapi upload otomatis belum berhasil: {upload_exc}")
        upload_failed = (
            bool(payload.get("autoUploadAfterQC", False))
            and qc_passed
            and not bool(result.get("upload", {}).get("youtubeVideoId"))
        )
        final_status = "ready_to_upload" if (not qc_passed or upload_failed) else "completed"
        final_stage = (
            "QC lulus; upload otomatis gagal atau belum selesai — siap unggah ulang"
            if upload_failed else
            "Produksi selesai" if qc_passed else
            "Menunggu pemeriksaan/perbaikan"
        )
        db_update_task(task_id, status=final_status, stage=final_stage, progress=100,
                       result_json=json.dumps(result, ensure_ascii=False))
        db_update_episode_for_task(task_id, "completed" if qc_passed else "needs_review")
        log.info("Workforce task %s selesai: %s", task_id, final_status)
    except Exception as exc:
        log.exception("Workforce task %s gagal", task_id)
        current = db_get_task(task_id, (task or {}).get("owner_uid", "")) if task else None
        if WORKER_STOP.is_set():
            reason = "Worker ditutup — tugas dilanjutkan saat aplikasi dibuka kembali"
            db_update_task(task_id, status="paused", stage=reason, error_message=str(exc))
            db_update_episode_for_task(task_id, "paused")
        elif isinstance(exc, OperationPausedError):
            reason = "Istirahat Minggu: antrean disimpan dan akan dilanjutkan pukul 15.00 WIB"
            db_update_task(task_id, status="paused", stage=reason, error_message=str(exc))
            db_update_episode_for_task(task_id, "paused")
        else:
            db_update_task(task_id, status="failed", stage="Gagal", error_message=str(exc))
            db_update_episode_for_task(task_id, "failed")


def create_auto_tasks_for_day() -> int:
    if not CONFIG.get("autoDailyProduction") or not ollama_status().get("modelAvailable") or not is_working_time():
        return 0
    today=jakarta_now().date()
    if SCHEDULER_LAST_RUN_FILE.exists() and SCHEDULER_LAST_RUN_FILE.read_text(encoding="utf-8").strip()==today.isoformat():
        return 0
    created=0
    # Sequential queue; never run more than one rendering task at a time.
    for channel_key, seeds in AUTO_TOPIC_SEEDS.items():
        connection = connections.get(channel_key) or {}
        if connection.get("status") != "connected":
            log.warning("Auto schedule melewati %s karena channel belum terhubung.", channel_key)
            continue
        idx=(today.toordinal() // 6) % len(seeds)
        title, reference=seeds[idx]
        payload={"jobId":"auto-"+today.isoformat()+"-"+channel_key,"channelId":channel_key,"title":title,
                 "format":"YouTube Shorts","notes":"Topik dibuat dari kalender editorial awal; AI boleh mengembangkan sudut cerita tanpa mengklaim data tren live.",
                 "bibleReference":reference,"durationSeconds":45,"targetDate":"","autoUploadAfterQC":bool(CONFIG.get("autoUploadAfterQC",False)),
                 "privacyStatus":str(CONFIG.get("privacyStatus","private")),
                 "madeForKids": channel_key == "bible-stories-3d"}
        db_create_task(connection.get("ownerUid",""), payload)
        created += 1
    if created:
        SCHEDULER_LAST_RUN_FILE.write_text(today.isoformat(), encoding="utf-8")
        log.info("Scheduler membuat %s task untuk %s", created, today.isoformat())
    return created


_REST_MODEL_UNLOADED = False
_BIBLE_RESUME_SCAN_DONE = False


def unload_ollama_model() -> None:
    """Release the configured local model from VRAM during the Sunday rest window."""
    base_url = str(CONFIG.get("ollamaBaseUrl", "http://127.0.0.1:11434")).rstrip("/")
    model = str(CONFIG.get("ollamaModel", "qwen3:4b"))
    try:
        requests.post(base_url + "/api/generate", json={"model": model, "prompt": "", "keep_alive": 0}, timeout=(2, 10))
        log.info("Permintaan melepas model Ollama %s dari VRAM selama istirahat Minggu dikirim.", model)
    except Exception as exc:
        log.warning("Tidak dapat meminta Ollama melepas model selama istirahat: %s", exc)


def resume_sunday_paused_bible_series() -> int:
    """Resume Bible planners paused by the weekly rest boundary only."""
    resumed = 0
    with task_db_connection() as con:
        rows = con.execute("SELECT series_id,owner_uid FROM bible_series WHERE status='paused' AND error_message LIKE '%istirahat hari Minggu%'").fetchall()
    for series_id, owner_uid in rows:
        series = db_get_bible_series(series_id, owner_uid)
        if not series:
            continue
        selected = [BIBLE_BOOK_INDEX[bid] for bid in series.get("selectedBookIds", []) if bid in BIBLE_BOOK_INDEX]
        if not selected:
            continue
        normalized = {"scopeType": series.get("scope_type", "canon"), "channelId": series.get("channel_id"),
                      "title": series.get("title", "Seri Alkitab"), "durationSeconds": series.get("target_duration_seconds",45),
                      "audience": series.get("audience", "Keluarga dan semua umur"), "autoQueue": series.get("autoQueue", True)}
        db_update_bible_series(series_id, owner_uid, status="planning", error_message="")
        threading.Thread(target=run_bible_series_planner, args=(series_id,owner_uid,normalized,selected),
                         daemon=True, name=f"BibleSeriesResumeSchedule-{series_id[:8]}").start()
        resumed += 1
    return resumed


def resume_sunday_paused_transcription_jobs() -> int:
    """Restart transcription tasks paused specifically by the Sunday rest window."""
    resumed = 0
    with task_db_connection() as con:
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT job_id,owner_uid,source_id,model_size FROM transcription_jobs "
            "WHERE status='paused' AND error_message LIKE '%istirahat hari Minggu%' ORDER BY created_at"
        ).fetchall()
    for row in rows:
        with task_db_connection() as con:
            con.row_factory = sqlite3.Row
            source = con.execute(
                "SELECT file_path FROM church_shorts_sources WHERE source_id=? AND owner_uid=?",
                (row["source_id"], row["owner_uid"])
            ).fetchone()
            if not source or not Path(source["file_path"]).exists():
                con.execute("UPDATE transcription_jobs SET status='failed',stage='Sumber rekaman tidak ditemukan',error_message=?,updated_at=? WHERE job_id=?",
                            ("File rekaman sumber tidak tersedia setelah jadwal istirahat.", time.time(), row["job_id"]))
                continue
            con.execute("UPDATE transcription_jobs SET status='queued',progress=0,stage='Dilanjutkan otomatis setelah istirahat Minggu',error_message='',updated_at=? WHERE job_id=?",
                        (time.time(), row["job_id"]))
        threading.Thread(target=run_local_transcription_job,
                         args=(row["job_id"], str(source["file_path"]), str(row["model_size"] or "base")),
                         daemon=True, name=f"TranscribeResume-{row['job_id'][:8]}").start()
        resumed += 1
    return resumed


def workforce_queue_loop() -> None:
    global _REST_MODEL_UNLOADED, _BIBLE_RESUME_SCAN_DONE
    log.info("AI Workforce queue processor aktif; maksimum satu tugas. Jadwal istirahat Minggu 06.00–15.00 WIB.")
    while not WORKER_STOP.is_set():
        try:
            if is_sunday_rest_period():
                if not _REST_MODEL_UNLOADED:
                    unload_ollama_model()
                    _REST_MODEL_UNLOADED = True
                time.sleep(15)
                continue
            if _REST_MODEL_UNLOADED or not _BIBLE_RESUME_SCAN_DONE:
                _REST_MODEL_UNLOADED = False
                resume_sunday_paused_bible_series()
                resume_sunday_paused_transcription_jobs()
                _BIBLE_RESUME_SCAN_DONE = True
            # Resume only tasks paused by the weekly rest schedule, never arbitrary failures.
            with task_db_connection() as con:
                con.execute("UPDATE tasks SET status='queued', stage='Dilanjutkan otomatis setelah istirahat Minggu', updated_at=? WHERE status='paused' AND stage LIKE 'Istirahat Minggu:%'", (time.time(),))
                con.execute("UPDATE bible_episodes SET status='queued', updated_at=? WHERE status='paused' AND episode_id IN (SELECT json_extract(payload_json,'$.bibleEpisodeId') FROM tasks WHERE status='queued')", (time.time(),))
                con.commit()
            with task_db_connection() as con:
                con.row_factory=sqlite3.Row
                row=con.execute("SELECT task_id FROM tasks WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").fetchone()
            if not row:
                time.sleep(3)
                continue
            run_workforce_pipeline(row["task_id"])
        except Exception:
            log.exception("Queue processor error")
            time.sleep(5)


def workforce_scheduler_loop() -> None:
    while not WORKER_STOP.is_set():
        try:
            if CONFIG.get("autoDailyProduction") and is_working_time():
                now=jakarta_now()
                hour=int(CONFIG.get("dailyHour",6))
                if now.hour >= hour:
                    create_auto_tasks_for_day()
        except Exception:
            log.exception("Scheduler error")
        time.sleep(30)


def start_workforce_background_services() -> None:
    threading.Thread(target=workforce_queue_loop, daemon=True, name="AICF-WorkforceQueue").start()
    threading.Thread(target=workforce_scheduler_loop, daemon=True, name="AICF-WorkforceScheduler").start()


def ffmpeg_capabilities() -> dict[str, Any]:
    """Report the actual FFmpeg binary and whether its subtitles/libass filter exists."""
    binary = ""
    try:
        import imageio_ffmpeg
        candidate = imageio_ffmpeg.get_ffmpeg_exe()
        if candidate and Path(candidate).is_file():
            binary = str(candidate)
    except Exception:
        pass
    if not binary:
        binary = shutil.which("ffmpeg") or ""
    if not binary:
        return {"available": False, "path": "", "subtitlesFilterAvailable": False}
    try:
        result = run_media_command([binary, "-hide_banner", "-filters"], timeout=25)
        listing = (result.stdout or "") + "\n" + (result.stderr or "")
        subtitles_available = result.returncode == 0 and bool(re.search(r"^\s*[\w.]{3}\s+subtitles\s", listing, re.M))
    except Exception as exc:
        log.warning("Tidak dapat memeriksa filter FFmpeg subtitles: %s", exc)
        subtitles_available = False
    return {"available": True, "path": binary, "subtitlesFilterAvailable": subtitles_available}


class Handler(BaseHTTPRequestHandler):
    server_version = f"AIContentFactory/{APP_VERSION}"

    def log_message(self, fmt, *args):
        log.info("%s - %s", self.address_string(), fmt % args)

    def _is_local_request(self) -> bool:
        return is_trusted_loopback_request(
            self.client_address[0],
            self.headers.get("Host", ""),
            self.headers.get("Origin"),
            self.headers.get("X-Forwarded-Host"),
        )

    def _origin_ok(self) -> bool:
        origin = self.headers.get("Origin")
        if origin:
            return allowed_origin(origin)
        # Same-origin GET requests may omit Origin; allow only loopback Host + loopback client.
        return self._is_local_request()

    def _cors_headers(self):
        origin = self.headers.get("Origin", "")
        if allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _send_json(self, status: int, payload: dict[str, Any]):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized_user(self) -> dict[str, str]:
        auth_header = self.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise PermissionError("Sesi login Firebase tidak ditemukan. Login kembali ke AI Content Factory.")
        user = verify_firebase_google_user(auth_header[7:].strip())
        return enforce_worker_owner(user, self._is_local_request())

    def _serve_dashboard(self):
        if not APP_HTML_FILE.exists():
            self._send_json(500, {"message": "File dashboard tidak ditemukan dalam paket aplikasi."})
            return
        body = APP_HTML_FILE.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not self._origin_ok():
            self._send_json(403, {"message": "Origin website tidak diizinkan oleh Windows Worker."})
            return
        self.send_response(204)
        self._cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ("/", "/index.html"):
            if not self._is_local_request():
                self._send_json(403, {"message": "Dashboard Worker hanya tersedia melalui officecontent.netlify.app. Endpoint ini khusus API."})
                return
            self._serve_dashboard()
            return
        if parsed.path == "/health":
            # Local health probes may be anonymous. Remote/tunnel health checks require
            # both the exact allowed Origin and a valid Firebase Google ID token.
            origin = self.headers.get("Origin")
            if origin and not self._origin_ok():
                self._send_json(403, {"message": "Origin website tidak diizinkan."})
                return
            # A browser request from the hosted Netlify origin must always authenticate,
            # even if the local tunnel proxy itself connects over a loopback TCP socket.
            needs_auth = bool(origin) or not self._is_local_request()
            if needs_auth:
                try:
                    self._authorized_user()
                except PermissionError as exc:
                    self._send_json(401, {"message": str(exc)})
                    return
                except Exception as exc:
                    self._send_json(503, {"message": "Tidak dapat memverifikasi sesi Firebase: " + str(exc)[:250]})
                    return
            ffmpeg_status = ffmpeg_capabilities()
            self._send_json(200, {
                "status": "online",
                "version": APP_VERSION,
                "service": "AI Content Factory Windows App",
                "dashboardAvailable": APP_HTML_FILE.exists(),
                "oauthClientConfigured": (SECRETS_DIR / "desktop-oauth-client.dpapi").exists(),
                "aiConfigured": bool(ollama_status().get("modelAvailable")),
                "aiProvider": "ollama-local",
                "ollama": ollama_status(),
                "ffmpegAvailable": ffmpeg_status["available"],
                "ffmpegPath": ffmpeg_status["path"],
                "ffmpegSubtitlesFilterAvailable": ffmpeg_status["subtitlesFilterAvailable"],
                "workforceVersion": "1.6.3",
                "guardianAgentsAvailable": True,
                "verticalVideoEditorAvailable": True,
                "bibleSeriesAvailable": True,
                "bibleSourceMode": "uploaded_json_only",
                "localBibleJsonConfigured": LOCAL_BIBLE_JSON_FILE.exists(),
                "analyticsScopeRequired": ANALYTICS_SCOPE,
                "operationalMode": "hybrid_multi_agent",
                "providers": provider_status_payload(),
                "operationalHours": "Senin–Sabtu 24 jam; Minggu istirahat 06.00–15.00 WIB",
                "sundayPause": True,
                "operationStatus": operation_status(),
            })
            return

        if parsed.path == "/api/bible/catalog":
            if not self._origin_ok(): self._send_json(403,{"message":"Origin website tidak diizinkan."}); return
            try:
                self._authorized_user()
                payload=bible_catalog_payload()
                self._send_json(200,payload)
            except PermissionError as exc: self._send_json(401,{"message":str(exc)})
            except Exception as exc: self._send_json(500,{"message":str(exc)})
            return
        if parsed.path == "/api/bible/status":
            if not self._origin_ok(): self._send_json(403,{"message":"Origin website tidak diizinkan."}); return
            try:
                self._authorized_user()
                self._send_json(200,bible_source_status_payload())
            except PermissionError as exc: self._send_json(401,{"message":str(exc)})
            except Exception as exc: self._send_json(500,{"message":str(exc)})
            return
        if parsed.path == "/api/bible/series":
            if not self._origin_ok(): self._send_json(403,{"message":"Origin website tidak diizinkan."}); return
            try:
                user=self._authorized_user()
                self._send_json(200,{"series":db_list_bible_series(user["uid"],30),"operationalMode":"local_ollama","sundayPause":True,"operationStatus":operation_status()})
            except PermissionError as exc: self._send_json(401,{"message":str(exc)})
            except Exception as exc: self._send_json(500,{"message":str(exc)})
            return
        if parsed.path == "/api/bible/series/detail":
            if not self._origin_ok(): self._send_json(403,{"message":"Origin website tidak diizinkan."}); return
            try:
                user=self._authorized_user(); params=urllib.parse.parse_qs(parsed.query)
                series_id=(params.get("seriesId") or [""])[0]
                series=db_get_bible_series(series_id,user["uid"])
                if not series: self._send_json(404,{"message":"Seri Alkitab tidak ditemukan."}); return
                self._send_json(200,{"series":series})
            except PermissionError as exc: self._send_json(401,{"message":str(exc)})
            except Exception as exc: self._send_json(500,{"message":str(exc)})
            return

        if parsed.path == "/api/youtube/status":
            if not self._origin_ok():
                self._send_json(403, {"message": "Origin website tidak diizinkan."})
                return
            try:
                user = self._authorized_user()
                params = urllib.parse.parse_qs(parsed.query)
                channel_key = (params.get("channelId") or [""])[0]
                if channel_key not in CHANNELS:
                    self._send_json(400, {"message": "Channel ID tidak dikenal."})
                    return
                expire_stale_oauth_flow(channel_key)
                with connections_lock:
                    connection = dict(connections.get(channel_key) or {})
                if connection.get("ownerUid") != user["uid"]:
                    connection = {"channelKey": channel_key, "status": "not_connected"}
                connection.pop("flowId", None)
                self._send_json(200, {"connection": connection})
            except PermissionError as exc:
                self._send_json(401, {"message": str(exc)})
            except Exception as exc:
                self._send_json(500, {"message": str(exc)})
            return
        if parsed.path == "/api/workforce/tasks":
            if not self._origin_ok():
                self._send_json(403, {"message": "Origin website tidak diizinkan."}); return
            try:
                user = self._authorized_user()
                self._send_json(200, {"tasks": db_list_tasks(user["uid"], 30), "operationalMode":"local_ollama", "sundayPause":True, "operationStatus":operation_status()})
            except PermissionError as exc:
                self._send_json(401, {"message": str(exc)})
            except Exception as exc:
                self._send_json(500, {"message": str(exc)})
            return
        if parsed.path == "/api/workforce/task":
            if not self._origin_ok():
                self._send_json(403, {"message": "Origin website tidak diizinkan."}); return
            try:
                user = self._authorized_user()
                params = urllib.parse.parse_qs(parsed.query)
                task_id = (params.get("taskId") or [""])[0]
                task = db_get_task(task_id, user["uid"])
                if not task:
                    self._send_json(404, {"message": "Tugas tidak ditemukan."}); return
                self._send_json(200, {"task": task})
            except PermissionError as exc:
                self._send_json(401, {"message": str(exc)})
            except Exception as exc:
                self._send_json(500, {"message": str(exc)})
            return
        if parsed.path == "/api/workforce/download":
            if not self._origin_ok():
                self._send_json(403, {"message": "Origin website tidak diizinkan."}); return
            try:
                user = self._authorized_user()
                params = urllib.parse.parse_qs(parsed.query)
                task_id = (params.get("taskId") or [""])[0]
                task = db_get_task(task_id, user["uid"])
                if not task:
                    self._send_json(404, {"message": "Tugas tidak ditemukan."}); return
                file_path = Path((task.get("result") or {}).get("video", {}).get("filePath", ""))
                if not file_path.exists() or not file_path.resolve().is_relative_to(OUTPUT_DIR.resolve()):
                    self._send_json(404, {"message": "File video tidak ditemukan."}); return
                body = file_path.read_bytes()
                self.send_response(200); self._cors_headers()
                self.send_header("Content-Type", "video/mp4")
                self.send_header("Content-Disposition", f'attachment; filename="{file_path.name}"')
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
            except PermissionError as exc:
                self._send_json(401, {"message": str(exc)})
            except Exception as exc:
                self._send_json(500, {"message": str(exc)})
            return
        if parsed.path == "/api/workforce/settings":
            if not self._origin_ok():
                self._send_json(403, {"message": "Origin website tidak diizinkan."}); return
            try:
                user = self._authorized_user()
                ai = ollama_status()
                self._send_json(200, {"autoDailyProduction": bool(CONFIG.get("autoDailyProduction")),
                    "dailyHour": int(CONFIG.get("dailyHour",6)), "dailyPerChannel": 1,
                    "autoUploadAfterQC": bool(CONFIG.get("autoUploadAfterQC")),
                    "privacyStatus": str(CONFIG.get("privacyStatus","private")),
                    "aiConfigured": bool(ai.get("modelAvailable")), "aiProvider":"ollama-local", "ollama":ai,
                    "operationalMode":"local_ollama", "sundayPause":True,
                    "sundayPauseEnabled": bool(CONFIG.get("sundayPauseEnabled", True)),
                    "sundayPauseStart": int(CONFIG.get("sundayPauseStart", 6)),
                    "sundayPauseEnd": int(CONFIG.get("sundayPauseEnd", 15)),
                    "operationStatus": operation_status(), "analyticsEnabled": True, "analyticsScope": ANALYTICS_SCOPE,
                    "autoAnalyticsSync": bool(CONFIG.get("autoAnalyticsSync", False)),
                    "includeMonetaryAnalytics": bool(CONFIG.get("includeMonetaryAnalytics", False)),
                    "monetaryAnalyticsScope": MONETARY_ANALYTICS_SCOPE,
                    "ttsProvider":"elevenlabs", "imageProvider":str(CONFIG.get("imageProvider","hybrid")),
                    "providers":provider_status_payload()})
            except PermissionError as exc:
                self._send_json(401, {"message": str(exc)})
            return
        if parsed.path == "/api/guardians/history":
            if not self._origin_ok(): self._send_json(403,{"message":"Origin website tidak diizinkan."}); return
            try:
                user=self._authorized_user()
                params=urllib.parse.parse_qs(parsed.query)
                self._send_json(200,{"reviews":list_guardian_reviews(user["uid"], int((params.get("limit") or [20])[0]))})
            except PermissionError as exc: self._send_json(401,{"message":str(exc)})
            except Exception as exc: self._send_json(500,{"message":str(exc)})
            return
        if parsed.path == "/api/providers/status":
            if not self._origin_ok(): self._send_json(403,{"message":"Origin website tidak diizinkan."}); return
            try:
                self._authorized_user()
                self._send_json(200, provider_status_payload())
            except PermissionError as exc: self._send_json(401,{"message":str(exc)})
            except Exception as exc: self._send_json(500,{"message":str(exc)})
            return
        if parsed.path == "/api/church-shorts/transcription":
            if not self._origin_ok(): self._send_json(403,{"message":"Origin website tidak diizinkan."}); return
            try:
                user=self._authorized_user(); params=urllib.parse.parse_qs(parsed.query); job_id=(params.get("jobId") or [""])[0]
                with task_db_connection() as con:
                    con.row_factory=sqlite3.Row
                    row=con.execute("SELECT * FROM transcription_jobs WHERE job_id=? AND owner_uid=?",(job_id,user["uid"])).fetchone()
                if not row: self._send_json(404,{"message":"Job transkripsi tidak ditemukan."}); return
                item=dict(row)
                transcript=Path(item["transcript_path"]).read_text(encoding="utf-8") if item.get("transcript_path") and Path(item["transcript_path"]).exists() else ""
                self._send_json(200,{"job":item,"transcript":transcript})
            except PermissionError as exc: self._send_json(401,{"message":str(exc)})
            except Exception as exc: self._send_json(500,{"message":str(exc)})
            return
        if parsed.path == "/api/church-shorts":
            if not self._origin_ok(): self._send_json(403,{"message":"Origin website tidak diizinkan."}); return
            try:
                user = self._authorized_user()
                self._send_json(200, list_church_shorts(user["uid"]))
            except PermissionError as exc: self._send_json(401,{"message":str(exc)})
            except Exception as exc: self._send_json(500,{"message":str(exc)})
            return
        if parsed.path == "/api/church-shorts/download":
            if not self._origin_ok(): self._send_json(403,{"message":"Origin website tidak diizinkan."}); return
            try:
                user=self._authorized_user(); params=urllib.parse.parse_qs(parsed.query); clip_id=(params.get("clipId") or [""])[0]
                with task_db_connection() as con:
                    con.row_factory=sqlite3.Row
                    row=con.execute("SELECT output_path,title FROM church_shorts_clips WHERE clip_id=? AND owner_uid=?",(clip_id,user["uid"])).fetchone()
                if not row: self._send_json(404,{"message":"Potongan video tidak ditemukan."}); return
                file_path=Path(row["output_path"])
                if not file_path.exists() or not file_path.resolve().is_relative_to(CHURCH_SHORTS_OUTPUT_DIR.resolve()): self._send_json(404,{"message":"File hasil potongan tidak ditemukan."}); return
                self.send_response(200); self._cors_headers(); self.send_header("Content-Type","video/mp4")
                self.send_header("Content-Disposition",f'attachment; filename="{file_path.name}"'); self.send_header("Cache-Control","no-store")
                self.send_header("Content-Length",str(file_path.stat().st_size)); self.end_headers()
                with file_path.open("rb") as stream: shutil.copyfileobj(stream,self.wfile)
            except PermissionError as exc: self._send_json(401,{"message":str(exc)})
            except Exception as exc: self._send_json(500,{"message":str(exc)})
            return
        if parsed.path == "/api/video-editor/download":
            if not self._origin_ok(): self._send_json(403, {"message": "Origin website tidak diizinkan."}); return
            try:
                user = self._authorized_user()
                params = urllib.parse.parse_qs(parsed.query)
                project_id = validate_video_editor_project_id((params.get("projectId") or [""])[0])
                owner_dir = video_editor_project_dir(user["uid"], project_id).resolve()
                file_path = (owner_dir / "output_vertical.mp4").resolve()
                if not file_path.exists() or file_path.parent != owner_dir:
                    self._send_json(404, {"message": "Video hasil render tidak ditemukan pada akun ini."}); return
                self.send_response(200); self._cors_headers(); self.send_header("Content-Type", "video/mp4")
                self.send_header("Content-Disposition", 'attachment; filename="AI-Content-Factory-Vertical.mp4"')
                self.send_header("Cache-Control", "no-store"); self.send_header("Content-Length", str(file_path.stat().st_size)); self.end_headers()
                with file_path.open("rb") as stream: shutil.copyfileobj(stream, self.wfile)
            except PermissionError as exc: self._send_json(401, {"message": str(exc)})
            except ValueError as exc: self._send_json(400, {"message": str(exc)})
            except Exception as exc: self._send_json(500, {"message": str(exc)[:500]})
            return
        self._send_json(404, {"message": "Endpoint tidak ditemukan."})

    def do_POST(self):
        if not self._origin_ok():
            self._send_json(403, {"message": "Origin website tidak diizinkan."})
            return
        path = urllib.parse.urlparse(self.path).path
        allowed_paths = (
            "/api/setup/oauth-client", "/api/youtube/connect", "/api/youtube/cancel", "/api/setup/ollama-test",
            "/api/workforce/start", "/api/workforce/upload", "/api/workforce/settings",
            "/api/church-shorts/source", "/api/church-shorts/clip", "/api/church-shorts/metadata", "/api/church-shorts/upload",
            "/api/analytics/sync", "/api/providers/settings", "/api/providers/test-groq", "/api/providers/test-elevenlabs-tts", "/api/providers/test-comfyui", "/api/providers/test-claude", "/api/providers/test-veo",
            "/api/church-shorts/transcribe", "/api/bible/series/plan",
            "/api/bible/series/resume", "/api/bible/series/queue", "/api/bible/local-source/import",
            "/api/guardians/theological", "/api/guardians/sensitivity", "/api/community/reply",
            "/api/video-editor/upload", "/api/video-editor/render", "/api/workforce/flow-import"
        )
        if path not in allowed_paths:
            self._send_json(404, {"message": "Endpoint tidak ditemukan."})
            return
        try:
            user = self._authorized_user()
            length = int(self.headers.get("Content-Length", "0"))
            payload = {}
            # Parse small JSON bodies before provider/transcription handlers. Binary uploads
            # and the Bible JSON importer keep their dedicated streaming paths below.
            early_json_paths = {"/api/providers/settings", "/api/providers/test-elevenlabs-tts", "/api/church-shorts/transcribe", "/api/guardians/theological", "/api/guardians/sensitivity", "/api/community/reply", "/api/video-editor/render"}
            if path in early_json_paths:
                if length <= 0 or length > 100000:
                    self._send_json(400, {"message": "Isi permintaan kosong atau terlalu besar."})
                    return
                try:
                    payload = json.loads(self.rfile.read(length).decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                    self._send_json(400, {"message": "Format JSON permintaan tidak valid: " + str(exc)[:180]})
                    return
            if path == "/api/workforce/flow-import":
                if length <= 0 or length > 500 * 1024 * 1024:
                    self._send_json(400, {"message":"File klip Flow kosong atau melebihi batas 500 MB."}); return
                task_id=str(self.headers.get("X-Task-ID", "")).strip()
                try: scene_no=int(self.headers.get("X-Scene-Index", "0"))
                except ValueError: scene_no=0
                if not task_id or not (1 <= scene_no <= 20):
                    self._send_json(400,{"message":"Task ID atau nomor adegan tidak valid."}); return
                task_item=db_get_task(task_id,user["uid"])
                if not task_item:
                    self._send_json(404,{"message":"Project tidak ditemukan pada akun ini."}); return
                if task_item.get("status") != "paused" or "Google Flow" not in str(task_item.get("stage", "")):
                    self._send_json(409,{"message":"Project belum berada pada tahap menunggu impor Google Flow."}); return
                content_type=str(self.headers.get("Content-Type", "")).lower()
                if "video/mp4" not in content_type and "application/octet-stream" not in content_type:
                    self._send_json(415,{"message":"Kirim klip sebagai video/mp4."}); return
                target_dir=_flow_import_dir(task_id); target_dir.mkdir(parents=True,exist_ok=True)
                target=target_dir/f"scene_{scene_no:03d}.mp4"
                temp=target.with_suffix(".uploading")
                remaining=length
                with temp.open("wb") as handle:
                    while remaining > 0:
                        chunk=self.rfile.read(min(1024*1024,remaining))
                        if not chunk: raise ConnectionError("Upload terputus sebelum file selesai diterima.")
                        handle.write(chunk); remaining-=len(chunk)
                with temp.open("rb") as _mp4_header_file:
                    header=_mp4_header_file.read(16)
                if len(header)<12 or header[4:8] != b"ftyp" or temp.stat().st_size < 20_000:
                    temp.unlink(missing_ok=True); self._send_json(400,{"message":"File bukan MP4 yang valid atau ukuran terlalu kecil."}); return
                try:
                    import imageio_ffmpeg
                    duration=probe_video_editor_duration(imageio_ffmpeg.get_ffmpeg_exe(),temp)
                    if duration < 1 or duration > 120: raise ValueError("Durasi klip harus 1–120 detik.")
                except Exception as exc:
                    temp.unlink(missing_ok=True); self._send_json(400,{"message":"Klip Flow gagal divalidasi: "+str(exc)[:260]}); return
                os.replace(temp,target)
                self._send_json(201,{"status":"imported","taskId":task_id,"sceneNo":scene_no,"durationSeconds":round(duration,2),"sizeBytes":target.stat().st_size,"message":f"Klip adegan {scene_no} berhasil diimpor. Worker akan melanjutkan setelah semua adegan tersedia."})
                return

            if path in ("/api/guardians/theological", "/api/guardians/sensitivity", "/api/community/reply"):
                channel_id=str(payload.get("channelId", ""))[:80]
                if channel_id and channel_id not in CHANNELS:
                    self._send_json(400,{"message":"Channel tidak dikenal."}); return
                title=str(payload.get("title", ""))[:200]
                if path == "/api/guardians/theological":
                    source_text=str(payload.get("script", ""))
                    if not source_text.strip() or len(source_text)>20000:
                        self._send_json(400,{"message":"Naskah harus diisi dan maksimal 20.000 karakter."}); return
                    try:
                        result=run_theological_guardian(source_text,title,str(payload.get("reference", "")),channel_id)
                        result["reviewId"]=save_guardian_review(user["uid"],channel_id,title,"theological",source_text,result)
                        self._send_json(200,{"status":"reviewed","result":result})
                    except (ValueError, OperationPausedError) as exc: self._send_json(409,{"message":str(exc)})
                    except Exception as exc: self._send_json(503,{"message":"Theological Guardian gagal: "+str(exc)[:500]})
                    return
                if path == "/api/guardians/sensitivity":
                    source_text=str(payload.get("script", ""))
                    if not source_text.strip() or len(source_text)>20000:
                        self._send_json(400,{"message":"Naskah harus diisi dan maksimal 20.000 karakter."}); return
                    try:
                        result=run_pastoral_sensitivity_checker(source_text,title,channel_id)
                        result["reviewId"]=save_guardian_review(user["uid"],channel_id,title,"sensitivity",source_text,result)
                        self._send_json(200,{"status":"reviewed","result":result})
                    except (ValueError, OperationPausedError) as exc: self._send_json(409,{"message":str(exc)})
                    except Exception as exc: self._send_json(503,{"message":"Pastoral Sensitivity Checker gagal: "+str(exc)[:500]})
                    return
                comment=str(payload.get("comment", ""))
                if not comment.strip() or len(comment)>5000:
                    self._send_json(400,{"message":"Komentar harus diisi dan maksimal 5.000 karakter."}); return
                try:
                    result=generate_community_prayer_reply(comment,channel_id or "daily-faith-inspiration")
                    result["reviewId"]=save_guardian_review(user["uid"],channel_id or "daily-faith-inspiration",title,"community_reply",comment,result)
                    self._send_json(200,{"status":"drafted","result":result,"message":"Draf balasan berhasil dibuat. Tinjau sebelum dikirim."})
                except (ValueError, OperationPausedError) as exc: self._send_json(409,{"message":str(exc)})
                except Exception as exc: self._send_json(503,{"message":"Community Manager gagal: "+str(exc)[:500]})
                return

            if path == "/api/providers/settings":
                provider_image=str(payload.get("imageProvider",CONFIG.get("imageProvider","hybrid"))).lower()
                if provider_image not in ("hybrid","comfyui","openverse"):
                    self._send_json(400,{"message":"Pilihan provider visual tidak valid."}); return
                eleven_model=str(payload.get("elevenLabsModel",CONFIG.get("elevenLabsModel","eleven_v4")))
                if eleven_model not in ("eleven_v4","eleven_multilingual_v2"):
                    self._send_json(400,{"message":"Model ElevenLabs tidak valid."}); return
                default_voice_id=str(payload.get("elevenLabsVoiceId",CONFIG.get("elevenLabsVoiceId","")) or "").strip()
                requested_voices=payload.get("elevenLabsVoiceIds",CONFIG.get("elevenLabsVoiceIds",{}))
                channel_voice_defaults={key:"" for key in CHANNELS}
                if not isinstance(requested_voices,dict):
                    requested_voices={}
                try:
                    default_voice_id=validate_elevenlabs_voice_id(default_voice_id,allow_empty=True)
                    channel_voice_ids={key:validate_elevenlabs_voice_id(str(requested_voices.get(key,default) or ""),allow_empty=True) for key,default in channel_voice_defaults.items()}
                    comfy_url=local_service_base_url(payload.get("comfyuiBaseUrl",CONFIG.get("comfyuiBaseUrl","http://127.0.0.1:8188")),"http://127.0.0.1:8188")
                    if payload.get("groqApiKey"):
                        save_provider_secret("groqApiKey",str(payload.get("groqApiKey")))
                    if payload.get("elevenLabsApiKey"):
                        save_provider_secret("elevenLabsApiKey",str(payload.get("elevenLabsApiKey")))
                    if payload.get("clearGroqApiKey"):
                        clear_provider_secret("groqApiKey")
                    if payload.get("clearElevenLabsApiKey"):
                        clear_provider_secret("elevenLabsApiKey")
                except Exception as exc:
                    self._send_json(400,{"message":str(exc)}); return
                groq_model=str(payload.get("groqModel",CONFIG.get("groqModel","openai/gpt-oss-20b"))).strip()[:120]
                checkpoint=str(payload.get("comfyuiCheckpoint",CONFIG.get("comfyuiCheckpoint","v1-5-pruned-emaonly.safetensors"))).strip()[:180]
                claude_model=str(payload.get("claudeModel",CONFIG.get("claudeModel","claude-sonnet-5-5"))).strip()
                if claude_model not in ("claude-sonnet-5-5", "claude-sonnet-5-5-latest"):
                    self._send_json(400,{"message":"Model Claude Script Director tidak valid."}); return
                veo_project=str(payload.get("veoProjectId",CONFIG.get("veoProjectId",""))).strip()
                veo_bucket=str(payload.get("veoStorageUri",CONFIG.get("veoStorageUri",""))).strip()
                veo_model=str(payload.get("veoModel",CONFIG.get("veoModel","veo-3.1-fast-generate-001"))).strip()
                veo_resolution=str(payload.get("veoResolution",CONFIG.get("veoResolution","720p"))).strip()
                try:
                    budget=float(payload.get("veoDailyBudgetUsd",CONFIG.get("veoDailyBudgetUsd",5.0)) or 5.0)
                    max_clips=int(payload.get("veoMaxClipsPerProject",CONFIG.get("veoMaxClipsPerProject",16)) or 16)
                except (TypeError,ValueError):
                    self._send_json(400,{"message":"Batas anggaran atau jumlah klip Veo tidak valid."}); return
                if not (0.1 <= budget <= 500) or not (1 <= max_clips <= 30):
                    self._send_json(400,{"message":"Anggaran Veo harus US$0,10–500 dan batas klip 1–30."}); return
                visual_mode=str(payload.get("veoVisualMode",CONFIG.get("veoVisualMode","veo"))).strip()
                if visual_mode not in ("veo","google_flow_manual"):
                    self._send_json(400,{"message":"Mode visual harus Veo otomatis atau Google Flow manual."}); return
                try:
                    if payload.get("groqApiKey"): save_provider_secret("groqApiKey",str(payload.get("groqApiKey")))
                    if payload.get("elevenLabsApiKey"): save_provider_secret("elevenLabsApiKey",str(payload.get("elevenLabsApiKey")))
                    if payload.get("claudeApiKey"): save_provider_secret("claudeApiKey",str(payload.get("claudeApiKey")))
                    if payload.get("veoServiceAccountJson"):
                        raw_sa=str(payload.get("veoServiceAccountJson"))
                        parsed_sa=json.loads(raw_sa)
                        if not isinstance(parsed_sa,dict) or parsed_sa.get("type") != "service_account" or not parsed_sa.get("private_key"):
                            raise ValueError("File kredensial Google harus berupa JSON service account yang valid.")
                        save_provider_secret("veoServiceAccountJson",raw_sa)
                    if payload.get("clearClaudeApiKey"): clear_provider_secret("claudeApiKey")
                    if payload.get("clearVeoServiceAccount"): clear_provider_secret("veoServiceAccountJson")
                    if payload.get("clearGroqApiKey"): clear_provider_secret("groqApiKey")
                    if payload.get("clearElevenLabsApiKey"): clear_provider_secret("elevenLabsApiKey")
                except Exception as exc:
                    self._send_json(400,{"message":str(exc)[:350]}); return
                CONFIG.update({"ttsProvider":"elevenlabs","elevenLabsModel":eleven_model,
                    "elevenLabsVoiceId":default_voice_id,"elevenLabsVoiceIds":channel_voice_ids,
                    "imageProvider":provider_image,"comfyuiBaseUrl":comfy_url,"comfyuiCheckpoint":checkpoint,
                    "groqEnabled":bool(payload.get("groqEnabled",False)),"groqModel":groq_model,
                    "claudeModel":claude_model,"veoProjectId":veo_project,"veoLocation":"us-central1",
                    "veoModel":veo_model,"veoStorageUri":veo_bucket,"veoResolution":veo_resolution,
                    "veoDailyBudgetUsd":budget,"veoMaxClipsPerProject":max_clips,"veoVisualMode":visual_mode,
                    "whisperModel":str(payload.get("whisperModel","base")) if payload.get("whisperModel") in ("tiny","base","small") else "base"})
                CONFIG_FILE.write_text(json.dumps(CONFIG,indent=2),encoding="utf-8")
                self._send_json(200,{"status":"saved","message":"Claude API Key dan kredensial Google Veo disimpan terenkripsi di Worker Windows. Secret tidak dikembalikan ke Dashboard/Firestore.","providers":provider_status_payload()})
                return

            if path == "/api/providers/test-claude":
                try:
                    result=call_claude_json("Balas JSON singkat untuk uji koneksi: ringkasan berisi kata SIAP.", {"type":"object","properties":{"summary":{"type":"string"}},"required":["summary"],"additionalProperties":False}, max_output_tokens=256)
                    self._send_json(200,{"status":"ok","message":"Claude Script Director terhubung. Respons uji: "+str(result.get("summary",""))[:100]})
                except Exception as exc:
                    self._send_json(503,{"message":"Uji Claude gagal: "+str(exc)[:400]})
                return

            if path == "/api/providers/test-veo":
                try:
                    cfg=_veo_validate_settings()
                    credentials=_veo_google_credentials()
                    self._send_json(200,{"status":"ok","message":"Kredensial Google Cloud valid dan token berhasil diperoleh. Belum ada klip yang dibuat atau kredit Veo yang digunakan.","projectId":cfg["projectId"],"model":cfg["model"]})
                except Exception as exc:
                    self._send_json(503,{"message":"Pemeriksaan Veo gagal: "+str(exc)[:450]})
                return

            if path == "/api/providers/test-groq":
                key=load_provider_secret("groqApiKey")
                if not key: self._send_json(409,{"message":"Groq API key belum dipasang."}); return
                try:
                    response=requests.post("https://api.groq.com/openai/v1/chat/completions",
                        headers={"Authorization":f"Bearer {key}","Content-Type":"application/json"},
                        json={"model":str(CONFIG.get("groqModel","openai/gpt-oss-20b")),"messages":[{"role":"user","content":"Balas tepat: GROQ SIAP"}],"max_tokens":32,"temperature":0},timeout=(10,45))
                    response.raise_for_status()
                    answer=response.json().get("choices",[{}])[0].get("message",{}).get("content","")
                    self._send_json(200,{"status":"ok","message":"Groq terhubung. Respons uji: "+str(answer)[:100]})
                except Exception as exc: self._send_json(503,{"message":"Uji Groq gagal: "+str(exc)[:300]})
                return

            if path == "/api/providers/test-elevenlabs-tts":
                if not load_provider_secret("elevenLabsApiKey"):
                    self._send_json(409,{"message":"ElevenLabs API Key belum dipasang."}); return
                if not configured_elevenlabs_voice_for_channel("bible-stories-3d"):
                    self._send_json(409,{"message":"Voice ID utama atau Voice ID Bible Stories 3D belum diatur."}); return
                try:
                    test_path=OUTPUT_DIR/"elevenlabs-speech-test.wav"
                    info=elevenlabs_speech_to_wav("Halo, ini adalah uji suara narator Bahasa Indonesia dari AI Content Factory.",test_path,"bible-stories-3d")
                    self._send_json(200,{"status":"ok","voice":info,"message":"ElevenLabs berhasil membuat audio uji Bahasa Indonesia. Penggunaan karakter dihitung ke kuota akun Anda."})
                except Exception as exc: self._send_json(503,{"message":"Uji ElevenLabs gagal: "+str(exc)[:400]})
                return

            if path == "/api/providers/test-comfyui":
                status=comfyui_status()
                if not status.get("online"):
                    self._send_json(409,{"status":"offline","message":"ComfyUI belum aktif pada alamat lokal yang ditentukan.","details":status}); return
                if status.get("checkpointAvailable") is False:
                    self._send_json(409,{"status":"checkpoint_missing","message":"ComfyUI aktif, tetapi checkpoint yang dipilih belum tersedia.","details":status}); return
                self._send_json(200,{"status":"ok","message":"ComfyUI aktif dan checkpoint tersedia.","details":status})
                return

            if path == "/api/church-shorts/transcribe":
                source_id=str(payload.get("sourceId",""))
                model_size=str(payload.get("modelSize",CONFIG.get("whisperModel","base")))
                if model_size not in ("tiny","base","small"):
                    self._send_json(400,{"message":"Model Whisper yang didukung: tiny, base, atau small."}); return
                if importlib.util.find_spec("faster_whisper") is None:
                    self._send_json(409,{"status":"install_required","message":"Whisper lokal belum dipasang. Jalankan INSTALL-LOCAL-WHISPER.bat, lalu mulai ulang Worker."}); return
                with task_db_connection() as con:
                    con.row_factory=sqlite3.Row
                    source_row=con.execute("SELECT * FROM church_shorts_sources WHERE source_id=? AND owner_uid=?",(source_id,user["uid"])).fetchone()
                if not source_row:
                    self._send_json(404,{"message":"Rekaman tidak ditemukan pada akun ini."}); return
                job_id=uuid.uuid4().hex
                now=time.time()
                with task_db_connection() as con:
                    con.execute("INSERT INTO transcription_jobs(job_id,owner_uid,source_id,status,progress,stage,model_size,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                        (job_id,user["uid"],source_id,"queued",0,"Menunggu transkripsi lokal",model_size,now,now))
                threading.Thread(target=run_local_transcription_job,args=(job_id,str(source_row["file_path"]),model_size),daemon=True,name=f"Transcribe-{job_id[:8]}").start()
                self._send_json(202,{"status":"queued","jobId":job_id,"message":"Transkripsi lokal dimulai. Proses menggunakan CPU agar ComfyUI/Ollama tidak berebut VRAM; durasi tergantung panjang rekaman."})
                return

            if path == "/api/church-shorts/source":
                if length <= 0 or length > 2 * 1024 * 1024 * 1024:
                    self._send_json(400,{"message":"File video kosong atau lebih besar dari batas 2 GB."}); return
                query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                filename = safe_upload_filename((query.get("filename") or ["rekaman-ibadah.mp4"])[0])
                source_id = uuid.uuid4().hex
                destination = CHURCH_SHORTS_SOURCE_DIR / f"{source_id[:12]}-{filename}"
                remaining = length
                with destination.open("wb") as target:
                    while remaining > 0:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        if not chunk: break
                        target.write(chunk); remaining -= len(chunk)
                if remaining != 0 or destination.stat().st_size < 1000:
                    destination.unlink(missing_ok=True)
                    self._send_json(400,{"message":"Upload video tidak lengkap atau file terlalu kecil."}); return
                item = create_church_shorts_source(user["uid"], filename, destination)
                self._send_json(201,{"status":"uploaded", **item, "message":"File rekaman ibadah tersimpan di komputer Worker."})
                return
            if path == "/api/video-editor/upload":
                params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                project_id = validate_video_editor_project_id((params.get("projectId") or [""])[0])
                kind = (params.get("kind") or [""])[0]
                filename = (params.get("filename") or [""])[0]
                if length <= 0:
                    self._send_json(400, {"message": "File upload kosong."}); return
                try:
                    result = save_video_editor_upload(user["uid"], project_id, kind, filename, self.rfile, length)
                    self._send_json(201, {"status": "uploaded", **result, "message": f"File {kind} tersimpan secara lokal pada project Video Editor."})
                except ValueError as exc:
                    self._send_json(400, {"message": str(exc)})
                except Exception as exc:
                    log.exception("Upload Video Editor gagal")
                    self._send_json(500, {"message": "Upload Video Editor gagal: " + str(exc)[:400]})
                return

            if path == "/api/video-editor/render":
                project_id = validate_video_editor_project_id(str(payload.get("projectId", "")))
                try:
                    result = render_vertical_video_editor(user["uid"], project_id)
                    self._send_json(200, {"status": "completed", "result": result,
                                          "message": "Video Editor Agent berhasil menyelesaikan render vertikal."})
                except (ValueError, OperationPausedError) as exc:
                    self._send_json(409, {"message": str(exc)})
                except Exception as exc:
                    log.exception("Render Video Editor gagal")
                    self._send_json(503, {"message": "Render Video Editor gagal: " + str(exc)[:900]})
                return

            if path == "/api/bible/local-source/import":
                if length <= 0 or length > 20 * 1024 * 1024:
                    self._send_json(400,{"message":"File JSON kosong atau melebihi batas 20 MB."})
                    return
                content_type = self.headers.get("Content-Type", "").split(";",1)[0].strip().lower()
                if content_type not in ("application/json", "application/octet-stream", "text/json"):
                    self._send_json(415,{"message":"Kirim file sebagai application/json."})
                    return
                raw_bytes = self.rfile.read(length)
                source_name = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("filename",["Alkitab JSON"])[0]
                query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                terms_acknowledged = (query.get("termsAcknowledged",["0"])[0] == "1")
                if not terms_acknowledged:
                    self._send_json(409,{"status":"terms_not_acknowledged","message":"Baca keterangan hak penggunaan pada metadata file, lalu centang pengakuan sebelum mengunggah sumber untuk produksi."})
                    return
                report = import_local_bible_json(raw_bytes, source_name)
                CONFIG["localBibleTermsAcknowledged"] = terms_acknowledged
                CONFIG["localBibleSourceName"] = str(source_name)[:180]
                CONFIG_FILE.write_text(json.dumps(CONFIG,indent=2),encoding="utf-8")
                queued_after_import = 0
                queue_warnings = []
                if terms_acknowledged:
                    for pending_series in db_list_bible_series(user["uid"],50):
                        if pending_series.get("autoQueue") and pending_series.get("status") == "planned":
                            try:
                                queued_after_import += queue_bible_series_episodes(pending_series["series_id"],user["uid"])["queued"]
                            except Exception as queue_error:
                                queue_warnings.append(str(queue_error)[:500])
                self._send_json(200,{"status":"imported","report":report,"termsAcknowledged":terms_acknowledged,
                    "queuedEpisodes":queued_after_import,"queueWarnings":queue_warnings,
                    "message":"JSON lokal berhasil diimpor dan divalidasi. Teks tetap tersimpan hanya di komputer ini; periksa laporan cakupan sebelum memasukkan episode ke antrean."})
                log.info("Sumber Alkitab JSON diunggah oleh workspace %s: %s",user["uid"],source_name)
                return
            if path not in early_json_paths:
                if length <= 0 or length > 100000:
                    self._send_json(400, {"message": "Isi permintaan kosong atau terlalu besar."})
                    return
                try:
                    payload = json.loads(self.rfile.read(length).decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                    self._send_json(400, {"message": "Format JSON permintaan tidak valid: " + str(exc)[:180]})
                    return

            if path == "/api/bible/series/plan":
                assert_working_day()
                try: require_ollama_ready()
                except RuntimeError as exc: self._send_json(409,{"message":str(exc)}); return
                channel_id=str(payload.get("channelId","")); scope_type=str(payload.get("scopeType",""))
                if channel_id not in CHANNELS: self._send_json(400,{"message":"Channel tujuan tidak dikenal."}); return
                selected,scope_label,scope_id=bible_scope_books(scope_type,str(payload.get("groupId","")),str(payload.get("bookId","")),payload.get("selectedBookIds") or [])
                auto_queue = payload.get("autoQueue", True)
                if not isinstance(auto_queue, bool): auto_queue = True
                normalized={"scopeType":scope_type,"channelId":channel_id,"title":str(payload.get("title") or f"Seri {scope_label}")[:160],
                            "durationSeconds":max(20,min(60,int(payload.get("durationSeconds",45)))),"audience":str(payload.get("audience","Keluarga dan semua umur"))[:120],"autoQueue":auto_queue}
                series_id=db_create_bible_series(user["uid"],normalized,selected,scope_label,scope_id)
                thread=threading.Thread(target=run_bible_series_planner,args=(series_id,user["uid"],normalized,selected),daemon=True,name=f"BibleSeries-{series_id[:8]}")
                thread.start()
                self._send_json(202,{"status":"planning","seriesId":series_id,"totalBooks":len(selected),"scopeLabel":scope_label,"message":f"Ollama lokal mulai menyusun daftar episode untuk {len(selected)} kitab. Proses berjalan bertahap dan dapat dilanjutkan setelah jeda operasional."})
                return

            if path == "/api/bible/series/resume":
                assert_working_day()
                series_id=str(payload.get("seriesId","")); series=db_get_bible_series(series_id,user["uid"])
                if not series: self._send_json(404,{"message":"Seri tidak ditemukan."}); return
                if series["status"] not in ("paused","paused_quota","partial","failed"): self._send_json(409,{"message":"Seri belum membutuhkan proses lanjut."}); return
                selected=[BIBLE_BOOK_INDEX[bid] for bid in series.get("selectedBookIds",[]) if bid in BIBLE_BOOK_INDEX]
                db_update_bible_series(series_id,user["uid"],status="planning",error_message="")
                normalized={"scopeType":series["scope_type"],"channelId":series["channel_id"],"title":series["title"],"durationSeconds":series["target_duration_seconds"],"audience":series["audience"],"autoQueue":series.get("autoQueue",True)}
                threading.Thread(target=run_bible_series_planner,args=(series_id,user["uid"],normalized,selected),daemon=True,name=f"BibleSeriesResume-{series_id[:8]}").start()
                self._send_json(202,{"status":"planning","seriesId":series_id,"message":"Perencanaan dilanjutkan dari kitab yang belum selesai."})
                return

            if path == "/api/bible/series/queue":
                series_id=str(payload.get("seriesId","")); raw_ids=payload.get("episodeIds")
                if raw_ids is not None and (not isinstance(raw_ids,list) or len(raw_ids)>500): self._send_json(400,{"message":"Daftar episode tidak valid."}); return
                try:
                    queued=queue_bible_series_episodes(series_id,user["uid"],raw_ids)
                except BibleQueueBlockedError as exc:
                    self._send_json(409,{
                        "status":"blocked", "code":exc.code, "message":str(exc),
                        "blockedCount":len(exc.blocked), "blockedReferences":exc.blocked[:20],
                        "tasksCreated":0
                    })
                    return
                except RuntimeError as exc:
                    # Preconditions such as the weekly pause or a source/license
                    # gate are not server crashes; report them as actionable conflicts.
                    self._send_json(409,{"status":"blocked","code":"QUEUE_PRECONDITION_FAILED","message":str(exc),"tasksCreated":0})
                    return
                except ValueError as exc:
                    self._send_json(409,{"status":"blocked","code":"QUEUE_STATE_INVALID","message":str(exc),"tasksCreated":0})
                    return
                self._send_json(202,{"status":"queued","seriesId":series_id,**queued,"message":f"{queued['queued']} episode masuk antrean produksi. Semua diproses berurutan, satu render pada satu waktu."})
                return

            if path == "/api/youtube/cancel":
                channel_key = str(payload.get("channelId", ""))
                if channel_key not in CHANNELS:
                    self._send_json(400, {"message": "Channel ID tidak dikenal."}); return
                with connections_lock:
                    current = dict(connections.get(channel_key) or {})
                    if current.get("ownerUid") != user["uid"]:
                        self._send_json(404, {"message": "Koneksi channel tidak ditemukan pada workspace ini."}); return
                    active = active_flows.get(channel_key)
                    if not active:
                        self._send_json(409, {"message": "Tidak ada proses login aktif untuk channel ini."}); return
                    if active.get("ownerUid") != user["uid"]:
                        self._send_json(403, {"message": "Proses OAuth dimiliki workspace lain."}); return
                    active_flows.pop(channel_key, None)
                    current.update({
                        "status": "cancelled",
                        "message": "Proses login dibatalkan. Kamu dapat memulai koneksi baru.",
                        "updatedAt": int(time.time()),
                    })
                    current.pop("flowId", None)
                    connections[channel_key] = current
                    save_connections()
                self._send_json(200, {
                    "status": "cancelled",
                    "message": "Proses login dibatalkan. Jika halaman Google lama masih terbuka, tutup halaman tersebut."
                })
                return

            if path == "/api/setup/ollama-test":
                status = ollama_status()
                if not status.get("online") or not status.get("modelAvailable"):
                    self._send_json(409,{"status":"not_ready", **status}); return
                try:
                    test = call_ollama_json('Kembalikan JSON tepat: {"ok":true,"message":"Ollama siap"}.', 128)
                    self._send_json(200,{"status":"configured", "provider":"Ollama lokal", "model":status["model"], "test":test,
                                         "message":"Ollama dan model lokal berhasil diuji. Tidak ada API Key AI cloud yang diperlukan."})
                except Exception as exc:
                    self._send_json(503,{"status":"test_failed","message":str(exc)})
                return

            if path == "/api/church-shorts/clip":
                try:
                    clip = create_church_shorts_clip(user["uid"], payload)
                    self._send_json(201,{"status":"created", **clip})
                except (ValueError, OperationPausedError) as exc:
                    self._send_json(409,{"status":"blocked","message":str(exc)})
                return

            if path == "/api/church-shorts/metadata":
                try:
                    metadata = generate_church_shorts_metadata(payload)
                    self._send_json(200,{"status":"generated","metadata":metadata})
                except (ValueError, OperationPausedError) as exc:
                    self._send_json(409,{"status":"blocked","message":str(exc)})
                except Exception as exc:
                    self._send_json(503,{"message":str(exc)})
                return

            if path == "/api/church-shorts/upload":
                clip_id = str(payload.get("clipId", ""))
                privacy = str(payload.get("privacyStatus", "private"))
                try:
                    uploaded = upload_church_shorts_clip(clip_id,user["uid"],privacy)
                    self._send_json(200,{"status":"uploaded","upload":uploaded,"message":"Potongan ibadah berhasil diunggah ke YouTube."})
                except Exception as exc:
                    self._send_json(409,{"status":"upload_blocked","message":str(exc)})
                return

            if path == "/api/workforce/settings":
                auto_daily = bool(payload.get("autoDailyProduction", False))
                daily_hour = int(payload.get("dailyHour", 6))
                auto_upload = bool(payload.get("autoUploadAfterQC", False))
                auto_analytics = bool(payload.get("autoAnalyticsSync", False))
                include_monetary = bool(payload.get("includeMonetaryAnalytics", CONFIG.get("includeMonetaryAnalytics", False)))
                privacy = str(payload.get("privacyStatus", "private"))
                pause_enabled = bool(payload.get("sundayPauseEnabled", True))
                pause_start = int(payload.get("sundayPauseStart", 6))
                pause_end = int(payload.get("sundayPauseEnd", 15))
                if daily_hour < 0 or daily_hour > 23 or privacy not in ("private", "unlisted", "public") or not (0 <= pause_start < 24 and 0 < pause_end <= 24 and pause_start < pause_end):
                    self._send_json(400, {"message":"Pengaturan jam kerja atau visibilitas upload tidak valid."}); return
                CONFIG["autoDailyProduction"] = auto_daily
                CONFIG["dailyHour"] = daily_hour
                CONFIG["operationalMode"] = "local_ollama"
                CONFIG["dailyPerChannel"] = 1
                CONFIG["autoUploadAfterQC"] = auto_upload
                CONFIG["autoAnalyticsSync"] = auto_analytics
                CONFIG["includeMonetaryAnalytics"] = include_monetary
                CONFIG["privacyStatus"] = privacy
                CONFIG["sundayPauseEnabled"] = pause_enabled
                CONFIG["sundayPauseStart"] = pause_start
                CONFIG["sundayPauseEnd"] = pause_end
                CONFIG_FILE.write_text(json.dumps(CONFIG, indent=2), encoding="utf-8")
                ai = ollama_status()
                self._send_json(200, {"status":"saved", "message":"Pengaturan tersimpan. Mesin AI lokal menggunakan Ollama. Istirahat Minggu 06.00–15.00 WIB; antrean dilanjutkan otomatis setelah pukul 15.00.", "settings":{
                    "autoDailyProduction":auto_daily,"dailyHour":daily_hour,"operationalMode":"local_ollama","autoUploadAfterQC":auto_upload,
                    "autoAnalyticsSync":auto_analytics,"includeMonetaryAnalytics":include_monetary,"privacyStatus":privacy,
                    "sundayPauseEnabled":pause_enabled,"sundayPauseStart":pause_start,"sundayPauseEnd":pause_end,
                    "ttsProvider":"elevenlabs","imageProvider":str(CONFIG.get("imageProvider","hybrid")),"ollama":ai,
                    "providers":provider_status_payload()},"reauthorizationRequired":include_monetary})
                return

            if path == "/api/workforce/start":
                assert_working_day()
                try: require_ollama_ready()
                except RuntimeError as exc: self._send_json(409, {"message":str(exc)}); return
                channel_key = str(payload.get("channelId", ""))
                title = str(payload.get("title", "")).strip()
                if channel_key not in CHANNELS or not title or len(title) > 120:
                    self._send_json(400, {"message":"Channel atau judul konten tidak valid."}); return
                normalized = {
                    "jobId": str(payload.get("jobId", ""))[:128],
                    "channelId": channel_key,
                    "title": title,
                    "format": "YouTube Shorts",
                    "notes": str(payload.get("notes", ""))[:2000],
                    "bibleReference": str(payload.get("bibleReference", ""))[:160],
                    "durationSeconds": max(20, min(60, int(payload.get("durationSeconds",45)))),
                    "targetDate": str(payload.get("targetDate", ""))[:10],
                    "autoUploadAfterQC": bool(payload.get("autoUploadAfterQC", CONFIG.get("autoUploadAfterQC", False))),
                    "privacyStatus": str(payload.get("privacyStatus", CONFIG.get("privacyStatus", "private"))),
                    "madeForKids": bool(payload.get("madeForKids", channel_key == "bible-stories-3d")),
                    "visualMode": str(payload.get("visualMode", CONFIG.get("veoVisualMode", "veo"))) if str(payload.get("visualMode", CONFIG.get("veoVisualMode", "veo"))) in ("veo", "google_flow_manual") else "veo",
                    "aspectRatio": "9:16"
                }
                if normalized["privacyStatus"] not in ("private","unlisted","public"):
                    normalized["privacyStatus"]="private"
                task_id=db_create_task(user["uid"], normalized)
                self._send_json(202, {"status":"queued","taskId":task_id,"message":"Tugas masuk antrean. Sepuluh peran AI akan bekerja secara berurutan; hanya satu proses render berjalan pada satu waktu."})
                return

            if path == "/api/workforce/upload":
                task_id = str(payload.get("taskId", ""))
                privacy = str(payload.get("privacyStatus", "private"))
                manual_override = bool(payload.get("manualOverride", False))
                uploaded = upload_video_for_task(task_id, user["uid"], privacy, manual_override=manual_override)
                message = "Video berhasil diunggah setelah persetujuan manual pemilik." if manual_override else "Video berhasil dikirim ke YouTube."
                self._send_json(200, {"status":"uploaded", "upload":uploaded, "message":message})
                return

            if path == "/api/analytics/sync":
                assert_working_day()
                channel_key = str(payload.get("channelId", ""))
                days = int(payload.get("days") or 30)
                if days not in (1, 7, 28, 30, 90):
                    self._send_json(400, {"message": "Rentang Analytics yang didukung adalah 1, 7, 30, atau 90 hari."}); return
                analytics_result = sync_youtube_analytics(channel_key, user["uid"], days)
                self._send_json(200, {"status": "synced", "analytics": analytics_result,
                                      "message": f"Analytics {CHANNELS[channel_key]} berhasil diambil."})
                log.info("YouTube Analytics disinkronkan: %s oleh workspace %s", channel_key, user["uid"])
                return

            if path == "/api/setup/oauth-client":
                client_doc = validate_desktop_client(payload.get("clientConfig"), payload.get("expectedClientId", ""))
                store_oauth_client_file(client_doc)
                client_id = client_doc["installed"]["client_id"]
                self._send_json(200, {
                    "status": "saved",
                    "clientId": client_id,
                    "message": "File OAuth Desktop berhasil dipasang secara lokal dan dilindungi Windows DPAPI.",
                })
                log.info("OAuth Desktop config dipasang oleh workspace %s", user["uid"])
                return

            channel_key = payload.get("channelId", "")
            channel_name = payload.get("channelName", CHANNELS.get(channel_key, ""))
            client_id = payload.get("clientId", "")
            if channel_key not in CHANNELS:
                self._send_json(400, {"message": "Channel ID tidak dikenal."})
                return
            if channel_name != CHANNELS[channel_key]:
                self._send_json(400, {"message": "Nama channel tidak sesuai dengan konfigurasi aplikasi."})
                return
            if not CLIENT_ID_PATTERN.fullmatch(client_id):
                self._send_json(400, {"message": "OAuth Client ID tidak valid."})
                return
            if not (SECRETS_DIR / "desktop-oauth-client.dpapi").exists():
                self._send_json(409, {"message": "File OAuth Desktop belum dipasang. Buka Pengaturan dan pilih file JSON OAuth Desktop."})
                return
            expire_stale_oauth_flow(channel_key)
            flow_id = uuid.uuid4().hex
            with connections_lock:
                active = active_flows.get(channel_key)
                if active:
                    age = max(0, int(time.time() - float(active.get("startedAt", time.time()))))
                    self._send_json(409, {
                        "message": (
                            f"Proses login untuk {channel_name} masih berjalan ({age} detik). "
                            "Selesaikan jendela Google atau gunakan tombol Batalkan Login sebelum mencoba akun lain."
                        )
                    })
                    return
                active_flows[channel_key] = {
                    "flowId": flow_id, "ownerUid": user["uid"], "startedAt": time.time()
                }
                connections[channel_key] = {
                    "channelKey": channel_key,
                    "status": "connecting",
                    "ownerUid": user["uid"],
                    "flowId": flow_id,
                    "startedAt": int(time.time()),
                    "message": "Menunggu persetujuan akun Google.",
                    "updatedAt": int(time.time()),
                }
                save_connections()
            thread = threading.Thread(
                target=run_channel_oauth,
                args=(channel_key, channel_name, client_id, user["uid"], flow_id),
                daemon=True,
            )
            thread.start()
            self._send_json(202, {
                "status": "connecting",
                "message": f"Membuka proses login Google untuk {channel_name}. Pilih Gmail pemilik channel tersebut.",
            })
        except OperationPausedError as exc:
            self._send_json(409, {"status":"paused","code":"SUNDAY_REST_WINDOW","message":str(exc)})
        except PermissionError as exc:
            self._send_json(401, {"message": str(exc)})
        except (ValueError, json.JSONDecodeError) as exc:
            self._send_json(400, {"message": str(exc) or "Format JSON tidak valid."})
        except Exception as exc:
            log.exception("Permintaan worker gagal")
            self._send_json(500, {"message": str(exc)})


def notify_error(message: str) -> None:
    log.exception(message)
    if os.name == "nt":
        try:
            ctypes.windll.user32.MessageBoxW(None, message, "AI Content Factory", 0x10)
        except Exception:
            pass


def startup_dashboard_url() -> str:
    # First-run owner pairing must happen from loopback; after pairing, open Netlify.
    return f"http://localhost:{PORT}/" if not str(CONFIG.get("ownerUid") or "").strip() else DASHBOARD_URL


def is_existing_worker() -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=1.5) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data.get("service") == "AI Content Factory Windows App"
    except Exception:
        return False


def main() -> None:
    if is_existing_worker():
        webbrowser.open(startup_dashboard_url())
        return
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
        server.daemon_threads = True
        server_thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.5}, daemon=True)
        server_thread.start()
        start_workforce_background_services()
        dashboard_url = startup_dashboard_url()
        log.info("AI Content Factory %s berjalan di %s", APP_VERSION, dashboard_url)
        log.info("Data lokal disimpan di %s", LOCAL_APP_DATA)
        time.sleep(0.4)
        webbrowser.open(dashboard_url)

        # A small native controller window keeps the local service visible and easy to stop.
        try:
            import tkinter as tk
            from tkinter import messagebox

            root = tk.Tk()
            root.title("AI Content Factory")
            root.geometry("440x220")
            root.resizable(False, False)
            root.configure(bg="#101827")
            title = tk.Label(root, text="AI Content Factory berjalan", bg="#101827", fg="#FFFFFF", font=("Segoe UI", 15, "bold"))
            title.pack(pady=(22, 8))
            subtitle = tk.Label(root, text="Dashboard telah dibuka di browser. Biarkan jendela ini tetap aktif saat menggunakan koneksi YouTube.", bg="#101827", fg="#C7D2E0", wraplength=390, justify="center", font=("Segoe UI", 9))
            subtitle.pack(padx=20, pady=4)
            status = tk.Label(root, text=f"Worker lokal: 127.0.0.1:{PORT}", bg="#101827", fg="#75D69C", font=("Segoe UI", 9, "bold"))
            status.pack(pady=8)

            def open_dashboard():
                webbrowser.open(dashboard_url)

            def stop_app():
                if messagebox.askyesno("Tutup AI Content Factory", "Tutup dashboard lokal dan Windows Worker sekarang?"):
                    root.destroy()

            buttons = tk.Frame(root, bg="#101827")
            buttons.pack(pady=8)
            tk.Button(buttons, text="Buka Dashboard", command=open_dashboard, width=17).pack(side="left", padx=6)
            tk.Button(buttons, text="Tutup Aplikasi", command=stop_app, width=17).pack(side="left", padx=6)
            root.protocol("WM_DELETE_WINDOW", stop_app)
            root.mainloop()
        except Exception:
            log.exception("Gagal membuka jendela kontrol; worker tetap berjalan di console.")
            while server_thread.is_alive():
                time.sleep(1)
        finally:
            WORKER_STOP.set()
            server.shutdown()
            server.server_close()
    except OSError as exc:
        notify_error(f"Tidak dapat menjalankan AI Content Factory pada port {PORT}. Pastikan port tersebut tidak sedang digunakan. Detail: {exc}")
    except Exception as exc:
        notify_error(f"AI Content Factory gagal dijalankan: {exc}")


if __name__ == "__main__":
    main()

"""Edge-TTS endpoint for the Kantor AI 3D Windows Production Worker.

Install:
    py -m pip install edge-tts fastapi uvicorn firebase-admin

Run:
    set FIREBASE_PROJECT_ID=kantor-ai-agent-creator
    set FIREBASE_ALLOWED_UIDS=YOUR_FIREBASE_OWNER_UID
    set GOOGLE_APPLICATION_CREDENTIALS=C:\secure\kantor-ai-firebase-admin.json
    py worker_edge_tts.py

To mount into an existing FastAPI application:
    from worker_edge_tts import router as edge_tts_router
    app.include_router(edge_tts_router)
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import edge_tts
import firebase_admin
from fastapi import APIRouter, FastAPI, HTTPException, Request
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials
from starlette.responses import JSONResponse, Response

LOGGER = logging.getLogger("kantor-ai-edge-tts")
PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "kantor-ai-agent-creator").strip()
ALLOWED_UIDS = {
    value.strip()
    for value in os.getenv("FIREBASE_ALLOWED_UIDS", "").split(",")
    if value.strip()
}
ALLOWED_VOICES = {
    "id-ID-ArdiNeural",
    "id-ID-GadisNeural",
    "en-US-AndrewNeural",
    "en-US-AriaNeural",
}
DEFAULT_ORIGINS = {
    "https://officecontent.netlify.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}
ALLOWED_ORIGINS = {
    value.strip().rstrip("/")
    for value in os.getenv("KANTOR_AI_ALLOWED_ORIGINS", "").split(",")
    if value.strip()
} or DEFAULT_ORIGINS

router = APIRouter()


def ensure_firebase_admin() -> firebase_admin.App:
    try:
        return firebase_admin.get_app()
    except ValueError:
        credential_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        credential = (
            credentials.Certificate(credential_path)
            if credential_path
            else credentials.ApplicationDefault()
        )
        return firebase_admin.initialize_app(credential, options={"projectId": PROJECT_ID})


def get_bearer_token(request: Request) -> str:
    match = re.fullmatch(
        r"Bearer\s+(.+)",
        request.headers.get("Authorization", ""),
        flags=re.IGNORECASE,
    )
    if not match:
        raise HTTPException(status_code=401, detail="Firebase ID Token diperlukan.")
    return match.group(1).strip()


async def verify_owner(request: Request) -> dict[str, Any]:
    if not ALLOWED_UIDS:
        raise HTTPException(
            status_code=503,
            detail="Worker belum dikunci ke pemilik. Isi FIREBASE_ALLOWED_UIDS terlebih dahulu.",
        )
    token = get_bearer_token(request)
    try:
        decoded = await asyncio.to_thread(
            firebase_auth.verify_id_token,
            token,
            app=ensure_firebase_admin(),
            check_revoked=True,
        )
    except Exception as exc:
        LOGGER.warning("Firebase token verification failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=401,
            detail="Firebase ID Token tidak valid atau kedaluwarsa.",
        ) from exc

    uid = decoded.get("uid")
    if not isinstance(uid, str) or uid not in ALLOWED_UIDS:
        raise HTTPException(status_code=403, detail="Akun Firebase ini tidak diizinkan memakai Worker.")
    return decoded


def validate_rate(value: Any) -> str:
    raw = value if isinstance(value, str) else "-5%"
    if not re.fullmatch(r"[+-]?(?:0|[1-2]?\d|30)%", raw):
        raise HTTPException(status_code=400, detail="Rate harus berada pada rentang -30% sampai +30%.")
    number = int(raw[:-1])
    if not -30 <= number <= 30:
        raise HTTPException(status_code=400, detail="Rate harus berada pada rentang -30% sampai +30%.")
    return raw if raw[0] in "+-" else f"+{raw}"


def validate_pitch(value: Any) -> str:
    raw = value if isinstance(value, str) else "+0Hz"
    if not re.fullmatch(r"[+-]?(?:0|[1]?\d|20)Hz", raw):
        raise HTTPException(status_code=400, detail="Pitch harus berada pada rentang -20Hz sampai +20Hz.")
    number = int(raw[:-2])
    if not -20 <= number <= 20:
        raise HTTPException(status_code=400, detail="Pitch harus berada pada rentang -20Hz sampai +20Hz.")
    return raw if raw[0] in "+-" else f"+{raw}"


def safe_file_stem(job_id: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "-", job_id).strip("-_")
    return (cleaned or "narasi")[:80]


async def synthesize_segment(text: str, voice: str, rate: str, pitch: str, output_path: Path) -> None:
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(str(output_path))


def assemble_mp3(segment_paths: list[Path], pauses: list[int], output_path: Path) -> None:
    if len(segment_paths) == 1:
        shutil.copyfile(segment_paths[0], output_path)
        return

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError(
            "FFmpeg tidak ditemukan. Pasang FFmpeg dan tambahkan folder bin ke PATH Windows "
            "untuk menggabungkan dialog dan jeda."
        )

    command: list[str] = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y"]
    filter_inputs: list[str] = []
    input_index = 0

    for index, segment_path in enumerate(segment_paths):
        command.extend(["-i", str(segment_path)])
        filter_inputs.append(f"[{input_index}:a]")
        input_index += 1

        if index < len(segment_paths) - 1 and pauses[index] > 0:
            seconds = f"{pauses[index] / 1000:.3f}"
            command.extend([
                "-f", "lavfi", "-t", seconds, "-i",
                "anullsrc=channel_layout=mono:sample_rate=24000",
            ])
            filter_inputs.append(f"[{input_index}:a]")
            input_index += 1

    concat_filter = "".join(filter_inputs) + f"concat=n={len(filter_inputs)}:v=0:a=1[out]"
    command.extend([
        "-filter_complex", concat_filter,
        "-map", "[out]",
        "-c:a", "libmp3lame",
        "-b:a", "128k",
        "-ar", "24000",
        str(output_path),
    ])
    completed = subprocess.run(command, capture_output=True, text=True, timeout=180, check=False)
    if completed.returncode != 0 or not output_path.exists():
        detail = (completed.stderr or "FFmpeg gagal menggabungkan audio.")[-600:]
        raise RuntimeError(detail)


@router.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": "kantor-ai-edge-tts", "provider": "edge-tts"}


@router.post("/api/audio/generate")
async def generate_audio(request: Request) -> JSONResponse:
    await verify_owner(request)
    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Payload JSON tidak dapat dibaca.") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Payload harus berupa objek JSON.")

    job_id = payload.get("jobId", "narasi")
    if not isinstance(job_id, str) or not job_id.strip() or len(job_id) > 128:
        raise HTTPException(status_code=400, detail="jobId tidak valid.")

    default_voice = payload.get("voice", "id-ID-ArdiNeural")
    if default_voice not in ALLOWED_VOICES:
        raise HTTPException(status_code=400, detail="Voice default tidak termasuk preset yang diizinkan.")
    rate = validate_rate(payload.get("rate", "-5%"))
    pitch = validate_pitch(payload.get("pitch", "+0Hz"))

    raw_segments = payload.get("segments")
    if not raw_segments:
        raw_text = payload.get("text")
        if not isinstance(raw_text, str) or not raw_text.strip():
            raise HTTPException(status_code=400, detail="Isi minimal satu segmen narasi.")
        raw_segments = [{"role": "narator", "voice": default_voice, "text": raw_text, "pauseMs": 0}]

    if not isinstance(raw_segments, list) or not 1 <= len(raw_segments) <= 100:
        raise HTTPException(status_code=400, detail="Jumlah segmen harus 1–100.")

    segments: list[dict[str, Any]] = []
    total_chars = 0
    for item in raw_segments:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="Format segmen narasi tidak valid.")
        text = item.get("text")
        role = item.get("role", "narator")
        voice = item.get("voice", default_voice)
        pause_ms = item.get("pauseMs", 0)
        if not isinstance(text, str) or not text.strip() or len(text) > 10000:
            raise HTTPException(status_code=400, detail="Teks setiap segmen wajib diisi dan maksimal 10.000 karakter.")
        if not isinstance(role, str) or not role.strip() or len(role) > 50:
            raise HTTPException(status_code=400, detail="Role segmen tidak valid.")
        if voice not in ALLOWED_VOICES:
            raise HTTPException(status_code=400, detail="Voice segmen tidak termasuk preset yang diizinkan.")
        if not isinstance(pause_ms, int) or isinstance(pause_ms, bool) or not 0 <= pause_ms <= 10000:
            raise HTTPException(status_code=400, detail="Jeda antarsegmen harus 0–10.000 milidetik.")
        total_chars += len(text)
        segments.append({"role": role, "voice": voice, "text": text.strip(), "pauseMs": pause_ms})

    if total_chars > 80000:
        raise HTTPException(status_code=400, detail="Total teks narasi maksimal 80.000 karakter.")

    try:
        with tempfile.TemporaryDirectory(prefix="kantor-ai-edge-tts-") as temp_dir:
            temp_path = Path(temp_dir)
            audio_paths: list[Path] = []
            pauses: list[int] = []

            for index, segment in enumerate(segments):
                audio_path = temp_path / f"segment_{index:03d}.mp3"
                await synthesize_segment(segment["text"], segment["voice"], rate, pitch, audio_path)
                if not audio_path.exists() or audio_path.stat().st_size == 0:
                    raise RuntimeError(f"Edge-TTS tidak menghasilkan audio pada segmen {index + 1}.")
                audio_paths.append(audio_path)
                if index < len(segments) - 1:
                    pauses.append(segment["pauseMs"])

            output_path = temp_path / "narration.mp3"
            assemble_mp3(audio_paths, pauses, output_path)
            audio_base64 = base64.b64encode(output_path.read_bytes()).decode("ascii")

        return JSONResponse({
            "ok": True,
            "jobId": job_id,
            "provider": "Edge-TTS",
            "mimeType": "audio/mpeg",
            "fileName": f"{safe_file_stem(job_id)}-narasi.mp3",
            "audioBase64": audio_base64,
            "segmentCount": len(segments),
            "characterCount": total_chars,
        })
    except HTTPException:
        raise
    except subprocess.TimeoutExpired as exc:
        LOGGER.exception("FFmpeg timeout while assembling Edge-TTS audio.")
        raise HTTPException(status_code=504, detail="Proses penggabungan audio melewati batas waktu.") from exc
    except Exception as exc:
        LOGGER.exception("Edge-TTS generation failed.")
        raise HTTPException(status_code=502, detail=f"Gagal membuat audio Edge-TTS: {str(exc)[:500]}") from exc


app = FastAPI(title="Kantor AI 3D · Edge-TTS Worker")
app.include_router(router)


@app.middleware("http")
async def cors_and_private_network(request: Request, call_next):
    origin = request.headers.get("origin", "").rstrip("/")
    if origin and origin not in ALLOWED_ORIGINS:
        return JSONResponse({"error": "Origin tidak diizinkan oleh Windows Worker."}, status_code=403)

    if request.method == "OPTIONS":
        response = Response(status_code=204)
    else:
        response = await call_next(request)

    if origin and origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Max-Age"] = "600"
        if request.headers.get("access-control-request-private-network") == "true":
            response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("KANTOR_AI_WORKER_HOST", "127.0.0.1")
    port = int(os.getenv("KANTOR_AI_WORKER_PORT", "8765"))
    uvicorn.run(app, host=host, port=port)

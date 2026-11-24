## v1.6.5 — Claude Story Director + Veo 3.1 + actual voice timeline

- Claude API menjadi penulis naskah utama dan Story Director dengan JSON Schema output untuk naskah, storyboard, character bible, prompt video dan segmen narasi yang berurutan.
- ElevenLabs tetap menjadi satu-satunya Voice Artist. Alignment karakter aktual menjadi sumber timeline adegan dan subtitle; fallback proporsional ditandai ketika pencocokan teks tidak memadai.
- Google Veo 3.1 melalui Vertex AI menghasilkan video-only portrait 9:16 (720p/1080p) memakai referensi karakter dan output Google Cloud Storage.
- Antrean visual Veo diserialkan untuk satu project aktif, dengan anggaran harian estimasi, batas total klip kumulatif per project, pencatatan biaya, serta stop-on-quota.
- Google Flow ditambahkan sebagai jalur semi-manual: MP4 per adegan diimpor ke task yang sama, diperiksa signature/durasi, lalu dirakit FFmpeg.
- Perbaikan QC: bila naskah diperbarui, voice-over dan alignment terbaru dibuat terlebih dahulu sebelum klip visual diregenerasi.
- Perbaikan atribusi editorial: Claude Script Director dicatat sebagai provider penulis; Ollama tetap digunakan untuk riset, Guardian, QC dan SEO.
- Semua video cerita dirender 9:16, 720×1280, 30fps; fitur dan data versi v1.6.4 dipertahankan.

## v1.6.4 — ElevenLabs Voice Artist

- Mengganti Voice Artist menjadi ElevenLabs sebagai satu-satunya provider Text-to-Speech Bahasa Indonesia.
- Menambahkan model Eleven v4 (default) dan Eleven Multilingual v2 untuk narasi panjang.
- Menambahkan API Key dan Voice ID global serta override Voice ID per channel.
- Menambahkan tombol langsung ke halaman API Keys dan Voice Library ElevenLabs.
- API Key disimpan terenkripsi menggunakan Windows DPAPI pada Worker lokal; status API tidak pernah mengembalikan nilai key.
- Menambahkan uji narator melalui API ElevenLabs dan konversi audio MP3 menjadi WAV PCM untuk pipeline FFmpeg.
- Mendukung naskah panjang dengan pemecahan otomatis pada batas kalimat (maksimal sekitar 9.000 karakter per request) dan penggabungan hasil ke satu WAV; permintaan diproses berurutan.
- Menghentikan fallback diam-diam ke Azure Speech/Windows Speech; jika key, Voice ID, kredit, atau API bermasalah, pekerjaan menampilkan error yang jelas.
- Mempertahankan Groq, ComfyUI, Whisper, Bible Series, Guardian, Church Shorts, Video Editor, dashboard Netlify, dan Tailscale Worker tunnel.

## v1.6.3 — Netlify Dashboard + Secure Local Worker Tunnel

- Menjadikan `https://officecontent.netlify.app/` alamat dashboard produksi.
- Menambahkan pengaturan URL HTTPS Worker yang dapat disimpan per browser; URL remote dibatasi ke host Tailscale `*.ts.net`.
- Menambahkan skrip Windows untuk menyalakan/mematikan Tailscale Funnel ke Worker loopback `127.0.0.1:8765`.
- Mempertahankan Worker hanya pada loopback; tidak perlu membuka port router atau mengekspos Ollama/ComfyUI.
- Memverifikasi Firebase Google ID token untuk semua endpoint API jarak jauh dan health check jarak jauh.
- Mengunci Worker ke satu UID Firebase pemilik melalui login loopback pertama; akun lain ditolak.
- Menggunakan origin Netlify produksi eksplisit, menjaga allowlist origin dan dukungan preview Cloudflare Pages yang sudah ada.
- Menyertakan paket dashboard terpisah untuk deploy Netlify dan panduan setup.


## v1.6.2 — Reliability and upload-safety patch

- Firestore: allow optional `operationalMode` in office settings and register all 13 UI agents plus Guardian task types.
- Dashboard: remove incompatible default `operationalMode`, align 13-agent mappings, include GKIN Hosiana selectors, clear Bible Series polling, expose QC blockers and owner-confirmed manual upload.
- Analytics: avoid PointerEvent being passed as `daysOverride`, use dynamic channel counts, parse empty `days` safely and select the matching YouTube channel ID.
- Worker: use `localhost` for browser login, allow Cloudflare Pages origins, preserve repaired Bible JSON payloads, increase Ollama context, use POSIX concat paths, combine Video Editor pass-2 filters, report real FFmpeg capabilities, distinguish Guardian fatal errors from manual notes, and gate manual override by technical media checks plus Guardian non-rejection.
- Automatic upload continues to require full QC; manual override is explicit and owner-confirmed.
# Changelog v1.6.1

Riwayat v1.6.0 dan versi sebelumnya dipertahankan di bawah.

## v1.6.1 — Video Editor Studio Vertikal
- Menambahkan menu dashboard Video Editor untuk empat bahan media: background, voice-over, subtitle SRT, dan musik.
- Merender 1080×1920, 30 FPS, MP4 H.264/AAC dengan subtitle kuning tebal dan stroke hitam di tengah bawah.
- Menormalkan voice-over, mencampur musik pada volume 10%, serta mengikuti durasi audio yang paling panjang.
- Menggunakan two-pass encoding, batas ukuran 50 MB, isolasi file per akun, dan satu proses render aktif.

## Theological Guardian & Community Edition
- Menambahkan Theological Guardian dengan aturan verifikasi TB, konteks ayat, doktrin, dan penandaan fakta sejarah yang perlu diverifikasi manual.
- Menambahkan Pastoral Sensitivity Checker untuk mendeteksi bahasa yang menghakimi, menakuti berlebihan, merendahkan denominasi, atau membuat janji kesembuhan/mujizat.
- Menambahkan Community / Prayer Manager untuk membuat draf balasan komentar maksimal tiga kalimat.
- Menambahkan menu Guardian & Komunitas, hasil review, dan riwayat lokal SQLite.
- Menjalankan dua Guardian secara otomatis setelah Scriptwriter pada pipeline produksi.
- QC menahan publikasi jika kedua pemeriksaan belum berstatus LULUS. Video masih dapat dirender untuk ditinjau, tetapi tidak dianggap siap dipublikasikan.
- Komentar tidak dibaca dari atau dikirim ke YouTube secara otomatis; pengguna menempel komentar dan meninjau draf.
- Pemeriksaan Alkitab menggunakan TB JSON lokal yang telah diunggah dan ketentuan sumbernya diakui. Tidak ada teks ayat yang dikirim ke cloud.
- Mempertahankan perbaikan v1.5.9: proses FFmpeg/FFprobe tidak membuka jendela CMD anak di Windows dan log tetap ditangkap.

## Catatan
- Hasil AI merupakan pemeriksaan awal, bukan pengesahan teologis/pastoral. Editor manusia tetap bertanggung jawab.
- Jika TB JSON tidak tersedia atau referensi tidak dapat dicocokkan, status menjadi PERLU REVISI / verifikasi manual.

## v1.6.1 — Vertical Video Editor Studio
- Added a dedicated dashboard Video Editor for background video, voice-over, SRT subtitles, and background music.
- Renders portrait 1080×1920 at 30 FPS, H.264/AAC MP4, with yellow bold bottom-center subtitles outlined in black.
- Normalizes narration, mixes music at 10%, loops background/music as needed, and uses the longer of voice/music durations.
- Uses two-pass encoding with a safety margin and rejects final output at or above 50,000,000 bytes.
- Adds owner-isolated local project storage, single-render lock, protected upload/download endpoints, and FFmpeg no-console execution.
- Preserves the existing AI Workforce Shorts pipeline, Church Shorts tools, Bible Series, and Guardian agents.

## v1.6.3 — Netlify + Secure Worker Tunnel
- Dashboard production fixed to https://officecontent.netlify.app.
- Added browser-side Worker HTTPS base URL setting and connectivity test.
- Added Tailscale Funnel start/stop scripts and setup guide.
- CORS now explicitly allowlists the production Netlify origin and configured local origins.
- Remote API and /health requests require a verified Firebase Google ID token; worker dashboard is loopback-only.
- Kept the Worker bound to 127.0.0.1 and preserved all v1.6.2 features.

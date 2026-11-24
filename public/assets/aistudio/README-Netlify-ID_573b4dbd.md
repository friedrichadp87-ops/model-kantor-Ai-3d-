# AI Content Factory v1.6.5 — Netlify Dashboard + Windows Worker

Dashboard resmi: https://officecontent.netlify.app/

## Arsitektur

- Dashboard statis dilayani Netlify.
- Python Worker, Ollama, ComfyUI, ElevenLabs connector, Claude Script Director connector, Veo connector, SQLite, FFmpeg, Whisper, token YouTube dan media workspace tetap berada pada komputer Windows pemilik.
- Browser mengirim request ke Worker melalui Tailscale Funnel HTTPS (`*.ts.net`). Worker tetap bind pada `127.0.0.1:8765`, tidak membuka port router.
- Setiap API Worker jarak jauh memerlukan Firebase Google ID token dan pemeriksaan UID pemilik. Jangan membagikan URL tunnel.

## Deploy dashboard

1. Deploy file `NETLIFY-DEPLOY/index.html` ke site `officecontent`.
2. Tambahkan `officecontent.netlify.app` pada Firebase Authentication → Authorized Domains.
3. Worker harus diperbarui dari paket Complete Source; deploy dashboard saja tidak memperbarui Python Worker.

## Worker dan koneksi

1. Cadangkan `%LOCALAPPDATA%\AIContentFactory`.
2. Hentikan Worker lama, ekstrak source v1.6.5 ke folder baru dan jalankan `RUN-WORKER.bat`.
3. Pada login pertama gunakan akun Google pemilik di `http://localhost:8765`; setelah pairing gunakan dashboard Netlify.
4. Instal Tailscale, aktifkan Funnel pada tailnet, jalankan `START-WORKER-TUNNEL.bat`, lalu salin URL `https://...ts.net` yang ditampilkan.
5. Pada dashboard Netlify → Pengaturan → Mesin AI Lokal & Otomatisasi, simpan URL Worker dan uji koneksi.
6. `STOP-WORKER-TUNNEL.bat` mematikan akses publik sementara Worker lokal dapat tetap hidup.

## Provider AI v1.6.5

- Claude API: naskah dan storyboard otomatis; API key disimpan terenkripsi oleh Worker.
- ElevenLabs: satu-satunya mesin Voice Artist.
- Google Veo 3.1 melalui Google Cloud Vertex AI: memerlukan billing, project, service account, GCS bucket; klip portrait 9:16 dan biaya API terpisah.
- Google Flow: jalur semi-manual; buat klip di website Flow, unduh MP4, lalu impor per adegan ke task.

Jangan mengunggah `worker.py` sebagai Netlify Function. Netlify tetap hanya menyajikan dashboard statis; Worker Python membutuhkan proses Windows yang berjalan terus-menerus.

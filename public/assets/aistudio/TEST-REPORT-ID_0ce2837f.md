# Laporan Pengujian — AI Content Factory v1.6.5

Tanggal pengujian: 21 November 2026  
Basis source: `AI-Content-Factory-v1.6.4-ElevenLabs-Complete-Source.zip` yang tersedia di Library, dengan patch v1.6.5.

## Ringkasan hasil

- **93 tes unit/regresi dijalankan**
- **92 tes lulus**
- **1 tes dilewati** karena file sumber Alkitab `indo_tb.json` milik pengguna tidak tersedia dalam lingkungan build.
- `python -m py_compile worker/worker.py`: PASS.
- JavaScript pada `<script type="module">` diekstrak dan diperiksa menggunakan `node --check` (Node v22.16.0): PASS.
- `node tests/test_v140_dashboard.js`: PASS.
- Pemeriksaan struktural `firestore.rules` (keseimbangan delimiter dan field/Agent yang diwajibkan): PASS.
- `app/index.html` dan `NETLIFY-DEPLOY/index.html` identik: PASS.
- FFmpeg smoke test dengan media sintetis: PASS.
- ZIP integrity dan SHA-256 dihitung ulang setelah paket final dibuat.

## Uji render FFmpeg

Video uji dirakit dari tiga klip sintetis dengan titik potong berdasarkan timeline. Hasil:

- Resolusi: 720 × 1280 (portrait 9:16).
- Frame rate: 30 FPS.
- Durasi: 20,00 detik.
- Video: H.264; audio: AAC.
- Ukuran: 389.557 byte.
- Hasil: PASS.

## Cakupan tes v1.6.5

- Claude Script Director menggunakan Messages API dan structured output JSON Schema.
- Storyboard terstruktur menyimpan 6–8 adegan, character bible, narasi per adegan, prompt Veo, kamera, mood dan komposisi portrait.
- ElevenLabs tetap satu-satunya provider voice-over; timestamp karakter dipakai untuk membangun `story_timeline.json`.
- Adegan disinkronkan dari waktu pengucapan aktual. Fallback proporsional diberi label jika alignment tidak cukup cocok.
- Veo 3.1 mengirim permintaan video-only 9:16, menggunakan gambar referensi karakter, durasi model yang valid, antrean visual satu project, batas klip per project dan guardrail anggaran harian.
- Google Flow mendukung impor MP4 per adegan sebagai jalur manual; Worker tidak mengklaim mengendalikan UI Google Flow secara otomatis.
- FFmpeg menyusun klip berdasarkan timeline, suara ElevenLabs, subtitle dan audio final.
- Jika QC mengharuskan regenerasi, suara/alignment terbaru dibuat sebelum klip visual diminta ulang.
- Registry 13 Agent dan seluruh suite regresi versi sebelumnya dipertahankan.

## Pemeriksaan paket dan kompatibilitas

- Seluruh **46 file** dari arsip sumber v1.6.4 tetap ada.
- Satu file baru ditambahkan: `tests/test_v165_claude_veo_story_director.py`.
- API key Claude, API key ElevenLabs, dan service-account JSON Veo tidak disertakan dalam ZIP.
- Netlify dashboard pada `NETLIFY-DEPLOY/index.html` sama persis dengan `app/index.html`.

## Batas pengujian yang perlu diketahui

- Permintaan Claude, ElevenLabs, dan Veo pada tes unit menggunakan mock/stub. Tidak ada kredit akun atau billing Google Cloud yang digunakan selama pengujian paket.
- Belum dilakukan generasi video Veo live dengan project Google Cloud pemilik.
- Belum dilakukan tes login Firebase/Firestore terhadap project pemilik atau Firebase Rules Emulator.
- Belum dilakukan uji pemasangan dan eksekusi di PC Windows pemilik.
- Belum diuji izin project Google untuk `personGeneration=allow_all`; penggambaran karakter anak dapat memerlukan project allowlist Google.
- Guardrail budget internal adalah estimasi sebelum request, bukan hard cap tagihan Google. Aktifkan Google Cloud Budgets/alerts untuk perlindungan billing tambahan.

## Konfigurasi utama

- Claude model default: `claude-sonnet-5-5`.
- Voice Artist: ElevenLabs only.
- Veo model: `veo-3.1-fast-generate-001` atau `veo-3.1-generate-001`.
- Semua video cerita: portrait 9:16, default 720 × 1280, 30 fps.
- Default guardrail internal: estimasi US$5/hari dan maksimal 16 klip per project; dapat diubah pada pengaturan.
- Satu project visual aktif secara global; adegan dalam project dijalankan secara serial.

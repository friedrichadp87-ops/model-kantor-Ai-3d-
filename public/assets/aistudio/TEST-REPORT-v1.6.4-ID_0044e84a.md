# Laporan Pengujian — AI Content Factory v1.6.4 ElevenLabs Edition

Tanggal: 20 November 2026

## Ringkasan hasil

- Python unit/regression tests: **84 dijalankan, 83 lulus, 1 dilewati**.
- Tes yang dilewati adalah audit file `indo_tb.json` milik pengguna karena file tersebut tidak disertakan di lingkungan build.
- `python -m py_compile worker/worker.py`: **PASS**.
- Ekstraksi dan pemeriksaan sintaks JavaScript pada `<script type="module">` di `app/index.html` dengan `node --check`: **PASS** (2.360 baris modul).
- `node tests/test_v140_dashboard.js`: **PASS**.
- Dashboard `NETLIFY-DEPLOY/index.html` identik dengan `app/index.html`: **PASS**.
- Uji konversi audio MP3 ke WAV PCM memakai FFmpeg: **PASS**.
- Uji pemecahan naskah panjang menjadi potongan <= 9.000 karakter, pemanggilan API tiruan secara berurutan, dan penggabungan WAV: **PASS**.
- Pemeriksaan integritas ZIP dan checksum dijalankan saat pengemasan.

## Cakupan ElevenLabs

1. ElevenLabs ditetapkan sebagai satu-satunya provider aktif untuk Voice Artist.
2. Model default `eleven_v4` dan alternatif `eleven_multilingual_v2`.
3. API Key dikirim melalui HTTPS ke Worker dan disimpan menggunakan Windows DPAPI pada komputer pemilik; kolom dashboard dikosongkan setelah simpan dan status API tidak mengembalikan nilai key.
4. Voice ID global dan Voice ID khusus empat channel tersedia.
5. Dashboard menyediakan tautan langsung ke halaman resmi API Keys dan Voice Library ElevenLabs.
6. Endpoint uji suara tersedia dan memakai karakter/kredit akun pengguna.
7. Naskah panjang dipecah pada batas kalimat menjadi permintaan berurutan dan audio digabung ke satu file WAV.
8. Jika API key, Voice ID, kredit, akses, atau permintaan API gagal, task memberikan pesan kesalahan dan tidak melakukan fallback diam-diam ke Azure atau Windows Speech.

## Catatan batas pengujian

- Pengujian API ElevenLabs menggunakan respons HTTP tiruan; tidak ada API Key pengguna yang dipakai dan tidak ada kredit akun yang dikonsumsi selama build.
- Konversi MP3 ke WAV dan penggabungan beberapa potongan diuji menggunakan binary FFmpeg nyata di lingkungan build.
- Windows DPAPI, proses build EXE, akun ElevenLabs langsung, serta koneksi Netlify/Tailscale pengguna belum diuji pada komputer Windows milik pengguna.
- Satu tes yang dilewati membutuhkan file `indo_tb.json` asli. Tidak ada perubahan pada sumber Alkitab atau Firestore Rules dalam rilis ini.

## Perubahan utama

- `worker/worker.py`: ElevenLabs-only TTS, penyimpanan API Key DPAPI, Voice ID per channel, konversi MP3→WAV, pemecahan naskah panjang, endpoint tes, dan parsing JSON endpoint uji.
- `app/index.html`: panel ElevenLabs, tombol API Keys/Voice Library, pengaturan model dan Voice ID per channel, tombol audio uji. Dashboard Netlify disinkronkan.
- Dokumentasi, manifest, skrip pemeriksaan/build, dan tes regresi diperbarui ke v1.6.4.

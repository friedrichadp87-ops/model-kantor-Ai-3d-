# Catatan Rilis v1.6.5 — Claude Story Director + Google Veo + ElevenLabs

## Script Director
- Claude API menjadi penulis naskah utama untuk hook, narasi, penutup dan storyboard terstruktur.
- Storyboard mencakup 6–8 adegan, `characterBible`, segmen narasi persis/berurutan, karakter yang tampil, prompt Veo berbahasa Inggris, kamera, mood dan format 9:16.
- Ollama tetap menangani riset Bible lokal, Guardian, QC dan SEO; Claude tidak menggantikan pemeriksaan ayat TB lokal.

## Voice dan timeline
- ElevenLabs tetap satu-satunya provider TTS.
- API `/with-timestamps` menghasilkan alignment tingkat karakter. Worker mengubah alignment ini menjadi `story_timeline.json` dan memakai titik potong absolut saat render. Jika pencocokan scene kurang dari ambang, timeline proporsional digunakan dan diberi label.
- Pada regenerasi QC, audio/alignment diperbarui sebelum generator visual dipanggil ulang.

## Veo dan Google Flow
- Veo 3.1 Fast/Standard melalui Google Cloud Vertex AI, output video-only 9:16, 4/6/8 detik dan gambar referensi karakter. Hasil disimpan sementara di GCS dan diunduh oleh Worker.
- Satu antrean visual global memastikan hanya satu project aktif menggunakan Veo pada satu waktu. Ada guardrail anggaran harian estimasi dan batas klip kumulatif per project.
- Google Flow website tidak dipanggil otomatis: pemilik membuat klip di Flow, mengunduh MP4 per adegan, lalu mengimpor MP4 ke task yang sama. FFmpeg merakit hasil impor dengan audio ElevenLabs.

## Semua fitur sebelumnya dipertahankan
13 peran Agent, tiga channel utama dan GKIN Hosiana, Theological Guardian, Pastoral Sensitivity, Community / Prayer Manager, Bible Series 66 kitab, sumber TB JSON lokal, Netlify Dashboard, Worker HTTPS tunnel, Firebase, YouTube OAuth/Analytics, ComfyUI, Whisper, Church Sermon Shorts, Video Editor Studio, FFmpeg/QC, laporan, antrean satu task, dan jadwal istirahat Minggu 06.00–15.00 WIB.

## Catatan pengujian dan billing
- Pengujian provider menggunakan mock/stub; tidak memakai kredit Claude, ElevenLabs atau Veo. Kredensial pemilik harus diuji dari dashboard setelah konfigurasi.
- Veo menggunakan Google Cloud billing terpisah. Guardrail internal adalah estimasi, bukan batas tagihan Google.
- Teks Alkitab TB JSON tetap lokal di Worker dan tidak dimigrasikan ke Firestore.

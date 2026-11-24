# Checklist pemilik — AI Content Factory v1.6.5 Local Edition

## Sebelum pembaruan
- [ ] Tutup Worker/aplikasi lama.
- [ ] Cadangkan `%LOCALAPPDATA%\AIContentFactory` ke folder lain. Jangan menghapusnya.
- [ ] Ekstrak v1.6.5 ke folder source baru.
- [ ] Pastikan Ollama aktif dan `ollama list` menampilkan `qwen3:4b`.
- [ ] Jalankan `CHECK-LOCAL-AI.bat`.
- [ ] Atur ElevenLabs API Key dan Voice ID utama/per channel di Pengaturan → Narator Bahasa Indonesia — ElevenLabs; jalankan audio uji (menggunakan kredit akun).
- [ ] Jika memakai gambar AI lokal, instal ComfyUI Desktop dan checkpoint SD 1.5.
- [ ] Jika memakai transkripsi lokal, jalankan `INSTALL-LOCAL-WHISPER.bat`.

## Menjalankan
- [ ] Jalankan `RUN-WORKER.bat` untuk mencoba source, atau buat EXE dengan `BUILD-WINDOWS-EXE.bat` di Windows.
- [ ] Buka Pengaturan → Mesin AI Lokal → Uji koneksi Ollama.
- [ ] Pastikan model yang dilaporkan adalah `qwen3:4b`.
- [ ] Pastikan Worker health menampilkan versi 1.6.5.
- [ ] Bila memakai Firestore, publikasikan `firestore.rules` dari paket v1.6.5; jangan gunakan aturan akses publik.

## Jadwal Minggu
- [ ] Pastikan istirahat Minggu aktif pukul 06.00–15.00 WIB.
- [ ] Pastikan Windows tidak Sleep/Hibernate jika Worker harus melanjutkan otomatis pukul 15.00.
- [ ] Uji dengan antrean percobaan: task yang terkena waktu istirahat harus paused, bukan failed, dan lanjut setelah istirahat berakhir.
- [ ] Pahami bahwa render FFmpeg yang sudah berjalan mungkin berhenti pada batas aman, bukan selalu tepat pada detik 06.00.

## Bible Series
- [ ] Unggah `indo_tb.json` melalui Pengaturan → Sumber Alkitab dari File JSON.
- [ ] Baca dan akui keterangan penggunaan pada metadata file.
- [ ] Uji satu kitab terlebih dahulu; periksa judul, ringkasan, dan rujukan setiap episode.
- [ ] Pastikan produksi tetap mengambil teks ayat dari JSON lokal, bukan tebakan model.
- [ ] Auto-upload tetap OFF selama pengujian.

## Church Sermon Shorts
- [ ] Hubungkan kanal GKIN Hosiana pada kartu channel khusus di menu Channel YouTube.
- [ ] Buka Church Shorts dan unggah satu video uji pendek.
- [ ] Masukkan timestamp mulai/selesai `HH:MM:SS`.
- [ ] Potong satu klip, unduh, dan tonton sampai selesai.
- [ ] Periksa framing 9:16 atau pilih rasio asli jika posisi pembicara terpotong.
- [ ] (Opsional) Jalankan transkripsi lokal Whisper, periksa teks dan koreksi sebelum memilih timestamp.
- [ ] Upload percobaan dengan visibilitas Private.
- [ ] Pastikan hak penggunaan rekaman, musik, dan persetujuan pihak yang tampil.

## Batasan yang perlu diingat
- Qwen3 4B adalah model teks; ComfyUI digunakan terpisah untuk gambar, bukan animasi video generatif.
- Transkripsi lokal memakai faster-whisper CPU dan dapat berjalan lambat pada rekaman panjang. Hasil transkrip wajib diperiksa manusia.
- Judul/deskripsi Church Shorts dapat dibuat dari transkrip atau ringkasan yang sudah diperiksa.
- YouTube upload memerlukan OAuth, internet, serta kuota YouTube Data API.
- Dashboard Netlify dari HP/perangkat lain belum terhubung aman ke PC Worker; `localhost` selalu mengacu pada perangkat pembuka dashboard.

## Pemeriksaan Guardian v1.6.5
- [ ] Buka menu Guardian & Komunitas dan pastikan Ollama aktif.
- [ ] Jalankan kedua pemeriksaan pada satu naskah uji.
- [ ] Pastikan TB JSON lokal sudah diunggah dan ketentuan sumber diakui untuk pemeriksaan ayat.
- [ ] Periksa hasil AI dan verifikasi fakta sejarah secara manual bila ditandai.
- [ ] Coba Community Manager; tinjau dan salin draf secara manual, jangan mengandalkan pengiriman otomatis.


## Video Editor Studio (dipertahankan dan diperbaiki di v1.6.2)
- [ ] Jalankan Worker dan pastikan `/health` menampilkan versi 1.6.2 serta `verticalVideoEditorAvailable: true`.
- [ ] Buka menu Video Editor dan siapkan background, voice-over, SRT UTF-8, serta musik.
- [ ] Render satu video uji; periksa durasi mengikuti audio terpanjang, campuran musik 10%, subtitle, resolusi, FPS, dan ukuran file.
- [ ] Pastikan hasil akhir tetap di bawah 50 MB sebelum publikasi.

## Claude Script Director + Veo + Flow v1.6.5
- [ ] Cadangkan `%LOCALAPPDATA%\AIContentFactory` sebelum mengganti Worker.
- [ ] Simpan Claude API Key di Pengaturan → Script Director dan jalankan Uji Claude.
- [ ] Aktifkan billing/API Vertex AI pada Google Cloud, siapkan service account dan GCS bucket.
- [ ] Masukkan Project ID, service-account JSON, GCS URI, model Veo, resolusi, budget harian, dan batas klip per project.
- [ ] Jalankan Uji konfigurasi Veo (tidak membuat klip dan tidak memakai kredit generasi).
- [ ] Buat satu project percobaan kecil; periksa `story_timeline.json` dan sumber timeline ElevenLabs.
- [ ] Pastikan klip Veo portrait 9:16 atau impor MP4 Flow per adegan pada task yang sama.
- [ ] Periksa semua klip, narasi ElevenLabs, subtitle dan hasil FFmpeg sebelum upload.
- [ ] Pastikan pengaturan Google Cloud Budgets/alerts tersedia; budget Worker hanya estimasi guardrail.
- [ ] Jangan mengunggah API Key, service-account JSON, token YouTube, atau file Alkitab pribadi ke source ZIP/Netlify.

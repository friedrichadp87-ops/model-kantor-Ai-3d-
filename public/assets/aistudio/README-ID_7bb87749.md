# AI Content Factory v1.6.5 — Claude Story Director + Veo 3.1 + ElevenLabs

## Ringkasan

v1.6.5 mempertahankan source dan fitur v1.6.4, lalu menambahkan Claude API sebagai penulis naskah/story director utama, Google Veo 3.1 melalui Google Cloud Vertex AI untuk klip video otomatis portrait 9:16, timestamp adegan berdasarkan alignment suara ElevenLabs yang benar-benar dihasilkan, konsistensi karakter melalui gambar referensi, dan impor MP4 per adegan dari Google Flow sebagai alternatif manual.

Dashboard tetap di https://officecontent.netlify.app. Worker tetap berjalan di komputer Windows pemilik seperti arsitektur v1.6.3/v1.6.5; versi ini **bukan migrasi ke VPS** dan tidak membutuhkan server VPS tambahan. Ollama tetap digunakan untuk riset Bible lokal, Guardian, QC, SEO, dan tugas Agent lokal. ElevenLabs tetap satu-satunya Voice Artist.

## Pembagian mesin

| Tugas | Provider | Catatan |
|---|---|---|
| Penulisan naskah, hook, penutup | Claude API (`claude-sonnet-5-5`) | Output JSON terstruktur; API Key disimpan terenkripsi oleh Worker |
| Storyboard, karakter, prompt tiap adegan | Claude API | 6–8 adegan; setiap segmen narasi harus berupa potongan persis dan berurutan dari naskah |
| Riset Alkitab dan konteks TB | Ollama `qwen3:4b` + JSON TB lokal | Teks ayat tidak dikirim ke Claude; konteks yang diperlukan diproses oleh Worker/Ollama lokal |
| Pemeriksaan teologi & sensitivitas | Theological Guardian + Pastoral Sensitivity (Ollama lokal) | Gerbang wajib sebelum publikasi; Community / Prayer Manager menyiapkan draf komentar |
| Narator Indonesia | ElevenLabs `eleven_v4` / `eleven_multilingual_v2` | Provider tunggal; timestamp karakter dipakai untuk timeline dan subtitle |
| Klip video otomatis | Google Veo 3.1 Fast / Standard melalui Vertex AI | Video-only, portrait 9:16; perlu Google Cloud Project, billing, Vertex AI, service account, dan GCS bucket |
| Alternatif klip visual | Google Flow (manual import) | Worker menyiapkan storyboard/timestamp, pemilik mengunduh MP4 per adegan dari Flow lalu mengimpor ke task yang sama |
| Referensi karakter | ComfyUI + Stable Diffusion 1.5 lokal | Membuat lembar referensi karakter konsisten; satu project visual aktif pada satu waktu |
| Transkripsi khotbah | faster-whisper `base` CPU int8 | Lokal; tidak mengirim audio rekaman ke cloud |
| Editing akhir | FFmpeg | Semua hasil cerita 9:16, 720×1280, 30fps; ElevenLabs menyediakan audio, klip Veo/Flow tanpa audio asli |
| Sinkronisasi/publikasi | Firebase dan YouTube API | Metadata, status, dan upload sesuai izin pemilik |

## Persiapan awal

### A. Ollama dan ComfyUI

1. Instal Ollama: https://ollama.com/download
2. Jalankan `ollama pull qwen3:4b` dan `CHECK-LOCAL-AI.bat`.
3. Untuk referensi karakter, instal ComfyUI Desktop dari https://www.comfy.org/download.
4. Pasang checkpoint Stable Diffusion 1.5 yang lisensinya sesuai. Mulai dari 512×768, batch 1 untuk GPU 6 GB.
5. API Ollama dan ComfyUI harus tetap di localhost; jangan membuka portnya ke internet.

### B. Claude Script Director

1. Buka https://console.anthropic.com/settings/keys.
2. Buat API Key Claude dengan akses Messages API dan pastikan akun/workspace memiliki billing/credit.
3. Di dashboard Netlify buka Pengaturan → Multi-Agent Hybrid Providers → Script Director — Claude API.
4. Tempel API Key lalu pilih `claude-sonnet-5-5`; tekan Simpan dan Uji Claude.
5. Key dikirim melalui HTTPS ke Worker Windows, disimpan terenkripsi dengan Windows DPAPI, dan tidak disimpan di Firestore, Netlify, atau localStorage browser.

Claude memakai Structured Outputs JSON Schema untuk mengembalikan naskah dan storyboard dalam struktur yang dapat dibaca Worker. API key tidak disertakan dalam paket.

### C. Google Veo 3.1 (API otomatis, billing terpisah)

1. Pilih atau buat Google Cloud Project.
2. Aktifkan billing pada project dan aktifkan Vertex AI API/Agent Platform yang diperlukan untuk Veo.
3. Buat Cloud Storage bucket dan prefix output, contoh `gs://nama-bucket/ai-content-factory`.
4. Buat service account dengan hak minimum yang diperlukan untuk menjalankan Vertex AI dan membuat/membaca objek dalam bucket GCS. Batasi akses bucket hanya pada bucket produksi ini; jangan memakai Owner/Editor project jika tidak diperlukan.
5. Unduh service-account JSON dengan aman. Jangan mengirimnya ke chat, GitHub, Netlify, atau Firestore.
6. Buka Pengaturan → Google Veo 3.1. Masukkan Project ID, pilih file service-account JSON, masukkan GCS URI, model, resolusi dan batas biaya harian.
7. Default model `veo-3.1-fast-generate-001`, resolusi 720p, batas biaya internal US$5/hari, maksimal 16 klip per project (termasuk satu kesempatan perbaikan QC). Semua nilai dapat diubah.
8. Tekan **Uji konfigurasi Veo**. Tes ini hanya memeriksa service-account/token dan tidak membuat video atau menggunakan kredit generasi.

Worker mengirim satu klip per adegan secara serial. Veo menerima 9:16, durasi 4/6/8 detik, dan gambar referensi karakter sampai batas yang didukung API. Model Standard dengan subject reference dibatasi 8 detik. Untuk adegan yang menggambarkan anak, Google dapat mensyaratkan project berada pada allowlist fitur `personGeneration=allow_all`; bila project tidak diizinkan, prompt dapat ditolak. ElevenLabs tetap menyediakan narasi; `generateAudio` dimatikan untuk menghindari audio Veo yang tidak diperlukan. Hasil Veo disimpan sementara melalui GCS lalu diunduh ke workspace Worker untuk dirakit FFmpeg.

**Estimasi harga referensi Google Cloud untuk video-only:** Veo 3.1 Fast sekitar US$0,08/klip pada 720p dan US$0,10/klip pada 1080p; Veo 3.1 Standard sekitar US$0,20/klip pada 720p/1080p. Harga dapat berubah menurut SKU, lokasi, diskon, dan kebijakan Google; invoice Cloud adalah sumber biaya sebenarnya. Batas harian dalam Worker merupakan guardrail perkiraan internal, bukan hard cap billing pada Google Cloud. Atur juga Google Cloud Budgets/alerts secara terpisah.

### D. Google Flow — impor manual

Flow tetap menjadi jalur alternatif bila pemilik ingin membuat klip dari website Google Flow atau belum mengatur Veo API.

1. Pada project baru di menu AI Workforce, pilih **Google Flow — buat klip manual lalu impor per adegan**.
2. Worker menyusun naskah, storyboard, timeline, dan karakter. Task akan berhenti pada status menunggu klip Flow.
3. Buka Google Flow, buat setiap klip sesuai nomor Scene, prompt, referensi karakter, dan rentang waktu pada storyboard.
4. Unduh setiap hasil sebagai MP4.
5. Kembali ke dashboard, pada task yang sama pilih file MP4 untuk Scene 1, Scene 2, dan seterusnya lalu tekan **Impor klip**.
6. Worker memeriksa header MP4 dan durasi (1–120 detik). Setelah semua klip tersedia, task melanjutkan ke FFmpeg.

Flow website tidak dipanggil otomatis oleh Worker. Google Flow adalah alur semi-manual; untuk generasi video otomatis gunakan Veo API yang dikonfigurasi di atas. File Flow harus diunduh dan diimpor ke task, bukan sekadar tautan preview.

## Pipeline produksi per project

1. AI Director memilih/menerima topik dan mengumpulkan konteks riset lokal.
2. Claude Script Director membuat naskah, hook, penutup, dan ringkasan terstruktur.
3. Theological Guardian dan Pastoral Sensitivity Checker memeriksa naskah. Status DITOLAK tetap memblokir upload; hasil yang belum LULUS membutuhkan peninjauan pemilik.
4. Claude membuat storyboard 6–8 adegan beserta `characterBible`, referensi karakter, prompt gerak/kamera, dan potongan narasi persis.
5. ElevenLabs membuat voice-over dan mengembalikan alignment per karakter. Worker menggabungkan audio dan membuat `story_timeline.json` dari waktu karakter aktual. Jika teks adegan tidak cukup cocok, sumber timeline ditandai `proportional-fallback`.
6. Worker membuat referensi karakter dengan ComfyUI bila tersedia. Semua panggilan Veo diserialkan menggunakan satu global visual queue lock; satu project visual diproses pada satu waktu.
7. Veo menghasilkan klip portrait 9:16 per adegan, atau pemilik mengimpor MP4 dari Google Flow.
8. FFmpeg memotong/menahan klip pada timestamp scene, menggabungkan voice-over ElevenLabs, membuat subtitle, dan merender MP4 9:16 720×1280 30fps.
9. SEO Agent, Guardian, technical QC, dan AI QC berjalan. Jika terjadi perbaikan naskah, Voice Artist dibuat ulang lebih dulu, timeline diperbarui dari audio terbaru, baru visual dibuat ulang.
10. Upload otomatis tetap memerlukan seluruh QC sesuai pengaturan. Upload manual setelah tinjau pemilik tetap perlu konfirmasi, validasi teknis video/audio, dan tidak dapat melewati Guardian berstatus DITOLAK.

## Anggaran dan antrean Veo

- Satu project visual aktif secara global; project lain tetap menunggu giliran.
- Permintaan klip Veo dikirim satu per satu, bukan paralel.
- Batas estimasi biaya per hari dan jumlah klip per project diperiksa sebelum request generasi.
- Penggunaan aktual per klip dicatat pada SQLite Worker ketika Google mengonfirmasi output video. Catatan tersebut merupakan estimasi, bukan pengganti Google Cloud billing.
- Jika kuota/anggaran internal tidak cukup atau API mengembalikan 429, project dihentikan/ditahan; tidak beralih diam-diam ke provider lain.
- Google Flow manual tidak menggunakan kuota generasi Veo, tetapi penggunaan kredit pada akun Google Flow mengikuti aturan paket Flow milik pemilik.

## Multi-Agent dan fitur yang dipertahankan

Semua 13 peran Agent tetap tersedia: CEO Manager, Trend Researcher, Bible Researcher, Scriptwriter, Theological Guardian, Pastoral Sensitivity, Storyboard Artist, Image Generator, Voice Artist, Video Generator, Video Editor, SEO Publisher, dan Community / Prayer Manager. Community Manager menyiapkan draf komentar; pemilik memeriksa dan mengirimkannya secara manual.

Fitur lama tetap disertakan: Bible Series Generator kanon Protestan 66 kitab/1.189 pasal, upload JSON TB lokal dan validasi ayat, queue episode berurutan, Guardian, dashboard Netlify dan Worker HTTPS tunnel, Firestore owner-scoped metadata, 4 channel (3 channel YouTube utama + GKIN Hosiana), Analytics, YouTube OAuth, Church Sermon Shorts Editor, Whisper lokal, Video Editor Studio 1080×1920, QC, laporan, penjadwalan 24/7 dengan istirahat Minggu 06.00–15.00 WIB, dan penyimpanan data lama.

Teks TB `indo_tb.json` pada versi ini tetap berada pada Worker lokal di `%LOCALAPPDATA%\AIContentFactoryible-sources`. Teks ayat tidak disimpan ke Firestore atau Netlify. Metadata seri dan episode dapat disinkronkan. Cadangkan sumber JSON milik Anda; jangan menghapus folder data lokal ketika memperbarui aplikasi. Periksa lisensi/izin sumber sebelum menggunakan teks dalam video monetisasi.

## Instalasi Worker dan Dashboard

1. Cadangkan `%LOCALAPPDATA%\AIContentFactory`.
2. Hentikan Worker lama, ekstrak Complete Source ke folder baru dan jalankan `RUN-WORKER.bat`.
3. Deploy `NETLIFY-DEPLOY/index.html` ke site `officecontent` (domain `https://officecontent.netlify.app`).
4. Worker tetap bind `127.0.0.1:8765`; gunakan Tailscale Funnel seperti dijelaskan `README-Netlify-ID.md` agar Netlify dapat menghubungkan API melalui HTTPS.
5. Firebase Authorized Domains harus memuat `officecontent.netlify.app`; gunakan login Google pemilik yang sama.
6. Pastikan `/health` menampilkan versi 1.6.5.
7. Jalankan `CHECK-HYBRID-PROVIDERS.bat`, lalu uji Claude, ElevenLabs, Veo configuration (tanpa generate) sebelum membuat satu project percobaan.

## Build EXE

Jalankan `BUILD-WINDOWS-EXE.bat` pada Windows. Model Ollama, checkpoint ComfyUI, API keys, service account, token YouTube, dan file `indo_tb.json` tidak disertakan ke ZIP.

## Catatan privasi dan lisensi

- Claude menerima naskah dan konteks ringkas yang dibangun Worker; hindari menambahkan data jemaat/pribadi yang tidak diperlukan.
- API key Claude, ElevenLabs dan service account Veo disimpan pada Worker lokal menggunakan Windows DPAPI; tidak dimasukkan ke Firestore, Netlify, atau paket source.
- Video Veo disimpan sementara di Google Cloud Storage. Atur lifecycle policy untuk menghapus output sementara sesuai kebutuhan.
- Konten hasil AI wajib ditinjau pemilik. Pemeriksaan Guardian bukan pengesahan pastoral atau teologis.
- Hak penggunaan teks Alkitab, gambar referensi, musik, dan aset eksternal harus diperiksa pemilik sebelum publikasi.

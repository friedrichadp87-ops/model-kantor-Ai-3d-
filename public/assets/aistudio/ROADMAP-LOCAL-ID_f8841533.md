# Roadmap AI Content Factory v1.6.0 — Multi-Agent Hybrid Edition

## Fondasi saat ini
- Ollama/Qwen3 4B sebagai mesin utama penalaran dan teks.
- Groq sebagai pemeriksa editorial cloud yang opsional.
- ElevenLabs sebagai satu-satunya provider TTS Bahasa Indonesia; Voice ID utama dan Voice ID khusus per channel dapat dipilih. API Key disimpan terenkripsi pada Worker lokal. Tidak ada fallback diam-diam ke Azure atau Windows Speech.
- ComfyUI lokal untuk ilustrasi AI dengan satu gambar per proses.
- faster-whisper lokal CPU int8 untuk transkripsi rekaman khotbah.
- FFmpeg untuk render video, subtitle, dan Church Shorts timestamp.
- Jeda operasi Minggu 06.00–15.00 WIB.
- Upload YouTube tetap memerlukan persetujuan eksplisit.

## Prioritas lanjutan
1. Uji kualitas Qwen3 dan profil suara narator pada setiap kanal.
2. Uji kualitas checkpoint ComfyUI pada GTX 1660 Ti 6 GB dan pilih konfigurasi yang stabil.
3. Tingkatkan sinkronisasi subtitle dengan forced alignment jika model lokal yang ringan tersedia.
4. Tambahkan pencarian timestamp khotbah dari transkrip dan penilaian segmen, tetapi tetap minta persetujuan pemilik.
5. Tambahkan pemeriksaan konsistensi karakter dan kesinambungan visual antaradegan.
6. Tambahkan jalur remote dashboard yang aman bila akses dari HP/perangkat lain dibutuhkan.

## Prinsip
- Agent memakai provider sesuai pekerjaan; provider cloud opsional dan memiliki kuota/billing sendiri.
- Teks Alkitab tetap diverifikasi terhadap sumber JSON lokal yang diunggah.
- Aset dan hasil video disimpan di PC Worker secara default.
- Jangan membuka API Ollama, ComfyUI, atau Worker lokal langsung ke internet.
- QC tidak boleh dilewati hanya untuk mempercepat publikasi.
- Model AI tidak menggantikan pemeriksaan manusia untuk akurasi Alkitab, hak cipta, izin rekaman, dan kualitas publikasi.

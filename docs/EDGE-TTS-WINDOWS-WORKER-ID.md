# Edge-TTS untuk Windows Production Worker

## Yang diperlukan
- Windows PC yang menjalankan Kantor AI 3D Production Worker.
- Python 3.10 atau lebih baru.
- Koneksi internet. Edge-TTS berkomunikasi dengan layanan Microsoft Edge TTS; bukan engine offline dan tidak menjamin pemakaian tanpa batas.
- FFmpeg tersedia di PATH Windows untuk menggabungkan beberapa segmen beserta jedanya. Untuk satu segmen saja FFmpeg tidak diperlukan.
- Firebase Admin credentials untuk memverifikasi Firebase ID Token.

## 1. Instalasi Python
Buka PowerShell di folder Windows Production Worker:

```powershell
py -m pip install --upgrade pip
py -m pip install edge-tts fastapi uvicorn firebase-admin
```

Simpan file `worker_edge_tts.py` di folder Worker. Jika Worker yang ada sudah menggunakan FastAPI, jangan jalankan server kedua; impor router sesuai bagian 5.

## 2. Firebase Admin
Gunakan service-account JSON dari proyek Firebase `kantor-ai-agent-creator`. Simpan hanya di PC, di luar repository dan jangan kirim ke browser/GitHub.

Set variabel lingkungan PowerShell (ganti UID dan lokasi file):

```powershell
$env:FIREBASE_PROJECT_ID = "kantor-ai-agent-creator"
$env:FIREBASE_ALLOWED_UIDS = "UID_FIREBASE_PEMILIK"
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\secure\\kantor-ai-firebase-admin.json"
```

Worker menolak semua permintaan audio jika `FIREBASE_ALLOWED_UIDS` kosong. Gunakan UID pemilik yang sama dengan allowlist Kantor AI 3D. Firebase Admin SDK memverifikasi tanda tangan, masa berlaku, dan status revokasi token.

## 3. CORS aplikasi
Origin bawaan yang diizinkan:
- `https://officecontent.netlify.app`
- `http://localhost:5173`
- `http://127.0.0.1:5173`

Tambahkan origin lain dengan `KANTOR_AI_ALLOWED_ORIGINS` (pisahkan dengan koma). Jangan gunakan wildcard karena aplikasi mengirim Firebase Bearer Token.

## 4. FFmpeg dan jalankan Worker
Pastikan perintah `ffmpeg -version` berhasil di PowerShell. Kemudian:

```powershell
py worker_edge_tts.py
```

Secara default Worker mendengarkan di `127.0.0.1:8765`. Jangan membuka port ini ke internet atau meneruskan port melalui router. Untuk akses jarak jauh gunakan tunnel privat HTTPS yang Anda kendalikan dan tambahkan origin secara eksplisit.

## 5. Pasang ke Worker FastAPI yang sudah ada
Tambahkan pada aplikasi FastAPI utama:

```python
from worker_edge_tts import router as edge_tts_router
app.include_router(edge_tts_router)
```

Jika aplikasi utama sudah memiliki middleware CORS, pastikan ia membatasi origin dan mengizinkan preflight `OPTIONS` beserta header `Authorization` dan `Content-Type`. Pastikan allowlist Firebase tetap konsisten.

## 6. Pengaturan di Kantor AI 3D
Buka **Pengaturan → Suara & TTS**:
1. Pilih **Edge-TTS (Gratis via Windows Worker)**.
2. Masukkan `http://127.0.0.1:8765`.
3. Pilih suara, Rate, dan Pitch.
4. Simpan pengaturan. Nilainya ikut tersimpan dalam dokumen workspace Firestore yang sudah digunakan.
5. Klik **Tes Suara Narator**. Hasil MP3 akan muncul untuk diputar dan diunduh.

URL localhost hanya bekerja bila browser dibuka pada PC yang sama dengan Worker. Untuk URL remote gunakan HTTPS.

## Endpoint
`POST /api/audio/generate`

Header:
```
Authorization: Bearer <Firebase ID Token>
Content-Type: application/json
```

Contoh:
```json
{
  "jobId": "kisah-daniel-001",
  "voice": "id-ID-ArdiNeural",
  "rate": "-5%",
  "pitch": "+0Hz",
  "segments": [
    { "role": "narator", "voice": "id-ID-GadisNeural", "text": "Pada suatu hari, Daniel tetap setia berdoa kepada Tuhan.", "pauseMs": 600 },
    { "role": "tokoh", "voice": "id-ID-ArdiNeural", "text": "Aku akan tetap berdoa kepada Tuhan.", "pauseMs": 400 }
  ]
}
```

Jika naskah hanya berupa teks biasa, kirim satu segmen `narator`. Jeda setelah tiap segmen (kecuali segmen terakhir) dibuat dengan FFmpeg. Respons sukses berisi `audioBase64`, `mimeType`, `fileName`, dan jumlah segmen. Browser mengubah respons menjadi MP3 untuk pratinjau/unduh.

GET `/health` mengembalikan status proses Worker tanpa menampilkan kredensial.


## Catatan pemeriksaan source

File UI TypeScript dan Worker Python berada pada branch fitur terpisah. Sebelum penggunaan produksi, jalankan pemeriksaan TypeScript, unit test, dan build dari repo; lalu lakukan tes langsung pada Windows Worker dengan token Firebase pemilik. Hasil CI source tidak menggantikan uji suara nyata.

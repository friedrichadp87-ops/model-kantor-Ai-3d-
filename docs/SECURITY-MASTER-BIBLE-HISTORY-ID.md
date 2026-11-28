# Panduan Keamanan, Master Alkitab, dan Histori Pekerjaan

Dokumen ini menjelaskan pengaturan yang diperlukan setelah branch keamanan dan histori digabungkan/deploy.

## 1. Batasi API hanya untuk akun pemilik

Semua endpoint `/api/*` (kecuali probe GET kesehatan dan pemeriksaan versi PWA) sekarang memerlukan Firebase Authentication ID Token yang tanda tangannya diverifikasi oleh server.

API produksi juga **menolak semua akun sampai UID pemilik diisi**. Ini disengaja supaya pengguna yang sekadar bisa mendaftar ke Firebase tidak dapat memakai API key Gemini/ElevenLabs milik pemilik.

Langkah pengaturan:

1. Buka Firebase Console proyek `kantor-ai-agent-creator`.
2. Buka **Authentication → Users**.
3. Pilih akun pemilik Kantor AI 3D, lalu salin **User UID**. Jangan memakai alamat email.
4. Buka Netlify → situs Kantor AI 3D → **Site configuration → Environment variables**.
5. Tambahkan:
   - `FIREBASE_PROJECT_ID` = `kantor-ai-agent-creator`
   - `FIREBASE_ALLOWED_UIDS` = UID yang disalin dari Firebase Authentication.
6. Simpan perubahan dan jalankan deploy ulang Netlify.

Jika ada lebih dari satu pemilik tepercaya, UID boleh dipisahkan koma. Jangan masukkan UID orang lain yang tidak perlu.

## 2. Terapkan Firestore Security Rules

Sebelum mengganti aturan yang sudah ada, simpan salinan aturan lama sebagai cadangan. Setelah itu buka Firebase Console → Firestore Database → Rules dan terapkan isi file `firestore.rules` pada repositori.

Aturan tersebut membatasi akses dokumen `users/{uid}` dan seluruh subkoleksinya hanya untuk pengguna dengan UID yang sama. Jalur Firestore di luar ruang pengguna ditolak.

## 3. Master Alkitab menjadi sumber bersama

Alkitab diunggah satu kali melalui **Pengaturan → Master Alkitab**. Aplikasi menyimpan metadata pada:

- `users/{uid}/masterBible/meta`

Teks ayat disimpan dalam beberapa dokumen agar ukuran dokumen Firestore tetap aman:

- `users/{uid}/masterBibleChunks/chunk_000`
- `users/{uid}/masterBibleChunks/chunk_001`
- dan seterusnya.

Lantai 1, 2, dan 3 menggunakan sumber yang sama. Sebelum permintaan AI dikirim, browser membaca Master Alkitab milik UID yang sedang login dari Firestore, lalu mengirimkan kebijakan dan ayat relevan saja. Seluruh file Alkitab tidak dikirim ulang pada setiap permintaan.

Jika Firestore belum memiliki Master Alkitab, aplikasi dapat menyinkronkan salinan IndexedDB perangkat yang sudah ada saat pengguna login. Firestore menjadi sumber utama setelah sinkronisasi berhasil. Jika unggahan Firestore gagal, aplikasi menampilkan status bahwa data belum tersimpan di cloud.

## 4. Histori pekerjaan AI per lantai

Setiap pekerjaan dicatat sebagai event terpisah (append-only) di:

`users/{uid}/workHistory/{eventId}`

Catatan menyimpan:

- Lantai dan kanal YouTube.
- Project ID, Run ID, Task ID.
- Agen dan tahap pipeline.
- Judul serta input/instruksi.
- Hasil atau ringkasan respons API.
- Status mulai, selesai, peringatan, atau gagal.
- Pesan error, provider, dan model.
- Apakah Master Alkitab aktif serta nama sumbernya.

Histori muncul di **Dashboard Performa → pilih lantai → Dokumentasi Pekerjaan AI**. Panel menampilkan maksimal 40 catatan terbaru per lantai dari 200 event terbaru yang sedang disubscribe. Dokumen yang lebih lama tetap ada di Firestore.

Data besar seperti gambar base64, audio, dan video tidak dimasukkan ke histori. Histori ini merekam jejak eksekusi dan kesalahan, bukan menggantikan penyimpanan file aset video.

## 5. Batas API dan pemeriksaan otomatis

Server menerapkan batas permintaan per UID per menit untuk mengurangi penyalahgunaan endpoint provider. Pembatasan memori ini berlaku per instance serverless; UID allowlist tetap menjadi kontrol utama.

GitHub Actions menjalankan:

1. Unit test.
2. TypeScript check (`npm run lint`).
3. Production build (`npm run build`).

Jika pemeriksaan gagal, perbaiki masalahnya sebelum menggabungkan branch ke `main`.

## 6. Versi Node.js

Repositori menetapkan Node.js 24 melalui file `.nvmrc` dan `package.json`. Firebase JavaScript SDK yang dipakai memerlukan Node.js minimal 24.12. Netlify membaca versi dari `.nvmrc` saat build; runtime Functions mengikuti versi build kecuali ada override runtime khusus pada pengaturan Netlify. Jangan mengunci situs kembali ke Node.js 22 untuk branch ini.

## 7. Catatan deployment

- Deploy Firestore Rules dan environment variables secara manual melalui konsol Firebase/Netlify; perubahan source code saja tidak dapat menerapkan pengaturan cloud tersebut.
- Setelah merge/deploy, login kembali ke aplikasi. Uji unggah Master Alkitab, buka Dashboard Performa untuk ketiga lantai, lalu buat satu tugas uji agar catatan pertama muncul di Firestore.
- Jangan menghapus koleksi `workHistory` jika masih membutuhkan jejak audit pekerjaan konten sebelumnya.


## 8. Integrasi YouTube OAuth dan SEO Publisher

Kantor AI 3D menggunakan Google Cloud Project lama yang sama, tetapi aplikasi Netlify memerlukan OAuth Client jenis Web application. OAuth Desktop Client lama tetap dapat dipakai worker Desktop lama dan tidak perlu dihapus.

### Environment variables Netlify

Isi variabel berikut di Site configuration → Environment variables. Jangan commit nilainya ke GitHub.

- YOUTUBE_CLIENT_ID: Client ID OAuth Web application.
- YOUTUBE_CLIENT_SECRET: Client Secret OAuth Web application.
- YOUTUBE_REDIRECT_URI: URL callback aplikasi yang persis sama dengan Authorized redirect URI. Untuk situs produksi officecontent.netlify.app, gunakan https://officecontent.netlify.app/.
- YOUTUBE_OAUTH_STATE_SECRET: secret acak independen minimal 32 karakter untuk tanda tangan state anti-CSRF.
- YOUTUBE_TOKEN_ENCRYPTION_KEY: 32 byte acak yang dikodekan sebagai 64 karakter hex untuk AES-256-GCM.
- FIREBASE_PROJECT_ID: tetap kantor-ai-agent-creator.
- FIREBASE_ALLOWED_UIDS: UID Firebase pemilik seperti dijelaskan pada bagian 1.

Buat secret secara lokal dengan password manager atau generator tepercaya. Jangan tempelkan Client Secret, refresh token, maupun encryption key ke percakapan, screenshot, atau GitHub.

### Google Cloud Console

1. Pertahankan project dan OAuth Desktop Client lama.
2. Buat OAuth Client baru bertipe Web application di project yang sama.
3. Masukkan URL YOUTUBE_REDIRECT_URI persis sebagai Authorized redirect URI.
4. Pastikan YouTube Data API v3 aktif.
5. Tambahkan domain aplikasi ke Authorized domains dan atur OAuth Audience. Aplikasi yang masih Testing memiliki batas masa berlaku refresh token untuk scope YouTube; pindahkan ke In production dan selesaikan verifikasi Google yang diwajibkan sebelum operasional 24/7.

### Alur aplikasi

- Pengaturan → Koneksi Provider → YouTube OAuth.
- Hubungkan akun Google yang memiliki kanal target pada setiap lantai. Satu koneksi OAuth mengunggah ke kanal YouTube default akun Google tersebut.
- Refresh token dienkripsi AES-256-GCM sebelum disimpan pada users/{uid}/youtubeConnections/{channelId}.
- Access token hanya dikirim sementara ke browser untuk memulai upload resumable; refresh token dan Client Secret tidak pernah dikirim ke browser.
- SEO Publisher memakai judul, deskripsi, hashtag/tag, dan label Made for Kids dari pipeline; video harus lulus Final QC.
- Aktifkan opsi upload otomatis per channel. Default tetap nonaktif dan privasi awal Private.
- Riwayat upload disimpan pada users/{uid}/youtubeUploads/{videoId}.

### Batasan penting

- OAuth lama bertipe Desktop tidak dapat menjadi callback web Netlify; buat Web application Client dalam project yang sama, jangan membuat project baru.
- Jika OAuth consent masih Testing, refresh token YouTube dapat kedaluwarsa setelah 7 hari. Status In production dan proses verifikasi Google diperlukan untuk penggunaan berkelanjutan.
- Upload browser memakai sesi resumable YouTube. Pengguna harus membiarkan tab aplikasi terbuka sampai transfer video selesai; ini bukan job serverless background 24/7. Penjadwalan upload tanpa browser terbuka memerlukan worker/cloud job yang tahan lama pada tahap berikutnya.
- Setiap video memakai kuota YouTube Data API; pantau quota project dan kebijakan YouTube.
- Uji pertama gunakan Private. Pastikan kanal Google yang terhubung benar sebelum mengaktifkan Public/Unlisted atau auto-upload.

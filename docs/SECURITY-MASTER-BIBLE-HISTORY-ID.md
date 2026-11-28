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

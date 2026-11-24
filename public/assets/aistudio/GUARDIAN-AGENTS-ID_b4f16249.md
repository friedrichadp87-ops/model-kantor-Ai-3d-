# Tiga Agent Penjaga Konten Rohani — v1.6.0

## 1. Theological Guardian

- Acuan utama: Alkitab Terjemahan Baru (TB) dari JSON lokal yang diunggah pemilik.
- Memeriksa setiap rujukan yang terdeteksi, konteks ayat, dan doktrin.
- Menandai [FATAL ERROR] untuk rujukan yang tidak ada/salah atau pemelintiran isi sesuai hasil pemeriksaan.
- Fakta sejarah yang tidak dapat dibuktikan dari sumber yang tersedia wajib ditandai [PERLU VERIFIKASI MANUAL].
- Agent tidak menulis ulang naskah. Saran perbaikan hanya ditampilkan sebagai usulan kalimat pengganti.

## 2. Pastoral Sensitivity Checker

Meninjau bahasa yang berpotensi menghakimi, mengaitkan penyakit/kemiskinan/musibah dengan dosa penonton, merendahkan denominasi, terlalu keras untuk isu sensitif, atau menjanjikan kesembuhan/mujizat. Hasil berisi kalimat asli, masalah, dan kalimat pengganti yang lebih aman.

## 3. Community / Prayer Manager

Membuat draf balasan komentar YouTube dalam Bahasa Indonesia, hangat dan empatik, maksimal tiga kalimat. Permintaan doa dibalas dengan doa; kesaksian dijawab dengan ucapan syukur. Tidak memberi nasihat medis/keuangan spesifik dan tidak menjanjikan hasil mujizat. Bila ada tanda bahaya menyakiti diri/orang lain, tandai agar ditangani manusia secara segera.

## Alur aplikasi

1. Setelah Scriptwriter, pipeline menjalankan Theological Guardian dan Pastoral Sensitivity Checker secara berurutan menggunakan Ollama lokal.
2. Bila salah satu tidak berstatus LULUS, video boleh dirender untuk ditinjau tetapi QC memblokir publikasi otomatis.
3. Jika script berubah karena repair pass, kedua Guardian dijalankan ulang pada naskah terbaru.
4. Community Manager hanya menghasilkan draf. Pengguna tetap membaca ulang dan mengirim sendiri melalui YouTube Studio.
5. Riwayat pemeriksaan dan draf disimpan dalam `guardian_reviews` di SQLite lokal. Tidak disinkronkan ke Firestore.

## Batas dan tanggung jawab

Agent menggunakan Qwen/Ollama lokal dan dapat salah menafsirkan ayat atau konteks. Hasil bukan pengesahan teologis atau pastoral. Pengecekan sumber membuktikan bahwa rujukan ditemukan di file lokal pengguna, bukan keaslian penerbitan, lisensi, maupun kebenaran historis eksternal. Perlu tinjauan editor manusia.

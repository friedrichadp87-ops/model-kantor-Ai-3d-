# Laporan Pengujian — AI Content Factory v1.6.3

Tanggal pengujian: 20 November 2026  
Target: Dashboard Netlify `https://officecontent.netlify.app/` + Windows Worker lokal melalui Tailscale Funnel HTTPS.

## Ringkasan hasil otomatis

- **75 tes dijalankan**
- **74 tes lulus**
- **1 tes dilewati** karena file `indo_tb.json` asli milik pemilik tidak tersedia pada lingkungan build.
- `python -m py_compile worker/worker.py`: **PASS**.
- `python -m unittest discover -s tests`: **PASS** (`OK (skipped=1)`).
- Ekstraksi inline `<script type="module">` dan pemeriksaan `node --check`: **PASS**.
- Pemeriksaan keseimbangan delimiter `firestore.rules`: **PASS (statis)**.
- Salinan `NETLIFY-DEPLOY/index.html` identik byte-per-byte dengan `app/index.html`: **PASS**.
- Pengujian pemetaan Worker owner UID: klaim pertama hanya dari loopback tepercaya; UID sama diterima; UID lain dan origin Netlify tidak dapat mengklaim Worker: **PASS (unit test)**.

## Perubahan yang diverifikasi

1. Dashboard diarahkan ke `https://officecontent.netlify.app/`.
2. Dashboard dapat menyimpan URL Worker HTTPS di browser; mode Netlify menolak URL loopback dan domain non-Tailscale, serta membatasi remote URL ke `*.ts.net` pada port HTTPS standar.
3. Worker tetap bind hanya pada `127.0.0.1:8765`.
4. Origin Netlify produksi ditambahkan ke allowlist CORS.
5. Remote API dan health check memerlukan Firebase Google ID token; Worker memeriksa UID yang telah dipasangkan sebagai pemilik.
6. Login loopback pertama menyimpan UID pemilik pada `worker_config.json`; permintaan remote tidak dapat melakukan pairing pertama.
7. Endpoint dashboard HTML Worker dibatasi untuk request loopback; tunnel digunakan sebagai API endpoint.
8. Skrip Windows `START-WORKER-TUNNEL.bat` dan `STOP-WORKER-TUNNEL.bat` ditambahkan.
9. Folder `NETLIFY-DEPLOY` berisi dashboard statis siap deploy.

## Batasan pengujian

- Tailscale Funnel belum dapat dinyalakan dari lingkungan build ini karena memerlukan instalasi Tailscale, akun/tailnet pemilik, dan persetujuan Funnel pada perangkat Windows.
- Login Firebase, CORS browser nyata, tunnel HTTPS, OAuth YouTube, dan koneksi Netlify live belum diuji menggunakan project/akun pemilik.
- Pemeriksaan Firestore Rules pada laporan ini adalah pemeriksaan struktur/delimiter dan tes kode terkait; Firebase Rules Emulator tidak dijalankan.
- Uji pemilik dilakukan sebagai unit test terhadap fungsi lokal; bukan pengujian penetrasi atau audit keamanan independen.
- Tailscale Funnel membuat URL layanan dapat dijangkau dari internet. Semua API aplikasi tetap mewajibkan token Firebase Google dan UID pemilik, tetapi pengguna harus menjaga Worker tetap diperbarui dan tidak membagikan URL tunnel secara tidak perlu.
- Tailscale Funnel memiliki batas bandwidth yang ditetapkan penyedia; transfer file video besar dapat lebih lambat.

## Langkah deploy pemilik

1. Deploy isi ZIP `AI-Content-Factory-v1.6.3-Netlify-Dashboard.zip` ke site `officecontent`.
2. Tambahkan `officecontent.netlify.app` ke Firebase Authentication → Settings → Authorized domains.
3. Hentikan Worker lama, ekstrak source baru, lalu jalankan `RUN-WORKER.bat`. Pada login pertama, gunakan `http://localhost:8765` dan akun Google pemilik yang sama dengan dashboard Netlify untuk memasangkan UID Worker.
4. Login ke `https://officecontent.netlify.app`, jalankan `START-WORKER-TUNNEL.bat`, salin URL `https://*.ts.net` yang ditampilkan, lalu simpan dan uji pada Pengaturan → Mesin AI Lokal & Otomatisasi.
5. Gunakan `STOP-WORKER-TUNNEL.bat` untuk menghentikan akses publik saat tidak diperlukan.


# Audit file `indo_tb.json` yang diunggah

File yang diperiksa adalah lampiran pengguna bernama `indo_tb.json`. Struktur sumbernya merupakan object JSON dengan dua bagian utama: `metadata` dan `verses`.

Setiap elemen `verses[]` menggunakan field:

- `book_name`: nama kitab sumber.
- `book`: nomor kitab numerik 1–66.
- `chapter`: nomor pasal.
- `verse`: nomor ayat.
- `text`: teks ayat.

## Hasil audit

| Pemeriksaan | Hasil |
|---|---:|
| Total baris ayat | 31.102 |
| Baris dapat dibaca | 31.102 |
| Baris tidak valid/kosong | 0 |
| Referensi unik | 31.102 |
| Referensi duplikat | 0 |
| Konflik teks | 0 |
| Kitab | 66/66 |
| Pasal | 1.189/1.189 |
| Pasal hilang | 0 |
| Variasi nama kitab | 1.007 |
| Mismatch ID numerik dengan alias nama yang dikenali | 0 |

Importer menggunakan `book` numerik sebagai identitas kanonis ketika `book_name` memakai ejaan/variasi berbeda. Teks ayat tidak diubah.

## Metadata hak cipta/penggunaan sumber

Metadata file menyebut:

- Nama: Terjemahan Baru.
- Short name: Indonesian TB.
- Module: `indo_tb`.
- Tahun: 1994.
- Publisher/owner: Lembaga Alkitab Indonesia (Indonesian Bible Society).
- Copyright Lembaga Alkitab Indonesia, 1994.
- Released for non-profit scholarly and personal use.
- Not to be sold for profit.
- Untuk referensi publik formal, akui Lembaga Alkitab Indonesia sebagai pemegang hak cipta.

Aplikasi menampilkan dan mempertahankan metadata tersebut. Aplikasi tidak memverifikasi keaslian file atau memberikan izin baru. Pernyataan non-profit scholarly/personal dan not to be sold for profit tidak boleh ditafsirkan sebagai izin monetisasi atau penggunaan komersial.

## Kompatibilitas

Importer AI Content Factory v1.6.0 tetap membaca struktur asli `indo_tb.json` tanpa mengharuskan pengguna mengedit JSON. Format WebPresenter lama tetap didukung sebagai alternatif upload. Teks yang dinormalisasi disimpan lokal pada komputer Windows Worker saja.

# Kalkulator Cloud AWS / Google Cloud — v2

Aplikasi web untuk menyusun usulan cloud dari kebutuhan pelanggan: pemilihan solusi, topologi, proyeksi biaya sewa (3 bulan–3 tahun), TCO vs on‑premise, catatan penting, serta ekspor **.docx / .pdf / .xlsx**.

Didisain oleh **@letsgobram** - **@motivaseein** (GDB)

## Yang baru di v2
| Fitur | Keterangan |
|---|---|
| **Login & keamanan** | Semua halaman dan data tertutup sampai login. Aplikasi utama hanya dikirim server setelah sesi valid (cookie HttpOnly, ditandatangani HMAC). Opsi "Simpan username & password" di perangkat. Percobaan login gagal dikunci 15 menit setelah 8 kali. |
| **Admin awal** | `AdminCoba1` / `Trial1!` — wajib ganti password saat login pertama. Sebelum diganti, aplikasi dan modul admin tidak bisa dibuka (dicek di server). |
| **Kelola pengguna** (admin) | Buat akun (nama, username, password awal + tombol *Buat acak*, peran, tanggal berlaku). Teks alamat/username/password siap disalin. Reset password, atur masa berlaku, nonaktifkan/aktifkan, jadikan admin/pengguna, ubah nama, hapus akun. |
| **Catatan aktivitas** (admin) | Login, perubahan akun, akses admin yang ditolak, backup, ekspor, recompute, reset, ganti mata uang/bahasa. Filter + unduh CSV. |
| **Pengguna biasa** | Tidak melihat menu admin; HTML & JS modul admin tidak dikirim, dan semua `/api/admin/*` menolak peran non-admin (403, dicatat di log). |
| **Dwibahasa** | Indonesia / English — antarmuka, hasil, catatan, dan file ekspor. |
| **Menu samping** | Fitur & pengaturan di kiri, bisa ditampilkan/disembunyikan (☰). |
| **Tombol atas** | Recompute, Reset Data, Logout (+ Update Harga). |
| **Backup & restore** | Unduh/pulihkan file `.json`, atau simpan di server (per akun, maks. 30). Berisi input, data harga, pengaturan mata uang & kurs. |
| **Lokasi negara** | Indonesia, Malaysia, Singapura, Thailand, Filipina, Brunei (+ AS sebagai pembanding). Region usulan otomatis di dalam negeri bila tersedia, jika tidak region terdekat. Catatan regulasi data & pajak mengikuti negara. |
| **Mata uang** | IDR (default), SGD, MYR, THB, PHP, USD. Pilih mata uang output → semua hitungan, tabel, grafik & ekspor dikonversi otomatis. Mata uang data input (asumsi on‑prem) bisa berbeda. Kurs bisa diperbarui online. |

### Region usulan per negara
| Negara | AWS | Google Cloud | Pajak bawaan |
|---|---|---|---|
| Indonesia | Jakarta `ap-southeast-3` | Jakarta `asia-southeast2` | PPN 11% |
| Malaysia | Malaysia `ap-southeast-5` | Singapura `asia-southeast1` (terdekat) | Service Tax 8% |
| Singapura | Singapura `ap-southeast-1` | Singapura `asia-southeast1` | GST 9% |
| Thailand | Bangkok `ap-southeast-7` | Bangkok `asia-southeast3` | VAT 7% |
| Filipina | Singapura (terdekat; ada Local Zone Manila) | Singapura (terdekat) | VAT 12% |
| Brunei | Singapura (terdekat) | Singapura (terdekat) | – |

Pengali harga region Malaysia & Thailand adalah perkiraan; klik **⟳ Update Harga** untuk harga aktual per region. Tarif pajak bisa diubah manual di form.

## Deploy ke Vercel dari GitHub
1. **Unggah ke GitHub**: buat repo baru, lalu push seluruh isi folder ini (isi folder langsung di root repo: `api/`, `public/`, `src/`, `vercel.json`, dst.).
2. **Import di Vercel**: *Add New → Project* → pilih repo. Framework preset: **Other**. Build command & output sudah diatur di `vercel.json` (`node build.js`, output `public`).
3. **Hubungkan penyimpanan (wajib)**: di project Vercel buka **Storage** (atau *Marketplace*) → **Upstash for Redis** → *Create* → *Connect to project*. Vercel otomatis menambahkan env `KV_REST_API_URL` dan `KV_REST_API_TOKEN` (atau `UPSTASH_REDIS_REST_URL` / `_TOKEN`). Paket gratis Upstash sudah cukup.
4. *(Disarankan)* tambahkan env **`SESSION_SECRET`** berisi string acak ≥ 32 karakter (jika tidak diisi, rahasia dibuat otomatis dan disimpan di Redis).
5. **Redeploy**, buka URL aplikasi, login `AdminCoba1` / `Trial1!`, lalu ganti password.

> Tanpa Redis, API mengembalikan pesan "Penyimpanan server belum dikonfigurasi" dan login tidak bisa dilakukan.

## Menjalankan lokal
```bash
npm run dev        # build + server di http://localhost:3000
```
Tanpa env Redis, data disimpan di `.data/db.json` (khusus pengembangan).

## Struktur
| Path | Isi |
|---|---|
| `public/` | Halaman login (publik), `i18n.js`, pustaka ekspor (`lib/`) |
| `api/_lib/app-html.js` | Aplikasi utama hasil build — **hanya** disajikan oleh `/api/app` setelah login |
| `api/` | Serverless functions: `auth/*`, `admin/users`, `admin/logs`, `backups`, `rates`, `activity`, `app` |
| `api/_lib/` | Sesi, hash password (scrypt), penyimpanan (Upstash Redis REST / file lokal) |
| `src/` | Kode sumber aplikasi (`engine`, `app`, `exporter`, `online`, `currency`, `shell`, `admin`, `i18n`, `dict/`) |
| `data/prices.json` | Data harga bawaan |
| `build.js` | Merakit `api/_lib/app-html.js` (jalankan setelah mengubah `src/`) |
| `dev-server.js` | Server lokal yang meniru Vercel |
| `tools/update_prices.py` | Skrip opsional pengambil harga resmi untuk otomasi terjadwal |

## Catatan keamanan
- Password disimpan sebagai hash **scrypt**; sesi di cookie `HttpOnly; SameSite=Strict; Secure`. Perubahan akun (reset, nonaktif, ganti peran) langsung membatalkan sesi lama.
- Semua permintaan yang mengubah data wajib header `X-KC: 1` (perlindungan CSRF).
- Peran & status akun dibaca ulang dari database pada **setiap** permintaan.
- Fitur "Simpan username & password" menyimpan kredensial di browser perangkat tersebut — jangan dipakai di komputer bersama.
- Minimal satu admin aktif selalu dipertahankan; admin tidak bisa menonaktifkan/menghapus/menurunkan perannya sendiri.

## Metodologi singkat
- Harga list on‑demand (Linux) basis region US × pengali region; 1 bulan = 730 jam. Update online memakai AWS Price List API & daftar harga Google Cloud.
- Sizing otomatis dari pengguna bersamaan per vCPU sesuai jenis aplikasi; bisa diganti spesifikasi manual.
- Diskon komitmen hanya untuk beban dasar; pertumbuhan dihitung on‑demand.
- Konversi mata uang lewat kurs basis USD; nilai uang asumsi on‑premise dikonversi dari mata uang input ke output.
- Estimasi, bukan penawaran resmi. Validasi dengan AWS Pricing Calculator dan Google Cloud Pricing Calculator.

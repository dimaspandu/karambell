# Karambell — UI Prototype

UI pengelolaan sesi kompetisi karambol, terhubung ke Google Sheets melalui Google Apps Script dan proxy API Node.js.

## Jalankan dengan Node.js
Tidak perlu `npm install` atau dependency tambahan. Pastikan Node.js sudah terpasang, lalu dari folder proyek jalankan:

```bash
node server.js
```

Buka `http://127.0.0.1:3000`.

Port dan host bisa diubah melalui environment variable:

```bash
PORT=3001 node server.js
```

Di PowerShell Windows:

```powershell
$env:PORT=3001; node server.js
```

Server hanya melayani file statis dengan metode GET/HEAD. Untuk penggunaan lokal, host default `127.0.0.1` membuat server hanya bisa diakses dari komputer sendiri.

## Integrasi Google Sheets
Node.js menjadi proxy server-side ke Google Apps Script. URL Apps Script yang diberikan sudah disetel sebagai default di `server.js`. Bisa dioverride lewat environment variable `APPS_SCRIPT_URL`.

Endpoint lokal:
- `GET /api/health` — cek server lokal.
- `GET /api/sessions` — daftar sesi.
- `GET /api/session?session_id=...` — detail sesi, peserta, dan pertandingan.
- `POST /api/sessions` — buat sesi dan bracket.
- `POST /api/participants` — tambah peserta sebelum pertandingan dimulai.
- `POST /api/matches/score` — simpan skor dan maju-kan pemenang.

Jalankan server dari folder proyek:

```bash
node server.js
```

Buka `http://127.0.0.1:3000`. Node.js 18+ diperlukan karena proxy memakai `fetch` bawaan.

## Yang sudah bisa dicoba
- Memuat daftar sesi dari Google Sheets saat halaman dibuka.
- Membuat sesi baru; sesi, peserta, dan bracket disimpan ke Google Sheets.
- Melihat bracket, peserta, dan daftar pertandingan dari data tersimpan.
- Input/edit skor; backend menyimpan skor dan memperbarui pemenang di bracket.
- Menambah peserta sebelum pertandingan dimulai.
- Membuat Playbook melalui dialog cetak browser, lalu pilih **Save as PDF**.

## Troubleshooting
- Jika muncul pesan gagal memuat Google Sheets, pastikan Apps Script sudah di-deploy sebagai Web App dan akses deployment mengizinkan Node.js memanggilnya.
- Pastikan fungsi `setupSheets()` sudah dijalankan dan Script Property `SPREADSHEET_ID` telah disetel di Apps Script.
- Periksa **Apps Script → Executions** untuk error yang terjadi di sisi Google.
- Data tidak lagi menggunakan demo di browser; sesi baru hanya muncul setelah berhasil tersimpan melalui API.
- Google Fonts membutuhkan koneksi internet; fallback font tersedia.

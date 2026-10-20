# Karambell — UI Prototype

UI pengelolaan sesi kompetisi karambol, terhubung ke Google Sheets melalui Google Apps Script dan proxy API Node.js.

## Jalankan secara lokal
Live Server hanya menyajikan file statis, sehingga request frontend ke `/api/sessions` akan mendapat 404. Jalankan backend Node.js yang sudah menyertakan proxy Google Apps Script:

```bash
node server.js
```

Buka `http://127.0.0.1:3000`.

Jangan buka aplikasi lewat port Live Server (`5500`); gunakan alamat yang dicetak oleh `node server.js`.
Server lokal juga mengembalikan `index.html` untuk path aplikasi seperti `/bracket/<session-id>` saat halaman di-refresh.

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

Saat di-deploy ke Netlify, endpoint yang sama dilayani oleh Netlify Function di `netlify/functions/api.mjs`. Konfigurasi `netlify.toml` menjalankan `scripts/build-netlify.mjs` untuk menyalin frontend ke `dist/`, lalu mem-publish folder itu. Rewrite SPA mengirim path aplikasi ke `index.html`; route API tetap diproses Netlify Function. Jika memakai Apps Script deployment lain, atur environment variable `APPS_SCRIPT_URL` pada Netlify untuk scope Functions, lalu deploy ulang.

Untuk menguji function Netlify secara lokal, gunakan Netlify CLI (`netlify dev`); Live Server tidak menjalankan Netlify Functions.

## URL aplikasi
Router client-side didefinisikan di `js/router.js` dengan engine HistoryPP lokal (`js/libs/historypp/src/1.0.5`). Refresh pada path ini akan mengirim `index.html`, lalu router memilih tampilan berdasarkan path:

- `/` atau `/competitions` — Dashboard dan daftar kompetisi.
- `/competitions/<session-id>` — Detail kompetisi, membuka bracket.
- `/bracket` — Membuka kompetisi terakhir yang dipilih, atau kompetisi pertama jika belum ada pilihan. `/bracket/<session-id>` membuka bracket kompetisi tersebut.
- `/participants` — Mengikuti aturan pemilihan yang sama; `/participants/<session-id>` membuka peserta kompetisi tersebut.
- `/matches` — Mengikuti aturan pemilihan yang sama; `/matches/<session-id>` membuka daftar pertandingan kompetisi tersebut.

Path lama `/?session_id=<id>` tetap diarahkan ke `/bracket/<id>`.

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

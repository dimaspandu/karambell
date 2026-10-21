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

## Data provider
Pemilihan provider terpusat di `js/data/config.js` melalui `dataProvider`. Default tetap `google-sheets`; ubah ke `supabase` untuk memakai Supabase PostgreSQL Data API. Isi `supabaseUrl` dan `supabaseAnonKey` pada file yang sama dengan project URL dan publishable/anon key. Key tersebut memang dapat dilihat browser; jangan pernah memasukkan service-role/secret key.

`js/data/service.js` adalah antarmuka repository yang dipakai UI: `listCompetitions`, `getCompetition`, `createCompetition`, `addPlayer`, `recordScore`, dan `recordWinner`. Kedua provider mengembalikan bentuk payload kompetisi yang sama sebelum dinormalisasi oleh aplikasi. Google Sheets tetap memakai proxy dan action Apps Script `listSessions`, `getSession`, `createSession`, `addParticipant`, serta `updateMatchScore`; skornya tetap numerik. Supabase memetakan `sessions`, `players`, `teams`, `team_members`, dan `matches` ke model yang sama: tim menjadi competitor ber-ID team, anggota digabung sebagai nama `Pemain A & Pemain B`, dan `winner_team_id` menjadi winner ID.

Implementasi Supabase mengasumsikan kolom standar berikut tersedia: `sessions.id/name/event_date/location/format/status`; `players.id/session_id/name/seed`; `teams.id/session_id/name/seed`; `team_members.session_id/team_id/player_id/position`; `matches.id/session_id/round/match_number/team1_id/team2_id/winner_team_id/status/next_match_id/next_slot`. Nama/struktur kolom aktual belum dapat diverifikasi dari repository ini, jadi sesuaikan mapping bila skema project berbeda. Bye disimpan dengan status `completed` dan winner, lalu dipetakan menjadi status UI `bye`. Tidak ada SQL/schema otomatis yang dijalankan. RLS harus mengizinkan operasi SELECT/INSERT/UPDATE yang diperlukan untuk kelima tabel; kebijakan anon write terbuka berarti siapa pun yang dapat mengakses aplikasi/API dapat mengubah data. Hindari perubahan policy otomatis dari frontend.

Limitasi: mode Supabase saat ini membuat kompetisi tim dan mendukung hasil/progres bracket, serta tambah pemain individual. Google Sheets tetap satu-satunya provider yang diketahui mendukung kompetisi individual lama secara lengkap; mapping Google tidak menganggap ID peserta individual sebagai ID tim. Untuk mencocokkan Supabase dengan skema deployment sebenarnya, verifikasi nama kolom, foreign key, nilai status, dan RLS sebelum memilih provider tersebut.

Checklist manual: (1) dengan `google-sheets`, muat sesi lama, buat sesi tim, pilih dan koreksi pemenang sampai final, lalu tambah pemain pada sesi individual; (2) isi URL/anon key dan pilih `supabase`, buat kompetisi tim dengan minimal empat pemain, muat ulang, periksa anggota dan bracket, catat/koreksi pemenang dan pastikan juara tampil; (3) coba key/RLS salah dan pastikan pesan error tampil tanpa beralih provider.

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
- Memuat daftar sesi kompetisi saat halaman dibuka.
- Membuat sesi tim baru: pemain diacak dengan Fisher–Yates sebelum sesi dibuat. Pasangan tersimpan sebagai baris peserta/kompetitor yang sudah ada, dengan `participant_id` dari Sheets dipakai sebagai ID tim dan `format` menandai mode tim.
- Kompetisi lama tetap menggunakan peserta individual dan alur skor numerik yang sudah ada.
- Melihat bracket, peserta, dan daftar pertandingan dari data tersimpan.
- Memilih Menang untuk setiap tim; aplikasi mengirim `score1`/`score2` numerik (`1`/`0`) melalui endpoint lama agar backend memperbarui pemenang dan babak berikutnya.
- Menambah peserta individual pada kompetisi lama sebelum pertandingan dimulai. Komposisi tim baru dikunci setelah bracket dibuat supaya hasil tidak rusak.
- Membuat Playbook melalui dialog cetak browser, lalu pilih **Save as PDF**.

## Troubleshooting
- Jika memilih provider Google Sheets dan pemuatan data gagal, pastikan Apps Script sudah di-deploy sebagai Web App dan akses deployment mengizinkan Node.js memanggilnya.
- Pastikan fungsi `setupSheets()` sudah dijalankan dan Script Property `SPREADSHEET_ID` telah disetel di Apps Script.
- Periksa **Apps Script → Executions** untuk error yang terjadi di sisi Google.
- Data tidak lagi menggunakan demo di browser; sesi baru hanya muncul setelah berhasil tersimpan melalui API.
- Google Fonts membutuhkan koneksi internet; fallback font tersedia.

# Panduan Instalasi — Absen Digital SMA Triguna 1956 (versi GitHub Pages)

Arsitektur versi 2.0:

```
Browser (siswa, guru piket, admin)
   │  https://USERNAME.github.io/absen-digital-triguna/   ← FRONTEND (GitHub Pages)
   │       index.html + css/ + js/
   │
   │  fetch POST (JSON, text/plain)
   ▼
Google Apps Script Web App  …/exec                        ← BACKEND (REST API)
   Kode.gs → Google Sheets (database) + Drive (foto) + Gmail (notifikasi walas)
```

Yang Anda terima:

| Berkas | Untuk apa | Dipasang di mana |
| --- | --- | --- |
| `Kode.gs` | Backend REST API | Disalin-tempel ke editor Apps Script |
| `absen-digital-triguna.zip` | Frontend (tampilan) | Diekstrak lalu di-push ke GitHub |
| `PANDUAN-INSTALASI.md` | Panduan ini | Dibaca (salinannya juga ada di dalam ZIP) |

Urutannya penting: **backend dulu** (supaya dapat URL `/exec`), **baru frontend**.

---

## Bagian A — Backend di Google Apps Script

> Gunakan akun Google yang akan menjadi pemilik aplikasi (sebaiknya akun sekolah). Semua data tersimpan di Drive akun ini dan email notifikasi dikirim atas nama akun ini.

### A1. Buat proyek
1. Buka **https://script.google.com** → **Proyek baru**.
2. Klik "Proyek tanpa judul" → ganti menjadi `Absen Digital API`.
3. File `Code.gs` → titik tiga → **Ganti nama** → `Kode`. Hapus isinya, tempel seluruh isi **Kode.gs**, lalu **Ctrl + S**.

Versi ini **hanya butuh satu file** (`Kode.gs`). Tidak ada file HTML di Apps Script.
Kalau Anda memakai proyek lama (versi 1.0), hapus file `Index`, `Stylesheet`, dan `JavaScript` dari proyek itu.

### A2. Jalankan setup (sekali)
1. Pilih fungsi **`setupAplikasi`** di menu tarik-turun → **▶ Jalankan**.
2. Izinkan akses: **Tinjau izin** → pilih akun → **Lanjutan** → **Buka … (tidak aman)** → **Izinkan**.
3. Buka **Log eksekusi** lalu catat:
   - `🔑 Username: admin`
   - `🔑 Password awal: ……`

Setup membuat folder **"Absen Digital SMA Triguna 1956"** di Drive. Isinya database, folder Foto Siswa, Surat Izin & Sakit, Ekspor Rekap, dan Aset. Setup juga memasang trigger email harian jam 09:00 dan menambahkan 3 siswa contoh.
Aman dijalankan ulang: data yang sudah ada tidak ditimpa. Lupa password admin? Jalankan **`resetSandiAdmin`**.

### A3. Deploy sebagai Web App
1. **Terapkan** → **Deployment baru** → ikon roda gigi → **Aplikasi web**.
2. **Jalankan sebagai:** Saya. **Yang memiliki akses:** **Siapa saja** (*Anyone*).
3. **Terapkan** → salin **URL aplikasi web** (berakhiran `/exec`).

### A4. Cek API sudah hidup
Tempel URL `/exec` di tab browser baru. Harus muncul teks JSON seperti:
```json
{"success":true,"data":{"status":"OK","aplikasi":"Absen Digital SMA Triguna 1956 — REST API",...}}
```
Kalau muncul halaman login Google atau "akses ditolak", berarti akses deploy belum **Siapa saja**. Ulangi A3.

---

## Bagian B — Frontend di GitHub Pages

### B1. Ekstrak ZIP dan isi alamat API
1. Ekstrak **absen-digital-triguna.zip**. Hasilnya folder **`absen-digital-triguna`**. Di dalamnya langsung ada `index.html`, `css\`, dan `js\`.
2. Buka **`js\config.js`** dengan Notepad. Ganti `https://script.google.com/macros/s/XXXX/exec` dengan URL `/exec` dari A3, lalu simpan.

```js
const GAS_URL = 'https://script.google.com/macros/s/AKfycbx...ISI-PUNYA-ANDA.../exec';
```

> ⚠️ Folder yang nanti di-`git init` adalah **`absen-digital-triguna`**, yaitu folder yang langsung berisi `index.html`. Jangan folder di atasnya.

### B2. Pasang Git (sekali per komputer)
- Windows: unduh dari **https://git-scm.com/download/win**, install dengan pilihan bawaan.
- Cek di PowerShell: `git --version` → muncul `git version 2.x`.

Lalu atur identitas (sekali saja):
```bash
git config --global user.name "Nama Anda"
git config --global user.email "email-akun-github@contoh.com"
```

### B3. Buat repository di GitHub
1. Masuk **https://github.com** → tombol **+** → **New repository**.
2. **Repository name:** `absen-digital-triguna`. Pilih **Public** (wajib untuk Pages gratis).
3. **Jangan** centang README / .gitignore / license → **Create repository**.

### B4. Masuk ke folder yang benar & cek isinya
Buka folder `absen-digital-triguna` di File Explorer → klik address bar → ketik `powershell` → Enter. Lalu:
```powershell
dir
```
Yang harus terlihat: `css`, `js`, `index.html`, `README.md`, `PANDUAN-INSTALASI.md`.
Kalau yang terlihat malah folder `absen-digital-triguna` lagi, ketik `cd absen-digital-triguna` dulu.

### B5. Kirim ke GitHub (satu per satu)
```bash
git init
git add .
git commit -m "Upload pertama Absen Digital"
git branch -M main
git remote add origin https://github.com/USERNAME/absen-digital-triguna.git
git push -u origin main
```
Saat `git push` meminta **Password**, yang diisi adalah **Personal Access Token**, bukan password akun GitHub. Saat menempel token, layar memang tidak menampilkan apa-apa. Itu normal.
Membuat token: **https://github.com/settings/tokens** → *Generate new token (classic)* → centang **repo** → *Generate* → salin `ghp_…`.

Tanda berhasil: `Writing objects: 100%` dan `* [new branch] main -> main`.

### B6. Aktifkan GitHub Pages
Repo → **Settings** → **Pages** → Source **Deploy from a branch** → Branch **main** / **(root)** → **Save**. Centang **Enforce HTTPS**.
Tunggu 1–2 menit. Alamat aplikasi: **`https://USERNAME.github.io/absen-digital-triguna/`**

### B7. Uji
1. Buka alamat di atas → halaman login muncul.
2. Masuk dengan `admin` + password awal → dashboard tampil.
3. Kalau muncul *"Alamat server belum diatur"*, `js/config.js` belum diisi. Edit lalu push ulang (lihat Bagian H).
4. Kalau muncul *"Server tidak mengembalikan data yang benar"*, URL di config salah atau deploy belum **Siapa saja**.

---

## Bagian C — Pengaturan awal di aplikasi

1. Buka situs GitHub Pages (`https://USERNAME.github.io/absen-digital-triguna/`) → masuk dengan username `admin` + password awal.
2. Menu bawah kiri **Ubah Password** → ganti password awal.
3. **Pengaturan → Identitas & Logo**: unggah logo Yayasan Triguna 1956 (PNG, latar transparan lebih bagus).
4. **Pengaturan → Jam & Aturan**: periksa jam masuk, batas tepat waktu (bawaan 07:00), jam pulang, dan hari sekolah (bawaan Senin–Jumat). Tambahkan tanggal libur nasional/sekolah.
5. **Pengaturan → Notifikasi**: atur jam kirim email walas (bawaan 09:00). Klik **Kirim email uji ke pemilik akun** untuk mengecek tampilannya. Email uji dikirim ke akun Google pemilik skrip.
6. **Pengaturan → Pengguna**: tambah akun Guru Piket atau Admin lain dengan **username** (mis. `sriwahyuni`). Password acak muncul **sekali**. Salin dan berikan ke guru yang bersangkutan. Jika lupa, klik ikon reset password.

**Cara login (satu form untuk semua peran, tanpa email):**

| Peran | Username | Password |
| --- | --- | --- |
| Admin | `admin` (atau username admin lain) | dari Log eksekusi / dari admin |
| Guru Piket | username yang dibuat admin | password acak dari admin |
| Siswa | NIS | awalnya = NIS, lalu diganti sendiri |

Username staf wajib mengandung huruf (mis. `bambang`, `piket.pagi`), agar tidak bentrok dengan NIS siswa yang berupa angka.

## Bagian D — Masukkan data siswa

Pilih salah satu:

- **Satu per satu:** menu **Data Siswa & Barcode → Tambah Siswa**. Kode barcode dibuat otomatis.
- **Sekaligus banyak (disarankan untuk 500–600 siswa):**
  1. **Pengaturan → Identitas & Logo → Buka database** → sheet **Siswa**.
  2. Hapus 3 baris siswa contoh.
  3. Tempel data mulai baris 2. Cukup isi kolom **NIS, Nama, Kelas, Nama_Walas, Email_Walas**. Kolom ID_Siswa, Kode_Barcode, dan Status_Aktif biarkan kosong.
  4. Kembali ke aplikasi → **Data Siswa & Barcode → Impor dari Sheet**. ID, barcode, dan status terisi otomatis.

Tulis kelas dengan pola yang konsisten, misalnya `X-1`, `XI MIPA 1`, `XII IPS 2`. Awalan X/XI/XII dipakai untuk grafik per tingkat.
Login siswa: username = **NIS**, password awal = **NIS**. Siswa diminta menggantinya saat login pertama. Admin bisa mengembalikan password siswa ke NIS dari form **Ubah Data Siswa → Reset sandi ke NIS**.

## Bagian E — Cetak kartu barcode

**Data Siswa & Barcode → Cetak Kartu** → pilih kelas → **Cetak**.
Di jendela cetak: ukuran **A4**, skala **100%**, centang **Grafik latar belakang / Background graphics**. Ukuran kartu 85,6 × 54 mm (seukuran KTP), 10 kartu per halaman.
Jika kartu hilang/disalahgunakan: buka siswa → **Buat ulang barcode**. Kartu lama langsung tidak berlaku.

## Bagian F — Siapkan stasiun scan di gerbang

**Perangkat:** komputer/laptop + **pemindai barcode USB** + monitor yang menghadap siswa.

1. Pemindai barcode USB umumnya bekerja seperti keyboard. Pastikan diatur ke mode yang **menambahkan Enter** setelah kode (bawaan sebagian besar pemindai) dan bisa membaca **Code 128**.
2. Hubungkan monitor gerbang ke komputer dengan mode **Duplikat/Mirror**.
3. Login dengan username Guru Piket/Admin → **Stasiun Scan**.
4. Klik ikon pengaturan di samping tombol monitor → beri nama perangkat, mis. `Kiosk 01 Gerbang Utama`. Jika ada lebih dari satu gerbang, setiap komputer harus punya nama berbeda. Nama ini dipakai untuk mendeteksi titip absen.
5. Klik **Layar Monitor Siswa** → layar penuh. Siswa cukup menempelkan kartu; layar menampilkan sambutan lalu kembali siap dalam 5 detik.
   - Mode MASUK/PULANG berganti otomatis sesuai jam di Pengaturan.
   - Tekan **Esc** untuk keluar dari layar monitor.
6. Biarkan tab tetap terbuka sepanjang hari. Sesi dijaga tetap aktif otomatis selama tab terbuka.

Kartu rusak atau lupa dibawa? Di Stasiun Scan tekan **F9** (Catat manual), cari nama siswa, lalu catat.

## Bagian G — Alur harian

| Waktu | Yang terjadi |
| --- | --- |
| 05:30–07:00 | Scan masuk → **Hadir** |
| setelah 07:00 | Scan masuk → **Terlambat** |
| sepanjang hari | Guru piket meninjau **Pengajuan Izin/Sakit**. Yang disetujui otomatis tercatat di rekap |
| 09:00 (otomatis) | Siswa tanpa scan & tanpa keterangan ditandai **Alpa**, lalu satu email dikirim ke setiap wali kelas |
| 14:30–18:00 | Scan pulang |

Pengajuan izin/sakit yang disetujui **setelah** jam 09:00 tetap mengubah status Alpa menjadi Izin/Sakit di rekap.

## Bagian H — Memperbarui aplikasi

**Frontend berubah** (file di folder `absen-digital-triguna`), jalankan dari folder itu:
```bash
git add .
git commit -m "Keterangan perubahan"
git push
```
Tunggu 1–2 menit, lalu tekan **Ctrl + Shift + R** di browser.

**Backend berubah** (`Kode.gs`): editor Apps Script → **Terapkan → Kelola deployment → ikon pensil → Versi: Versi baru → Terapkan**.
Dengan cara ini URL `/exec` tetap sama, jadi `js/config.js` tidak perlu diubah. Jangan pilih "Deployment baru" karena URL akan berganti.

## Troubleshooting cepat

| Yang terlihat | Penyebab | Solusi |
| --- | --- | --- |
| "Alamat server belum diatur" | `GAS_URL` masih `XXXX` | Isi `js/config.js`, push ulang |
| "Server tidak mengembalikan data yang benar" | Deploy bukan "Siapa saja" / URL salah | Ulangi A3–A4, cek URL berakhiran `/exec` |
| "Tidak bisa terhubung ke server" | Internet putus | Periksa koneksi |
| Situs 404 | Folder yang di-push salah atau Pages belum aktif | Di repo GitHub, `index.html` harus terlihat di halaman depan |
| Tampilan polos tanpa warna | Folder `css/` atau `js/` tidak ikut | Push lewat terminal, jangan "Upload files" di web |
| Data baru tidak muncul setelah ubah Kode.gs | Lupa membuat versi baru deployment | Bagian H, bagian backend |
| `Password authentication is not supported` | GitHub butuh token | Buat Personal Access Token (B5) |

## Bagian I — Batasan yang perlu diketahui

- **Kuota email:** akun Gmail biasa ±100 email/hari, Google Workspace ±1.500/hari. Satu email dikirim per wali kelas per hari, jadi jauh di bawah batas.
- **Kecepatan scan:** sekitar 1–2 detik per siswa (tergantung server Google). Scan diproses berurutan sehingga tidak ada yang hilang saat antre.
- **Foto siswa** dibagikan "siapa saja yang memiliki link" agar bisa tampil di layar dan kartu. Tautannya acak dan tidak terdaftar di mana pun.
  **Foto surat izin/sakit tetap privat.**
- **File Excel rekap** dibuat di folder "Ekspor Rekap" dan otomatis dihapus setelah 1 hari.
- Jangan mengubah urutan atau nama kolom di sheet database. Menambah/mengubah isi baris boleh.
- **Sesi login** tersimpan di browser masing-masing perangkat (localStorage situs github.io). Menutup tab tidak mengeluarkan pengguna; tekan **Keluar** di perangkat bersama.
- **Repository GitHub bersifat publik**, tetapi hanya berisi tampilan (HTML/CSS/JS) dan alamat API. Tidak ada data siswa, password, atau kode backend di dalamnya. Data tetap di Google Sheets milik Anda dan hanya bisa diakses setelah login.

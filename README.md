# Absen Digital — SMA Triguna 1956 Jakarta

Frontend aplikasi presensi barcode siswa (scan masuk & pulang, layar monitor sambutan, rekap harian & bulanan, pengajuan izin/sakit, portal siswa).

- **Frontend:** situs statis ini (GitHub Pages): `index.html`, `css/style.css`, `js/`.
- **Backend:** Google Apps Script Web App (REST API). Kode backend tidak disimpan di repository ini.

## Konfigurasi
Isi alamat API di `js/config.js`:
```js
const GAS_URL = 'https://script.google.com/macros/s/…/exec';
```

## Struktur
```
index.html        kerangka semua halaman (SPA)
css/style.css     tampilan (token desain Triguna: biru #1D4ED8, emas #F5B301)
js/config.js      alamat API
js/api.js         fetch ke Apps Script (POST text/plain)
js/app.js         logika halaman
```

Panduan lengkap: `PANDUAN-INSTALASI.md`.

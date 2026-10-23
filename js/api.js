/**
 * ============================================================
 * ABSEN DIGITAL — js/api.js
 * Penghubung frontend (GitHub Pages) ↔ backend (Google Apps Script REST API).
 *
 * Semua permintaan dikirim sebagai POST dengan Content-Type text/plain
 * agar browser TIDAK mengirim CORS preflight (OPTIONS) yang ditolak GAS.
 * Body: {"action":"apiXxx","args":[...]} → balasan {"success","data","message"}
 * ============================================================
 */

const API_TIMEOUT_MS = 60000;       // permintaan biasa
const API_TIMEOUT_UNGGAH_MS = 120000; // permintaan berisi foto

/** URL /exec yang dibaca dari js/config.js (spasi/kutip berlebih dibuang). */
function gasUrl() {
  return typeof GAS_URL === 'string' ? GAS_URL.trim().replace(/^['"]|['"]$/g, '') : '';
}

/**
 * Terima semua bentuk URL Web App Apps Script:
 *   https://script.google.com/macros/s/ID/exec
 *   https://script.google.com/a/macros/domain-sekolah/s/ID/exec   (akun Google Workspace)
 */
function gasUrlSiap() {
  const u = gasUrl();
  return /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[A-Za-z0-9_-]{20,}\/exec\/?$/.test(u) && !/XXXX/.test(u);
}

/**
 * Panggil satu aksi di backend.
 * Resolve → data. Reject → Error (err.data berisi detail dari server, mis. {kode:'DUPLIKAT'}).
 */
async function call(action, ...args) {
  if (!gasUrlSiap()) {
    const u = gasUrl();
    if (!u || /XXXX/.test(u)) throw new Error('Alamat server belum diatur. Isi GAS_URL di file js/config.js dengan URL /exec dari Apps Script, lalu push ulang.');
    if (/\/dev\/?$/.test(u)) throw new Error('URL di js/config.js berakhiran /dev. Gunakan URL yang berakhiran /exec (dari Terapkan → Kelola deployment).');
    throw new Error('Format URL di js/config.js tidak dikenali: ' + u + ' — harus berawalan https://script.google.com/ dan berakhiran /exec.');
  }
  const body = JSON.stringify({ action, args });
  const ctrl = new AbortController();
  const batas = setTimeout(() => ctrl.abort(), body.length > 200000 ? API_TIMEOUT_UNGGAH_MS : API_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(gasUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      signal: ctrl.signal
    });
  } catch (err) {
    clearTimeout(batas);
    if (err.name === 'AbortError') throw new Error('Server terlalu lama merespons. Coba lagi.');
    throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet.');
  }
  clearTimeout(batas);

  const teks = await res.text();
  let r;
  try {
    r = JSON.parse(teks);
  } catch (e) {
    // GAS mengembalikan halaman HTML (bukan JSON) bila deploy belum diatur "Siapa saja"
    throw new Error('Server tidak mengembalikan data yang benar. Pastikan Apps Script di-deploy sebagai Aplikasi web dengan akses "Siapa saja" dan URL di js/config.js benar.');
  }
  if (r && r.success) return r.data;
  const e = new Error((r && r.message) || 'Terjadi kesalahan di server.');
  e.data = (r && r.data) || {};
  if (e.data.sesiHabis && typeof sesiHabis === 'function') sesiHabis();
  throw e;
}

/* ============================================================
 * IDENTITAS APLIKASI (nama, nama sekolah, logo) — dipakai index.html & monitor.html
 * Disimpan di browser agar layar loading & favicon langsung memakai logo sekolah
 * pada kunjungan berikutnya, sebelum server sempat menjawab.
 * ============================================================ */
const BRAND_KEY = 'absen_brand';
const FAVICON_BAWAAN = (document.getElementById('favicon') || {}).href || '';

function brandBaca() {
  try { return JSON.parse(localStorage.getItem(BRAND_KEY) || 'null'); } catch (e) { return null; }
}

function brandSimpan(app) {
  if (!app) return;
  const lama = brandBaca() || {};
  const baru = {
    namaAplikasi: app.namaAplikasi || lama.namaAplikasi || 'Absen Digital',
    namaSekolah: app.namaSekolah || lama.namaSekolah || 'SMA Triguna 1956 Jakarta',
    logo: app.logo !== undefined ? app.logo : (lama.logo || ''),
    logoVer: app.logoVer !== undefined ? app.logoVer : (lama.logoVer || '')
  };
  try { localStorage.setItem(BRAND_KEY, JSON.stringify(baru)); } catch (e) {
    // Logo terlalu besar untuk penyimpanan browser: simpan tanpa logo
    try { localStorage.setItem(BRAND_KEY, JSON.stringify(Object.assign({}, baru, { logo: '' }))); } catch (e2) { /* abaikan */ }
  }
  return baru;
}

/** Terapkan nama & logo ke semua elemen bertanda + favicon + layar loading. */
function terapkanBrand(app) {
  if (!app) return;
  const nama = app.namaAplikasi || 'Absen Digital';
  const sek = app.namaSekolah || 'SMA Triguna 1956 Jakarta';
  document.querySelectorAll('.app-name').forEach((el) => { el.textContent = nama; });
  document.querySelectorAll('.app-upper').forEach((el) => { el.textContent = nama.toUpperCase(); });
  document.querySelectorAll('.school-name').forEach((el) => { el.textContent = sek; });
  document.querySelectorAll('.school-upper').forEach((el) => { el.textContent = sek.toUpperCase(); });
  document.querySelectorAll('.logo-ring').forEach((el) => {
    const img = el.querySelector('img');
    if (img && app.logo) img.src = app.logo;
    el.classList.toggle('has-logo', !!app.logo);
  });
  const lg = document.getElementById('loaderLogo');
  if (lg) {
    if (app.logo) lg.src = app.logo;
    lg.hidden = !app.logo;
    const ik = document.getElementById('loaderIkon');
    if (ik) ik.hidden = !!app.logo;
  }
  const fav = document.getElementById('favicon');
  if (fav) fav.href = app.logo || FAVICON_BAWAAN;
}

// Terapkan identitas tersimpan sesegera mungkin (sebelum server menjawab)
terapkanBrand(brandBaca());

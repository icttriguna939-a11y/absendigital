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

function gasUrlSiap() {
  return typeof GAS_URL === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(GAS_URL.trim()) && !/XXXX/.test(GAS_URL);
}

/**
 * Panggil satu aksi di backend.
 * Resolve → data. Reject → Error (err.data berisi detail dari server, mis. {kode:'DUPLIKAT'}).
 */
async function call(action, ...args) {
  if (!gasUrlSiap()) {
    throw new Error('Alamat server belum diatur. Isi GAS_URL di file js/config.js dengan URL /exec dari Apps Script.');
  }
  const body = JSON.stringify({ action, args });
  const ctrl = new AbortController();
  const batas = setTimeout(() => ctrl.abort(), body.length > 200000 ? API_TIMEOUT_UNGGAH_MS : API_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(GAS_URL.trim(), {
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

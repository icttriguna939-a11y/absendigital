/**
 * ============================================================
 * ABSEN DIGITAL — SMA TRIGUNA 1956 • js/app.js
 * SPA: semua halaman ada di index.html, ditampilkan/disembunyikan di sini.
 * Semua panggilan server lewat call() di js/api.js → fetch ke GAS REST API.
 * ============================================================
 */

// ════════════════════════════════════════════════════════
// 1. STATE & HELPER
// ════════════════════════════════════════════════════════
const TZ = 'Asia/Jakarta';
const STATUS = ['Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alpa'];
const WARNA = { Hadir: '#22C55E', Terlambat: '#F97316', Izin: '#3B82F6', Sakit: '#A855F7', Alpa: '#EF4444', 'Belum Hadir': '#94A3B8' };
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const PER_HAL = 25;

const S = {
  token: '', sesi: null, app: {}, offset: 0, section: '',
  scan: { mode: 'MASUK', auto: true, aturan: null, siswa: null, antrean: Promise.resolve(), suara: true },
  rekap: { data: null, page: 1, chip: '' },
  pj: { data: null, tab: 'Menunggu', sel: null, tingkat: '', gambar: {} },
  bl: { data: null, tipe: 'bar' },
  ss: { data: [], page: 1, sel: new Set() },
  pg: { data: null, hari: [] },
  ps: { data: null, surat: null },
  charts: {}, refresh: null
};

const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const simpan = {
  get(k, d) { try { const v = localStorage.getItem('absen_' + k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('absen_' + k, v); } catch (e) { /* abaikan */ } },
  del(k) { try { localStorage.removeItem('absen_' + k); } catch (e) { /* abaikan */ } }
};

// ── Waktu (selalu zona Asia/Jakarta, disinkronkan dengan server) ──
const fmtJam = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fmtTgl = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
function sekarang() { return new Date(Date.now() + S.offset); }
function jamStr(d) { return fmtJam.format(d || sekarang()).replace(/^24/, '00'); }
function tglStr(d) { return fmtTgl.format(d || sekarang()); }
function tglPanjang(t) {
  if (!t) return '-';
  const p = t.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return `${HARI[d.getUTCDay()]}, ${p[2]} ${BULAN[p[1] - 1]} ${p[0]}`;
}
function tglPendek(t) {
  if (!t) return '-';
  const p = t.split('-').map(Number);
  return `${p[2]} ${BULAN[p[1] - 1].substr(0, 3)} ${p[0]}`;
}
function geserHari(t, n) {
  const p = t.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().substr(0, 10);
}
function selisihHari(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000) + 1;
}
function jm(t) { return t ? String(t).substr(0, 5) : '—'; }

// ── Komponen kecil ──
function inisial(nama) {
  return String(nama || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
/** Avatar siswa. `foto` = id siswa bila punya foto (foto diambil lewat API karena file di Drive privat). */
function avatar(nama, foto, cls) {
  return `<div class="avatar ${cls || 'sm'} soft"${foto ? ` data-foto="${esc(foto)}"` : ''}>${esc(inisial(nama))}</div>`;
}

// ── Pemuat foto siswa ──
// Semua elemen ber-atribut data-foto="ID_SISWA" (opsional data-foto-size="besar") diisi otomatis
// begitu muncul di halaman. Foto diambil per kelompok (maks 50) dan disimpan di memori.
const FOTO_CACHE = { mini: new Map(), besar: new Map() };
const FOTO_TUNGGU = { mini: new Map(), besar: new Map() };
function pasangFoto(el, url) {
  if (!url) return;
  el.style.backgroundImage = `url('${url}')`;
  el.classList.remove('soft');
  Array.from(el.childNodes).forEach((n) => { if (n.nodeType === 3) n.remove(); });
  el.dataset.fotoOk = '1';
}
function isiFoto(root) {
  if (!S.token) return Promise.resolve();
  const els = $$('[data-foto]:not([data-foto-ok])', root || document);
  const tugas = [];
  ['mini', 'besar'].forEach((uk) => {
    const grup = els.filter((el) => (el.dataset.fotoSize || 'mini') === uk);
    grup.forEach((el) => { if (FOTO_CACHE[uk].has(el.dataset.foto)) pasangFoto(el, FOTO_CACHE[uk].get(el.dataset.foto)); });
    const perlu = Array.from(new Set(grup.filter((el) => !el.dataset.fotoOk).map((el) => el.dataset.foto)));
    const baru = perlu.filter((id) => !FOTO_TUNGGU[uk].has(id) && !FOTO_CACHE[uk].has(id));
    for (let i = 0; i < baru.length; i += 50) {
      const ids = baru.slice(i, i + 50);
      const pr = call('apiFoto', S.token, ids, uk).then((m) => {
        ids.forEach((id) => { FOTO_CACHE[uk].set(id, (m && m[id]) || ''); FOTO_TUNGGU[uk].delete(id); });
      }).catch(() => ids.forEach((id) => FOTO_TUNGGU[uk].delete(id)));
      ids.forEach((id) => FOTO_TUNGGU[uk].set(id, pr));
    }
    perlu.forEach((id) => { if (FOTO_TUNGGU[uk].has(id)) tugas.push(FOTO_TUNGGU[uk].get(id)); });
  });
  return Promise.all(tugas).then(() => {
    $$('[data-foto]:not([data-foto-ok])', root || document).forEach((el) => {
      const uk = el.dataset.fotoSize || 'mini';
      if (FOTO_CACHE[uk].has(el.dataset.foto)) pasangFoto(el, FOTO_CACHE[uk].get(el.dataset.foto));
    });
  });
}
let fotoJeda = null;
new MutationObserver(() => { clearTimeout(fotoJeda); fotoJeda = setTimeout(() => isiFoto(), 60); })
  .observe(document.body, { childList: true, subtree: true });

/** Batas & format foto yang boleh diunggah dari komputer. */
const FOTO_MAKS_MB = 5;
const FOTO_FORMAT = ['image/jpeg', 'image/png', 'image/webp'];
function cekFileFoto(f, maksMb) {
  if (!f) return 'Tidak ada file dipilih.';
  if (!FOTO_FORMAT.includes(f.type)) return `Format "${f.name.split('.').pop()}" tidak didukung. Gunakan JPG, PNG, atau WEBP.`;
  if (f.size > (maksMb || FOTO_MAKS_MB) * 1024 * 1024) return `Ukuran file ${(f.size / 1048576).toFixed(1)} MB melebihi batas ${maksMb || FOTO_MAKS_MB} MB.`;
  return '';
}
function pill(status) {
  const map = { 'Belum Hadir': 'belum' };
  const k = map[status] || String(status).toLowerCase();
  return `<span class="pill pill-${esc(k)}"><i class="dot"></i>${esc(status)}</span>`;
}
function kelasPill(k) { return `<span class="pill pill-kelas">${esc(k)}</span>`; }
function persen(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }

function toast(tipe, judul, pesan) {
  const ikon = { sukses: 'check_circle', error: 'error', info: 'info', warn: 'warning' }[tipe] || 'info';
  const el = document.createElement('div');
  el.className = 'toast ' + (tipe === 'sukses' ? '' : tipe);
  el.innerHTML = `<span class="ms">${ikon}</span><div><b>${esc(judul)}</b>${pesan ? `<p>${esc(pesan)}</p>` : ''}</div><button class="icon-btn sm"><span class="ms">close</span></button>`;
  el.querySelector('button').onclick = () => el.remove();
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), tipe === 'error' ? 7000 : 4000);
}
function gagal(e) { toast('error', 'Gagal', e && e.message ? e.message : String(e)); }

function modal(html, lebar) {
  $('modalIsi').innerHTML = html;
  $('modal').querySelector('.modal-box').classList.toggle('wide', !!lebar);
  $('modal').hidden = false;
  const f = $('modalIsi').querySelector('[autofocus]');
  if (f) setTimeout(() => f.focus(), 50);
}
function tutupModal() {
  $('modal').hidden = true;
  $('modalIsi').innerHTML = '';
  if (S.section === 'scan') fokusScan();
}
function konfirmasi(judul, pesan, label, tipe) {
  return new Promise((resolve) => {
    modal(`<h2>${esc(judul)}</h2><p class="muted mt">${pesan}</p>
      <div class="modal-actions"><button class="btn btn-ghost" id="kfBatal">Batal</button>
      <button class="btn ${tipe === 'danger' ? 'btn-danger' : 'btn-primary'}" id="kfYa">${esc(label || 'Ya, lanjutkan')}</button></div>`);
    $('kfBatal').onclick = () => { tutupModal(); resolve(false); };
    $('kfYa').onclick = () => { tutupModal(); resolve(true); };
  });
}
function sibuk(btn, on, teks) {
  if (!btn) return;
  if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner dark" style="width:18px;height:18px;border-width:2px"></span> ${esc(teks || 'Memproses…')}`; }
  else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
}
function skeletonRows(n, kol) {
  return Array.from({ length: n }, () => `<tr>${Array.from({ length: kol }, () => '<td><div class="skeleton"></div></td>').join('')}</tr>`).join('');
}
function pager(el, total, page, onGo) {
  const pages = Math.max(1, Math.ceil(total / PER_HAL));
  const a = total ? (page - 1) * PER_HAL + 1 : 0, b = Math.min(total, page * PER_HAL);
  const nums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  el.innerHTML = `<span>Menampilkan <b>${a}–${b}</b> dari <b>${total}</b></span><div class="pager-btns">
    <button ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}"><span class="ms">chevron_left</span></button>
    ${nums.map((n) => n === '…' ? '<span>…</span>' : `<button class="${n === page ? 'active' : ''}" data-p="${n}">${n}</button>`).join('')}
    <button ${page >= pages ? 'disabled' : ''} data-p="${page + 1}"><span class="ms">chevron_right</span></button></div>`;
  $$('button[data-p]', el).forEach((b) => { b.onclick = () => onGo(Number(b.dataset.p)); });
}

/** Kompres gambar di browser sebelum dikirim (hemat kuota & waktu unggah). */
function kompresGambar(file, maxDim, kualitas, mime) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('File tidak bisa dibaca.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar yang valid.'));
      img.onload = () => {
        const skala = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * skala); c.height = Math.round(img.height * skala);
        const ctx = c.getContext('2d');
        if ((mime || 'image/jpeg') === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const url = c.toDataURL(mime || 'image/jpeg', kualitas || 0.8);
        resolve({ dataUrl: url, base64: url.split(',')[1], mime: mime || 'image/jpeg' });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function hapusChart(k) { if (S.charts[k]) { S.charts[k].destroy(); delete S.charts[k]; } }

// ════════════════════════════════════════════════════════
// 2. INISIALISASI, LOGIN, NAVIGASI
// ════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  document.documentElement.setAttribute('data-theme', simpan.get('tema', 'light'));
  $('ikonTema').textContent = simpan.get('tema', 'light') === 'dark' ? 'light_mode' : 'dark_mode';
  pasangEvent();
  setInterval(detik, 1000);
  // Jaga sesi tetap aktif (kiosk bisa diam ±7 jam antara jam masuk dan pulang)
  setInterval(() => { if (S.token) call('apiPing', S.token).then((ms) => { S.offset = ms - Date.now(); }).catch(() => {}); }, 20 * 60 * 1000);
  call('apiInit', simpan.get('token', ''))
    .then((d) => {
      terapkanApp(d.app);
      if (d.sesi) masuk(d.sesi); else tampilLogin();
    })
    .catch((e) => {
      tampilLogin();
      tampilAlertLogin(e.message);
    })
    .finally(() => { $('loader').hidden = true; });
});

function terapkanApp(app) {
  S.app = Object.assign({}, brandBaca() || {}, app || {});
  brandSimpan(S.app);
  terapkanBrand(S.app); // nama, logo, favicon, layar loading (lihat js/api.js)
  document.title = (S.app.namaAplikasi || 'Absen Digital') + ' — ' + (S.app.namaSekolah || 'SMA Triguna 1956 Jakarta');
}

function tampilLogin() {
  ['viewStaf', 'viewSiswa'].forEach((v) => { $(v).hidden = true; });
  $('viewLogin').hidden = false;
  tutupAlertLogin();
  setTimeout(() => $('loginUser').focus(), 50);
}
function tampilAlertLogin(msg) { $('loginAlertText').textContent = msg; $('loginAlert').hidden = false; }
function tutupAlertLogin() { $('loginAlert').hidden = true; }
function lihatSandi(id, btn) {
  const i = $(id);
  i.type = i.type === 'password' ? 'text' : 'password';
  btn.querySelector('.ms').textContent = i.type === 'password' ? 'visibility' : 'visibility_off';
}

/** Satu form login untuk semua peran: username staf, atau NIS untuk siswa. */
function login(e) {
  e.preventDefault();
  const b = e.target.querySelector('button[type=submit]');
  tutupAlertLogin();
  sibuk(b, true, 'Masuk…');
  call('apiLogin', $('loginUser').value, $('loginSandi').value)
    .then((s) => { $('loginSandi').value = ''; masuk(s); })
    .catch((err) => tampilAlertLogin(err.message)).finally(() => sibuk(b, false));
  return false;
}

function masuk(sesi) {
  S.sesi = sesi; S.token = sesi.token;
  simpan.set('token', sesi.token);
  $('viewLogin').hidden = true;
  tutupAlertLogin();
  if (sesi.tipe === 'siswa') {
    $('viewSiswa').hidden = false;
    $('psBulan').value = tglStr().substr(0, 7);
    navigateSiswa('beranda');
    return;
  }
  $('viewStaf').hidden = false;
  const admin = sesi.peran === 'Admin';
  $$('[data-admin]').forEach((el) => { el.hidden = !admin; });
  $('tbNama').textContent = sesi.nama;
  $('tbAvatar').textContent = inisial(sesi.nama);
  $('tbPeran').textContent = sesi.peran;
  $('tbPeran').classList.toggle('admin', admin);
  let awal = simpan.get('section', 'dashboard');
  if (!admin && ['bulanan', 'siswa', 'log', 'pengaturan'].includes(awal)) awal = 'dashboard';
  navigateTo(awal);
}

function sesiHabis() {
  if (!S.token) return;
  S.token = ''; S.sesi = null;
  simpan.del('token');
  toast('warn', 'Sesi berakhir', 'Silakan masuk kembali.');
  tampilLogin();
}

function logout() {
  const t = S.token;
  S.token = ''; S.sesi = null;
  simpan.del('token');
  if (S.refresh) clearInterval(S.refresh);
  call('apiLogout', t).catch(() => {});
  tampilLogin();
}

function navigateTo(sec) {
  if (!S.sesi || S.sesi.tipe !== 'staf') return;
  if (S.sesi.peran !== 'Admin' && ['bulanan', 'siswa', 'log', 'pengaturan'].includes(sec)) sec = 'dashboard';
  S.section = sec;
  simpan.set('section', sec);
  $$('#viewStaf .section').forEach((el) => el.classList.toggle('active', el.id === 'sec-' + sec));
  $$('#sideNav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === sec));
  toggleSidebar(false);
  window.scrollTo(0, 0);
  if (S.refresh) { clearInterval(S.refresh); S.refresh = null; }
  const muat = { dashboard: muatDashboard, scan: initScan, rekap: muatRekap, pengajuan: muatPengajuan, bulanan: muatBulanan, siswa: muatSiswa, log: muatLog, pengaturan: muatPengaturan }[sec];
  if (muat) muat();
  if (sec === 'dashboard') S.refresh = setInterval(() => { if (!document.hidden) muatDashboard(true); }, 60000);
}

function toggleSidebar(buka) {
  const open = buka === undefined ? !$('sidebar').classList.contains('open') : buka;
  $('sidebar').classList.toggle('open', open);
  $$('.side-backdrop').forEach((b) => b.classList.toggle('open', open));
}

function toggleTema() {
  const baru = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', baru);
  simpan.set('tema', baru);
  $('ikonTema').textContent = baru === 'dark' ? 'light_mode' : 'dark_mode';
  if (S.section === 'dashboard' && S.dashData) renderDonut(S.dashData);
  if (S.section === 'bulanan' && S.bl.data) renderGrafikBulanan();
}

/** Jam berjalan (topbar, stasiun scan, monitor) + pergantian mode otomatis. */
function detik() {
  const d = sekarang();
  const j = jamStr(d);
  if ($('tbJam')) $('tbJam').textContent = j;
  if ($('tbTanggal')) $('tbTanggal').textContent = tglPanjang(tglStr(d));
  if (S.section === 'scan') {
    $('scJamServer').textContent = j;
    if (S.scan.auto && S.scan.aturan) {
      const m = j.substr(0, 5) >= S.scan.aturan.jamPulangMulai ? 'PULANG' : 'MASUK';
      if (m !== S.scan.mode) setMode(m, true);
    }
  }
}

function pasangEvent() {
  // Pemindai USB: proses saat Enter/Tab, atau otomatis bila pemindai tidak mengirim akhiran
  pasangPemindai($('scanInput'), (v) => prosesScan(v, S.scan.perangkat));
  $$('#sideNav a').forEach((a) => { a.onclick = () => navigateTo(a.dataset.nav); });
  $$('#modeSwitch button').forEach((b) => { b.onclick = () => setMode(b.dataset.mode, false); });
  $$('#pjTabs button').forEach((b) => { b.onclick = () => { S.pj.tab = b.dataset.tab; S.pj.sel = null; $$('#pjTabs button').forEach((x) => x.classList.toggle('active', x === b)); renderPengajuanList(); }; });
  $$('#pjTingkat button').forEach((b) => { b.onclick = () => { S.pj.tingkat = b.dataset.t; $$('#pjTingkat button').forEach((x) => x.classList.toggle('active', x === b)); renderPengajuanList(); }; });
  $$('#blTipe button').forEach((b) => { b.onclick = () => { S.bl.tipe = b.dataset.tipe; $$('#blTipe button').forEach((x) => x.classList.toggle('active', x === b)); renderGrafikBulanan(); }; });
  $$('#pgTabs button').forEach((b) => { b.onclick = () => { $$('#pgTabs button').forEach((x) => x.classList.toggle('active', x === b)); $$('.pg-pane').forEach((p) => { p.hidden = p.id !== 'pg-' + b.dataset.tab; }); }; });
  $$('.bottom-nav a').forEach((a) => { a.onclick = () => navigateSiswa(a.dataset.ps); });
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') tutupModal(); });
  $('ajAlasan').addEventListener('input', () => { $('ajHitung').textContent = $('ajAlasan').value.length + '/300'; });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('modal').hidden) tutupModal();
    if (S.section !== 'scan' || !$('modal').hidden) return;
    if (e.key === 'F2') { e.preventDefault(); $('scanInput').value = ''; fokusScan(); }
    if (e.key === 'F9') { e.preventDefault(); bukaManual(); }
  });
  // Klik area kosong di stasiun scan → kursor kembali ke input barcode
  document.addEventListener('click', (e) => {
    if (S.section !== 'scan' || !$('modal').hidden) return;
    if (!e.target.closest('input,select,textarea,button,a,label')) fokusScan();
  });
}

// ════════════════════════════════════════════════════════
// 3. DASHBOARD
// ════════════════════════════════════════════════════════
function muatDashboard(diam) {
  if (!diam) $('dbStat').innerHTML = Array.from({ length: 5 }, () => '<div class="stat"><div class="skeleton" style="height:90px"></div></div>').join('');
  call('apiDashboard', S.token, tglStr()).then((d) => { S.dashData = d; renderDashboard(d); }).catch((e) => { if (!diam) gagal(e); });
}

function renderDashboard(d) {
  const j = Number(jamStr().substr(0, 2));
  const sapa = j < 11 ? 'Selamat pagi' : j < 15 ? 'Selamat siang' : j < 18 ? 'Selamat sore' : 'Selamat malam';
  $('dbSapa').textContent = `${sapa}, ${d.nama}`;
  $('dbSesi').textContent = d.hariSekolah ? 'SESI AKTIF • ' + tglPanjang(d.tanggal).toUpperCase() : 'HARI LIBUR' + (d.keteranganLibur ? ' • ' + d.keteranganLibur.toUpperCase() : '');
  $('dbSub').textContent = `Pemantauan kehadiran real-time. Sistem memantau ${d.total} siswa aktif. Batas tepat waktu pukul ${d.batasTepat} WIB.`;

  const n = d.jumlah, t = d.total || 0;
  const kartu = [
    { st: 'Hadir', label: 'Hadir Tepat Waktu', ikon: 'check_circle', tile: 'green', v: n.Hadir, foot: `Sebelum ${d.batasTepat} WIB` },
    { st: 'Terlambat', label: 'Terlambat Masuk', ikon: 'alarm', tile: 'orange', v: n.Terlambat, foot: `Setelah ${d.batasTepat} WIB` },
    { st: 'Izin', label: 'Izin', ikon: 'assignment', tile: 'blue', v: n.Izin, foot: 'Surat terverifikasi' },
    { st: 'Sakit', label: 'Sakit', ikon: 'medical_services', tile: 'purple', v: n.Sakit, foot: 'Dengan surat' },
    { st: 'Alpa', label: n['Belum Hadir'] ? 'Belum Hadir / Alpa' : 'Alpa', ikon: 'error', tile: 'red', v: n.Alpa + n['Belum Hadir'], foot: n['Belum Hadir'] ? `Ditandai Alpa pukul ${d.notif.jam}` : 'Walas dinotifikasi' }
  ];
  $('dbStat').innerHTML = kartu.map((k) => `<div class="stat">
      <div class="stat-top"><div class="icon-tile ${k.tile}"><span class="ms">${k.ikon}</span></div><span class="pill pill-${k.st.toLowerCase()}">${persen(k.v, t)}%</span></div>
      <div class="stat-label">${k.label}</div>
      <div class="stat-value" style="${k.st === 'Alpa' && k.v ? 'color:var(--danger)' : ''}">${k.v}<small>siswa</small></div>
      <div class="stat-foot">${esc(k.foot)}</div></div>`).join('');

  $('dbLegend').innerHTML = STATUS.map((s) => `<span><i style="background:${WARNA[s]}"></i>${s}</span>`).join('') + (n['Belum Hadir'] ? `<span><i style="background:${WARNA['Belum Hadir']}"></i>Belum Hadir</span>` : '');
  $('dbTingkat').innerHTML = d.perTingkat.length ? d.perTingkat.map((g) => {
    const hadir = g.Hadir + g.Terlambat;
    const seg = STATUS.concat(['Belum Hadir']).map((s) => g[s] ? `<i class="c-${s === 'Belum Hadir' ? 'belum' : s.toLowerCase()}" style="width:${(g[s] / g.total) * 100}%" title="${s}: ${g[s]}"></i>` : '').join('');
    return `<div class="bar-row"><div class="row between"><b>Kelas ${esc(g.nama)}</b><span class="small"><b style="color:var(--hadir-fg)">${persen(hadir, g.total)}% hadir</b> <span class="muted">(${hadir}/${g.total} siswa)</span></span></div>
      <div class="stackbar">${seg}</div></div>`;
  }).join('') : '<div class="empty"><span class="ms">groups</span><p>Belum ada data siswa.</p></div>';
  const top = d.perKelas.slice().sort((a, b) => persen(b.Hadir + b.Terlambat, b.total) - persen(a.Hadir + a.Terlambat, a.total))[0];
  $('dbTertinggi').innerHTML = top ? `Kehadiran tertinggi: <b>Kelas ${esc(top.nama)}</b> (${persen(top.Hadir + top.Terlambat, top.total)}%)` : '';

  renderDonut(d);

  $('dbJumlahTunggu').textContent = d.jumlahMenunggu + ' Menunggu';
  $('badgePengajuan').hidden = !d.jumlahMenunggu;
  $('badgePengajuan').textContent = d.jumlahMenunggu;
  $('dbMenunggu').innerHTML = d.menunggu.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Siswa</th><th>Tipe</th><th>Tanggal</th><th></th></tr></thead><tbody>
    ${d.menunggu.map((p) => `<tr><td><div class="person">${avatar(p.nama, p.foto)}<div><b>${esc(p.nama)}</b><small>${esc(p.kelas)}</small></div></div></td>
      <td>${pill(p.jenis)}</td><td class="time">${tglPendek(p.dari)}${p.sampai !== p.dari ? ' – ' + tglPendek(p.sampai) : ''}</td>
      <td><button class="btn btn-soft sm" onclick="bukaPengajuan('${esc(p.id)}')">Tinjau</button></td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty"><span class="ms">task_alt</span><p>Semua pengajuan sudah ditinjau.</p></div>';
  $('dbMenungguInfo').textContent = `Menampilkan ${d.menunggu.length} dari ${d.jumlahMenunggu} pengajuan`;

  $('badgeLog').hidden = !d.jumlahAnomali || S.sesi.peran !== 'Admin';
  $('badgeLog').textContent = d.jumlahAnomali;
  $('dbAnomali').innerHTML = d.anomali.length ? `<div class="stack-sm">${d.anomali.map((a) => `<div class="feed-item"><div class="icon-tile orange"><span class="ms">content_copy</span></div>
      <div class="grow"><b>Kartu di-scan di dua perangkat</b><small>${esc(a.detail)}</small></div></div>`).join('')}
      ${S.sesi.peran === 'Admin' ? '<a class="link mt" onclick="navigateTo(\'log\')">Tinjau di Log Aktivitas <span class="ms">chevron_right</span></a>' : ''}</div>`
    : '<div class="empty"><span class="ms">verified</span><p>Tidak ada kejanggalan scan.</p></div>';

  const nt = d.notif;
  $('dbNotif').innerHTML = `<span class="ms">mail</span><div class="grow"><b>${nt.aktif ? `Notifikasi walas terjadwal otomatis ${nt.jam} WIB` : 'Notifikasi walas nonaktif'}</b>
    ${nt.terakhir ? ` • Terakhir ${esc(nt.terakhir.waktu)}: ${nt.terakhir.jumlahEmail} email, ${nt.terakhir.jumlahSiswa} siswa Alpa` : ' • Belum pernah terkirim'}</div>`;
}

function renderDonut(d) {
  const n = d.jumlah;
  const labels = STATUS.concat(n['Belum Hadir'] ? ['Belum Hadir'] : []);
  const data = labels.map((s) => n[s] || 0);
  $('dbTotal').textContent = d.total;
  hapusChart('donut');
  if (typeof Chart !== 'undefined') {
    S.charts.donut = new Chart($('dbDonut'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data: data.some(Boolean) ? data : [1], backgroundColor: data.some(Boolean) ? labels.map((s) => WARNA[s]) : [cssVar('--border')], borderWidth: 0 }] },
      options: { cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: data.some(Boolean) } }, animation: { duration: 400 } }
    });
  }
  $('dbDonutLegend').innerHTML = STATUS.slice(0, 4).map((s) => `<div><span><i class="dot" style="color:${WARNA[s]}"></i> ${s}</span><b>${persen(n[s], d.total)}%</b></div>`).join('')
    + `<div class="full"><span>Alpa &amp; belum hadir</span><b>${persen(n.Alpa + n['Belum Hadir'], d.total)}% (${n.Alpa + n['Belum Hadir']})</b></div>`;
}

// ════════════════════════════════════════════════════════
// 4. STASIUN SCAN & LAYAR MONITOR
// ════════════════════════════════════════════════════════
function initScan() {
  S.scan.perangkat = simpan.get('perangkat', 'Kiosk 01');
  S.scan.suara = simpan.get('suara', '1') === '1';
  $('scPerangkat').textContent = S.scan.perangkat;
  $('scSuaraInfo').innerHTML = S.scan.suara ? '<span class="ms">volume_up</span> Suara aktif' : '<span class="ms">volume_off</span> Suara mati';
  fokusScan();
  call('apiScanInit', S.token).then((d) => {
    S.offset = d.serverMs - Date.now();
    S.scan.aturan = d.aturan;
    $('scRentangMasuk').textContent = `(${d.aturan.jamMasukMulai}–${d.aturan.batasTepat})`;
    $('scRentangPulang').textContent = `(${d.aturan.jamPulangMulai}–${d.aturan.jamPulangSelesai})`;
    $('scLibur').hidden = d.hariSekolah;
    $('scLiburText').textContent = d.keteranganLibur ? d.keteranganLibur + '. Scan tidak akan dicatat.' : 'Hari ini tidak termasuk hari sekolah. Scan tidak akan dicatat.';
    S.scan.auto = true;
    renderStatScan(d.statistik);
  }).catch(gagal);
}

function fokusScan() { setTimeout(() => { if (S.section === 'scan' && $('modal').hidden) $('scanInput').focus(); }, 30); }

function setMode(m, otomatis) {
  S.scan.mode = m;
  if (!otomatis) S.scan.auto = false;
  $$('#modeSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  fokusScan();
}

function toggleSuara() {
  S.scan.suara = !S.scan.suara;
  simpan.set('suara', S.scan.suara ? '1' : '0');
  $('scSuaraInfo').innerHTML = S.scan.suara ? '<span class="ms">volume_up</span> Suara aktif' : '<span class="ms">volume_off</span> Suara mati';
}

let audioCtx = null;
function bunyi(ok) {
  if (!S.scan.suara) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const nada = ok ? [[880, 0], [1320, 0.12]] : [[220, 0], [180, 0.18]];
    nada.forEach(([f, t]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = ok ? 'sine' : 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + (ok ? 0.11 : 0.2));
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.25);
    });
  } catch (e) { /* perangkat tanpa audio */ }
}

function kirimScan(e) {
  e.preventDefault();
  const v = $('scanInput').value;
  $('scanInput').value = '';
  prosesScan(v, S.scan.perangkat);
  return false;
}

/** Scan diproses berurutan (antrean) agar tidak ada yang tertukar saat siswa antre cepat. */
function prosesScan(kode, perangkat, modeKhusus) {
  kode = String(kode || '').trim();
  if (!kode) return Promise.resolve();
  const mode = modeKhusus || S.scan.mode;
  // Tampilkan tanda "sedang diproses" SEKETIKA, walaupun masih ada scan sebelumnya di antrean
  $('scHasil').innerHTML = `<div class="empty"><div class="spinner dark"></div><p>Memverifikasi <b class="mono">${esc(kode)}</b>…</p></div>`;
  S.scan.antrean = S.scan.antrean.then(() => {
    $('scHasil').innerHTML = `<div class="empty"><div class="spinner dark"></div><p>Memverifikasi <b class="mono">${esc(kode)}</b>…</p></div>`;
    return call('apiScan', S.token, kode, mode, perangkat)
      .then((d) => { bunyi(true); tampilHasilScan(d, null); if (d.statistik) renderStatScan(d.statistik); })
      .catch((err) => { bunyi(false); tampilHasilScan(null, err, kode); });
  });
  return S.scan.antrean;
}

function tampilHasilScan(d, err, kode) {
  if (err) {
    const info = err.data && err.data.siswa;
    $('scHasil').innerHTML = `<div class="result">
      <div class="result-head"><span class="pill pill-alpa"><span class="ms" style="font-size:16px">cancel</span> VERIFIKASI GAGAL</span><span class="small muted mono">${esc(kode || '')}</span></div>
      ${info ? hasilOrang(info, true) : ''}
      <div class="result-box err"><div class="eyebrow">PESAN SISTEM</div><div class="big txt">${esc(err.message)}</div>
      <p class="small mt">${err.data && err.data.kode === 'TIDAK_DIKENAL' ? 'Pastikan kartu milik siswa SMA Triguna 1956. Gunakan "Catat manual" bila kartu rusak.' : 'Silakan hubungi guru piket.'}</p></div></div>`;
    return;
  }
  const telat = d.status === 'Terlambat';
  const batas = S.scan.aturan ? S.scan.aturan.batasTepat : '07:00';
  const ket = d.mode === 'PULANG' ? 'Scan pulang tercatat' : telat ? `Terlambat — setelah ${batas}` : `Tepat waktu — sebelum ${batas}`;
  $('scHasil').innerHTML = `<div class="result">
    <div class="result-head"><span class="pill pill-hadir"><span class="ms" style="font-size:16px">verified</span> VERIFIKASI BERHASIL</span><span class="small muted">Scan ${d.mode.toLowerCase()} • ${esc(S.scan.perangkat)}</span></div>
    ${hasilOrang(d.siswa, false)}
    <div class="result-grid">
      <div class="result-box"><div class="eyebrow">WAKTU PEMINDAIAN</div><div class="big">${esc(d.jam)} <small style="font-size:14px">WIB</small></div><p class="small mt"><span class="ms" style="font-size:16px">schedule</span> ${esc(ket)}</p></div>
      <div class="result-box ${d.mode === 'PULANG' ? '' : telat ? 'late' : 'ok'}"><div class="eyebrow">STATUS KEHADIRAN</div><div class="big txt"><span class="ms">${telat ? 'alarm' : 'check_circle'}</span> ${d.mode === 'PULANG' ? 'PULANG' : telat ? 'TERLAMBAT' : 'HADIR TEPAT WAKTU'}</div><p class="small mt">${d.mode === 'PULANG' ? 'Status hari ini: ' + esc(d.status) : 'Tercatat dengan waktu server'}</p></div>
    </div>
    <div class="row gap wrap"><button class="btn btn-outline" onclick="koreksiDariScan()"><span class="ms">edit_note</span> Koreksi Status</button></div></div>`;
  S.scan.terakhir = d;
}

function hasilOrang(s, err) {
  return `<div class="result-person">
    <div class="result-photo" style="${s.fotoData ? `background-image:url('${s.fotoData}')` : ''}">${s.fotoData ? '' : esc(inisial(s.nama))}<span class="badge-ok ${err ? 'err' : ''}"><span class="ms">${err ? 'close' : 'check'}</span></span></div>
    <div><div class="row gap wrap">${kelasPill(s.kelas)}</div><h2>${esc(s.nama)}</h2>
    <div class="small muted">NIS: <b class="mono">${esc(s.nis)}</b>${s.walas ? ` • Wali Kelas: <b>${esc(s.walas)}</b>` : ''}</div></div></div>`;
}

function koreksiDariScan() {
  const d = S.scan.terakhir;
  if (!d) return;
  const s = (S.scan.siswa || []).find((x) => x.kode === d.siswa.kode);
  const buka = (list) => {
    const x = list.find((y) => y.kode === d.siswa.kode);
    if (x) modalUbahStatus({ idSiswa: x.id, nama: x.nama, nis: x.nis, kelas: x.kelas, status: d.status }, d.tanggal, initScan);
  };
  if (s) buka(S.scan.siswa); else muatSiswaRingkas().then(buka).catch(gagal);
}

function renderStatScan(st) {
  $('scStat').innerHTML = [
    { l: 'HADIR', v: st.hadir, ikon: 'how_to_reg', tile: 'green', f: 'Tepat waktu' },
    { l: 'TERLAMBAT', v: st.terlambat, ikon: 'alarm', tile: 'orange', f: S.scan.aturan ? 'Setelah ' + S.scan.aturan.batasTepat : '' },
    { l: 'BELUM HADIR', v: st.belum, ikon: 'person_search', tile: 'slate', f: `Total ${st.total} siswa` }
  ].map((k) => `<div class="stat"><div class="stat-top"><span class="eyebrow">${k.l}</span><div class="icon-tile ${k.tile}" style="width:34px;height:34px"><span class="ms">${k.ikon}</span></div></div>
      <div class="stat-value">${k.v}</div><div class="small muted">${esc(k.f)}</div></div>`).join('');
  const t = st.total || 1;
  $('scBarHadir').style.width = (st.hadir / t) * 100 + '%';
  $('scBarTelat').style.width = (st.terlambat / t) * 100 + '%';
  $('scBarIzin').style.width = (st.izinSakit / t) * 100 + '%';
  $('scPersen').textContent = persen(st.hadir + st.terlambat, st.total) + '%';
  $('scBarKet').innerHTML = `<span style="color:var(--hadir)">●</span> ${st.hadir} tepat &nbsp; <span style="color:var(--accent)">●</span> ${st.terlambat} terlambat &nbsp; <span style="color:var(--izin)">●</span> ${st.izinSakit} izin/sakit &nbsp; <span class="muted">●</span> ${st.belum} belum`;
  $('scFeed').innerHTML = st.feed.length ? st.feed.map((f) => `<div class="feed-item">${avatar(f.nama, f.foto)}
      <div class="grow"><b>${esc(f.nama)}</b><small>${esc(f.kelas)} • <span class="mono">${esc(f.kode)}</span></small></div>
      <div class="right-col">${f.mode === 'PULANG' ? '<span class="pill pill-izin">PULANG</span>' : pill(f.status)}<span>${esc(f.jam)}</span></div></div>`).join('')
    : '<div class="empty"><span class="ms">hourglass_empty</span><p>Belum ada scan hari ini.</p></div>';
}

function muatSiswaRingkas() {
  if (S.scan.siswa) return Promise.resolve(S.scan.siswa);
  return call('apiSiswaRingkas', S.token).then((l) => { S.scan.siswa = l; return l; });
}

function bukaManual() {
  modal(`<h2>Catat Presensi Manual</h2><p class="muted small mt">Untuk kartu rusak, hilang, atau saat pemindai bermasalah. Tercatat dengan metode "Manual".</p>
    <div class="seg mt" id="mnMode"><button class="seg-btn ${S.scan.mode === 'MASUK' ? 'active' : ''}" data-m="MASUK">Masuk</button><button class="seg-btn ${S.scan.mode === 'PULANG' ? 'active' : ''}" data-m="PULANG">Pulang</button></div>
    <div class="input-icon mt"><span class="ms">search</span><input id="mnCari" placeholder="Ketik nama atau NIS siswa…" autofocus></div>
    <div class="search-list" id="mnList"><div class="empty"><div class="spinner dark"></div></div></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="tutupModal()">Batal</button><button class="btn btn-primary" id="mnSimpan" disabled><span class="ms">check</span> Catat</button></div>`);
  let mode = S.scan.mode, pilih = null;
  $$('#mnMode button').forEach((b) => { b.onclick = () => { mode = b.dataset.m; $$('#mnMode button').forEach((x) => x.classList.toggle('active', x === b)); }; });
  const render = (list) => {
    const q = $('mnCari').value.toLowerCase().trim();
    const hasil = list.filter((s) => !q || s.nama.toLowerCase().includes(q) || s.nis.includes(q)).slice(0, 30);
    $('mnList').innerHTML = hasil.length ? hasil.map((s) => `<button data-k="${esc(s.kode)}" class="${pilih === s.kode ? 'sel' : ''}"><span><b>${esc(s.nama)}</b><br><small class="muted">NIS ${esc(s.nis)}</small></span>${kelasPill(s.kelas)}</button>`).join('')
      : '<div class="empty"><p>Siswa tidak ditemukan.</p></div>';
    $$('#mnList button').forEach((b) => { b.onclick = () => { pilih = b.dataset.k; $('mnSimpan').disabled = false; render(list); }; });
  };
  muatSiswaRingkas().then((list) => { render(list); $('mnCari').oninput = () => render(list); }).catch(gagal);
  $('mnSimpan').onclick = () => {
    if (!pilih) return;
    tutupModal();
    prosesScan(pilih, 'Manual', mode);
  };
}

function aturPerangkat() {
  modal(`<h2>Nama Perangkat / Kiosk</h2><p class="muted small mt">Dipakai untuk mendeteksi kartu yang di-scan di dua perangkat berbeda dalam waktu berdekatan. Beri nama unik per komputer.</p>
    <label class="field mt"><span>Nama perangkat</span><input id="npNama" maxlength="30" value="${esc(S.scan.perangkat)}" autofocus></label>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="tutupModal()">Batal</button><button class="btn btn-primary" id="npSimpan">Simpan</button></div>`);
  $('npSimpan').onclick = () => {
    const v = $('npNama').value.trim() || 'Kiosk 01';
    simpan.set('perangkat', v);
    S.scan.perangkat = v;
    $('scPerangkat').textContent = v;
    tutupModal();
  };
}

// ── Layar monitor: dibuka di TAB BARU (monitor.html) dengan kunci perangkat sendiri ──
// Kunci perangkat disimpan di browser ini dan tidak ikut habis saat admin logout,
// sehingga layar monitor tetap berjalan walaupun dashboard dipakai di tab/komputer lain.
function bukaMonitor() {
  let ada = null;
  try { ada = JSON.parse(localStorage.getItem('absen_kiosk') || 'null'); } catch (e) { ada = null; }
  if (ada && ada.kunci) { window.open('monitor.html', '_blank'); return; }
  // Buka tab dulu (agar tidak diblokir pop-up blocker), lalu siapkan kunci perangkat
  const tab = window.open('monitor.html#menyiapkan', '_blank');
  call('apiKioskBuat', S.token, S.scan.perangkat || simpan.get('perangkat', 'Kiosk Gerbang')).then((k) => {
    try { localStorage.setItem('absen_kiosk', JSON.stringify({ kunci: k.kunci, nama: k.nama })); } catch (e) { /* abaikan */ }
    if (!tab || tab.closed) window.open('monitor.html', '_blank');
    toast('sukses', 'Layar monitor dibuka di tab baru', 'Perangkat: ' + k.nama);
  }).catch((e) => { if (tab && !tab.closed) tab.close(); gagal(e); });
}

// ════════════════════════════════════════════════════════
// 5. REKAP HARIAN
// ════════════════════════════════════════════════════════
function muatRekap() {
  if (!$('rkTanggal').value) $('rkTanggal').value = tglStr();
  $('rkBody').innerHTML = skeletonRows(8, 9);
  call('apiRekapHarian', S.token, $('rkTanggal').value).then((d) => {
    S.rekap.data = d; S.rekap.page = 1;
    const kelas = Array.from(new Set(d.rows.map((r) => r.kelas))).sort();
    const pilihK = $('rkKelas').value;
    $('rkKelas').innerHTML = '<option value="">Semua Kelas</option>' + kelas.map((k) => `<option ${k === pilihK ? 'selected' : ''}>${esc(k)}</option>`).join('');
    const pilihS = $('rkStatus').value;
    $('rkStatus').innerHTML = '<option value="">Semua Status</option>' + STATUS.concat(['Belum Hadir']).map((s) => `<option ${s === pilihS ? 'selected' : ''}>${s}</option>`).join('');
    renderRekap();
  }).catch(gagal);
}
function geserTanggal(n) { $('rkTanggal').value = geserHari($('rkTanggal').value || tglStr(), n); muatRekap(); }
function resetFilterRekap() { $('rkCari').value = ''; $('rkKelas').value = ''; $('rkStatus').value = ''; S.rekap.chip = ''; renderRekap(); }

function renderRekap() {
  const d = S.rekap.data;
  if (!d) return;
  const q = $('rkCari').value.toLowerCase().trim();
  const k = $('rkKelas').value;
  const st = $('rkStatus').value || S.rekap.chip;
  const dasar = d.rows.filter((r) => (!k || r.kelas === k) && (!q || r.nama.toLowerCase().includes(q) || r.nis.includes(q)));
  const rows = dasar.filter((r) => !st || r.status === st);
  const n = {};
  dasar.forEach((r) => { n[r.status] = (n[r.status] || 0) + 1; });
  const chipKls = { Hadir: 'pill-hadir', Terlambat: 'pill-terlambat', Izin: 'pill-izin', Sakit: 'pill-sakit', Alpa: 'pill-alpa', 'Belum Hadir': 'pill-belum' };
  $('rkChips').innerHTML = `<button class="semua ${!st ? 'active' : ''}" data-c="">Semua Presensi <b>${dasar.length}</b></button>` +
    Object.keys(chipKls).filter((s) => n[s] || s !== 'Belum Hadir').map((s) => `<button class="${chipKls[s]} ${st === s ? 'active' : ''}" data-c="${s}"><i class="dot"></i>${s} <b>${n[s] || 0}</b></button>`).join('');
  $$('#rkChips button').forEach((b) => { b.onclick = () => { S.rekap.chip = b.dataset.c; $('rkStatus').value = ''; S.rekap.page = 1; renderRekap(); }; });

  const hadir = (n.Hadir || 0) + (n.Terlambat || 0);
  const jamMasuk = dasar.map((r) => r.masuk).filter(Boolean).sort();
  const puncak = jamMasuk.length ? `${jm(jamMasuk[Math.floor(jamMasuk.length * 0.25)])} – ${jm(jamMasuk[Math.floor(jamMasuk.length * 0.75)])}` : '—';
  const perangkat = new Set(dasar.map((r) => r.perangkat).filter((p) => p && p !== 'Manual' && p !== 'Portal Siswa'));
  $('rkRingkas').innerHTML = `
    <div class="stat"><div><div class="stat-label" style="margin:0">Tingkat Kehadiran</div><div class="stat-value">${persen(hadir, dasar.length)}%</div></div><div class="icon-tile blue"><span class="ms">donut_large</span></div></div>
    <div class="stat"><div><div class="stat-label" style="margin:0">Puncak Waktu Masuk (50% siswa)</div><div class="stat-value" style="color:var(--primary)">${puncak}</div></div><div class="icon-tile orange"><span class="ms">speed</span></div></div>
    <div class="stat"><div><div class="stat-label" style="margin:0">Kiosk / Perangkat Aktif</div><div class="stat-value">${perangkat.size}</div></div><div class="icon-tile green"><span class="ms">devices</span></div></div>`;

  if (!d.hariSekolah && !d.rows.length) {
    $('rkBody').innerHTML = `<tr><td colspan="9"><div class="empty"><span class="ms">event_busy</span><p>${esc(tglPanjang(d.tanggal))} bukan hari sekolah${d.keteranganLibur ? ' — ' + esc(d.keteranganLibur) : ''}.</p></div></td></tr>`;
    $('rkPager').innerHTML = '';
    return;
  }
  const page = Math.min(S.rekap.page, Math.max(1, Math.ceil(rows.length / PER_HAL)));
  const potong = rows.slice((page - 1) * PER_HAL, page * PER_HAL);
  const ikonMetode = { Kiosk: 'qr_code_scanner', Manual: 'edit_note', Pengajuan: 'description', Sistem: 'smart_toy' };
  $('rkBody').innerHTML = potong.length ? potong.map((r, i) => `<tr class="${r.status === 'Alpa' ? 'row-alpa' : ''}">
      <td class="muted">${String((page - 1) * PER_HAL + i + 1).padStart(2, '0')}</td>
      <td><div class="person">${avatar(r.nama, r.foto)}<div><b>${esc(r.nama)}</b><small>NIS ${esc(r.nis)}</small></div></div></td>
      <td>${kelasPill(r.kelas)}</td>
      <td class="time ${r.status === 'Terlambat' ? 'time-late' : ''}">${r.masuk ? esc(r.masuk) : '—'}</td>
      <td class="time">${r.pulang ? esc(r.pulang) : '—'}</td>
      <td class="small">${r.metode ? `<span class="ms" style="font-size:17px;color:var(--primary)">${ikonMetode[r.metode] || 'qr_code_scanner'}</span> ${esc(r.metode === 'Kiosk' ? r.perangkat || 'Kiosk' : r.metode)}` : '<span class="muted">—</span>'}</td>
      <td>${pill(r.status)}</td>
      <td class="small ${r.status === 'Alpa' ? '' : 'muted'}" style="max-width:220px">${esc(r.ket || (r.status === 'Hadir' ? 'Tepat waktu' : ''))}</td>
      <td><button class="icon-btn sm" title="Ubah status" data-i="${(page - 1) * PER_HAL + i}"><span class="ms">edit</span></button></td></tr>`).join('')
    : '<tr><td colspan="9"><div class="empty"><span class="ms">search_off</span><p>Tidak ada data sesuai filter.</p></div></td></tr>';
  $$('#rkBody button[data-i]').forEach((b) => { b.onclick = () => modalUbahStatus(rows[Number(b.dataset.i)], d.tanggal, muatRekap); });
  pager($('rkPager'), rows.length, page, (p) => { S.rekap.page = p; renderRekap(); });
}

function modalUbahStatus(r, tgl, selesai) {
  modal(`<span class="chip-blue">KOREKSI PRESENSI</span> <span class="small muted mono">${esc(tglPanjang(tgl))}</span>
    <h2 class="mt">Ubah Status Presensi</h2>
    <p class="small muted">Siswa: <b style="color:var(--text)">${esc(r.nama)}</b> • NIS ${esc(r.nis)} (${esc(r.kelas)})</p>
    <div class="field mt-lg"><span>Pilih status baru</span>
      <div class="status-options">${STATUS.map((s) => `<label class="status-opt"><i style="background:${WARNA[s]}"></i>${s}<input type="radio" name="usStatus" value="${s}" ${r.status === s ? 'checked' : ''}></label>`).join('')}</div></div>
    <label class="field mt"><span>Alasan &amp; catatan guru piket <small class="muted">(wajib)</small></span><textarea id="usKet" rows="3" maxlength="300" placeholder="Contoh: Terjebak macet, orang tua sudah konfirmasi ke guru piket"></textarea></label>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="tutupModal()">Batal</button><button class="btn btn-primary" id="usSimpan"><span class="ms">save</span> Simpan Perubahan</button></div>`);
  $('usSimpan').onclick = () => {
    const st = ($$('input[name=usStatus]').find((x) => x.checked) || {}).value;
    const ket = $('usKet').value.trim();
    if (!st) return toast('warn', 'Pilih status terlebih dahulu');
    if (!ket) return toast('warn', 'Alasan wajib diisi');
    sibuk($('usSimpan'), true);
    call('apiUbahStatus', S.token, r.idSiswa, tgl, st, ket)
      .then(() => { tutupModal(); toast('sukses', 'Status diperbarui', `${r.nama} → ${st}`); if (selesai) selesai(); })
      .catch((e) => { sibuk($('usSimpan'), false); gagal(e); });
  };
}

/** Ekspor Excel: server membuat file, lalu tombol unduh ditampilkan (klik langsung = tidak diblokir pop-up). */
function ekspor(jenis) {
  const param = jenis === 'bulanan' ? $('blBulan').value : $('rkTanggal').value;
  const kelas = jenis === 'bulanan' ? $('blKelas').value : '';
  modal('<div class="empty"><div class="spinner dark"></div><p>Menyiapkan file Excel…</p></div>');
  call('apiEkspor', S.token, jenis, param, kelas).then((d) => {
    // File dikirim server sebagai base64 → dibuat jadi file unduhan di browser
    const bin = atob(d.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: d.mime }));
    modal(`<div class="center"><div class="icon-tile green lg" style="margin:0 auto"><span class="ms">table_view</span></div>
      <h2 class="mt">File siap diunduh</h2><p class="muted small mt">${esc(d.nama)} · ${Math.max(1, Math.round(bytes.length / 1024))} KB</p>
      <div class="modal-actions" style="justify-content:center"><button class="btn btn-ghost" onclick="tutupModal()">Tutup</button>
      <a class="btn btn-primary" href="${url}" download="${esc(d.nama)}" onclick="setTimeout(tutupModal,300)"><span class="ms">download</span> Unduh .xlsx</a></div></div>`);
  }).catch((e) => { tutupModal(); gagal(e); });
}

// ════════════════════════════════════════════════════════
// 6. PENGAJUAN IZIN & SAKIT
// ════════════════════════════════════════════════════════
function muatPengajuan(pilihId) {
  pilihId = pilihId || S.pj.pilih;
  S.pj.pilih = null;
  $('pjList').innerHTML = '<div class="card"><div class="skeleton"></div><div class="skeleton mt"></div></div>';
  return call('apiPengajuanList', S.token).then((d) => {
    S.pj.data = d;
    $('pjNMenunggu').textContent = d.Menunggu.length;
    $('pjNDisetujui').textContent = d.Disetujui.length;
    $('pjNDitolak').textContent = d.Ditolak.length;
    $('badgePengajuan').hidden = !d.Menunggu.length;
    $('badgePengajuan').textContent = d.Menunggu.length;
    if (pilihId) {
      const tab = ['Menunggu', 'Disetujui', 'Ditolak'].find((t) => d[t].some((p) => p.id === pilihId));
      if (tab) { S.pj.tab = tab; $$('#pjTabs button').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab)); }
      S.pj.sel = pilihId;
    }
    renderPengajuanList();
  }).catch(gagal);
}
function bukaPengajuan(id) { S.pj.pilih = id; navigateTo('pengajuan'); }

function tingkatDari(k) { const m = String(k).toUpperCase().match(/^(XII|XI|X)(?=\b|[-\s])/); return m ? m[1] : ''; }

function renderPengajuanList() {
  const d = S.pj.data;
  if (!d) return;
  const q = $('pjCari').value.toLowerCase().trim();
  const list = d[S.pj.tab].filter((p) => (!S.pj.tingkat || tingkatDari(p.kelas) === S.pj.tingkat) &&
    (!q || p.nama.toLowerCase().includes(q) || p.nis.includes(q) || p.alasan.toLowerCase().includes(q)));
  if (!S.pj.sel || !list.some((p) => p.id === S.pj.sel)) S.pj.sel = list.length ? list[0].id : null;
  $('pjList').innerHTML = list.length ? list.map((p) => {
    const hari = selisihHari(p.dari, p.sampai);
    return `<div class="req-card ${p.id === S.pj.sel ? 'active' : ''}" data-id="${esc(p.id)}">
      <div class="row gap"><div class="avatar lg soft">${esc(inisial(p.nama))}</div>
        <div class="grow"><b>${esc(p.nama)}</b><div class="small muted">NIS ${esc(p.nis)} • ${esc(p.kelas)}</div></div>${pill(p.jenis)}</div>
      <div class="meta"><span><span class="ms" style="font-size:16px">calendar_month</span> ${tglPendek(p.dari)}${hari > 1 ? ' – ' + tglPendek(p.sampai) : ''} <b>(${hari} hari)</b></span>
        <span>${S.pj.tab === 'Menunggu' ? `<span class="ms" style="font-size:16px">schedule</span> ${esc(p.diajukan.substr(11, 5))} • ${tglPendek(p.diajukan.substr(0, 10))}` : pill(p.status)}</span></div></div>`;
  }).join('') : `<div class="card"><div class="empty"><span class="ms">${S.pj.tab === 'Menunggu' ? 'task_alt' : 'inbox'}</span><p>${S.pj.tab === 'Menunggu' ? 'Semua pengajuan sudah ditinjau.' : 'Belum ada data.'}</p></div></div>`;
  $$('#pjList .req-card').forEach((c) => { c.onclick = () => { S.pj.sel = c.dataset.id; renderPengajuanList(); }; });
  renderPengajuanDetail(list.find((p) => p.id === S.pj.sel));
}

function renderPengajuanDetail(p) {
  if (!p) { $('pjDetail').innerHTML = '<div class="empty"><span class="ms">inbox</span><p>Pilih pengajuan untuk ditinjau.</p></div>'; return; }
  const hari = selisihHari(p.dari, p.sampai);
  $('pjDetail').innerHTML = `<div class="req-detail">
    <div class="row gap wrap"><div class="avatar lg">${esc(inisial(p.nama))}</div>
      <div class="grow"><div class="row gap"><h2>${esc(p.nama)}</h2>${pill(p.jenis)}</div>
      <div class="small muted">NIS <b class="mono">${esc(p.nis)}</b> • Kelas <b>${esc(p.kelas)}</b>${p.walas ? ' • Walas ' + esc(p.walas) : ''}</div></div>${pill(p.status)}</div>
    <div class="row between"><b><span class="ms">description</span> Foto Surat ${p.jenis === 'Sakit' ? 'Keterangan Sakit' : 'Izin'}</b>
      <button class="btn btn-soft sm" id="pjPerbesar" disabled><span class="ms">zoom_in</span> Perbesar</button></div>
    <div class="doc-frame" id="pjGambar"><div class="spinner dark"></div></div>
    <div class="kv">
      <div><div class="eyebrow">JENIS PERMOHONAN</div><b>${esc(p.jenis)}</b></div>
      <div><div class="eyebrow">PERIODE &amp; DURASI</div><b>${tglPendek(p.dari)}${hari > 1 ? ' — ' + tglPendek(p.sampai) : ''} (${hari} hari)</b></div>
      <div class="full"><div class="eyebrow">ALASAN</div>${esc(p.alasan)}</div>
      <div><div class="eyebrow">DIAJUKAN</div>${esc(p.diajukan)} via Portal Siswa</div>
      ${p.status !== 'Menunggu' ? `<div><div class="eyebrow">DIPUTUSKAN</div>${esc(p.oleh)} • ${esc(p.waktuKeputusan)}</div>` : ''}
      ${p.catatan ? `<div class="full"><div class="eyebrow">CATATAN</div>${esc(p.catatan)}</div>` : ''}
    </div>
    ${p.status === 'Menunggu' ? `<div class="note"><span class="ms">shield</span><div><b>Catatan sistem:</b> menyetujui pengajuan ini otomatis mengubah status di Rekap Harian menjadi <i>${esc(p.jenis)}</i> untuk hari sekolah pada periode tersebut, sehingga wali kelas tidak menerima notifikasi Alpa.</div></div>
    <div class="decision"><button class="btn btn-success lg" id="pjSetuju"><span class="ms">check</span> Setujui Pengajuan</button>
      <button class="btn btn-danger-o lg" id="pjTolak"><span class="ms">close</span> Tolak Permohonan</button></div>` : ''}
  </div>`;
  // Muat gambar surat (privat di Drive, dikirim sebagai data URL)
  const tampil = (url) => {
    if (!$('pjGambar') || S.pj.sel !== p.id) return;
    $('pjGambar').innerHTML = `<img src="${url}" alt="Surat">`;
    $('pjGambar').querySelector('img').onclick = () => perbesarSurat(url, p);
    $('pjPerbesar').disabled = false;
    $('pjPerbesar').onclick = () => perbesarSurat(url, p);
  };
  if (!p.suratId) $('pjGambar').innerHTML = '<div class="empty"><span class="ms">hide_image</span><p>Tidak ada foto surat.</p></div>';
  else if (S.pj.gambar[p.suratId]) tampil(S.pj.gambar[p.suratId]);
  else call('apiSuratGambar', S.token, p.suratId).then((u) => { S.pj.gambar[p.suratId] = u; tampil(u); })
    .catch((e) => { if ($('pjGambar')) $('pjGambar').innerHTML = `<div class="empty"><span class="ms">broken_image</span><p>${esc(e.message)}</p></div>`; });

  if (p.status === 'Menunggu') {
    $('pjSetuju').onclick = () => putuskan(p, 'Disetujui', '', $('pjSetuju'));
    $('pjTolak').onclick = () => {
      modal(`<h2>Tolak Permohonan</h2><p class="muted small mt">${esc(p.nama)} • ${esc(p.jenis)} ${tglPendek(p.dari)}</p>
        <label class="field mt"><span>Alasan penolakan (dibaca siswa)</span><textarea id="tlAlasan" rows="3" maxlength="300" autofocus placeholder="Contoh: Foto surat tidak terbaca, mohon unggah ulang"></textarea></label>
        <div class="modal-actions"><button class="btn btn-ghost" onclick="tutupModal()">Batal</button><button class="btn btn-danger" id="tlYa">Konfirmasi Tolak</button></div>`);
      $('tlYa').onclick = () => {
        const a = $('tlAlasan').value.trim();
        if (!a) return toast('warn', 'Alasan penolakan wajib diisi');
        putuskan(p, 'Ditolak', a, $('tlYa'));
      };
    };
  }
}

function perbesarSurat(url, p) {
  modal(`<h2>Surat ${esc(p.jenis)} — ${esc(p.nama)}</h2><div class="doc-frame mt"><img src="${url}" style="max-height:75vh;cursor:default"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="tutupModal()">Tutup</button><a class="btn btn-primary" href="${url}" download="surat-${esc(p.nis)}-${esc(p.dari)}.jpg"><span class="ms">download</span> Unduh</a></div>`, true);
}

function putuskan(p, keputusan, catatan, btn) {
  sibuk(btn, true);
  call('apiPutuskanPengajuan', S.token, p.id, keputusan, catatan).then((r) => {
    tutupModal();
    toast('sukses', keputusan === 'Disetujui' ? 'Verifikasi berhasil' : 'Pengajuan ditolak',
      keputusan === 'Disetujui' ? `Pengajuan ${p.nama} disetujui • ${r.hariTercatat} hari tercatat di rekap` : `Pengajuan ${p.nama} ditolak`);
    S.pj.sel = null;
    muatPengajuan();
  }).catch((e) => { sibuk(btn, false); gagal(e); });
}

// ════════════════════════════════════════════════════════
// 7. LAPORAN BULANAN
// ════════════════════════════════════════════════════════
function muatBulanan() {
  if (!$('blBulan').value) $('blBulan').value = tglStr().substr(0, 7);
  $('blStat').innerHTML = Array.from({ length: 4 }, () => '<div class="stat"><div class="skeleton" style="height:70px"></div></div>').join('');
  $('blBody').innerHTML = skeletonRows(5, 9);
  call('apiRekapBulanan', S.token, $('blBulan').value, $('blKelas').value).then((d) => {
    S.bl.data = d;
    const pk = $('blKelas').value;
    $('blKelas').innerHTML = '<option value="">Semua kelas</option>' + d.daftarKelas.map((k) => `<option ${k === pk ? 'selected' : ''}>${esc(k)}</option>`).join('');
    const [y, m] = d.bulan.split('-').map(Number);
    const namaBln = `${BULAN[m - 1]} ${y}`;
    $('blJudulGrafik').textContent = (d.kelasFilter ? 'Kehadiran Kelas ' + d.kelasFilter : 'Kehadiran per Kelas') + ' — ' + namaBln;
    const t = d.total;
    $('blStat').innerHTML = `
      <div class="stat gradient"><div class="stat-label" style="margin:0">Rata-rata kehadiran</div><div class="stat-value">${d.persen}%</div><div class="stat-foot">${d.hariSekolah} hari sekolah • ${d.jumlahSiswa} siswa</div></div>
      <div class="stat"><div class="stat-top"><div class="icon-tile orange"><span class="ms">alarm</span></div></div><div class="stat-label">Total terlambat</div><div class="stat-value">${t.Terlambat}</div></div>
      <div class="stat"><div class="stat-top"><div class="icon-tile purple"><span class="ms">medical_services</span></div></div><div class="stat-label">Total izin + sakit</div><div class="stat-value">${t.Izin + t.Sakit}</div><div class="small muted">${t.Izin} izin • ${t.Sakit} sakit</div></div>
      <div class="stat"><div class="stat-top"><div class="icon-tile red"><span class="ms">error</span></div></div><div class="stat-label">Total alpa</div><div class="stat-value" style="color:var(--danger)">${t.Alpa}</div></div>`;
    $('blBody').innerHTML = d.kelas.length ? d.kelas.map((k) => {
      const w = k.persen >= 95 ? 'var(--hadir)' : k.persen >= 85 ? 'var(--telat)' : 'var(--alpa)';
      return `<tr><td>${kelasPill(k.kelas)}</td><td>${esc(k.walas || '-')}</td><td class="num">${k.siswa}</td><td class="num">${k.Hadir}</td><td class="num">${k.Terlambat}</td>
        <td class="num">${k.Izin}</td><td class="num">${k.Sakit}</td><td class="num" style="${k.Alpa ? 'color:var(--danger);font-weight:700' : ''}">${k.Alpa}</td>
        <td><div class="prog-mini"><div class="progress"><i style="width:${k.persen}%;background:${w}"></i></div><b class="tnum">${k.persen}%</b></div></td></tr>`;
    }).join('') : '<tr><td colspan="9"><div class="empty"><p>Belum ada data.</p></div></td></tr>';
    renderGrafikBulanan();
  }).catch(gagal);
}

function renderGrafikBulanan() {
  const d = S.bl.data;
  if (!d || typeof Chart === 'undefined') return;
  const teks = cssVar('--text-muted'), grid = cssVar('--border');
  const skala = { x: { ticks: { color: teks }, grid: { display: false } }, y: { ticks: { color: teks }, grid: { color: grid }, beginAtZero: true } };
  const font = { family: "'Plus Jakarta Sans', sans-serif" };
  Chart.defaults.font = Object.assign(Chart.defaults.font || {}, font);
  hapusChart('blKelas'); hapusChart('blTren');
  const garis = S.bl.tipe === 'line';
  S.charts.blKelas = new Chart($('blChartKelas'), {
    type: garis ? 'line' : 'bar',
    data: {
      labels: d.kelas.map((k) => k.kelas),
      datasets: STATUS.map((s) => ({ label: s, data: d.kelas.map((k) => k[s]), backgroundColor: WARNA[s], borderColor: WARNA[s], borderRadius: 4, tension: 0.3, pointRadius: 3, borderWidth: garis ? 2 : 0 }))
    },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { color: teks, usePointStyle: true, boxWidth: 8 } } }, scales: skala }
  });
  S.charts.blTren = new Chart($('blChartTren'), {
    type: 'line',
    data: { labels: d.harian.map((h) => Number(h.tgl.substr(8))), datasets: [{ label: '% Kehadiran', data: d.harian.map((h) => h.persen), borderColor: '#1D4ED8', backgroundColor: 'rgba(29,78,216,.12)', fill: true, tension: 0.3, pointBackgroundColor: d.harian.map((h) => h.persen < 85 ? '#F5B301' : '#1D4ED8'), pointRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => tglPanjang(d.harian[it[0].dataIndex].tgl), label: (it) => it.parsed.y + '% hadir' } } },
      scales: { x: { ticks: { color: teks }, grid: { display: false }, title: { display: true, text: 'Tanggal', color: teks } }, y: { min: 0, max: 100, ticks: { color: teks, callback: (v) => v + '%' }, grid: { color: grid } } } }
  });
}

// ════════════════════════════════════════════════════════
// 8. DATA SISWA & KARTU BARCODE
// ════════════════════════════════════════════════════════
function muatSiswa() {
  $('ssBody').innerHTML = skeletonRows(8, 7);
  return call('apiSiswaList', S.token).then((l) => {
    S.ss.data = l.sort((a, b) => a.kelas === b.kelas ? a.nama.localeCompare(b.nama) : a.kelas.localeCompare(b.kelas));
    S.scan.siswa = null;
    const kelas = Array.from(new Set(l.map((s) => s.kelas))).sort();
    const pk = $('ssKelas').value;
    $('ssKelas').innerHTML = '<option value="">Semua Kelas</option>' + kelas.map((k) => `<option ${k === pk ? 'selected' : ''}>${esc(k)}</option>`).join('');
    renderSiswa();
  }).catch(gagal);
}

function filterSiswa() {
  const q = $('ssCari').value.toLowerCase().trim(), k = $('ssKelas').value, st = $('ssStatus').value;
  return S.ss.data.filter((s) => (!k || s.kelas === k) && (!st || (st === 'Aktif') === s.aktif) &&
    (!q || s.nama.toLowerCase().includes(q) || s.nis.includes(q) || s.kode.toLowerCase().includes(q)));
}

function renderSiswa() {
  const rows = filterSiswa();
  const page = Math.min(S.ss.page, Math.max(1, Math.ceil(rows.length / PER_HAL)));
  const potong = rows.slice((page - 1) * PER_HAL, page * PER_HAL);
  $('ssBody').innerHTML = potong.length ? potong.map((s) => `<tr>
      <td><input type="checkbox" data-id="${esc(s.id)}" ${S.ss.sel.has(s.id) ? 'checked' : ''}></td>
      <td><div class="person">${avatar(s.nama, s.foto)}<div><b>${esc(s.nama)}</b><small>NIS ${esc(s.nis)}</small></div></div></td>
      <td>${kelasPill(s.kelas)}</td>
      <td class="small">${esc(s.walas || '-')}<br><span class="muted">${esc(s.emailWalas || '')}</span></td>
      <td><span class="code-chip">${esc(s.kode)}</span></td>
      <td>${pill(s.aktif ? 'Aktif' : 'Nonaktif')}</td>
      <td><div class="row-actions">
        <button class="icon-btn sm" title="Ubah" data-a="ubah" data-id="${esc(s.id)}"><span class="ms">edit</span></button>
        <button class="icon-btn sm" title="Cetak kartu" data-a="cetak" data-id="${esc(s.id)}"><span class="ms">print</span></button>
        <button class="icon-btn sm" title="${s.aktif ? 'Nonaktifkan' : 'Aktifkan'}" data-a="${s.aktif ? 'nonaktif' : 'aktif'}" data-id="${esc(s.id)}"><span class="ms">${s.aktif ? 'person_off' : 'person_check'}</span></button>
      </div></td></tr>`).join('')
    : '<tr><td colspan="7"><div class="empty"><span class="ms">group_off</span><p>Belum ada siswa. Klik "Tambah Siswa" atau isi sheet Siswa lalu klik "Impor dari Sheet".</p></div></td></tr>';
  $$('#ssBody input[type=checkbox]').forEach((c) => { c.onchange = () => { if (c.checked) S.ss.sel.add(c.dataset.id); else S.ss.sel.delete(c.dataset.id); renderBulk(); }; });
  $$('#ssBody button[data-a]').forEach((b) => {
    b.onclick = () => {
      const s = S.ss.data.find((x) => x.id === b.dataset.id);
      if (b.dataset.a === 'ubah') formSiswa(s);
      else if (b.dataset.a === 'cetak') bukaCetak(false, [s]);
      else aksiSiswa(s, b.dataset.a);
    };
  });
  pager($('ssPager'), rows.length, page, (p) => { S.ss.page = p; renderSiswa(); });
  renderBulk();
}

function pilihSemuaSiswa(on) {
  if (on) filterSiswa().forEach((s) => S.ss.sel.add(s.id)); else S.ss.sel.clear();
  $('ssSemua').checked = !!on;
  renderSiswa();
}
function renderBulk() {
  $('ssBulk').hidden = !S.ss.sel.size;
  $('ssBulkN').textContent = S.ss.sel.size + ' dipilih';
}

function aksiSiswa(s, aksi) {
  const teks = { nonaktif: ['Nonaktifkan siswa?', `Kartu ${esc(s.nama)} tidak akan bisa dipakai scan dan siswa tidak bisa login.`], aktif: ['Aktifkan siswa?', `Kartu ${esc(s.nama)} bisa dipakai kembali.`],
    resetSandi: ['Reset kata sandi?', `Kata sandi ${esc(s.nama)} dikembalikan ke NIS (${esc(s.nis)}).`],
    barcodeBaru: ['Buat ulang barcode?', `Kartu lama <b>${esc(s.kode)}</b> langsung tidak berlaku. Cetak kartu baru setelah ini.`] }[aksi];
  konfirmasi(teks[0], teks[1], 'Ya, lanjutkan', aksi === 'nonaktif' || aksi === 'barcodeBaru' ? 'danger' : '').then((ok) => {
    if (!ok) return;
    call('apiSiswaAksi', S.token, s.id, aksi).then((h) => {
      toast('sukses', 'Berhasil', aksi === 'barcodeBaru' ? 'Kode baru: ' + h : h || 'Data siswa diperbarui');
      muatSiswa();
    }).catch(gagal);
  });
}

function formSiswa(s) {
  const baru = !s;
  s = s || { nis: '', nama: '', kelas: '', walas: '', emailWalas: '', aktif: true, kode: '', foto: '' };
  const kelasList = Array.from(new Set(S.ss.data.map((x) => x.kelas))).sort();
  let foto = null;
  modal(`<h2>${baru ? 'Tambah Siswa' : 'Ubah Data Siswa'}</h2>
    <div class="stack mt-lg">
      <div class="card" style="box-shadow:none"><h3><span class="ms">person</span> Data Siswa</h3>
        <div class="form-grid mt">
          <label class="field"><span>NIS <b style="color:var(--danger)">*</b></span><input id="fsNis" inputmode="numeric" value="${esc(s.nis)}" autofocus></label>
          <label class="field"><span>Nama lengkap <b style="color:var(--danger)">*</b></span><input id="fsNama" value="${esc(s.nama)}"></label>
          <label class="field"><span>Kelas <b style="color:var(--danger)">*</b></span><input id="fsKelas" list="fsKelasList" placeholder="XII MIPA 1" value="${esc(s.kelas)}"><datalist id="fsKelasList">${kelasList.map((k) => `<option value="${esc(k)}">`).join('')}</datalist></label>
          <label class="switch-field" style="align-self:end;height:42px"><input type="checkbox" id="fsAktif" ${s.aktif ? 'checked' : ''}><i></i><span>Status aktif</span></label>
        </div></div>
      <div class="card" style="box-shadow:none"><h3><span class="ms">supervisor_account</span> Wali Kelas</h3>
        <div class="form-grid mt">
          <label class="field"><span>Nama walas</span><input id="fsWalas" value="${esc(s.walas)}"></label>
          <label class="field"><span>Email walas (untuk notifikasi)</span><input id="fsEmail" type="email" value="${esc(s.emailWalas)}"></label>
        </div></div>
      <div class="card" style="box-shadow:none"><h3><span class="ms">photo_camera</span> Foto</h3>
        <div class="foto-upload mt">
          <div class="avatar xl soft" id="fsPrev"${s.foto ? ` data-foto="${esc(s.foto)}" data-foto-size="besar"` : ''}>${esc(inisial(s.nama || '?'))}</div>
          <label class="drop-zone grow" id="fsZona">
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden id="fsFoto">
            <span class="ms">cloud_upload</span>
            <b>Klik untuk pilih foto dari komputer</b>
            <small class="muted">atau seret &amp; lepas file ke sini · JPG, PNG, WEBP · maks ${FOTO_MAKS_MB} MB</small>
            <small class="muted">Otomatis diperkecil ke 400 px sebelum dikirim</small>
          </label>
        </div>
        <div class="row gap mt" id="fsFotoInfo" hidden></div>
        ${s.foto ? '<button type="button" class="btn btn-ghost sm mt" id="fsHapusFoto"><span class="ms">delete</span> Hapus foto</button>' : ''}</div>
      ${baru ? '<p class="small muted"><span class="ms" style="font-size:16px">qr_code_2</span> Kode barcode unik dibuat otomatis saat disimpan. Sandi awal portal siswa = NIS.</p>' : `
      <div class="card" style="box-shadow:none"><h3><span class="ms">qr_code_2</span> Barcode &amp; Akun</h3>
        <div class="row gap wrap mt"><div style="background:#fff;padding:8px;border-radius:10px;border:1px solid var(--border)"><svg id="fsBarcode"></svg></div>
          <div class="stack-sm"><span class="code-chip">${esc(s.kode)}</span>
            <button class="btn btn-outline sm" style="border-color:var(--accent)" id="fsBarcodeBaru"><span class="ms">autorenew</span> Buat ulang barcode</button>
            <button class="btn btn-ghost sm" id="fsReset"><span class="ms">lock_reset</span> Reset sandi ke NIS</button></div></div></div>`}
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="tutupModal()">Batal</button><button class="btn btn-primary" id="fsSimpan"><span class="ms">save</span> Simpan</button></div>`, true);
  if (!baru && window.JsBarcode) { try { JsBarcode('#fsBarcode', s.kode, { format: 'CODE128', height: 50, width: 1.8, fontSize: 13, margin: 0 }); } catch (e) { /* abaikan */ } }
  if (!baru) {
    $('fsBarcodeBaru').onclick = () => aksiSiswa(s, 'barcodeBaru');
    $('fsReset').onclick = () => aksiSiswa(s, 'resetSandi');
  }
  let hapusFoto = false;
  const pakaiFile = (f) => {
    const salah = cekFileFoto(f);
    if (salah) { toast('error', 'Foto tidak bisa dipakai', salah); return; }
    $('fsFotoInfo').hidden = false;
    $('fsFotoInfo').innerHTML = '<span class="spinner dark" style="width:16px;height:16px;border-width:2px"></span><small class="muted">Memproses foto…</small>';
    Promise.all([kompresGambar(f, 400, 0.82), kompresGambar(f, 96, 0.72)]).then(([besar, kecil]) => {
      foto = { base64: besar.base64, mime: besar.mime, mini: kecil.dataUrl };
      hapusFoto = false;
      const prev = $('fsPrev');
      prev.dataset.fotoOk = '1';
      pasangFoto(prev, besar.dataUrl);
      $('fsFotoInfo').innerHTML = `<span class="pill pill-hadir"><i class="dot"></i>Siap disimpan</span><small class="muted">${esc(f.name)} · ${(f.size / 1048576).toFixed(2)} MB → ${Math.round(besar.base64.length * 0.75 / 1024)} KB</small>`;
    }).catch((err) => { $('fsFotoInfo').hidden = true; gagal(err); });
  };
  $('fsFoto').onchange = (e) => { pakaiFile(e.target.files[0]); e.target.value = ''; };
  const zona = $('fsZona');
  ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('aktif'); }));
  ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('aktif'); }));
  zona.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) pakaiFile(e.dataTransfer.files[0]); });
  if ($('fsHapusFoto')) $('fsHapusFoto').onclick = () => {
    foto = null; hapusFoto = true;
    const prev = $('fsPrev');
    prev.style.backgroundImage = ''; prev.classList.add('soft'); prev.textContent = inisial(s.nama || '?');
    $('fsFotoInfo').hidden = false;
    $('fsFotoInfo').innerHTML = '<span class="pill pill-alpa"><i class="dot"></i>Foto akan dihapus saat disimpan</span>';
  };
  $('fsSimpan').onclick = () => {
    const obj = { id: s.id, nis: $('fsNis').value.trim(), nama: $('fsNama').value.trim(), kelas: $('fsKelas').value.trim(),
      walas: $('fsWalas').value.trim(), emailWalas: $('fsEmail').value.trim(), aktif: $('fsAktif').checked, hapusFoto: hapusFoto };
    if (!obj.nis || !obj.nama || !obj.kelas) return toast('warn', 'Lengkapi data', 'NIS, nama, dan kelas wajib diisi.');
    sibuk($('fsSimpan'), true, 'Menyimpan…');
    call('apiSiswaSimpan', S.token, obj, foto).then((r) => {
      if (foto || hapusFoto) { FOTO_CACHE.mini.delete(r.id); FOTO_CACHE.besar.delete(r.id); }
      tutupModal();
      toast('sukses', baru ? 'Siswa ditambahkan' : 'Data diperbarui', baru ? `Kode barcode: ${r.kode}` : obj.nama);
      muatSiswa();
    }).catch((e) => { sibuk($('fsSimpan'), false); gagal(e); });
  };
}

function sinkronSiswa() {
  konfirmasi('Impor dari Sheet', 'Ketik atau tempel data siswa langsung di sheet <b>Siswa</b> pada database (cukup kolom NIS, Nama, Kelas, Nama_Walas, Email_Walas). Tombol ini akan melengkapi ID, kode barcode, dan status untuk baris yang masih kosong.', 'Lengkapi sekarang').then((ok) => {
    if (!ok) return;
    toast('info', 'Memproses…', 'Melengkapi data siswa dari sheet');
    call('apiSiswaSinkron', S.token).then((r) => {
      toast(r.nisGanda.length ? 'warn' : 'sukses', 'Sinkronisasi selesai', `${r.dilengkapi} baris dilengkapi dari ${r.total} siswa` + (r.nisGanda.length ? `. NIS ganda: ${r.nisGanda.join(', ')}` : ''));
      muatSiswa();
    }).catch(gagal);
  });
}

function kartuHtml(s) {
  const logo = S.app.logo ? `<img src="${S.app.logo}">` : '<span class="ms">school</span>';
  return `<div class="id-card">
    <div class="id-top"><div class="lg">${logo}</div><div><b>${esc(S.app.namaSekolah || 'SMA Triguna 1956 Jakarta')}</b><small>KARTU PRESENSI SISWA</small></div></div>
    <div class="id-body"><div class="id-photo"${s.foto ? ` data-foto="${esc(s.foto)}" data-foto-size="besar"` : ''}>${esc(inisial(s.nama))}</div>
      <div class="id-info"><div class="nm">${esc(s.nama)}</div><div class="meta">NIS ${esc(s.nis)} • ${esc(s.kelas)}</div><svg class="bc" data-kode="${esc(s.kode)}"></svg></div></div>
    <div class="id-foot">Kartu pribadi — tidak dapat dipindahtangankan</div></div>`;
}
function gambarBarcode(root) {
  if (!window.JsBarcode) return;
  $$('svg.bc', root).forEach((svg) => {
    try { JsBarcode(svg, svg.dataset.kode, { format: 'CODE128', height: 46, width: 1.6, fontSize: 13, margin: 0, textMargin: 1 }); } catch (e) { /* abaikan */ }
  });
}

function bukaCetak(terpilih, daftar) {
  let list = daftar || (terpilih ? S.ss.data.filter((s) => S.ss.sel.has(s.id)) : null);
  const kelasList = Array.from(new Set(S.ss.data.map((s) => s.kelas))).sort();
  modal(`<h2>Cetak Kartu Barcode</h2>
    ${list ? `<p class="muted small mt">${list.length} kartu dipilih</p>` : `<div class="row gap wrap mt"><label class="field grow"><span>Kelas</span><select id="ckKelas"><option value="">— pilih kelas —</option>${kelasList.map((k) => `<option>${esc(k)}</option>`).join('')}<option value="*">Semua siswa aktif</option></select></label></div>`}
    <p class="small muted mt">Ukuran kartu ID-1 (85,6 × 54 mm), 10 kartu per halaman A4. Di jendela cetak, aktifkan <b>Background graphics</b>.</p>
    <div class="doc-frame mt" style="max-height:55vh;overflow:auto;display:block"><div class="print-sheet" id="ckPrev"></div></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="tutupModal()">Tutup</button><button class="btn btn-primary" id="ckCetak" ${list && list.length ? '' : 'disabled'}><span class="ms">print</span> Cetak</button></div>`, true);
  const render = () => {
    $('ckPrev').innerHTML = list && list.length ? list.map(kartuHtml).join('') : '<p class="muted center" style="grid-column:1/-1">Pilih kelas untuk melihat pratinjau.</p>';
    gambarBarcode($('ckPrev'));
    $('ckCetak').disabled = !(list && list.length);
  };
  if (!list) $('ckKelas').onchange = () => { const k = $('ckKelas').value; list = !k ? null : S.ss.data.filter((s) => s.aktif && (k === '*' || s.kelas === k)); render(); };
  render();
  $('ckCetak').onclick = () => {
    $('printArea').innerHTML = `<div class="print-sheet">${list.map(kartuHtml).join('')}</div>`;
    gambarBarcode($('printArea'));
    const btn = $('ckCetak');
    sibuk(btn, true, 'Memuat foto…');
    // Tunggu semua foto siswa termuat sebelum jendela cetak dibuka
    isiFoto($('printArea')).then(() => { sibuk(btn, false); setTimeout(() => window.print(), 300); });
  };
}

// ════════════════════════════════════════════════════════
// 9. LOG AKTIVITAS
// ════════════════════════════════════════════════════════
function muatLog() {
  if (!$('lgDari').value) { $('lgDari').value = geserHari(tglStr(), -7); $('lgSampai').value = tglStr(); }
  $('lgBody').innerHTML = skeletonRows(6, 5);
  call('apiLog', S.token, $('lgDari').value, $('lgSampai').value, $('lgJenis').value).then((d) => {
    $('badgeLog').hidden = !d.anomali.length;
    $('badgeLog').textContent = d.anomali.length;
    $('lgAnomali').innerHTML = d.anomali.length ? `<div class="card" style="border-left:4px solid var(--telat)">
      <div class="card-head"><h3><span class="ms" style="color:var(--telat)">warning</span> Kejanggalan perlu ditinjau (${d.anomali.length})</h3></div>
      <div class="stack-sm">${d.anomali.map((a) => `<div class="feed-item"><div class="icon-tile orange"><span class="ms">devices</span></div>
        <div class="grow"><b style="white-space:normal">${esc(a.detail)}</b><small>${esc(a.waktu)} • dicatat oleh ${esc(a.pelaku)}</small></div>
        <button class="btn btn-outline sm" data-id="${esc(a.id)}"><span class="ms">done</span> Tandai sudah ditinjau</button></div>`).join('')}</div></div>` : '';
    $$('#lgAnomali button[data-id]').forEach((b) => {
      b.onclick = () => { sibuk(b, true); call('apiLogTinjau', S.token, b.dataset.id).then(() => { toast('sukses', 'Ditandai sudah ditinjau'); muatLog(); }).catch((e) => { sibuk(b, false); gagal(e); }); };
    });
    const ikon = { Scan: 'qr_code_scanner', 'Ubah data': 'edit', Kejanggalan: 'warning', Email: 'mail', Login: 'login' };
    $('lgBody').innerHTML = d.rows.length ? d.rows.map((l) => `<tr><td class="time mono">${esc(l.waktu)}</td><td>${esc(l.pelaku)}</td>
      <td><span class="row gap" style="gap:6px"><span class="ms" style="font-size:17px;color:${l.jenis === 'Kejanggalan' ? 'var(--telat)' : 'var(--primary)'}">${ikon[l.jenis] || 'info'}</span>${esc(l.jenis)}</span></td>
      <td class="small">${esc(l.detail)}</td><td class="small muted">${esc(l.perangkat)}</td></tr>`).join('')
      : '<tr><td colspan="5"><div class="empty"><p>Tidak ada aktivitas pada rentang ini.</p></div></td></tr>';
    $('lgInfo').textContent = d.dipotong ? 'Menampilkan 500 aktivitas terbaru. Persempit rentang tanggal untuk melihat lebih lama.' : `${d.rows.length} aktivitas`;
  }).catch(gagal);
}

// ════════════════════════════════════════════════════════
// 10. PENGATURAN
// ════════════════════════════════════════════════════════
function muatPengaturan() {
  $('pgPengguna').innerHTML = skeletonRows(3, 5);
  call('apiPengaturan', S.token).then((d) => {
    S.pg.data = d;
    const p = d.pengaturan;
    $('pgPengguna').innerHTML = d.pengguna.map((u) => `<tr><td><b class="mono">${esc(u.username)}</b>${u.username === S.sesi.username ? ' <span class="small muted">(Anda)</span>' : ''}</td><td>${esc(u.nama)}</td>
      <td><span class="role-pill ${u.peran === 'Admin' ? 'admin' : ''}">${esc(u.peran)}</span></td><td class="small">${u.adaSandi ? 'Sudah diatur' : '<span style="color:var(--danger)">Belum ada</span>'}</td>
      <td><div class="row-actions"><button class="icon-btn sm" title="Ubah" data-a="ubah" data-e="${esc(u.username)}"><span class="ms">edit</span></button>
      <button class="icon-btn sm" title="Reset sandi" data-a="resetSandi" data-e="${esc(u.username)}"><span class="ms">lock_reset</span></button>
      ${u.username === S.sesi.username ? '' : `<button class="icon-btn sm" title="Hapus" data-a="hapus" data-e="${esc(u.username)}"><span class="ms" style="color:var(--danger)">delete</span></button>`}</div></td></tr>`).join('');
    $$('#pgPengguna button[data-a]').forEach((b) => {
      b.onclick = () => {
        const u = d.pengguna.find((x) => x.username === b.dataset.e);
        if (b.dataset.a === 'ubah') return formPengguna(u);
        const hapus = b.dataset.a === 'hapus';
        konfirmasi(hapus ? 'Hapus pengguna?' : 'Reset kata sandi?', hapus ? `${esc(u.username)} tidak bisa masuk lagi ke panel staf.` : `Password baru untuk ${esc(u.username)} akan dibuat dan ditampilkan sekali.`, hapus ? 'Hapus' : 'Reset', hapus ? 'danger' : '').then((ok) => {
          if (!ok) return;
          call('apiPenggunaAksi', S.token, u.username, b.dataset.a).then((r) => { if (r.sandi) tampilSandi(u.username, r.sandi); else toast('sukses', 'Pengguna dihapus'); muatPengaturan(); }).catch(gagal);
        });
      };
    });
    $('pgJamMasukMulai').value = p.jamMasukMulai; $('pgBatasTepat').value = p.batasTepat;
    $('pgJamPulangMulai').value = p.jamPulangMulai; $('pgJamPulangSelesai').value = p.jamPulangSelesai;
    S.pg.hari = String(p.hariSekolah).split(',').filter((x) => x !== '');
    const urut = [1, 2, 3, 4, 5, 6, 0];
    $('pgHari').innerHTML = urut.map((h) => `<button data-h="${h}" class="${S.pg.hari.includes(String(h)) ? 'active' : ''}">${HARI[h]}</button>`).join('');
    $$('#pgHari button').forEach((b) => { b.onclick = () => b.classList.toggle('active'); });
    $('pgLibur').innerHTML = d.libur.length ? `<div class="stack-sm">${d.libur.map((l) => `<div class="feed-item"><div class="icon-tile red"><span class="ms">event_busy</span></div>
      <div class="grow"><b>${esc(tglPanjang(l.tanggal))}</b><small>${esc(l.ket)}</small></div><button class="icon-btn sm" data-t="${esc(l.tanggal)}"><span class="ms">delete</span></button></div>`).join('')}</div>`
      : '<p class="muted small">Belum ada hari libur.</p>';
    $$('#pgLibur button[data-t]').forEach((b) => { b.onclick = () => call('apiLiburSimpan', S.token, b.dataset.t, '', true).then(muatPengaturan).catch(gagal); });
    $('pgNotifAktif').checked = p.notifAktif === 'ya';
    $('pgJamNotif').value = p.jamNotif;
    const nt = d.notifTerakhir;
    $('pgNotifInfo').innerHTML = `<span class="ms">history</span><div class="grow">${nt ? `Terakhir dijalankan <b>${esc(nt.waktu)}</b>: ${nt.jumlahEmail} email terkirim, ${nt.jumlahSiswa} siswa Alpa${nt.gagal ? `, ${nt.gagal} gagal` : ''}.` : 'Belum pernah dijalankan.'}</div>`;
    $('pgNamaAplikasi').value = p.namaAplikasi; $('pgNamaSekolah').value = p.namaSekolah;
    $('pgLinkDb').href = d.tautan.database; $('pgLinkFolder').href = d.tautan.folder;
    muatKiosk();
  }).catch(gagal);
}

function muatKiosk() {
  $('pgLinkMonitor').textContent = new URL('monitor.html', location.href).href;
  call('apiKioskList', S.token).then((list) => {
    $('pgKiosk').innerHTML = list.length ? list.map((k) => `<tr><td><b>${esc(k.nama)}</b></td><td>${esc(k.oleh)}</td><td class="small mono">${esc(k.dibuat)}</td>
      <td class="small mono">${esc(k.aktifTerakhir)}</td><td>${k.status === 'Dicabut' ? '<span class="pill pill-nonaktif">Dicabut</span>' : '<span class="pill pill-aktif"><i class="dot"></i>Aktif</span>'}</td>
      <td>${k.status === 'Dicabut' ? '' : `<button class="btn btn-danger-o sm" data-id="${esc(k.id)}"><span class="ms">link_off</span> Cabut</button>`}</td></tr>`).join('')
      : '<tr><td colspan="6"><div class="empty"><span class="ms">tv_off</span><p>Belum ada perangkat monitor. Buka Stasiun Scan → Layar Monitor Siswa.</p></div></td></tr>';
    $$('#pgKiosk button[data-id]').forEach((b) => {
      b.onclick = () => konfirmasi('Cabut perangkat?', 'Layar monitor di perangkat ini langsung berhenti menerima scan dan harus diaktifkan ulang.', 'Cabut', 'danger').then((ok) => {
        if (ok) call('apiKioskCabut', S.token, b.dataset.id).then(() => { toast('sukses', 'Perangkat dicabut'); muatKiosk(); }).catch(gagal);
      });
    });
  }).catch(gagal);
}

function simpanPengaturan() {
  const hari = $$('#pgHari button.active').map((b) => b.dataset.h);
  if (!hari.length) return toast('warn', 'Pilih minimal satu hari sekolah');
  const obj = {
    namaAplikasi: $('pgNamaAplikasi').value.trim() || 'Absen Digital', namaSekolah: $('pgNamaSekolah').value.trim() || 'SMA Triguna 1956 Jakarta',
    jamMasukMulai: $('pgJamMasukMulai').value, batasTepat: $('pgBatasTepat').value, jamPulangMulai: $('pgJamPulangMulai').value, jamPulangSelesai: $('pgJamPulangSelesai').value,
    hariSekolah: hari.join(','), notifAktif: $('pgNotifAktif').checked ? 'ya' : 'tidak', jamNotif: $('pgJamNotif').value
  };
  call('apiSimpanPengaturan', S.token, obj).then(() => {
    toast('sukses', 'Pengaturan disimpan', 'Jadwal notifikasi diperbarui.');
    terapkanApp(Object.assign({}, S.app, { namaAplikasi: obj.namaAplikasi, namaSekolah: obj.namaSekolah }));
    muatPengaturan();
  }).catch(gagal);
}

function tambahLibur(e) {
  e.preventDefault();
  call('apiLiburSimpan', S.token, $('pgLiburTgl').value, $('pgLiburKet').value.trim(), false)
    .then(() => { $('pgLiburTgl').value = ''; $('pgLiburKet').value = ''; toast('sukses', 'Hari libur disimpan'); muatPengaturan(); }).catch(gagal);
  return false;
}

function formPengguna(u) {
  const baru = !u;
  u = u || { username: '', nama: '', peran: 'Guru Piket' };
  modal(`<h2>${baru ? 'Tambah Pengguna' : 'Ubah Pengguna'}</h2>
    <div class="stack mt-lg">
      <label class="field"><span>Username</span><input id="fpUser" value="${esc(u.username)}" placeholder="mis. sriwahyuni" autocapitalize="none" spellcheck="false" maxlength="30" ${baru ? 'autofocus' : 'disabled'}><small class="muted">3–30 karakter: huruf kecil, angka, titik, garis bawah. Wajib mengandung huruf (agar tidak bentrok dengan NIS).</small></label>
      <label class="field"><span>Nama</span><input id="fpNama" value="${esc(u.nama)}" placeholder="Dra. Sri Wahyuni, M.Pd."></label>
      <label class="field"><span>Peran</span><select id="fpPeran"><option ${u.peran === 'Guru Piket' ? 'selected' : ''}>Guru Piket</option><option ${u.peran === 'Admin' ? 'selected' : ''}>Admin</option></select></label>
      ${baru ? '<p class="small muted">Kata sandi acak dibuat otomatis dan ditampilkan sekali setelah disimpan.</p>' : ''}
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="tutupModal()">Batal</button><button class="btn btn-primary" id="fpSimpan">Simpan</button></div>`);
  $('fpSimpan').onclick = () => {
    const username = $('fpUser').value.trim().toLowerCase();
    sibuk($('fpSimpan'), true);
    call('apiPenggunaSimpan', S.token, { username: username, nama: $('fpNama').value, peran: $('fpPeran').value }).then((r) => {
      tutupModal();
      if (r.sandi) tampilSandi(username, r.sandi); else toast('sukses', 'Pengguna diperbarui');
      muatPengaturan();
    }).catch((e) => { sibuk($('fpSimpan'), false); gagal(e); });
  };
}

function tampilSandi(username, sandi) {
  modal(`<div class="center"><div class="icon-tile green lg" style="margin:0 auto"><span class="ms">key</span></div><h2 class="mt">Password untuk <span class="mono">${esc(username)}</span></h2>
    <p class="muted small mt">Salin dan berikan ke pengguna sekarang. Sandi ini tidak bisa dilihat lagi (hanya bisa di-reset).</p>
    <div class="secret">${esc(sandi)}</div>
    <div class="modal-actions" style="justify-content:center"><button class="btn btn-primary" onclick="tutupModal()">Sudah saya catat</button></div></div>`);
}

function unggahLogo(input) {
  const f = input.files[0];
  if (!f) return;
  const proses = f.type === 'image/svg+xml' && f.size < 400000
    ? new Promise((res) => { const fr = new FileReader(); fr.onload = () => res({ base64: fr.result.split(',')[1], mime: f.type }); fr.readAsDataURL(f); })
    : kompresGambar(f, 512, 0.92, 'image/png');
  toast('info', 'Mengunggah logo…');
  proses.then((r) => call('apiUnggahLogo', S.token, r.base64, r.mime)).then((url) => {
    terapkanApp(Object.assign({}, S.app, { logo: url }));
    toast('sukses', 'Logo diperbarui');
  }).catch(gagal).finally(() => { input.value = ''; });
}

function kirimEmailUji() { call('apiKirimEmailUji', S.token).then((m) => toast('sukses', 'Email uji terkirim', m)).catch(gagal); }
function kirimNotifSekarang() {
  konfirmasi('Jalankan notifikasi sekarang?', 'Semua siswa aktif yang belum scan dan tanpa keterangan hari ini akan <b>ditandai Alpa</b>, lalu email dikirim ke wali kelasnya. Lakukan hanya setelah jam masuk selesai.', 'Jalankan', 'danger').then((ok) => {
    if (!ok) return;
    call('apiKirimNotifSekarang', S.token).then((r) => {
      toast('sukses', 'Notifikasi dijalankan', typeof r === 'string' ? r : `${r.jumlahEmail} email terkirim • ${r.jumlahSiswa} siswa Alpa`);
      muatPengaturan();
    }).catch(gagal);
  });
}

function bukaUbahSandi() {
  modal(`<h2>Ubah Password</h2>
    <div class="stack mt-lg">
      <label class="field"><span>Password lama</span><input type="password" id="usLama" autofocus></label>
      <label class="field"><span>Password baru (min. 6 karakter)</span><input type="password" id="usBaru"></label>
      <label class="field"><span>Ulangi password baru</span><input type="password" id="usUlang"></label>
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="tutupModal()">Batal</button><button class="btn btn-primary" id="usSimpanSandi">Simpan</button></div>`);
  $('usSimpanSandi').onclick = () => {
    if ($('usBaru').value !== $('usUlang').value) return toast('warn', 'Kata sandi baru tidak sama');
    sibuk($('usSimpanSandi'), true);
    call('apiUbahSandi', S.token, $('usLama').value, $('usBaru').value).then(() => {
      tutupModal(); toast('sukses', 'Kata sandi diubah');
      if (S.sesi.tipe === 'siswa') { S.sesi.sandiAwal = false; $('psSandiAwal').hidden = true; }
    }).catch((e) => { sibuk($('usSimpanSandi'), false); gagal(e); });
  };
}

// ════════════════════════════════════════════════════════
// 11. PORTAL SISWA
// ════════════════════════════════════════════════════════
function navigateSiswa(sec) {
  $$('#viewSiswa .section').forEach((el) => el.classList.toggle('active', el.id === 'ps-' + sec));
  $$('.bottom-nav a').forEach((a) => a.classList.toggle('active', a.dataset.ps === sec));
  window.scrollTo(0, 0);
  if (sec === 'beranda') muatBeranda();
  if (sec === 'ajukan') {
    if (!$('ajDari').value) { $('ajDari').value = tglStr(); $('ajSampai').value = tglStr(); }
  }
}

function muatBeranda() {
  $('psHariIni').innerHTML = '<div class="skeleton" style="height:50px;grid-column:1/-1"></div>';
  call('apiSiswaBeranda', S.token, $('psBulan').value).then((d) => {
    S.ps.data = d;
    const p = d.profil;
    $('psNama').textContent = p.nama;
    $('psInfo').textContent = `NIS ${p.nis} • ${p.kelas}${p.walas ? ' • Walas ' + p.walas : ''}`;
    $('psFoto').style.backgroundImage = '';
    $('psFoto').textContent = inisial(p.nama);
    delete $('psFoto').dataset.fotoOk;
    if (p.foto) { $('psFoto').dataset.foto = p.foto; $('psFoto').dataset.fotoSize = 'besar'; isiFoto(); }
    $('psSandiAwal').hidden = !p.sandiAwal;
    const h = d.hariIni;
    $('psHariIni').innerHTML = `<div><div class="eyebrow">HARI INI • MASUK</div><div class="big">${jm(h.masuk)}</div></div>
      <div><div class="eyebrow">PULANG</div><div class="big">${jm(h.pulang)}</div></div>
      <div>${h.hariSekolah ? pill(h.status) : '<span class="pill pill-belum">Libur</span>'}</div>`;
    const ikon = { Hadir: 'check_circle', Terlambat: 'alarm', Izin: 'assignment', Sakit: 'medical_services', Alpa: 'error' };
    $('psStat').innerHTML = STATUS.map((s) => `<div class="stat"><span class="ms" style="color:${WARNA[s]}">${ikon[s]}</span><div class="stat-value">${d.jumlah[s]}</div><div class="small muted">${s}</div></div>`).join('');
    $('psPengajuan').innerHTML = d.pengajuan.length ? d.pengajuan.map((x) => `<div class="req-mini ${esc(x.status)}">
      <div class="row between gap"><span>${pill(x.jenis)} <b class="small">${tglPendek(x.dari)}${x.sampai !== x.dari ? ' – ' + tglPendek(x.sampai) : ''}</b></span>${pill(x.status)}</div>
      <p class="small mt">${esc(x.alasan)}</p>
      ${x.status === 'Ditolak' && x.catatan ? `<div class="alert alert-danger mt" style="margin-bottom:0;padding:10px 12px"><span class="ms">info</span><div>Alasan ditolak: ${esc(x.catatan)}</div></div>` : ''}</div>`).join('')
      : '<p class="muted small">Belum ada pengajuan.</p>';
    const singkat = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'];
    $('psRiwayat').innerHTML = d.riwayat.length ? d.riwayat.map((r) => {
      const pp = r.tgl.split('-').map(Number);
      const hr = new Date(Date.UTC(pp[0], pp[1] - 1, pp[2])).getUTCDay();
      return `<div class="hist-item"><div class="hist-date"><small>${singkat[hr]}</small><b>${pp[2]}</b></div>
        <div class="grow small"><span class="muted">Masuk</span> <b class="tnum">${jm(r.masuk)}</b> &nbsp; <span class="muted">Pulang</span> <b class="tnum">${jm(r.pulang)}</b>${r.ket ? `<div class="muted">${esc(r.ket)}</div>` : ''}</div>${pill(r.status)}</div>`;
    }).join('') : '<p class="muted small">Belum ada riwayat pada bulan ini.</p>';
  }).catch(gagal);
}

function pilihSurat(input) {
  const f = input.files[0];
  if (!f) return;
  const salah = cekFileFoto(f, 10);
  if (salah) { input.value = ''; toast('error', 'Foto surat tidak bisa dipakai', salah); return; }
  $('ajPreview').innerHTML = '<div class="spinner dark"></div><small class="muted">Mengompres foto…</small>';
  kompresGambar(f, 1400, 0.72).then((r) => {
    S.ps.surat = r;
    $('ajPreview').innerHTML = `<img src="${r.dataUrl}" alt="Pratinjau surat"><small class="muted">${Math.round(r.base64.length * 0.75 / 1024)} KB • ketuk untuk mengganti</small>`;
  }).catch((e) => { S.ps.surat = null; $('ajPreview').innerHTML = '<b>Gagal membaca foto</b>'; gagal(e); });
}

function kirimAjukan(e) {
  e.preventDefault();
  const jenis = ($$('input[name=jenis]').find((x) => x.checked) || {}).value;
  if (!jenis) { toast('warn', 'Pilih Izin atau Sakit'); return false; }
  if (!S.ps.surat) { toast('warn', 'Foto surat wajib diunggah'); return false; }
  if ($('ajSampai').value < $('ajDari').value) { toast('warn', 'Tanggal selesai tidak boleh sebelum tanggal mulai'); return false; }
  const btn = $('ajKirim');
  sibuk(btn, true, 'Mengirim…');
  call('apiAjukan', S.token, { jenis, dari: $('ajDari').value, sampai: $('ajSampai').value, alasan: $('ajAlasan').value.trim() }, { base64: S.ps.surat.base64, mime: S.ps.surat.mime })
    .then(() => {
      $('formAjukan').reset(); S.ps.surat = null; $('ajHitung').textContent = '0/300';
      $('ajPreview').innerHTML = '<div class="icon-tile blue lg"><span class="ms">photo_camera</span></div><b>Ambil foto / pilih file surat</b><small class="muted">Foto dikompres otomatis sebelum dikirim</small>';
      $('ajDari').value = tglStr(); $('ajSampai').value = tglStr();
      modal(`<div class="center"><div class="icon-tile green lg" style="margin:0 auto"><span class="ms">check</span></div><h2 class="mt">Pengajuan terkirim</h2>
        <p class="muted mt">Status: <span class="pill pill-menunggu">Menunggu</span><br>Guru piket akan meninjau surat Anda.</p>
        <div class="modal-actions" style="justify-content:center"><button class="btn btn-primary" onclick="tutupModal();navigateSiswa('beranda')">Kembali ke Beranda</button></div></div>`);
    })
    .catch(gagal).finally(() => sibuk(btn, false));
  return false;
}

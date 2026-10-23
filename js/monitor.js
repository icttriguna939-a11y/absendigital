/**
 * ============================================================
 * ABSEN DIGITAL — js/monitor.js
 * Layar Monitor Siswa di halaman/tab sendiri (monitor.html).
 *
 * - Memakai "kunci perangkat" (bukan sesi login admin), disimpan di browser ini.
 *   Jadi tidak terpengaruh admin logout, ganti akun, atau membuka dashboard di komputer lain.
 * - Pemindai barcode USB mengetik kode + Enter ke input tersembunyi.
 * - Mode MASUK/PULANG otomatis mengikuti jam di Pengaturan (bisa dipaksa lewat menu/F2/F4).
 * ============================================================
 */
(function () {
  const TZ = 'Asia/Jakarta';
  const KUNCI_KEY = 'absen_kiosk';
  const MODE_KEY = 'absen_monitor_mode';
  const SUARA_KEY = 'absen_monitor_suara';
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const $ = (id) => document.getElementById(id);

  const M = {
    kiosk: null,            // {kunci, nama}
    offset: 0,              // selisih jam server - jam komputer
    aturan: null,
    paksaMode: 'AUTO',      // AUTO | MASUK | PULANG
    mode: 'MASUK',
    antrean: Promise.resolve(),
    timer: null,
    mulai: false,
    suara: true,
    logoVer: null
  };

  // ── Penyimpanan lokal (aman bila diblokir browser) ──
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* abaikan */ } }
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function inisial(n) { return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase(); }

  // ── Waktu server (zona Asia/Jakarta) ──
  const fmtJam = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const fmtTgl = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const sekarang = () => new Date(Date.now() + M.offset);
  const jamStr = () => fmtJam.format(sekarang()).replace(/^24/, '00');
  function tglPanjang() {
    const t = fmtTgl.format(sekarang());
    const p = t.split('-').map(Number);
    return `${HARI[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()]}, ${p[2]} ${BULAN[p[1] - 1]} ${p[0]}`;
  }

  function bacaKiosk() {
    try { const k = JSON.parse(ls.get(KUNCI_KEY) || 'null'); return k && k.kunci ? k : null; } catch (e) { return null; }
  }

  // ════════════════ INISIALISASI ════════════════
  document.addEventListener('DOMContentLoaded', mulaiHalaman);
  if (document.readyState !== 'loading') mulaiHalaman();
  let sudahMulai = false;

  function mulaiHalaman() {
    if (sudahMulai) return;
    sudahMulai = true;
    M.paksaMode = ls.get(MODE_KEY) || 'AUTO';
    M.suara = ls.get(SUARA_KEY) !== '0';
    pasangEvent();
    setInterval(detik, 1000);
    detik();
    // Dibuka dari dashboard yang sedang menyiapkan kunci: tunggu sebentar
    if (location.hash === '#menyiapkan' && !bacaKiosk()) {
      let n = 0;
      const tunggu = setInterval(() => {
        n++;
        if (bacaKiosk() || n > 40) { clearInterval(tunggu); history.replaceState(null, '', location.pathname); muatKiosk(); }
      }, 250);
      return;
    }
    muatKiosk();
  }

  function muatKiosk() {
    M.kiosk = bacaKiosk();
    if (!M.kiosk) { tampilAktivasi(); return; }
    $('loader').hidden = false;
    call('apiKioskInit', M.kiosk.kunci)
      .then((d) => {
        terapkanInfo(d);
        brandSimpan(d.app);
        terapkanBrand(Object.assign({}, d.app));
        M.logoVer = d.app.logoVer;
        $('loader').hidden = true;
        $('monAktivasi').hidden = true;
        if (!M.mulai) { $('monStart').hidden = false; $('monStartKiosk').textContent = M.kiosk.nama; }
        fokus();
      })
      .catch((e) => {
        $('loader').hidden = true;
        if (e.data && e.data.kioskInvalid) { ls.del(KUNCI_KEY); tampilAktivasi(e.message); return; }
        // Server belum bisa dihubungi: tampilkan layar tetap (pakai identitas tersimpan) dan coba lagi
        tampilOffline(true);
        $('monPromptText').textContent = 'Menghubungkan ke server…';
        setTimeout(muatKiosk, 15000);
      });
  }

  function terapkanInfo(d) {
    M.offset = d.serverMs - Date.now();
    M.aturan = d.aturan;
    M.kiosk.nama = d.nama;
    $('monKiosk').textContent = d.nama.toUpperCase();
    $('monMenuKiosk').textContent = 'Perangkat: ' + d.nama;
    $('monBatas').textContent = d.aturan.batasTepat;
    document.title = 'Layar Monitor — ' + (d.app.namaAplikasi || 'Absen Digital');
    $('monPromptText').textContent = d.hariSekolah ? 'Silakan scan kartu Anda' : 'Hari ini bukan hari sekolah' + (d.keteranganLibur ? ' — ' + d.keteranganLibur : '');
    tampilOffline(false);
    hitungMode();
  }

  // Sinkron berkala: jam server, aturan jam, nama sekolah, logo baru
  setInterval(() => {
    if (!M.kiosk) return;
    call('apiKioskPing', M.kiosk.kunci).then((d) => {
      terapkanInfo(d);
      const lama = brandBaca() || {};
      if (d.app.logoVer !== M.logoVer) { M.logoVer = d.app.logoVer; muatKiosk(); return; }
      const app = Object.assign({}, lama, { namaAplikasi: d.app.namaAplikasi, namaSekolah: d.app.namaSekolah });
      brandSimpan(app); terapkanBrand(app);
    }).catch((e) => {
      if (e.data && e.data.kioskInvalid) { ls.del(KUNCI_KEY); tampilAktivasi(e.message); return; }
      tampilOffline(true);
    });
  }, 5 * 60 * 1000);

  // ════════════════ AKTIVASI ════════════════
  function tampilAktivasi(pesan) {
    M.kiosk = null;
    $('loader').hidden = true;
    $('monStart').hidden = true;
    $('monAktivasi').hidden = false;
    $('akAlert').hidden = !pesan;
    $('akAlertText').textContent = pesan || '';
    setTimeout(() => $('akNama').focus(), 50);
  }

  function kirimAktivasi(e) {
    e.preventDefault();
    const btn = $('akKirim');
    btn.disabled = true;
    btn.textContent = 'Mengaktifkan…';
    call('apiKioskAktivasi', $('akUser').value, $('akSandi').value, $('akNama').value)
      .then((k) => {
        ls.set(KUNCI_KEY, JSON.stringify({ kunci: k.kunci, nama: k.nama }));
        $('akSandi').value = '';
        muatKiosk();
      })
      .catch((err) => { $('akAlert').hidden = false; $('akAlertText').textContent = err.message; })
      .finally(() => { btn.disabled = false; btn.innerHTML = '<span class="ms">link</span> Aktifkan'; });
  }

  // ════════════════ MODE & JAM ════════════════
  function hitungMode() {
    let m = M.paksaMode;
    if (m === 'AUTO') m = M.aturan && jamStr().substr(0, 5) >= M.aturan.jamPulangMulai ? 'PULANG' : 'MASUK';
    M.mode = m;
    $('monMode').textContent = m + (M.paksaMode === 'AUTO' ? '' : ' (manual)');
    document.querySelectorAll('#monModeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.m === M.paksaMode));
  }
  function setPaksaMode(m) { M.paksaMode = m; ls.set(MODE_KEY, m); hitungMode(); }

  function detik() {
    const p = jamStr().split(':');
    $('monJam').innerHTML = `<span>${p[0]}</span><i>:</i><span>${p[1]}</span><i>:</i><span class="sec">${p[2]}</span><small>WIB</small>`;
    $('monTanggal').textContent = tglPanjang();
    if (M.aturan) hitungMode();
  }

  // ════════════════ SCAN ════════════════
  function fokus() {
    if (!$('monAktivasi').hidden || !$('monMenu').hidden) return;
    $('monInput').focus();
  }

  function mulaiLayar() {
    M.mulai = true;
    $('monStart').hidden = true;
    try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* abaikan */ }
    fokus();
  }

  function proses(kode) {
    kode = String(kode || '').trim();
    if (!kode || !M.kiosk) return;
    if (!M.mulai) mulaiLayar();
    const mode = M.mode;
    M.antrean = M.antrean.then(() => call('apiKioskScan', M.kiosk.kunci, kode, mode)
      .then((d) => { tampilOffline(false); bunyi(true); tampil(d, null); })
      .catch((err) => {
        if (err.data && err.data.kioskInvalid) { ls.del(KUNCI_KEY); tampilAktivasi(err.message); return; }
        const putus = !err.data || (Object.keys(err.data).length === 0 && /terhubung|lama merespons/i.test(err.message));
        if (putus) tampilOffline(true);
        bunyi(false);
        tampil(null, err);
      }));
  }

  function tampilOffline(on) { $('monOffline').hidden = !on; }

  function idle() {
    $('monitor').classList.remove('err');
    $('monIdle').hidden = false;
    $('monCard').hidden = true;
  }

  function tampil(d, err) {
    clearTimeout(M.timer);
    const card = $('monCard');
    card.className = 'mon-card';
    $('monIdle').hidden = true;
    card.hidden = false;
    void card.offsetWidth;
    const DETIK = err ? 4 : 5;
    if (err) {
      $('monitor').classList.add('err');
      card.classList.add('error');
      const s = err.data && err.data.siswa;
      $('monFoto').innerHTML = '<span class="ms" style="font-size:1em">warning</span>';
      $('monFoto').style.backgroundImage = '';
      $('monSapa').textContent = s ? s.nama : 'Mohon maaf';
      $('monNama').textContent = err.message;
      $('monMeta').innerHTML = s ? `Kelas ${esc(s.kelas)} • NIS <b>${esc(s.nis)}</b>` : '';
      $('monStatus').className = 'mon-status error';
      $('monStatus').innerHTML = '<span class="ms">support_agent</span> Silakan hubungi guru piket';
      $('monInfo').textContent = 'Scan ditolak';
    } else {
      $('monitor').classList.remove('err');
      const pulang = d.mode === 'PULANG', telat = d.status === 'Terlambat';
      if (pulang) card.classList.add('pulang'); else if (telat) card.classList.add('late');
      const s = d.siswa;
      $('monFoto').style.backgroundImage = s.foto ? `url('${s.foto}')` : '';
      $('monFoto').innerHTML = (s.foto ? '' : esc(inisial(s.nama))) + '<span class="ok"><span class="ms">check</span></span>';
      $('monSapa').textContent = pulang ? 'Sampai Jumpa,' : 'Selamat Datang,';
      $('monNama').textContent = s.nama;
      $('monMeta').innerHTML = `Kelas ${esc(s.kelas)} • NIS: <b>${esc(s.nis)}</b>`;
      $('monStatus').className = 'mon-status ' + (pulang ? 'pulang' : telat ? 'late' : '');
      $('monStatus').innerHTML = `<span class="ms">${pulang ? 'home' : telat ? 'alarm' : 'verified'}</span> ${pulang ? 'PULANG' : telat ? 'TERLAMBAT' : 'HADIR TEPAT WAKTU'} — ${esc(d.jam)} WIB`;
      $('monInfo').textContent = pulang ? 'Hati-hati di jalan!' : telat ? 'Segera menuju kelas' : 'Selamat belajar!';
    }
    const bar = $('monBar');
    bar.style.transition = 'none'; bar.style.width = '100%';
    void bar.offsetWidth;
    bar.style.transition = `width ${DETIK}s linear`; bar.style.width = '0%';
    let sisa = DETIK;
    $('monDetik').textContent = sisa;
    const tick = () => {
      sisa--;
      if (sisa <= 0) { idle(); return; }
      $('monDetik').textContent = sisa;
      M.timer = setTimeout(tick, 1000);
    };
    M.timer = setTimeout(tick, 1000);
    fokus();
  }

  let audioCtx = null;
  function bunyi(ok) {
    if (!M.suara) return;
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

  function labelSuara() { $('monSuara').innerHTML = M.suara ? '<span class="ms">volume_up</span> Suara aktif' : '<span class="ms">volume_off</span> Suara mati'; }

  // ════════════════ EVENT ════════════════
  function pasangEvent() {
    labelSuara();
    $('monInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const v = $('monInput').value; $('monInput').value = ''; proses(v); }
    });
    $('formAktivasi').addEventListener('submit', kirimAktivasi);
    $('monMulai').addEventListener('click', mulaiLayar);
    $('monMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); $('monMenu').hidden = !$('monMenu').hidden; if ($('monMenu').hidden) fokus(); });
    document.querySelectorAll('#monModeSeg button').forEach((b) => { b.onclick = () => setPaksaMode(b.dataset.m); });
    $('monFull').onclick = () => {
      try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* abaikan */ }
    };
    $('monSuara').onclick = () => { M.suara = !M.suara; ls.set(SUARA_KEY, M.suara ? '1' : '0'); labelSuara(); };
    $('monLepas').onclick = () => {
      if (!confirm('Nonaktifkan layar monitor di perangkat ini? Perlu diaktifkan ulang dengan akun Admin/Guru Piket.')) return;
      ls.del(KUNCI_KEY);
      $('monMenu').hidden = true;
      tampilAktivasi();
    };
    // Klik di mana saja (selain menu & form) → kursor kembali ke input pemindai
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#monMenu, #monMenuBtn')) $('monMenu').hidden = true;
      if (!e.target.closest('input, button, a, form')) fokus();
    });
    document.addEventListener('keydown', (e) => {
      if (!$('monAktivasi').hidden) return;
      if (!M.mulai && M.kiosk && e.key !== 'Enter' && e.key.length === 1) mulaiLayar(); // scan pertama juga memulai layar
      if (e.key === 'Escape') { $('monMenu').hidden = !$('monMenu').hidden; if ($('monMenu').hidden) fokus(); }
      if (e.key === 'F2') { e.preventDefault(); setPaksaMode('MASUK'); }
      if (e.key === 'F4') { e.preventDefault(); setPaksaMode('PULANG'); }
      if (e.key === 'F9') { e.preventDefault(); setPaksaMode('AUTO'); }
      // Ketikan pemindai saat fokus lepas: alihkan ke input tanpa kehilangan karakter pertama
      if (e.target !== $('monInput') && $('monMenu').hidden && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        $('monInput').value += e.key;
        fokus();
      }
    });
    document.addEventListener('fullscreenchange', fokus);
    window.addEventListener('focus', fokus);
  }
})();

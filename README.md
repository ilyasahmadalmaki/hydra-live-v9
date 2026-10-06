<div align="center">

# HYDRA<span>LIVE</span> V9

**Cyberpunk multi-platform live streaming control deck.**

Self-hosted web app buat ngatur live streaming ke YouTube, Facebook, dan
server RTMP lainnya dari satu dashboard bergaya terminal hacker.

> `> hydra stream --target youtube --preset 1080p60`
> `[ok] transmission deployed_`

</div>

---

## Design Language

- **Warna**: hitam pekat `#05070c`, neon hijau terminal `#00ff41`,
  aksen cyan `#00f0ff` & magenta `#ff2a6d`
- **Tipografi**: JetBrains Mono (data) + Rajdhani (display)
- **Efek**: scanlines, grid background, glow text, status berkedip
- **Bahasa UI**: Indonesia, gaya terminal (`▸ DASHBOARD`)

## Quick Start

```bash
npm install
cp .env.example .env
# edit .env — isi SESSION_SECRET
npm run dev
```

Buka `http://localhost:3000`.

## Struktur Proyek

```
hydra-live-v9/
├── app.js              # Express server + routes
├── db/database.js      # SQLite init (users, transmissions, media)
├── views/
│   ├── partials/       # header (topbar+sidebar), footer
│   └── dashboard.ejs   # Halaman utama
├── public/
│   ├── css/hydra.css   # Design system cyberpunk
│   └── js/hydra.js     # Clock, status polling, terminal feed
├── data/               # SQLite db (git-ignored)
└── .env                # Konfigurasi (git-ignored)
```

## Roadmap

### Fase 1 — Fondasi: YouTube streamkey mode (IN PROGRESS)
- [x] Design system cyberpunk + layout dashboard
- [x] Multi-channel (tambah/aktifkan/hapus, channel switcher)
- [x] Media vault (upload & kelola video)
- [x] Broadcast: buat, start/stop FFmpeg → RTMP streamkey, live terminal log
- [x] Settings encoder (bitrate, preset)
- [ ] Login & proteksi halaman

### Fase 2 — Loop engine & scheduler (IN PROGRESS)
- [x] Rotation ala streamflow: setting sekali (channel + daftar video + jam tayang + gap + repeat harian/mingguan)
- [x] Mode "loop forever" 24/7 nonstop
- [x] Satu broadcast persistent per rotasi (keputusan: hemat kuota API)
- [x] Auto-reconnect + retry backoff (10s → 5 mnt)
- [x] Engine tick 30 detik: auto-start saat masuk window, auto-stop + geser index saat window tutup
- [ ] Login & proteksi halaman (sisa fase 1)

### Fase 3 — YouTube API penuh (IN PROGRESS)
- [x] OAuth per channel (YouTube Data API v3) — alur connect di halaman Channels
- [x] Auto-create broadcast persistent via API (1x per rotasi, ~4800 unit; auto-recreate bila mati)
- [x] Monitoring health + viewer count real-time (polling hemat: tiap 2 menit, 1 unit/call)
- [x] Notifikasi Telegram (rotasi error, health buruk, pulih kembali)
- [x] Enkripsi stream key & OAuth token di database (AES-256-GCM)
- [ ] Login & proteksi halaman (sisa fase 1)

## Setup YouTube API (Google Cloud)

1. Buka [Google Cloud Console](https://console.cloud.google.com) → buat project baru
2. **APIs & Services → Library** → cari **YouTube Data API v3** → Enable
3. **APIs & Services → OAuth consent screen** → tipe External → isi nama aplikasi
   → tambah scope `youtube` & `youtube.force-ssl` → tambah email lu sebagai Test user
4. **APIs & Services → Credentials** → Create Credentials → **OAuth client ID**
   → tipe **Web application** → Authorized redirect URI = URL yang tampil di halaman
   Channels HydraLive (default `http://localhost:3000/auth/youtube/callback`)
5. Salin **Client ID** & **Client Secret** → masukkan di halaman Channels → SIMPAN
6. Klik **🔑 DAPATKAN AKSES** → login Google → Allow
7. Klik **▶ CHANNEL YT** → hubungkan ke channel HydraLive → channel pindah ke **YT-API mode**

> Kuota default 10.000 unit/hari per project. Tulis (±1600/broadcast, stream, bind)
> hanya terjadi sekali per rotasi; monitoring baca cuma 1 unit per call.

## Lisensi

MIT — bebas dipakai dan dimodifikasi.

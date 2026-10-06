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

### Fase 2 — Loop engine & scheduler
- [ ] Rotation ala streamflow: setting sekali (channel + daftar video + jam tayang + gap + repeat harian/mingguan)
- [ ] Mode "loop forever" 24/7 nonstop
- [ ] Satu broadcast persistent per rotasi (keputusan: hemat kuota API)
- [ ] Auto-reconnect + retry backoff
- [ ] Scheduler: auto-start/auto-stop berjadwal

### Fase 3 — YouTube API penuh
- [ ] OAuth per channel (YouTube Data API v3)
- [ ] Auto-create broadcast persistent via API
- [ ] Monitoring health + viewer count real-time
- [ ] Notifikasi Telegram (stream putus/error)
- [ ] Enkripsi stream key di database

## Lisensi

MIT — bebas dipakai dan dimodifikasi.

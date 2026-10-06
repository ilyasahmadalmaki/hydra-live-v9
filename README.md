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

### Fase 1 — Fondasi UI (sekarang)
- [x] Design system cyberpunk + layout dashboard
- [ ] Halaman Transmissions (CRUD target RTMP)
- [ ] Halaman Media Vault (upload & galeri video)
- [ ] Login + multi-user roles

### Fase 2 — Streaming Engine
- [ ] Integrasi FFmpeg (start/stop/monitor via `fluent-ffmpeg`)
- [ ] Auto-reconnect + failover
- [ ] Preset kualitas (720p / 1080p / 1080p60)

### Fase 3 — Upgrade Fitur
- [ ] Scheduler + jadwal berulang (recurring)
- [ ] Playlist drag-and-drop builder
- [ ] Notifikasi Telegram saat stream putus
- [ ] Target TikTok Live / Twitch
- [ ] Statistik penonton real-time (YouTube API)

## Lisensi

MIT — bebas dipakai dan dimodifikasi.

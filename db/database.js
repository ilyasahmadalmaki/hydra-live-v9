const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'hydra.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Channel YouTube (multi-channel). Mode 'streamkey' = tempel RTMP+key manual.
  // Mode 'api' disiapkan untuk Fase 3 (OAuth YouTube Data API).
  // TODO Fase 3: enkripsi stream_key saat disimpan.
  db.run(`CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'streamkey',
    rtmp_url TEXT,
    stream_key TEXT,
    avatar_url TEXT,
    is_active INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Broadcast = satu sesi live milik sebuah channel.
  // Fase 1: 1 broadcast = 1 video (loop) → 1 target RTMP (dari channel).
  db.run(`CREATE TABLE IF NOT EXISTS broadcasts (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    title TEXT NOT NULL,
    media_id TEXT,
    status TEXT NOT NULL DEFAULT 'standby',
    started_at DATETIME,
    ended_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER,
    duration REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES
    ('video_bitrate', '4500k'),
    ('ffmpeg_preset', 'veryfast')`);

  // ---- Fase 2: Rotation (penjadwalan ala streamflow) ----
  // Rotation = setting sekali: channel + daftar video + jam tayang + gap + repeat.
  // repeat_mode: 'daily' | 'weekly' | 'forever' (24/7 nonstop, tanpa window)
  db.run(`CREATE TABLE IF NOT EXISTS rotations (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    name TEXT NOT NULL,
    repeat_mode TEXT NOT NULL DEFAULT 'daily',
    window_start TEXT,
    window_end TEXT,
    weekly_day INTEGER,
    gap_minutes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    current_index INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS rotation_items (
    id TEXT PRIMARY KEY,
    rotation_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rotation_id) REFERENCES rotations(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
  )`);

  // Broadcast bisa milik sebuah rotation (1 broadcast persistent per rotasi)
  db.run(`ALTER TABLE broadcasts ADD COLUMN rotation_id TEXT`, (err) => {
    // abaikan error "duplicate column name" — kolom sudah ada
  });
});

module.exports = db;

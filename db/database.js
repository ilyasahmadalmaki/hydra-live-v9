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
});

module.exports = db;

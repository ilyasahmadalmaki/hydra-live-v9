// Rotation engine (Fase 2) — penjadwalan ala streamflow.
// Setting sekali: channel + daftar video + jam tayang + gap + repeat.
// repeat_mode: daily | weekly | forever (24/7 nonstop).
// 1 broadcast persistent per rotasi (hemat kuota API).
// Tick tiap 30 detik: cek window → pastikan item yang seharusnya jalan.
const Rotation = require('../models/Rotation');
const Broadcast = require('../models/Broadcast');
const Settings = require('../models/Settings');
const streamer = require('./streamingService');

const TICK_MS = 30 * 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

// state in-memory per rotation:
// { handle, retryCount, nextRetryAt, gapUntil, intentionalStop }
const state = new Map();
let timer = null;
let ticking = false;

function getState(id) {
  if (!state.has(id)) {
    state.set(id, { handle: null, retryCount: 0, nextRetryAt: 0, gapUntil: 0, intentionalStop: false });
  }
  return state.get(id);
}

function hm(date) {
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

// Apakah sekarang masuk jam tayang rotasi?
function inWindow(r, now = new Date()) {
  if (r.repeat_mode === 'forever') return true;
  if (!r.window_start || !r.window_end) return false;

  if (r.repeat_mode === 'weekly') {
    const day = (r.weekly_day === null || r.weekly_day === undefined) ? now.getDay() : Number(r.weekly_day);
    if (now.getDay() !== day) return false;
  }

  const cur = hm(now);
  const s = String(r.window_start).slice(0, 5);
  const e = String(r.window_end).slice(0, 5);
  if (s <= e) return cur >= s && cur < e;   // mis. 08:00–22:00
  return cur >= s || cur < e;                // lewat tengah malam, mis. 22:00–06:00
}

function streamId(r) { return 'rot:' + r.id; }

async function ensureBroadcast(r, item) {
  let bc = await Broadcast.findByRotation(r.id);
  if (!bc) bc = await Broadcast.createForRotation(r.id, r.channel_id, r.name);
  if (item && bc.media_id !== item.media_id) {
    await Broadcast.updateMedia(bc.id, item.media_id);
  }
  return bc;
}

async function startItem(r, items) {
  const st = getState(r.id);
  const idx = (r.current_index || 0) % items.length;
  const item = items[idx];

  if (!r.channel_rtmp_url || !r.channel_stream_key) {
    console.error(`[rotation] ${r.name}: channel RTMP/key belum diisi`);
    st.nextRetryAt = Date.now() + 60000; // jangan spam retry
    return;
  }

  const settings = await Settings.getAll();
  const target = streamer.buildTarget(r.channel_rtmp_url, r.channel_stream_key);

  const handle = streamer.spawnStream(streamId(r), {
    input: item.media_path,
    target,
    bitrate: settings.video_bitrate || '4500k',
    preset: settings.ffmpeg_preset || 'veryfast',
    loop: false, // 1x putar → selesai → lanjut item berikut
    label: `${r.name} :: ${item.media_filename}`
  });
  st.handle = handle;
  st.intentionalStop = false;

  // PENTING: daftarkan onExit SEGERA (sebelum await apa pun).
  // Kalau ffmpeg mati seketika, exit bisa terjadi sebelum await selesai.
  handle.onExit(async (reason) => {
    const cur = state.get(r.id);
    st.handle = null;
    const wasIntentional = st.intentionalStop;
    st.intentionalStop = false;

    const bc = await Broadcast.findByRotation(r.id).catch(() => null);

    if (reason === 'ended' && !wasIntentional) {
      // video selesai natural → jeda gap → item berikut
      if (cur) cur.retryCount = 0;
      const gapMs = (r.gap_minutes || 0) * 60 * 1000;
      if (cur) cur.gapUntil = Date.now() + gapMs;
      const count = items.length;
      const nextIdx = (idx + 1) % count;
      await Rotation.setIndex(r.id, nextIdx).catch(() => {});
      console.log(`[rotation] ${r.name} ✓ item selesai → jeda ${r.gap_minutes || 0} mnt → item ${nextIdx + 1}/${count}`);
    } else if (reason === 'error') {
      // crash → backoff retry
      if (cur) {
        cur.retryCount += 1;
        const backoff = Math.min(MAX_BACKOFF_MS, 10 * 1000 * Math.pow(2, cur.retryCount - 1));
        cur.nextRetryAt = Date.now() + backoff;
        console.error(`[rotation] ${r.name} ✗ stream error → retry #${cur.retryCount} dalam ${Math.round(backoff / 1000)} dtk`);
      }
      try { if (bc) await Broadcast.setStatus(bc.id, 'error'); } catch (e) {}
    }
    // stop manual (window tutup / pause): tidak perlu aksi lanjutan
  });

  const bc = await ensureBroadcast(r, item);
  await Broadcast.setStatus(bc.id, 'live');
  console.log(`[rotation] ${r.name} ▶ item ${idx + 1}/${items.length}: ${item.media_filename}`);
}

async function stopItem(r, why) {
  const st = state.get(r.id);
  if (st && st.handle) {
    console.log(`[rotation] ${r.name} ■ stop (${why})`);
    st.intentionalStop = true;
    try { st.handle.stop(); } catch (e) {}
  }
  try {
    const bc = await Broadcast.findByRotation(r.id);
    if (bc) await Broadcast.setStatus(bc.id, 'standby');
  } catch (e) {}
}

async function evaluate(r) {
  const st = getState(r.id);
  const now = Date.now();

  // Di luar jam tayang → pastikan mati, geser index ala streamflow
  if (!inWindow(r)) {
    if (streamer.isActive(streamId(r))) {
      await stopItem(r, 'window tutup');
      const items = await Rotation.getItems(r.id);
      if (items.length) {
        const nextIdx = ((r.current_index || 0) + 1) % items.length;
        await Rotation.setIndex(r.id, nextIdx).catch(() => {});
      }
    }
    return;
  }

  const items = await Rotation.getItems(r.id);
  if (!items.length) return;

  if (streamer.isActive(streamId(r))) return;  // sudah jalan
  if (now < st.nextRetryAt) return;            // backoff retry
  if (now < st.gapUntil) return;               // jeda antar item

  await startItem(r, items);
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const rotations = await Rotation.findActive();
    for (const r of rotations) {
      try { await evaluate(r); }
      catch (e) { console.error(`[rotation] ${r.name} evaluate error:`, e.message); }
    }
    // bersihkan state rotasi yang sudah nonaktif/dihapus
    const activeIds = new Set(rotations.map(r => r.id));
    for (const key of [...state.keys()]) {
      if (!activeIds.has(key)) {
        const st = state.get(key);
        if (st && st.handle) {
          st.intentionalStop = true;
          try { st.handle.stop(); } catch (e) {}
        }
        state.delete(key);
      }
    }
  } finally {
    ticking = false;
  }
}

function status(id) {
  const st = state.get(id);
  const s = streamer.rawStatus(streamId({ id }));
  return {
    live: s.live,
    uptimeSec: s.uptimeSec || 0,
    retryCount: st ? st.retryCount : 0,
    inGap: st ? Date.now() < st.gapUntil : false,
    nextRetryIn: st && st.nextRetryAt > Date.now() ? Math.round((st.nextRetryAt - Date.now()) / 1000) : 0
  };
}

function logs(id) {
  return streamer.rawLogs(streamId({ id }));
}

function init() {
  if (timer) return;
  console.log('[rotation] engine online — tick 30 dtk');
  timer = setInterval(tick, TICK_MS);
  tick();
}

function shutdown() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { init, shutdown, tick, status, logs, stopItem, inWindow };

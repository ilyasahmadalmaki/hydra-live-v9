// Notifikasi Telegram — Fase 3.
// Config di Settings: telegram_bot_token, telegram_chat_id, telegram_enabled.
const axios = require('axios');
const Settings = require('../models/Settings');

let lastSent = new Map(); // key -> timestamp (anti spam)

async function isEnabled() {
  const s = await Settings.getAll();
  return s.telegram_enabled === '1' && s.telegram_bot_token && s.telegram_chat_id;
}

// Kirim dengan throttle per key (default 15 menit) biar tidak spam
async function notify(key, text, throttleMs = 15 * 60 * 1000) {
  try {
    if (!(await isEnabled())) return false;
    const now = Date.now();
    if (lastSent.has(key) && now - lastSent.get(key) < throttleMs) return false;

    const s = await Settings.getAll();
    await axios.post(`https://api.telegram.org/bot${s.telegram_bot_token}/sendMessage`, {
      chat_id: s.telegram_chat_id,
      text: `🤖 <b>HYDRALIVE</b>\n${text}`,
      parse_mode: 'HTML'
    }, { timeout: 10000 });

    lastSent.set(key, now);
    return true;
  } catch (e) {
    console.error('[telegram] gagal kirim:', e.message);
    return false;
  }
}

const rotationError = (name, detail) =>
  notify(`roterr:${name}`, `🔴 <b>ROTASI ERROR</b>\n${name}\n${detail}`);

const rotationRecovered = (name) =>
  notify(`roterr:${name}`, `🟢 <b>PULIH</b>\n${name} kembali streaming.`, 0);

const healthBad = (name, health) =>
  notify(`health:${name}`, `⚠️ <b>STREAM HEALTH BURUK</b>\n${name}: ${health}`);

const testMessage = () =>
  notify('test', '✅ Test notifikasi berhasil. HydraLive terhubung.', 0);

module.exports = { notify, rotationError, rotationRecovered, healthBad, testMessage, isEnabled };

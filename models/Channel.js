const { randomUUID } = require('crypto');
const { run, get, all } = require('../db/helpers');

async function create({ name, rtmp_url, stream_key }) {
  const id = randomUUID();
  const count = await get('SELECT COUNT(*) AS c FROM channels');
  await run(
    `INSERT INTO channels (id, name, mode, rtmp_url, stream_key, is_active)
     VALUES (?, ?, 'streamkey', ?, ?, ?)`,
    [id, name, rtmp_url || null, stream_key || null, count.c === 0 ? 1 : 0]
  );
  return get('SELECT * FROM channels WHERE id = ?', [id]);
}

function allChannels() {
  return all('SELECT * FROM channels ORDER BY created_at ASC');
}

function findById(id) {
  return get('SELECT * FROM channels WHERE id = ?', [id]);
}

function getActive() {
  return get('SELECT * FROM channels WHERE is_active = 1');
}

async function setActive(id) {
  const ch = await findById(id);
  if (!ch) throw new Error('channel not found');
  await run('UPDATE channels SET is_active = 0');
  await run('UPDATE channels SET is_active = 1 WHERE id = ?', [id]);
  return findById(id);
}

async function update(id, { name, rtmp_url, stream_key }) {
  await run('UPDATE channels SET name = ?, rtmp_url = ?, stream_key = ? WHERE id = ?',
    [name, rtmp_url || null, stream_key || null, id]);
  return findById(id);
}

async function remove(id) {
  const active = await getActive();
  await run('DELETE FROM channels WHERE id = ?', [id]);
  // kalau yang dihapus adalah channel aktif, aktifkan salah satu yang tersisa
  if (active && active.id === id) {
    const rest = await all('SELECT id FROM channels ORDER BY created_at ASC LIMIT 1');
    if (rest.length) await run('UPDATE channels SET is_active = 1 WHERE id = ?', [rest[0].id]);
  }
  return true;
}

function maskKey(key) {
  if (!key) return '—';
  return key.slice(0, 4) + '••••••••';
}

module.exports = { create, all: allChannels, findById, getActive, setActive, update, remove, maskKey };

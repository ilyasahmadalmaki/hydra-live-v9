const { randomUUID } = require('crypto');
const { run, get, all } = require('../db/helpers');
const { encrypt, decrypt } = require('../utils/encryption');

function hydrate(row) {
  if (!row) return row;
  // stream_key: decrypt bila terenkripsi, fallback plain (legacy)
  try { row.stream_key = decrypt(row.stream_key); } catch (e) {}
  try { row.yt_stream_key = decrypt(row.yt_stream_key); } catch (e) {}
  return row;
}

async function create({ name, rtmp_url, stream_key }) {
  const id = randomUUID();
  const count = await get('SELECT COUNT(*) AS c FROM channels');
  await run(
    `INSERT INTO channels (id, name, mode, rtmp_url, stream_key, is_active)
     VALUES (?, ?, 'streamkey', ?, ?, ?)`,
    [id, name, rtmp_url || null, stream_key ? encrypt(stream_key) : null, count.c === 0 ? 1 : 0]
  );
  return findById(id);
}

async function allChannels() {
  return (await all('SELECT * FROM channels ORDER BY created_at ASC')).map(hydrate);
}

async function findById(id) {
  return hydrate(await get('SELECT * FROM channels WHERE id = ?', [id]));
}

async function getActive() {
  return hydrate(await get('SELECT * FROM channels WHERE is_active = 1'));
}

async function setActive(id) {
  const ch = await findById(id);
  if (!ch) throw new Error('channel not found');
  await run('UPDATE channels SET is_active = 0');
  await run('UPDATE channels SET is_active = 1 WHERE id = ?', [id]);
  return findById(id);
}

async function update(id, { name, rtmp_url, stream_key, mode }) {
  const sets = [];
  const vals = [];
  if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
  if (rtmp_url !== undefined) { sets.push('rtmp_url = ?'); vals.push(rtmp_url || null); }
  if (stream_key !== undefined) {
    sets.push('stream_key = ?');
    vals.push(stream_key ? encrypt(stream_key) : null);
  }
  if (mode !== undefined) { sets.push('mode = ?'); vals.push(mode); }
  if (!sets.length) return findById(id);
  vals.push(id);
  await run(`UPDATE channels SET ${sets.join(', ')} WHERE id = ?`, vals);
  return findById(id);
}

// Hubungkan channel ke kredensial OAuth + info channel YouTube
async function linkYoutube(id, { oauth_credential_id, youtube_channel_id, youtube_channel_name, youtube_thumbnail }) {
  await run(
    `UPDATE channels SET oauth_credential_id = ?, youtube_channel_id = ?,
     youtube_channel_name = ?, youtube_thumbnail = ?, mode = 'api' WHERE id = ?`,
    [oauth_credential_id, youtube_channel_id, youtube_channel_name || null, youtube_thumbnail || null, id]
  );
  return findById(id);
}

async function unlinkYoutube(id) {
  await run(
    `UPDATE channels SET oauth_credential_id = NULL, youtube_channel_id = NULL,
     youtube_channel_name = NULL, youtube_thumbnail = NULL,
     yt_broadcast_id = NULL, yt_stream_id = NULL, yt_ingestion_url = NULL,
     yt_stream_key = NULL, mode = 'streamkey' WHERE id = ?`,
    [id]
  );
  return findById(id);
}

// Simpan info ingestion YouTube (hasil liveStreams.insert), key terenkripsi
async function saveIngestion(id, { yt_broadcast_id, yt_stream_id, yt_ingestion_url, yt_stream_key }) {
  await run(
    `UPDATE channels SET yt_broadcast_id = ?, yt_stream_id = ?,
     yt_ingestion_url = ?, yt_stream_key = ? WHERE id = ?`,
    [yt_broadcast_id || null, yt_stream_id || null, yt_ingestion_url || null,
     yt_stream_key ? encrypt(yt_stream_key) : null, id]
  );
  return findById(id);
}

async function remove(id) {
  const active = await getActive();
  await run('DELETE FROM channels WHERE id = ?', [id]);
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

module.exports = {
  create, all: allChannels, findById, getActive, setActive, update,
  linkYoutube, unlinkYoutube, saveIngestion, remove, maskKey
};

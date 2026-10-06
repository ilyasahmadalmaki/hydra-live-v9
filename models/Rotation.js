const { randomUUID } = require('crypto');
const { run, get, all } = require('../db/helpers');

async function create({ channel_id, name, repeat_mode, window_start, window_end, weekly_day, gap_minutes }) {
  const id = randomUUID();
  await run(
    `INSERT INTO rotations (id, channel_id, name, repeat_mode, window_start, window_end, weekly_day, gap_minutes, status, current_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)`,
    [id, channel_id, name, repeat_mode || 'daily',
     window_start || null, window_end || null,
     weekly_day === undefined || weekly_day === '' ? null : Number(weekly_day),
     Number(gap_minutes) || 0]
  );
  return findById(id);
}

function findById(id) {
  return get(
    `SELECT r.*, c.name AS channel_name, c.rtmp_url AS channel_rtmp_url, c.stream_key AS channel_stream_key
     FROM rotations r JOIN channels c ON c.id = r.channel_id WHERE r.id = ?`,
    [id]
  );
}

function allDetailed() {
  return all(
    `SELECT r.*, c.name AS channel_name,
            (SELECT COUNT(*) FROM rotation_items WHERE rotation_id = r.id) AS item_count
     FROM rotations r JOIN channels c ON c.id = r.channel_id
     ORDER BY r.created_at DESC`
  );
}

function findActive() {
  return all(
    `SELECT r.*, c.name AS channel_name, c.rtmp_url AS channel_rtmp_url, c.stream_key AS channel_stream_key
     FROM rotations r JOIN channels c ON c.id = r.channel_id
     WHERE r.status = 'active'`
  );
}

function getItems(rotationId) {
  return all(
    `SELECT ri.*, m.filename AS media_filename, m.path AS media_path, m.size AS media_size
     FROM rotation_items ri JOIN media m ON m.id = ri.media_id
     WHERE ri.rotation_id = ? ORDER BY ri.order_index ASC`,
    [rotationId]
  );
}

async function addItem(rotationId, mediaId) {
  const row = await get('SELECT COALESCE(MAX(order_index), -1) AS m FROM rotation_items WHERE rotation_id = ?', [rotationId]);
  const id = randomUUID();
  await run('INSERT INTO rotation_items (id, rotation_id, media_id, order_index) VALUES (?, ?, ?, ?)',
    [id, rotationId, mediaId, row.m + 1]);
  return id;
}

function removeItem(itemId) {
  return run('DELETE FROM rotation_items WHERE id = ?', [itemId]);
}

async function setIndex(id, index) {
  await run('UPDATE rotations SET current_index = ? WHERE id = ?', [index, id]);
}

async function setStatus(id, status) {
  await run('UPDATE rotations SET status = ? WHERE id = ?', [status, id]);
}

function remove(id) {
  return run('DELETE FROM rotations WHERE id = ?', [id]);
}

module.exports = {
  create, findById, allDetailed, findActive,
  getItems, addItem, removeItem, setIndex, setStatus, remove
};

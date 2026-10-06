const { randomUUID } = require('crypto');
const { run, get, all } = require('../db/helpers');

async function create({ channel_id, title, media_id }) {
  const id = randomUUID();
  await run(
    `INSERT INTO broadcasts (id, channel_id, title, media_id, status)
     VALUES (?, ?, ?, ?, 'standby')`,
    [id, channel_id, title, media_id || null]
  );
  return findDetailed(id);
}

function allDetailed() {
  return all(
    `SELECT b.*, c.name AS channel_name, c.mode AS channel_mode,
            c.rtmp_url AS channel_rtmp_url, c.stream_key AS channel_stream_key,
            m.filename AS media_filename, m.path AS media_path
     FROM broadcasts b
     JOIN channels c ON c.id = b.channel_id
     LEFT JOIN media m ON m.id = b.media_id
     ORDER BY b.created_at DESC`
  );
}

function findDetailed(id) {
  return get(
    `SELECT b.*, c.name AS channel_name, c.mode AS channel_mode,
            c.rtmp_url AS channel_rtmp_url, c.stream_key AS channel_stream_key,
            m.filename AS media_filename, m.path AS media_path
     FROM broadcasts b
     JOIN channels c ON c.id = b.channel_id
     LEFT JOIN media m ON m.id = b.media_id
     WHERE b.id = ?`,
    [id]
  );
}

async function setStatus(id, status) {
  const now = new Date().toISOString();
  if (status === 'live') {
    await run(`UPDATE broadcasts SET status = 'live', started_at = ?, ended_at = NULL WHERE id = ?`, [now, id]);
  } else {
    await run(`UPDATE broadcasts SET status = ?, ended_at = ? WHERE id = ?`, [status, now, id]);
  }
  return findDetailed(id);
}

function remove(id) {
  return run('DELETE FROM broadcasts WHERE id = ?', [id]);
}

module.exports = { create, allDetailed, findDetailed, setStatus, remove };

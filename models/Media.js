const { randomUUID } = require('crypto');
const { run, get, all } = require('../db/helpers');

async function create({ filename, path, size }) {
  const id = randomUUID();
  await run('INSERT INTO media (id, filename, path, size) VALUES (?, ?, ?, ?)',
    [id, filename, path, size || null]);
  return get('SELECT * FROM media WHERE id = ?', [id]);
}

function allMedia() {
  return all('SELECT * FROM media ORDER BY created_at DESC');
}

function findById(id) {
  return get('SELECT * FROM media WHERE id = ?', [id]);
}

function remove(id) {
  return run('DELETE FROM media WHERE id = ?', [id]);
}

module.exports = { create, all: allMedia, findById, remove };

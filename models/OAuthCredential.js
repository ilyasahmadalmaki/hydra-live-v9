const { randomUUID } = require('crypto');
const { run, get, all } = require('../db/helpers');
const { encrypt, decrypt } = require('../utils/encryption');

function hydrate(row) {
  if (!row) return row;
  for (const k of ['client_secret', 'access_token', 'refresh_token']) {
    try { row[k] = decrypt(row[k]); } catch (e) {}
  }
  return row;
}

async function create({ label, client_id, client_secret }) {
  const id = randomUUID();
  await run(
    'INSERT INTO oauth_credentials (id, label, client_id, client_secret) VALUES (?, ?, ?, ?)',
    [id, label, client_id, encrypt(client_secret)]
  );
  return findById(id);
}

async function allCreds() {
  const rows = await all('SELECT id, label, client_id, created_at FROM oauth_credentials ORDER BY created_at DESC');
  return rows;
}

async function findById(id) {
  return hydrate(await get('SELECT * FROM oauth_credentials WHERE id = ?', [id]));
}

async function saveTokens(id, { access_token, refresh_token, expiry_date }) {
  // refresh_token kadang tidak dikirim ulang Google — pertahankan yang lama bila kosong
  const cur = await findById(id);
  await run(
    `UPDATE oauth_credentials SET access_token = ?, refresh_token = ?, token_expiry = ? WHERE id = ?`,
    [encrypt(access_token),
     encrypt(refresh_token || (cur && cur.refresh_token) || ''),
     expiry_date ? new Date(expiry_date).toISOString() : null, id]
  );
}

function remove(id) {
  return run('DELETE FROM oauth_credentials WHERE id = ?', [id]);
}

module.exports = { create, all: allCreds, findById, saveTokens, remove };

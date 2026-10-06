// ── users ──────────────────────────────────────────────
const { randomUUID } = require('crypto');
const bcrypt = require('bcrypt');
const { run, get } = require('../db/helpers');

async function create({ username, password, role = 'admin' }) {
  const password_hash = await bcrypt.hash(password, 10);
  const id = randomUUID();
  await run('INSERT INTO users (id, username, password_hash, role) VALUES (?,?,?,?)',
    [id, username, password_hash, role]);
  return get('SELECT id, username, role, created_at FROM users WHERE id = ?', [id]);
}

function findByUsername(username) {
  return get('SELECT * FROM users WHERE username = ?', [username]);
}

async function verify(username, password) {
  if (!username || !password) return null;
  const u = await findByUsername(username);
  if (!u) return null;
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return null;
  return { id: u.id, username: u.username, role: u.role };
}

async function count() {
  const r = await get('SELECT COUNT(*) AS c FROM users');
  return r.c;
}

module.exports = { create, findByUsername, verify, count };

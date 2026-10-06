const { run, get, all } = require('../db/helpers');

async function getAll() {
  const rows = await all('SELECT key, value FROM settings');
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  return obj;
}

async function set(obj) {
  for (const [key, value] of Object.entries(obj)) {
    await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    );
  }
  return getAll();
}

module.exports = { getAll, set };

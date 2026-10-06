// Helper promise untuk sqlite3
const db = require('../db/database');

const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));

const get = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

const all = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));

module.exports = { db, run, get, all };

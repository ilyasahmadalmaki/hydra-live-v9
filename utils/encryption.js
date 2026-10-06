// Enkripsi simetris AES-256-GCM untuk secret di database
// (stream key, OAuth client secret, access/refresh token).
// Kunci dari env HYDRALIVE_SECRET (fallback SESSION_SECRET).
// Format: "enc:v1:<base64(iv|tag|ct)>"
const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function getKey() {
  const secret = process.env.HYDRALIVE_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error('HYDRALIVE_SECRET / SESSION_SECRET belum di-set');
  return crypto.scryptSync(secret, 'hydralive-salt', 32);
}

function encrypt(plain) {
  if (plain === null || plain === undefined) return plain;
  if (typeof plain !== 'string') plain = String(plain);
  if (plain.startsWith(PREFIX)) return plain; // sudah terenkripsi
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

function decrypt(stored) {
  if (stored === null || stored === undefined) return stored;
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return stored; // legacy plain
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function isEncrypted(v) {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

module.exports = { encrypt, decrypt, isEncrypted };

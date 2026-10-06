require('dotenv').config();
const os = require('os');
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const multer = require('multer');

require('./db/database');
const Channel = require('./models/Channel');
const Broadcast = require('./models/Broadcast');
const Media = require('./models/Media');
const Settings = require('./models/Settings');
const Rotation = require('./models/Rotation');
const OAuthCredential = require('./models/OAuthCredential');
const User = require('./models/User');
const streamer = require('./services/streamingService');
const rotationService = require('./services/rotationService');
const youtube = require('./services/youtubeService');
const telegram = require('./services/telegramService');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 8 * 1024 * 1024 * 1024 } // 8 GB
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'data') }),
  secret: process.env.SESSION_SECRET || 'hydra-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// Global auth gate: semua halaman & API butuh login (kecuali /login & /setup).
// Static assets diserve di atas, jadi login page tetap dapat CSS/JS.
app.use(require('./middleware/auth').requireAuth);

// Global view data: user + daftar channel + channel aktif (untuk switcher)
app.use(async (req, res, next) => {
  res.locals.appName = 'HYDRALIVE';
  res.locals.user = req.session.user || null;
  try {
    res.locals.channels = await Channel.all();
    res.locals.activeChannel = await Channel.getActive();
  } catch (e) {
    res.locals.channels = [];
    res.locals.activeChannel = null;
  }
  next();
});

// ---------- Auth: login / setup / logout ----------
// Halaman ini di-whitelist di middleware/auth (tidak butuh login).
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: 'LOGIN', error: null });
});

app.post('/login', async (req, res) => {
  const u = await User.verify(req.body.username, req.body.password).catch(() => null);
  if (!u) return res.render('login', { title: 'LOGIN', error: 'username / password salah' });
  req.session.user = u;
  res.redirect(req.session.returnTo || '/');
  delete req.session.returnTo;
});

// Setup admin pertama (hanya bisa diakses kalau belum ada user sama sekali)
app.get('/setup', async (req, res) => {
  if (await User.count().catch(() => 1) > 0) return res.redirect('/login');
  res.render('setup', { title: 'SETUP', error: null });
});

app.post('/setup', async (req, res) => {
  if (await User.count().catch(() => 1) > 0) return res.redirect('/login');
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  if (!username) return res.render('setup', { title: 'SETUP', error: 'username wajib diisi' });
  if (password.length < 6) return res.render('setup', { title: 'SETUP', error: 'password minimal 6 karakter' });
  try {
    const u = await User.create({ username, password, role: 'admin' });
    req.session.user = u;
    res.redirect('/');
  } catch (e) {
    res.render('setup', { title: 'SETUP', error: 'username sudah dipakai' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---------- Halaman ----------
app.get('/', async (req, res) => {
  const broadcasts = await Broadcast.allDetailed();
  const media = await Media.all();
  const statuses = {};
  broadcasts.forEach(b => { statuses[b.id] = streamer.status(b.id); });
  const liveOne = broadcasts.find(b => streamer.status(b.id).live);
  const rotations = await Rotation.findActive();
  const rotStatuses = {};
  for (const r of rotations) {
    const items = await Rotation.getItems(r.id);
    rotStatuses[r.id] = { ...rotationService.status(r.id), item_count: items.length, current_index: r.current_index || 0 };
  }
  res.render('dashboard', {
    title: 'DASHBOARD', active: 'dashboard',
    broadcasts, media, statuses, liveOne: liveOne || null,
    rotations, rotStatuses
  });
});

// ---------- YouTube OAuth (Fase 3) ----------
app.get('/channels', async (req, res) => {
  res.render('channels', {
    title: 'CHANNELS', active: 'channels',
    credentials: await OAuthCredential.all(),
    redirectUri: youtube.getRedirectUri()
  });
});

app.post('/oauth/credentials', async (req, res) => {
  try {
    await OAuthCredential.create(req.body);
  } catch (e) { console.error('[oauth] create:', e.message); }
  res.redirect('/channels');
});

app.post('/oauth/credentials/:id/delete', async (req, res) => {
  try { await OAuthCredential.remove(req.params.id); } catch (e) {}
  res.redirect('/channels');
});

// Langkah 1: redirect ke Google
app.get('/auth/youtube/start/:id', async (req, res) => {
  try {
    const url = await youtube.getAuthUrl(req.params.id);
    res.redirect(url);
  } catch (e) {
    res.status(400).send('Gagal membuat auth URL: ' + e.message);
  }
});

// Langkah 2: callback dari Google → tukar code → simpan token
app.get('/auth/youtube/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send('OAuth dibatalkan: ' + error);
  if (!code || !state) return res.status(400).send('code/state hilang');
  try {
    await youtube.exchangeCode(state, code);
    res.redirect('/oauth/credentials/' + state + '/yt-channels');
  } catch (e) {
    res.status(500).send('Gagal tukar code: ' + e.message);
  }
});

// Daftar channel YouTube milik akun tsb → pilih untuk dihubungkan
app.get('/oauth/credentials/:id/yt-channels', async (req, res) => {
  try {
    const { youtube: yt } = await youtube.getOAuthClient(req.params.id);
    const list = await yt.channels.list({ part: ['snippet'], mine: true, maxResults: 20 });
    const channels = (list.data.items || []).map(c => ({
      id: c.id,
      title: c.snippet.title,
      thumbnail: (c.snippet.thumbnails && c.snippet.thumbnails.default || {}).url || null
    }));
    const hydraChannels = await Channel.all();
    res.render('yt-channels', {
      title: 'PILIH CHANNEL', active: 'channels',
      credId: req.params.id, channels, hydraChannels
    });
  } catch (e) {
    res.status(500).send('Gagal ambil channel: ' + e.message);
  }
});

app.post('/oauth/credentials/:id/link', async (req, res) => {
  try {
    const { hydra_channel_id, yt_id, yt_title, yt_thumb } = req.body;
    await Channel.linkYoutube(hydra_channel_id, {
      oauth_credential_id: req.params.id,
      youtube_channel_id: yt_id,
      youtube_channel_name: yt_title,
      youtube_thumbnail: yt_thumb
    });
  } catch (e) { console.error('[oauth] link:', e.message); }
  res.redirect('/channels');
});

app.post('/channels/:id/unlink-youtube', async (req, res) => {
  try { await Channel.unlinkYoutube(req.params.id); } catch (e) {}
  res.redirect('/channels');
});

app.post('/api/telegram/test', async (req, res) => {
  const ok = await telegram.testMessage();
  res.json({ ok });
});

app.get('/media', async (req, res) => {
  res.render('media', { title: 'MEDIA_VAULT', active: 'media', media: await Media.all() });
});

app.get('/settings', async (req, res) => {
  res.render('settings', { title: 'SETTINGS', active: 'settings', settings: await Settings.getAll() });
});

// ---------- Channel API ----------
app.post('/channels', async (req, res) => {
  try {
    await Channel.create(req.body);
  } catch (e) { console.error('[channels] create:', e.message); }
  res.redirect('/channels');
});

app.post('/channels/:id/activate', async (req, res) => {
  try { await Channel.setActive(req.params.id); } catch (e) {}
  res.redirect(req.get('Referer') || '/');
});

app.post('/channels/:id/delete', async (req, res) => {
  try { await Channel.remove(req.params.id); } catch (e) {}
  res.redirect('/channels');
});

// ---------- Broadcast ----------
app.post('/broadcasts', async (req, res) => {
  try {
    await Broadcast.create(req.body);
  } catch (e) { console.error('[broadcasts] create:', e.message); }
  res.redirect('/');
});

app.post('/broadcasts/:id/delete', async (req, res) => {
  try {
    await streamer.stop(req.params.id);
    await Broadcast.remove(req.params.id);
  } catch (e) {}
  res.redirect('/');
});

app.post('/api/broadcasts/:id/start', async (req, res) => {
  try { res.json(await streamer.start(req.params.id)); }
  catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/broadcasts/:id/stop', async (req, res) => {
  try { res.json(await streamer.stop(req.params.id)); }
  catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get('/api/broadcasts/:id/logs', (req, res) => {
  res.json({ logs: streamer.logs(req.params.id) });
});

// ---------- Media vault ----------
app.post('/media/upload', upload.single('video'), async (req, res) => {
  try {
    if (req.file) {
      await Media.create({
        filename: req.file.originalname,
        path: req.file.path,
        size: req.file.size
      });
    }
  } catch (e) { console.error('[media] upload:', e.message); }
  res.redirect('/media');
});

app.post('/media/:id/delete', async (req, res) => {
  try {
    const m = await Media.findById(req.params.id);
    if (m) {
      try { fs.unlinkSync(m.path); } catch (e) {}
      await Media.remove(m.id);
    }
  } catch (e) {}
  res.redirect('/media');
});

// ---------- Rotation (Fase 2) ----------
app.get('/rotations', async (req, res) => {
  const rotations = await Rotation.allDetailed();
  const withItems = [];
  for (const r of rotations) {
    const items = await Rotation.getItems(r.id);
    withItems.push({ ...r, items, rt: rotationService.status(r.id) });
  }
  res.render('rotations', {
    title: 'ROTATIONS', active: 'rotations',
    rotations: withItems, media: await Media.all()
  });
});

app.post('/rotations', async (req, res) => {
  try {
    await Rotation.create(req.body);
  } catch (e) { console.error('[rotations] create:', e.message); }
  res.redirect('/rotations');
});

app.post('/rotations/:id/items', async (req, res) => {
  try {
    await Rotation.addItem(req.params.id, req.body.media_id);
  } catch (e) { console.error('[rotations] addItem:', e.message); }
  res.redirect('/rotations');
});

app.post('/rotations/:id/items/:itemId/delete', async (req, res) => {
  try { await Rotation.removeItem(req.params.itemId); } catch (e) {}
  res.redirect('/rotations');
});

app.post('/rotations/:id/toggle', async (req, res) => {
  try {
    const r = await Rotation.findById(req.params.id);
    if (r) {
      const next = r.status === 'active' ? 'paused' : 'active';
      if (next === 'paused') await rotationService.stopItem(r, 'pause manual');
      await Rotation.setStatus(r.id, next);
    }
  } catch (e) {}
  res.redirect('/rotations');
});

app.post('/rotations/:id/delete', async (req, res) => {
  try {
    const r = await Rotation.findById(req.params.id);
    if (r) await rotationService.stopItem(r, 'hapus rotasi');
    const bc = await Broadcast.findByRotation(req.params.id);
    if (bc) await Broadcast.remove(bc.id);
    await Rotation.remove(req.params.id);
  } catch (e) {}
  res.redirect('/rotations');
});

app.get('/api/rotations/status', async (req, res) => {
  const rotations = await Rotation.findActive();
  res.json(rotations.map(r => ({ id: r.id, name: r.name, ...rotationService.status(r.id) })));
});

app.get('/api/rotations/:id/logs', (req, res) => {
  res.json({ logs: rotationService.logs(req.params.id) });
});

// ---------- Settings ----------
app.post('/settings', async (req, res) => {
  try { await Settings.set(req.body); } catch (e) {}
  res.redirect('/settings');
});

// ---------- System status ----------
app.get('/api/status', (req, res) => {
  const total = os.totalmem();
  const free = os.freemem();
  res.json({
    time: new Date().toISOString(),
    uptime: Math.floor(os.uptime()),
    cpuCount: os.cpus().length,
    memUsedPct: Math.round(((total - free) / total) * 100),
    memUsedGb: (total - free) / 1024 ** 3,
    memTotalGb: total / 1024 ** 3,
    load1: os.loadavg()[0].toFixed(2)
  });
});

app.listen(PORT, () => {
  console.log('[hydra] control deck online → http://localhost:' + PORT);
});

// Rotation engine jalan begitu server nyala
rotationService.init();

process.on('SIGTERM', () => { rotationService.shutdown(); process.exit(0); });

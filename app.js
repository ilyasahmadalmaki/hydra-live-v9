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
const streamer = require('./services/streamingService');

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

// Global view data: daftar channel + channel aktif (untuk switcher)
app.use(async (req, res, next) => {
  res.locals.appName = 'HYDRALIVE';
  try {
    res.locals.channels = await Channel.all();
    res.locals.activeChannel = await Channel.getActive();
  } catch (e) {
    res.locals.channels = [];
    res.locals.activeChannel = null;
  }
  next();
});

// ---------- Halaman ----------
app.get('/', async (req, res) => {
  const broadcasts = await Broadcast.allDetailed();
  const media = await Media.all();
  const statuses = {};
  broadcasts.forEach(b => { statuses[b.id] = streamer.status(b.id); });
  const liveOne = broadcasts.find(b => streamer.status(b.id).live);
  res.render('dashboard', {
    title: 'DASHBOARD', active: 'dashboard',
    broadcasts, media, statuses, liveOne: liveOne || null
  });
});

app.get('/channels', async (req, res) => {
  res.render('channels', { title: 'CHANNELS', active: 'channels' });
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

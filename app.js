require('dotenv').config();
const os = require('os');
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

// Inisialisasi database (membuat tabel bila belum ada)
require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

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
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 hari
}));

app.use((req, res, next) => {
  res.locals.appName = 'HYDRALIVE';
  next();
});

// Halaman utama
app.get('/', (req, res) => {
  res.render('dashboard', { title: 'DASHBOARD', active: 'dashboard' });
});

// API status sistem (dipolling oleh hydra.js)
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

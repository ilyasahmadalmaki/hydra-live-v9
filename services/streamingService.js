// Streaming engine Fase 1: FFmpeg push ke RTMP (streamkey mode).
// 1 broadcast = 1 proses FFmpeg = 1 video di-loop.
// Fase 2 akan menambah: rotasi multi-item, scheduler, auto-reconnect.
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const Broadcast = require('../models/Broadcast');
const Settings = require('../models/Settings');

const active = new Map(); // broadcastId -> { proc, startedAt, logs[] }
const MAX_LOGS = 200;

function pushLog(id, line) {
  const s = active.get(id);
  if (!s) return;
  const ts = new Date().toLocaleTimeString('en-GB');
  s.logs.push(`[${ts}] ${line}`);
  if (s.logs.length > MAX_LOGS) s.logs.shift();
}

function buildTarget(b) {
  const base = (b.channel_rtmp_url || '').replace(/\/+$/, '');
  const key = (b.channel_stream_key || '').replace(/^\/+/, '');
  return `${base}/${key}`;
}

async function cleanup(id, finalStatus) {
  const s = active.get(id);
  if (s) {
    pushLog(id, `ffmpeg stopped → status: ${finalStatus}`);
  }
  active.delete(id);
  try {
    await Broadcast.setStatus(id, finalStatus === 'live' ? 'standby' : finalStatus);
  } catch (e) { /* db mungkin sudah berubah */ }
}

async function start(id) {
  if (active.has(id)) return { ok: false, error: 'broadcast already live' };

  const b = await Broadcast.findDetailed(id);
  if (!b) return { ok: false, error: 'broadcast not found' };
  if (!b.media_path) return { ok: false, error: 'no media attached to broadcast' };
  if (!b.channel_rtmp_url || !b.channel_stream_key) {
    return { ok: false, error: 'channel RTMP URL / stream key belum diisi' };
  }

  const settings = await Settings.getAll();
  const bitrate = settings.video_bitrate || '4500k';
  const preset = settings.ffmpeg_preset || 'veryfast';
  const target = buildTarget(b);

  const args = [
    '-re',
    '-stream_loop', '-1',
    '-i', b.media_path,
    '-c:v', 'libx264', '-preset', preset,
    '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', '8000k',
    '-pix_fmt', 'yuv420p', '-g', '60',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-f', 'flv', target
  ];

  let proc;
  try {
    proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    return { ok: false, error: 'gagal menjalankan ffmpeg: ' + e.message };
  }

  active.set(id, { proc, startedAt: Date.now(), logs: [] });
  pushLog(id, `$ ffmpeg -re -stream_loop -1 -i "${b.media_filename}"`);
  pushLog(id, `target: ${b.channel_rtmp_url}/*** (key disembunyikan)`);
  pushLog(id, `preset: ${preset} | video bitrate: ${bitrate}`);

  proc.stderr.on('data', (chunk) => {
    const line = chunk.toString().trim().split('\n').pop();
    if (!line) return;
    if (/error|failed|invalid|denied/i.test(line)) pushLog(id, line.slice(0, 180));
    else if (/frame=.*fps=/.test(line)) {
      // simpan 1 baris progress terakhir sebagai heartbeat
      const s = active.get(id);
      if (s) s.lastFrame = line.slice(0, 120);
    }
  });

  proc.on('error', (e) => {
    pushLog(id, 'spawn error: ' + e.message);
    cleanup(id, 'error');
  });

  proc.on('exit', (code, signal) => {
    // exit(0) normal (mis. di-stop manual); selain itu anggap error
    pushLog(id, `ffmpeg exit code=${code} signal=${signal}`);
    cleanup(id, code === 0 || code === null ? 'standby' : 'error');
  });

  await Broadcast.setStatus(id, 'live');
  return { ok: true };
}

async function stop(id) {
  const s = active.get(id);
  if (!s) {
    await Broadcast.setStatus(id, 'standby').catch(() => {});
    return { ok: true, note: 'not running' };
  }
  pushLog(id, '$ hydra stop — mengirim SIGTERM…');
  s.proc.kill('SIGTERM');
  // paksa mati kalau 5 detik masih hidup
  setTimeout(() => {
    if (active.has(id)) {
      try { s.proc.kill('SIGKILL'); } catch (e) {}
    }
  }, 5000).unref();
  return { ok: true };
}

function status(id) {
  const s = active.get(id);
  if (!s) return { live: false };
  return {
    live: true,
    uptimeSec: Math.floor((Date.now() - s.startedAt) / 1000),
    lastFrame: s.lastFrame || null
  };
}

function logs(id) {
  const s = active.get(id);
  return s ? s.logs : [];
}

function activeIds() {
  return [...active.keys()];
}

module.exports = { start, stop, status, logs, activeIds };

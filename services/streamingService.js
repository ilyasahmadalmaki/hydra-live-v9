// Streaming engine: spawn FFmpeg generik + wrapper broadcast (Fase 1).
// Fase 2: rotationService memakai spawnStream() per item rotasi.
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const Broadcast = require('../models/Broadcast');
const Settings = require('../models/Settings');

const MAX_LOGS = 200;

// Registry semua stream aktif: id -> handle
const active = new Map();

function pushLog(handle, line) {
  const ts = new Date().toLocaleTimeString('en-GB');
  handle.logs.push(`[${ts}] ${line}`);
  if (handle.logs.length > MAX_LOGS) handle.logs.shift();
}

function buildTarget(rtmpUrl, streamKey) {
  const base = (rtmpUrl || '').replace(/\/+$/, '');
  const key = (streamKey || '').replace(/^\/+/, '');
  return `${base}/${key}`;
}

/**
 * Spawn satu proses FFmpeg.
 * opts: { input, target, bitrate, preset, loop, label }
 * return handle { id, proc, startedAt, logs[], stop(), onExit(cb) }
 */
function spawnStream(id, opts) {
  const {
    input, target,
    bitrate = '4500k', preset = 'veryfast',
    loop = false, label = input
  } = opts;

  const args = [
    '-re',
    ...(loop ? ['-stream_loop', '-1'] : []),
    '-i', input,
    '-c:v', 'libx264', '-preset', preset,
    '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', '8000k',
    '-pix_fmt', 'yuv420p', '-g', '60',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-f', 'flv', target
  ];

  const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const handle = {
    id, proc, startedAt: Date.now(), logs: [],
    stopping: false, exitCbs: [], lastFrame: null, exitReason: null
  };
  active.set(id, handle);

  pushLog(handle, `$ ffmpeg -re${loop ? ' -stream_loop -1' : ''} -i "${label}"`);
  pushLog(handle, `preset: ${preset} | video bitrate: ${bitrate}`);

  proc.stderr.on('data', (chunk) => {
    const line = chunk.toString().trim().split('\n').pop();
    if (!line) return;
    if (/error|failed|invalid|denied/i.test(line)) pushLog(handle, line.slice(0, 180));
    else if (/frame=.*fps=/.test(line)) handle.lastFrame = line.slice(0, 120);
  });

  proc.on('error', (e) => {
    pushLog(handle, 'spawn error: ' + e.message);
    finish(id, 'error');
  });

  proc.on('exit', (code, signal) => {
    pushLog(handle, `ffmpeg exit code=${code} signal=${signal}`);
    const intentional = handle.stopping;
    // code 0 = selesai natural (video habis) ; intentional = stop manual
    finish(id, intentional || code === 0 ? 'ended' : 'error');
  });

  handle.stop = () => {
    if (!active.has(id)) return;
    handle.stopping = true;
    pushLog(handle, '$ hydra stop — mengirim SIGTERM…');
    try { proc.kill('SIGTERM'); } catch (e) {}
    setTimeout(() => {
      if (active.has(id)) { try { proc.kill('SIGKILL'); } catch (e) {} }
    }, 5000).unref();
  };

  handle.onExit = (cb) => {
    if (handle.exitReason !== null) {
      // Proses sudah selesai sebelum callback didaftarkan (race: ffmpeg
      // mati seketika saat startItem masih menunggu await). Panggil langsung
      // agar retry / advance index tetap jalan.
      try { cb(handle.exitReason, handle); } catch (e) {}
    } else {
      handle.exitCbs.push(cb);
    }
  };

  return handle;
}

function finish(id, reason) {
  const handle = active.get(id);
  active.delete(id);
  if (handle) {
    handle.exitReason = reason;
    pushLog(handle, `stream finished → ${reason}`);
    handle.exitCbs.forEach(cb => { try { cb(reason, handle); } catch (e) {} });
  }
  return handle;
}

function status(id) {
  const h = active.get(id);
  if (!h) return { live: false };
  return {
    live: true,
    uptimeSec: Math.floor((Date.now() - h.startedAt) / 1000),
    lastFrame: h.lastFrame || null
  };
}

function logs(id) {
  const h = active.get(id);
  return h ? h.logs : [];
}

function isActive(id) {
  return active.has(id);
}

// ---------- Wrapper broadcast (Fase 1, 1 video loop) ----------
async function start(id) {
  if (active.has('bc:' + id)) return { ok: false, error: 'broadcast already live' };

  const b = await Broadcast.findDetailed(id);
  if (!b) return { ok: false, error: 'broadcast not found' };
  if (!b.media_path) return { ok: false, error: 'no media attached to broadcast' };
  if (!b.channel_rtmp_url || !b.channel_stream_key) {
    return { ok: false, error: 'channel RTMP URL / stream key belum diisi' };
  }

  const settings = await Settings.getAll();
  const target = buildTarget(b.channel_rtmp_url, b.channel_stream_key);

  let handle;
  try {
    handle = spawnStream('bc:' + id, {
      input: b.media_path,
      target,
      bitrate: settings.video_bitrate || '4500k',
      preset: settings.ffmpeg_preset || 'veryfast',
      loop: true,
      label: b.media_filename
    });
  } catch (e) {
    return { ok: false, error: 'gagal menjalankan ffmpeg: ' + e.message };
  }

  pushLog(handle, `target: ${b.channel_rtmp_url}/*** (key disembunyikan)`);

  handle.onExit(async (reason) => {
    // broadcast manual: ended/error → standby/error
    try { await Broadcast.setStatus(id, reason === 'error' ? 'error' : 'standby'); } catch (e) {}
  });

  await Broadcast.setStatus(id, 'live');
  return { ok: true };
}

async function stop(id) {
  const h = active.get('bc:' + id);
  if (h) h.stop();
  else { try { await Broadcast.setStatus(id, 'standby'); } catch (e) {} }
  return { ok: true };
}

module.exports = {
  spawnStream, buildTarget, status: (id) => status('bc:' + id),
  rawStatus: status, logs: (id) => logs('bc:' + id), rawLogs: logs,
  isActive, start, stop, activeIds: () => [...active.keys()]
};

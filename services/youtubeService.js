// YouTube Data API v3 — Fase 3.
// OAuth per channel, 1 broadcast persistent per rotasi (hemat kuota),
// monitoring health + viewers.
//
// Catatan kuota (per Google Cloud project, default 10.000/hari):
//   liveBroadcasts.insert / liveStreams.insert / bind = ±1600 unit (tulis)
//   *.list = 1 unit (baca) → polling baca murah, tulis dihemat.
const { google } = require('googleapis');
const OAuthCredential = require('../models/OAuthCredential');

const SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl'
];

function getRedirectUri() {
  return process.env.YOUTUBE_REDIRECT_URI ||
    `http://localhost:${process.env.PORT || 3000}/auth/youtube/callback`;
}

function baseClient(cred) {
  return new google.auth.OAuth2(cred.client_id, cred.client_secret, getRedirectUri());
}

// OAuth2 client yang auto-refresh token & menyimpan token baru ke DB
async function getOAuthClient(credentialId) {
  const cred = await OAuthCredential.findById(credentialId);
  if (!cred) throw new Error('kredensial OAuth tidak ditemukan');
  if (!cred.refresh_token) throw new Error('belum ada refresh token — selesaikan alur OAuth dulu');

  const oauth2 = baseClient(cred);
  oauth2.setCredentials({
    access_token: cred.access_token || undefined,
    refresh_token: cred.refresh_token,
    expiry_date: cred.token_expiry ? new Date(cred.token_expiry).getTime() : undefined
  });

  oauth2.on('tokens', async (tokens) => {
    try {
      await OAuthCredential.saveTokens(credentialId, {
        access_token: tokens.access_token || cred.access_token,
        refresh_token: tokens.refresh_token, // kosong → dipertahankan di saveTokens
        expiry_date: tokens.expiry_date
      });
    } catch (e) {
      console.error('[youtube] gagal menyimpan token baru:', e.message);
    }
  });

  return { oauth2, youtube: google.youtube({ version: 'v3', auth: oauth2 }) };
}

function getAuthUrl(credentialId) {
  return OAuthCredential.findById(credentialId).then(cred => {
    if (!cred) throw new Error('kredensial tidak ditemukan');
    const oauth2 = baseClient(cred);
    return oauth2.generateAuthUrl({
      access_type: 'offline', // minta refresh_token
      prompt: 'consent',      // paksa kirim refresh_token tiap kali
      scope: SCOPES,
      state: credentialId     // bawa id kredensial lewat callback
    });
  });
}

// Tukar code → token → simpan → ambil info channel
async function exchangeCode(credentialId, code) {
  const cred = await OAuthCredential.findById(credentialId);
  if (!cred) throw new Error('kredensial tidak ditemukan');
  const oauth2 = baseClient(cred);
  const { tokens } = await oauth2.getToken(code);
  await OAuthCredential.saveTokens(credentialId, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date
  });
  return getMyChannel(credentialId);
}

async function getMyChannel(credentialId) {
  const { youtube } = await getOAuthClient(credentialId);
  const res = await youtube.channels.list({ part: ['snippet'], mine: true });
  const ch = (res.data.items || [])[0];
  if (!ch) throw new Error('tidak ada channel YouTube pada akun ini');
  return {
    id: ch.id,
    title: ch.snippet.title,
    thumbnail: (ch.snippet.thumbnails && ch.snippet.thumbnails.default || {}).url || null
  };
}

// Buat 1 broadcast persistent + 1 stream + bind.
// enableAutoStart: true → live otomatis saat data masuk.
// enableAutoStop: false → tahan terhadap jeda antar item (reconnect).
async function createPersistentBroadcast(credentialId, { title, description = '', privacy = 'public' }) {
  const { youtube } = await getOAuthClient(credentialId);

  const bc = await youtube.liveBroadcasts.insert({
    part: ['snippet', 'status', 'contentDetails'],
    requestBody: {
      snippet: {
        title,
        description,
        scheduledStartTime: new Date().toISOString()
      },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: false, // persistent: jangan matikan saat jeda item
        enableDvr: true,
        latencyPreference: 'normal'
      }
    }
  });
  const broadcast = bc.data;

  const st = await youtube.liveStreams.insert({
    part: ['snippet', 'cdn', 'status'],
    requestBody: {
      snippet: { title: title + ' — ingest' },
      cdn: {
        ingestionType: 'rtmp',
        ingestionInfo: { ingestionAddress: 'rtmp://a.rtmp.youtube.com/live2' },
        frameRate: 'variable',
        resolution: 'variable'
      }
    }
  });
  const stream = st.data;

  await youtube.liveBroadcasts.bind({
    part: ['id', 'contentDetails'],
    id: broadcast.id,
    streamId: stream.id
  });

  const ingestion = stream.cdn.ingestionInfo || {};
  return {
    broadcastId: broadcast.id,
    streamId: stream.id,
    ingestionUrl: ingestion.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
    streamKey: ingestion.streamName || ''
  };
}

async function getBroadcastLifeCycle(credentialId, broadcastId) {
  const { youtube } = await getOAuthClient(credentialId);
  const res = await youtube.liveBroadcasts.list({
    part: ['status'], id: [broadcastId]
  });
  const b = (res.data.items || [])[0];
  return b ? b.status.lifeCycleStatus : 'not_found'; // live | testing | complete | ...
}

async function getStreamHealth(credentialId, streamId) {
  const { youtube } = await getOAuthClient(credentialId);
  const res = await youtube.liveStreams.list({ part: ['status'], id: [streamId] });
  const s = (res.data.items || [])[0];
  return s ? s.status.streamStatus : 'unknown'; // active | inactive | error | ...
}

async function getViewers(credentialId, broadcastId) {
  const { youtube } = await getOAuthClient(credentialId);
  const res = await youtube.liveBroadcasts.list({ part: ['statistics'], id: [broadcastId] });
  const b = (res.data.items || [])[0];
  return b && b.statistics ? Number(b.statistics.concurrentViewers || 0) : 0;
}

module.exports = {
  SCOPES, getRedirectUri, getAuthUrl, exchangeCode, getOAuthClient,
  getMyChannel, createPersistentBroadcast,
  getBroadcastLifeCycle, getStreamHealth, getViewers
};

import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { logInfo } from './logger.js';
import { upsertUser, getUser, addComplaint, incrementAdImpression, listAds } from './db.js';
import { Matchmaker } from './matchmaking.js';
import { createWSServer } from './ws.js';
import { adminRoutes } from './admin.js';
import { AccessToken } from 'livekit-server-sdk';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.frontendOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('tiny'));

// State
const matchmaker = new Matchmaker();
const sockets = new Map(); // socketId -> ws
const indexByUser = new Map(); // userId -> socketId

// Helpers
function getOnlineCount() {
  // Count unique connected users who completed "hello" (mapped in indexByUser).
  // This avoids overcounting sockets (reconnects, StrictMode doubles, etc.).
  return indexByUser.size;
}

// Public API
app.get('/api/online', (req, res) => {
  res.json({ online: getOnlineCount() });
});

// Anonymous init: creates userId if missing
app.post('/api/init', (req, res) => {
  let { userId, gender } = req.body || {};
  if (!userId) {
    userId = uuidv4();
  }
  upsertUser({ id: userId, gender: gender || null });
  const user = getUser(userId);
  res.json({ userId, isPremium: !!user.is_premium, isBanned: !!user.is_banned });
});

// Complaints
app.post('/api/complaint', (req, res) => {
  const { reporterId, reportedId, reason } = req.body || {};
  if (!reporterId || !reportedId || !reason) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  addComplaint({ reporterId, reportedId, reason });
  res.json({ ok: true });
});

// Ads
app.get('/api/ads', (req, res) => {
  const ads = listAds().filter((a) => a.is_active);
  res.json({ ads });
});
app.post('/api/ads/impression', (req, res) => {
  const { id } = req.body || {};
  if (id) incrementAdImpression(id);
  res.json({ ok: true });
});

// ICE servers config for WebRTC (STUN/TURN)
app.get('/api/ice', async (req, res) => {
  try {
    // 1) Prefer dynamic Xirsys if configured (fresh ephemeral TURN creds)
    if (config.xirsysIdent && config.xirsysSecret) {
      const url = `https://global.xirsys.net/_turn/${encodeURIComponent(config.xirsysChannel)}`;
      const r = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + Buffer.from(`${config.xirsysIdent}:${config.xirsysSecret}`).toString('base64')
        },
        body: JSON.stringify({ format: 'urls' })
      });
      if (r.ok) {
        const j = await r.json();
        // Xirsys returns a few shapes:
        // { v: { iceServers: [...] } } OR { iceServers: [...] } OR { v: [...] } when format:"urls"
        let candidates =
          j?.v?.iceServers ||
          j?.iceServers ||
          j?.d?.iceServers ||
          (Array.isArray(j?.v) ? j.v : null);
        // If returned plain array of urls strings, wrap into TURN objects without creds (rare)
        if (Array.isArray(candidates) && typeof candidates[0] === 'string') {
          candidates = candidates.map((u) => ({ urls: u }));
        }
        if (Array.isArray(candidates) && candidates.length) {
          return res.json({ iceServers: candidates, forceRelay: !!config.iceForceRelay });
        }
      }
    }
    // 2) Fallback to static env-configured TURN
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
    ];
    if (config.turnUrls && config.turnUsername && config.turnCredential) {
      const urls = config.turnUrls.split(',').map((u) => u.trim()).filter(Boolean);
      for (const url of urls) {
        iceServers.push({
          urls: url,
          username: config.turnUsername,
          credential: config.turnCredential
        });
      }
    }
    return res.json({ iceServers, forceRelay: !!config.iceForceRelay });
  } catch {
    return res.status(500).json({ error: 'ice_config_error' });
  }
});

// LiveKit: issue access tokens for clients/admins
app.post('/api/livekit-token', (req, res) => {
  const { roomId, identity, name, admin } = req.body || {};
  if (!config.livekitApiKey || !config.livekitApiSecret || !config.livekitUrl) {
    return res.status(400).json({ error: 'LiveKit not configured' });
  }
  if (!roomId || !identity) return res.status(400).json({ error: 'roomId and identity required' });
  try {
    const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
      identity: String(identity).slice(0, 128),
      name: name ? String(name).slice(0, 128) : undefined
    });
    at.addGrant({
      room: roomId,
      roomJoin: true,
      canPublish: !admin,
      canSubscribe: true
    });
    const token = at.toJwt();
    res.json({ token, url: config.livekitUrl });
  } catch (e) {
    res.status(500).json({ error: 'token_error' });
  }
});

// Admin routes
adminRoutes(app, { matchmaker, getOnlineCount });

const server = http.createServer(app);
createWSServer(server, { matchmaker, sockets, indexByUser });

server.listen(config.port, () => {
  logInfo('Backend listening', { port: config.port, frontend: config.frontendOrigin });
});



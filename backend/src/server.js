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

const app = express();
app.disable('x-powered-by');
app.use(helmet());
// CORS: allow multiple origins (local + production domains)
const allowedOrigins = new Set([config.frontendOrigin, ...config.frontendOrigins]);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // non-browser or same-origin
      try {
        const o = origin.trim();
        // Allow exact match or *.vercel.app for convenience
        const ok =
          allowedOrigins.has(o) ||
          /\.vercel\.app$/.test(new URL(o).hostname);
        return cb(ok ? null : new Error('CORS'), ok);
      } catch {
        return cb(new Error('CORS'), false);
      }
    },
    credentials: true
  })
);
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
      const apiUrl = `https://global.xirsys.net/_turn/${encodeURIComponent(config.xirsysChannel)}`;
      // Attempt 1: Authorization header
      let r = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + Buffer.from(`${config.xirsysIdent}:${config.xirsysSecret}`).toString('base64')
        },
        body: JSON.stringify({})
      });
      const parseCandidates = async (resp) => {
        try {
          const j = await resp.json();
          let c =
            j?.v?.iceServers ||
            j?.iceServers ||
            j?.d?.iceServers ||
            (Array.isArray(j?.v) ? j.v : null);
          // Normalize to spec: 'urls' field
          if (Array.isArray(c)) {
            c = c.map((entry) => {
              if (typeof entry === 'string') return { urls: entry };
              if (entry && entry.url && !entry.urls) {
                const { url, ...rest } = entry;
                return { urls: url, ...rest };
              }
              return entry;
            });
          }
          // If returned plain array of urls strings, wrap into TURN objects without creds (rare)
          if (Array.isArray(c) && typeof c[0] === 'string') {
            c = c.map((u) => ({ urls: u }));
          }
          return Array.isArray(c) && c.length ? c : null;
        } catch {
          return null;
        }
      };
      let candidates = r.ok ? await parseCandidates(r) : null;
      // Attempt 2: embed credentials in URL (per Xirsys curl example)
      if (!candidates) {
        const urlWithCreds = `https://${encodeURIComponent(config.xirsysIdent)}:${encodeURIComponent(
          config.xirsysSecret
        )}@global.xirsys.net/_turn/${encodeURIComponent(config.xirsysChannel)}`;
        r = await fetch(urlWithCreds, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        candidates = r.ok ? await parseCandidates(r) : null;
      }
      if (candidates) {
          return res.json({ iceServers: candidates, forceRelay: !!config.iceForceRelay });
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
        // add explicit transport hints for better compatibility
        let fixed = url;
        if (fixed.startsWith('turns:') && !fixed.includes('transport=')) fixed += '?transport=tcp';
        if (fixed.startsWith('turn:') && !fixed.includes('transport=')) fixed += '?transport=udp';
        iceServers.push({
          urls: fixed,
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

// LiveKit disabled: token endpoint removed when not using LiveKit

// Admin routes
adminRoutes(app, { matchmaker, getOnlineCount });

const server = http.createServer(app);
createWSServer(server, { matchmaker, sockets, indexByUser });

server.listen(config.port, () => {
  logInfo('Backend listening', { port: config.port, frontend: config.frontendOrigin });
});



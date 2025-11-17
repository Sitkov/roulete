import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { setBan, setPremium, listComplaints, getVipFilters, setVipFilter, listAds, upsertAd } from './db.js';

export function issueAdminToken() {
  return jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyAdminToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return payload?.role === 'admin';
  } catch {
    return false;
  }
}

export function adminRoutes(app, ctx) {
  // Admin login
  app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body || {};
    if (username === config.adminUsername && password === config.adminPassword) {
      const token = issueAdminToken();
      return res.json({ token });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  });

  // Middleware
  function requireAdmin(req, res, next) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token && verifyAdminToken(token)) return next();
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Stats
  app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const rooms = ctx.matchmaker.listRooms();
    const participantsInRooms = rooms.length * 2;
    res.json({
      onlineUsers: ctx.getOnlineCount(),
      participantsInRooms,
      rooms,
      complaints: listComplaints(50)
    });
  });

  // Ban/Premium
  app.post('/api/admin/ban', requireAdmin, (req, res) => {
    const { userId, banned } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    setBan(userId, !!banned);
    res.json({ ok: true });
  });

  app.post('/api/admin/premium', requireAdmin, (req, res) => {
    const { userId, premium } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    setPremium(userId, !!premium);
    res.json({ ok: true });
  });

  // VIP filters
  app.get('/api/admin/vip-filters', requireAdmin, (req, res) => {
    res.json(getVipFilters());
  });
  app.post('/api/admin/vip-filters', requireAdmin, (req, res) => {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ error: 'key required' });
    setVipFilter(key, String(value ?? ''));
    res.json(getVipFilters());
  });

  // Ads
  app.get('/api/admin/ads', requireAdmin, (req, res) => {
    res.json(listAds());
  });
  app.post('/api/admin/ads', requireAdmin, (req, res) => {
    const { ad } = req.body || {};
    if (!ad) return res.status(400).json({ error: 'ad required' });
    upsertAd(ad);
    res.json(listAds());
  });
}




import Database from 'better-sqlite3';
import { config } from './config.js';
import { logInfo } from './logger.js';
import fs from 'fs';
import path from 'path';

const storageDir = path.dirname(config.databaseFile);
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

export const db = new Database(config.databaseFile);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  gender TEXT DEFAULT NULL,
  is_premium INTEGER DEFAULT 0,
  is_banned INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id TEXT NOT NULL,
  reported_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vip_filters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL,
  image_url TEXT NOT NULL,
  link_url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  impressions INTEGER NOT NULL DEFAULT 0
);
`);

logInfo('Database initialized', { file: config.databaseFile });

// Users
export function upsertUser({ id, gender = null }) {
  const ts = Date.now();
  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (exists) {
    db.prepare('UPDATE users SET last_seen = ?, gender = COALESCE(?, gender) WHERE id = ?').run(ts, gender, id);
  } else {
    db.prepare('INSERT INTO users (id, created_at, last_seen, gender) VALUES (?, ?, ?, ?)').run(id, ts, ts, gender);
  }
}

export function setPremium(id, isPremium) {
  db.prepare('UPDATE users SET is_premium = ? WHERE id = ?').run(isPremium ? 1 : 0, id);
}

export function setBan(id, isBanned) {
  db.prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(isBanned ? 1 : 0, id);
}

export function getUser(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function touchUser(id) {
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), id);
}

// Complaints
export function addComplaint({ reporterId, reportedId, reason }) {
  db.prepare('INSERT INTO complaints (reporter_id, reported_id, reason, created_at) VALUES (?, ?, ?, ?)').run(
    reporterId,
    reportedId,
    reason,
    Date.now()
  );
}

export function listComplaints(limit = 200) {
  return db.prepare('SELECT * FROM complaints ORDER BY created_at DESC LIMIT ?').all(limit);
}

// VIP Filters
export function setVipFilter(key, value) {
  db.prepare('INSERT INTO vip_filters (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value
  );
}

export function getVipFilters() {
  const rows = db.prepare('SELECT key, value FROM vip_filters').all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}

// Ads
export function listAds() {
  return db.prepare('SELECT * FROM ads ORDER BY id DESC').all();
}

export function upsertAd(ad) {
  if (ad.id) {
    db.prepare('UPDATE ads SET slot = ?, image_url = ?, link_url = ?, is_active = ? WHERE id = ?').run(
      ad.slot, ad.image_url, ad.link_url, ad.is_active ? 1 : 0, ad.id
    );
  } else {
    db.prepare('INSERT INTO ads (slot, image_url, link_url, is_active) VALUES (?, ?, ?, ?)').run(
      ad.slot, ad.image_url, ad.link_url, ad.is_active ? 1 : 0
    );
  }
}

export function incrementAdImpression(id) {
  db.prepare('UPDATE ads SET impressions = impressions + 1 WHERE id = ?').run(id);
}




import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { logInfo } from './logger.js';

// In-memory matchmaking and rooms
export class Matchmaker {
  constructor() {
    this.waiting = new Map(); // key: queueKey, value: array of userIds
    this.userPrefs = new Map(); // userId -> { desiredGender, isVip }
    this.rooms = new Map(); // roomId -> { a, b, createdAt, lastActivity }
    this.userToRoom = new Map(); // userId -> roomId
  }

  _keyForPrefs(prefs) {
    return `gender:${prefs?.desiredGender || 'any'}|vip:${prefs?.isVip ? 1 : 0}`;
  }

  setUserPrefs(userId, prefs) {
    this.userPrefs.set(userId, prefs || {});
  }

  enqueue(userId, prefs) {
    this.setUserPrefs(userId, prefs);
    const key = this._keyForPrefs(prefs);
    const arr = this.waiting.get(key) || [];
    if (!arr.includes(userId)) {
      arr.push(userId);
      this.waiting.set(key, arr);
    }
  }

  dequeue(userId, prefs) {
    const key = this._keyForPrefs(prefs || this.userPrefs.get(userId));
    const arr = this.waiting.get(key) || [];
    const idx = arr.indexOf(userId);
    if (idx >= 0) {
      arr.splice(idx, 1);
      this.waiting.set(key, arr);
    }
  }

  findMatch(userId, prefs) {
    // simple matching: try any user waiting in the same desiredGender bucket; prefer VIP with VIP
    const key = this._keyForPrefs(prefs);
    let candidate = null;
    const arr = this.waiting.get(key) || [];
    for (const other of arr) {
      if (other !== userId) {
        candidate = other;
        break;
      }
    }
    if (!candidate) return null;
    // remove both from queue and create room
    this.dequeue(candidate, this.userPrefs.get(candidate));
    this.dequeue(userId, prefs);
    const roomId = uuidv4();
    const now = Date.now();
    this.rooms.set(roomId, { a: userId, b: candidate, createdAt: now, lastActivity: now });
    this.userToRoom.set(userId, roomId);
    this.userToRoom.set(candidate, roomId);
    logInfo('Room created', { roomId, a: userId, b: candidate });
    return { roomId, a: userId, b: candidate };
  }

  getRoomForUser(userId) {
    const roomId = this.userToRoom.get(userId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return { roomId, ...room };
  }

  touchRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.lastActivity = Date.now();
    }
  }

  leaveRoom(userId) {
    const entry = this.getRoomForUser(userId);
    if (!entry) return null;
    const { roomId, a, b } = entry;
    this.rooms.delete(roomId);
    this.userToRoom.delete(a);
    this.userToRoom.delete(b);
    return { roomId, a, b };
  }

  cleanupIdleRooms() {
    const now = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      if (now - room.lastActivity > config.roomIdleTimeoutMs) {
        this.rooms.delete(roomId);
        this.userToRoom.delete(room.a);
        this.userToRoom.delete(room.b);
      }
    }
  }

  listRooms() {
    const arr = [];
    for (const [roomId, room] of this.rooms.entries()) {
      arr.push({ roomId, a: room.a, b: room.b, createdAt: room.createdAt, lastActivity: room.lastActivity });
    }
    return arr;
  }
}




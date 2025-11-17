import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { logInfo, logWarn } from './logger.js';
import { addComplaint, getUser, touchUser } from './db.js';
import { verifyAdminToken } from './admin.js';

export function createWSServer(httpServer, { matchmaker, sockets, indexByUser }) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  function broadcastAdminRooms() {
    const rooms = matchmaker.listRooms();
    for (const ws of wss.clients) {
      if (ws.isAdmin) {
        ws.send(JSON.stringify({ type: 'rooms', rooms }));
      }
    }
  }

  function safeSend(ws, data) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
  }

  wss.on('connection', (ws, req) => {
    ws.id = uuidv4();
    ws.isAlive = true;

    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (token && verifyAdminToken(token)) {
      ws.isAdmin = true;
      logInfo('Admin connected', { socketId: ws.id });
      safeSend(ws, { type: 'hello', role: 'admin', socketId: ws.id });
    } else {
      ws.isAdmin = false;
    }

    sockets.set(ws.id, ws);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (buf) => {
      let msg;
      try {
        msg = JSON.parse(buf.toString());
      } catch {
        return;
      }
      switch (msg.type) {
        case 'hello': {
          // Anonymous user registers
          const { userId, gender, isVip } = msg;
          ws.userId = userId;
          ws.gender = gender || null;
          ws.isVip = !!isVip;
          indexByUser.set(ws.userId, ws.id);
          touchUser(ws.userId);
          safeSend(ws, { type: 'ack', socketId: ws.id });
          break;
        }
        case 'find': {
          if (!ws.userId) return;
          const prefs = { desiredGender: msg.desiredGender || 'any', isVip: !!ws.isVip };
          matchmaker.enqueue(ws.userId, prefs);
          const match = matchmaker.findMatch(ws.userId, prefs);
          if (match) {
            // Decide initiator by lexical order to make deterministic
            const initiator = match.a < match.b ? match.a : match.b;
            for (const userId of [match.a, match.b]) {
              const socketId = indexByUser.get(userId);
              const peerWs = sockets.get(socketId);
              if (peerWs) {
                safeSend(peerWs, {
                  type: 'match',
                  roomId: match.roomId,
                  partnerId: userId === match.a ? match.b : match.a,
                  initiator: userId === initiator
                });
              }
            }
            broadcastAdminRooms();
          } else {
            safeSend(ws, { type: 'queue', queued: true });
          }
          break;
        }
        case 'signal': {
          // Forward WebRTC signal:
          // - user <-> user (regular)
          // - user -> admin (monitor) using adminSocketId
          // - admin -> user (monitor) using targetUserId
          const { targetUserId, roomId, data, monitor, adminSocketId } = msg;
          matchmaker.touchRoom(roomId);
          if (monitor) {
            if (ws.isAdmin) {
              // admin -> user
              if (!targetUserId) return;
              const socketId = indexByUser.get(targetUserId);
              const peerWs = sockets.get(socketId);
              if (peerWs) safeSend(peerWs, { type: 'signal', roomId, from: 'admin', data, monitor: true });
            } else {
              // user -> admin
              if (!adminSocketId) return;
              const adminWs = sockets.get(adminSocketId);
              if (adminWs && adminWs.isAdmin) {
                safeSend(adminWs, { type: 'signal', roomId, from: ws.userId, data, monitor: true });
              }
            }
            break;
          }
          // regular user <-> user
          if (!targetUserId) return;
          const socketId = indexByUser.get(targetUserId);
          const peerWs = sockets.get(socketId);
          if (peerWs) safeSend(peerWs, { type: 'signal', roomId, from: ws.userId, data, monitor: false });
          break;
        }
        case 'text': {
          // Fallback WS text chat
          const { roomId, message } = msg;
          const room = matchmaker.getRoomForUser(ws.userId);
          if (!room || room.roomId !== roomId) return;
          const to = ws.userId === room.a ? room.b : room.a;
          const socketId = indexByUser.get(to);
          const peerWs = sockets.get(socketId);
          if (peerWs) safeSend(peerWs, { type: 'text', from: ws.userId, message, ts: Date.now() });
          break;
        }
        case 'complaint': {
          const { against, reason } = msg;
          if (ws.userId && against && reason) {
            addComplaint({ reporterId: ws.userId, reportedId: against, reason });
          }
          break;
        }
        case 'stop': {
          if (!ws.userId) return;
          const left = matchmaker.leaveRoom(ws.userId);
          if (left) {
            for (const uid of [left.a, left.b]) {
              const sid = indexByUser.get(uid);
              const pw = sockets.get(sid);
              if (pw) safeSend(pw, { type: 'stopped', roomId: left.roomId });
            }
            broadcastAdminRooms();
          }
          break;
        }
        case 'next': {
          // Leave and re-enqueue
          if (!ws.userId) return;
          const prefs = { desiredGender: msg.desiredGender || 'any', isVip: !!ws.isVip };
          const left = matchmaker.leaveRoom(ws.userId);
          if (left) {
            const other = ws.userId === left.a ? left.b : left.a;
            const sid = indexByUser.get(other);
            const pw = sockets.get(sid);
            if (pw) safeSend(pw, { type: 'partner_left', roomId: left.roomId });
          }
          matchmaker.enqueue(ws.userId, prefs);
          const match = matchmaker.findMatch(ws.userId, prefs);
          if (match) {
            const initiator = match.a < match.b ? match.a : match.b;
            for (const userId of [match.a, match.b]) {
              const socketId = indexByUser.get(userId);
              const peerWs = sockets.get(socketId);
              if (peerWs) {
                safeSend(peerWs, {
                  type: 'match',
                  roomId: match.roomId,
                  partnerId: userId === match.a ? match.b : match.a,
                  initiator: userId === initiator
                });
              }
            }
            broadcastAdminRooms();
          } else {
            safeSend(ws, { type: 'queue', queued: true });
          }
          break;
        }
        case 'admin_spectate': {
          if (!ws.isAdmin) return;
          const { roomId } = msg;
          const room = matchmaker.rooms.get(roomId);
          if (!room) return;
          // Ask both participants to create monitor peer towards admin
          for (const uid of [room.a, room.b]) {
            const sid = indexByUser.get(uid);
            const pw = sockets.get(sid);
            if (pw) {
              safeSend(pw, { type: 'spectate_request', roomId, adminSocketId: ws.id });
            }
          }
          break;
        }
        default:
          break;
      }
    });

    ws.on('close', () => {
      sockets.delete(ws.id);
      if (ws.userId) {
        // remove from queues and rooms
        const room = matchmaker.getRoomForUser(ws.userId);
        if (room) {
          const other = ws.userId === room.a ? room.b : room.a;
          matchmaker.leaveRoom(ws.userId);
          const sid = indexByUser.get(other);
          const pw = sockets.get(sid);
          if (pw) {
            safeSend(pw, { type: 'partner_left', roomId: room.roomId });
          }
          broadcastAdminRooms();
        }
        indexByUser.delete(ws.userId);
      } else if (ws.isAdmin) {
        logWarn('Admin disconnected', { socketId: ws.id });
      }
    });
  });

  // Heartbeat
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
      } else {
        ws.isAlive = false;
        ws.ping();
      }
    }
    // cleanup
    matchmaker.cleanupIdleRooms();
    broadcastAdminRooms();
  }, config.wsHeartbeatIntervalMs);

  wss.on('close', () => clearInterval(interval));

  return wss;
}




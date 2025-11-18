import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  frontendOrigins: (process.env.FRONTEND_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  databaseFile: process.env.DATABASE_FILE || './storage/app.sqlite',
  wsHeartbeatIntervalMs: 15000,
  matchmakingTimeoutMs: 30000,
  roomIdleTimeoutMs: 120000,
  turnUrls: process.env.TURN_URLS || '', // comma-separated, e.g. "turn:turn.example.com:3478,turns:turn.example.com:5349"
  turnUsername: process.env.TURN_USERNAME || '',
  turnCredential: process.env.TURN_CREDENTIAL || '',
  iceForceRelay: process.env.ICE_FORCE_RELAY === '1' || false,
  livekitUrl: process.env.LIVEKIT_URL || '',
  livekitApiKey: process.env.LIVEKIT_API_KEY || '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
  // Xirsys (optional) - if provided, /api/ice will fetch fresh TURN creds dynamically
  xirsysIdent: process.env.XIRSYS_IDENT || '',
  xirsysSecret: process.env.XIRSYS_SECRET || '',
  xirsysChannel: process.env.XIRSYS_CHANNEL || 'roulete'
};




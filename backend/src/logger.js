/* Minimal structured logger */
export function logInfo(message, meta = {}) {
  console.log(JSON.stringify({ level: 'info', message, ...meta, ts: new Date().toISOString() }));
}

export function logWarn(message, meta = {}) {
  console.warn(JSON.stringify({ level: 'warn', message, ...meta, ts: new Date().toISOString() }));
}

export function logError(message, meta = {}) {
  console.error(JSON.stringify({ level: 'error', message, ...meta, ts: new Date().toISOString() }));
}




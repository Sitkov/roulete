export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

export function apiUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  return path.startsWith('/api') ? path : `/api${path}`;
}

export function wsUrl(): string {
  if (typeof window === 'undefined') return '';
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (API_BASE) {
    try {
      const u = new URL(API_BASE);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      u.pathname = '/ws';
      u.search = '';
      return u.toString();
    } catch {
      // ignore
    }
  }
  // Fallback to localhost backend port 4000
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.hostname}:4000/ws`;
}



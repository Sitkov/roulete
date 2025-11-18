import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { WSClient } from '../../lib/ws';
import Peer from 'simple-peer';
import { loadIceConfig } from '../../lib/webrtc';
import { apiUrl, wsUrl } from '../../lib/env';
import { connectLivekit, LivekitHandle } from '../../lib/livekit';

const BACKEND_WS = typeof window === 'undefined' ? '' : wsUrl();

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<{ roomId: string; a: string; b: string }[]>([]);
  const [stats, setStats] = useState<{ onlineUsers: number; participantsInRooms?: number; complaints: any[] } | null>(null);
  const [vipKey, setVipKey] = useState('');
  const [vipValue, setVipValue] = useState('');
  const [banUserId, setBanUserId] = useState('');
  const [premiumUserId, setPremiumUserId] = useState('');
  const [ads, setAds] = useState<any[]>([]);
  const [newAd, setNewAd] = useState({ slot: 'main', image_url: '', link_url: '', is_active: true });
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const iceRef = useRef<{ iceServers: RTCIceServer[]; forceRelay?: boolean } | null>(null);
  const wsRef = useRef<WSClient | null>(null);
  const aVideoRef = useRef<HTMLVideoElement>(null);
  const bVideoRef = useRef<HTMLVideoElement>(null);
  const monitorPeersRef = useRef<Record<string, Peer.Instance>>({});
  const useLivekit = typeof window !== 'undefined' ? !!process.env.NEXT_PUBLIC_LIVEKIT_URL : false;
  const livekitRef = useRef<LivekitHandle | null>(null);

  useEffect(() => {
    const t = localStorage.getItem('adminToken');
    if (t) setToken(t);
    loadIceConfig().then((c) => (iceRef.current = c)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    if (!BACKEND_WS) return;
    const ws = new WSClient(BACKEND_WS, (msg) => {
      if (msg.type === 'rooms') {
        setRooms(msg.rooms);
      } else if (msg.type === 'signal' && msg.monitor) {
        // This is monitor WebRTC negotiation from users → admin
        const fromKey = msg.from;
        let p = monitorPeersRef.current[fromKey];
        if (!p) {
          p = new Peer({
            initiator: false,
            trickle: true,
            config: {
              iceServers: iceRef.current?.iceServers || [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
              ],
              // @ts-ignore
              iceTransportPolicy: iceRef.current?.forceRelay ? 'relay' : 'all'
            }
          });
          const targetUserId = fromKey;
          p.on('signal', (data) => {
            wsRef.current?.send({
              type: 'signal',
              data,
              roomId: msg.roomId,
              targetUserId,
              monitor: true
            });
          });
          p.on('stream', async (remote) => {
            // Attach streams: first stream goes to A, second to B
            if (aVideoRef.current && !aVideoRef.current.srcObject) {
              aVideoRef.current.srcObject = remote;
              await aVideoRef.current.play().catch(() => {});
            } else if (bVideoRef.current && !bVideoRef.current.srcObject) {
              bVideoRef.current.srcObject = remote;
              await bVideoRef.current.play().catch(() => {});
            }
          });
          p.on('error', () => {});
          monitorPeersRef.current[fromKey] = p;
        }
        p.signal(msg.data);
      }
    }, token);
    ws.connect();
    wsRef.current = ws;
    const fetchStats = () => {
      fetch(apiUrl('/api/admin/stats'), { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => {
          setStats({ onlineUsers: d.onlineUsers, participantsInRooms: d.participantsInRooms, complaints: d.complaints });
        })
        .catch(() => {});
      fetch(apiUrl('/api/admin/ads'), { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setAds(d))
        .catch(() => {});
    };
    fetchStats();
    const iv = setInterval(fetchStats, 15000);
    return () => clearInterval(iv);
  }, [token]);

  const login = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get('username') || '');
    const password = String(fd.get('password') || '');
    const res = await fetch(apiUrl('/api/admin/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('adminToken', data.token);
      setToken(data.token);
      setLoginError(null);
    } else {
      setLoginError('Неверные данные');
    }
  }, []);

  const spectate = useCallback(async (roomId: string) => {
    if (!token) return;
    if (useLivekit) {
      // join room as admin (subscribe only)
      livekitRef.current?.disconnect().catch(() => {});
      livekitRef.current = null;
      if (aVideoRef.current) aVideoRef.current.srcObject = null;
      if (bVideoRef.current) bVideoRef.current.srcObject = null;
      try {
        const handle = await connectLivekit(roomId, 'admin-' + Math.random().toString(36).slice(2, 8), (remote) => {
          // Attach streams sequentially
          if (aVideoRef.current && !aVideoRef.current.srcObject) {
            aVideoRef.current.srcObject = remote;
            aVideoRef.current.muted = true;
            aVideoRef.current.play().catch(() => {});
          } else if (bVideoRef.current && !bVideoRef.current.srcObject) {
            bVideoRef.current.srcObject = remote;
            bVideoRef.current.muted = true;
            bVideoRef.current.play().catch(() => {});
          }
        }, false);
        livekitRef.current = handle;
      } catch {
        // ignore
      }
    } else {
      wsRef.current?.send({ type: 'admin_spectate', roomId });
      // reset monitors
      if (aVideoRef.current) aVideoRef.current.srcObject = null;
      if (bVideoRef.current) bVideoRef.current.srcObject = null;
      for (const key of Object.keys(monitorPeersRef.current)) {
        monitorPeersRef.current[key].destroy();
        delete monitorPeersRef.current[key];
      }
    }
    setSelectedRoomId(roomId);
  }, [token]);

  if (!token) {
    return (
      <>
        <Head>
          <title>Admin Login</title>
        </Head>
        <div className="min-h-screen flex items-center justify-center">
          <form onSubmit={login} className="card w-full max-w-sm">
            <div className="text-lg font-semibold mb-2">Админ-панель</div>
            <input name="username" placeholder="Логин" className="w-full mb-2 px-3 py-2 rounded bg-black/30" />
            <input
              name="password"
              placeholder="Пароль"
              type="password"
              className="w-full mb-4 px-3 py-2 rounded bg-black/30"
            />
            {loginError && <div className="text-red-400 mb-2">{loginError}</div>}
            <button className="btn w-full" type="submit">
              Войти
            </button>
          </form>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Admin</title>
      </Head>
      <div className="p-4 container mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-semibold">Онлайн-комнаты</div>
          <button
            className="btn bg-white/10 hover:bg-white/20"
            onClick={() => {
              localStorage.removeItem('adminToken');
              setToken(null);
            }}
          >
            Выйти
          </button>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="md:col-span-2 card">
            <div className="aspect-video grid grid-cols-2 gap-2">
              <video ref={aVideoRef} className="w-full h-full rounded bg-black" playsInline autoPlay muted />
              <video ref={bVideoRef} className="w-full h-full rounded bg-black" playsInline autoPlay muted />
            </div>
            <div className="text-sm text-white/70 mt-2">
              Мониторинг (невидимка){selectedRoomId ? ` — Room ${selectedRoomId.slice(0, 8)}…` : ''}
            </div>
          </div>
          <div className="card">
            <div className="text-sm text-white/70 mb-2">Активные:</div>
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {rooms.map((r) => (
                <div
                  key={r.roomId}
                  className={`flex items-center justify-between rounded px-3 py-2 ${
                    selectedRoomId === r.roomId ? 'bg-brand/30 border border-brand' : 'bg-white/5'
                  }`}
                >
                  <div className="text-xs text-white/70">Room: {r.roomId.slice(0, 8)}...</div>
                  <button className="btn" onClick={() => spectate(r.roomId)}>
                    Смотреть
                  </button>
                </div>
              ))}
              {!rooms.length && <div className="text-white/50 text-sm">Нет активных комнат</div>}
            </div>
          </div>
        </div>
        <div className="mt-6 grid lg:grid-cols-3 gap-4">
          <div className="card">
            <div className="font-semibold mb-2">Статистика</div>
            <div className="text-sm text-white/70">Онлайн: {stats?.onlineUsers ?? '...'}</div>
            <div className="text-sm text-white/70">В разговорах: {stats?.participantsInRooms ?? '...'}</div>
            <div className="mt-3 font-semibold">Жалобы</div>
            <div className="text-xs text-white/60 max-h-48 overflow-auto">
              {(stats?.complaints || []).map((c: any) => (
                <div key={c.id} className="border-b border-white/10 py-1">
                  <div>От: {c.reporter_id} → На: {c.reported_id}</div>
                  <div>Причина: {c.reason}</div>
                </div>
              ))}
              {!stats?.complaints?.length && <div>Нет жалоб</div>}
            </div>
          </div>
          <div className="card">
            <div className="font-semibold mb-2">Модерация</div>
            <div className="flex gap-2 mb-2">
              <input className="bg-black/30 rounded px-2 py-1 flex-1" placeholder="userId" value={banUserId} onChange={(e) => setBanUserId(e.target.value)} />
              <button
                className="btn bg-red-500 hover:bg-red-600"
                onClick={() => {
                  fetch(apiUrl('/api/admin/ban'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ userId: banUserId, banned: true })
                  });
                }}
              >
                Бан
              </button>
            </div>
            <div className="flex gap-2">
              <input className="bg-black/30 rounded px-2 py-1 flex-1" placeholder="userId" value={premiumUserId} onChange={(e) => setPremiumUserId(e.target.value)} />
              <button
                className="btn"
                onClick={() => {
                  fetch(apiUrl('/api/admin/premium'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ userId: premiumUserId, premium: true })
                  });
                }}
              >
                VIP +
              </button>
            </div>
            <div className="mt-4">
              <div className="font-semibold mb-1">VIP-фильтры</div>
              <div className="flex gap-2 mb-2">
                <input className="bg-black/30 rounded px-2 py-1 flex-1" placeholder="key" value={vipKey} onChange={(e) => setVipKey(e.target.value)} />
                <input className="bg-black/30 rounded px-2 py-1 flex-1" placeholder="value" value={vipValue} onChange={(e) => setVipValue(e.target.value)} />
                <button
                  className="btn"
                  onClick={() => {
                    fetch(apiUrl('/api/admin/vip-filters'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ key: vipKey, value: vipValue })
                    });
                  }}
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="font-semibold mb-2">Реклама</div>
            <div className="text-xs text-white/60 max-h-40 overflow-auto mb-2">
              {ads.map((a) => (
                <div key={a.id} className="border-b border-white/10 py-1">
                  <div>#{a.id} {a.slot} — {a.impressions} показов</div>
                  <div className="truncate">{a.image_url}</div>
                </div>
              ))}
              {!ads.length && <div>Нет баннеров</div>}
            </div>
            <div className="space-y-2">
              <input className="bg-black/30 rounded px-2 py-1 w-full" placeholder="slot" value={newAd.slot} onChange={(e) => setNewAd({ ...newAd, slot: e.target.value })} />
              <input className="bg-black/30 rounded px-2 py-1 w-full" placeholder="image_url" value={newAd.image_url} onChange={(e) => setNewAd({ ...newAd, image_url: e.target.value })} />
              <input className="bg-black/30 rounded px-2 py-1 w-full" placeholder="link_url" value={newAd.link_url} onChange={(e) => setNewAd({ ...newAd, link_url: e.target.value })} />
              <label className="text-sm text-white/70 flex items-center gap-2">
                <input type="checkbox" checked={newAd.is_active} onChange={(e) => setNewAd({ ...newAd, is_active: e.target.checked })} /> Активен
              </label>
              <button
                className="btn w-full"
                onClick={() => {
                  fetch(apiUrl('/api/admin/ads'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ ad: newAd })
                  }).then(() => {
                    setNewAd({ slot: 'main', image_url: '', link_url: '', is_active: true });
                  });
                }}
              >
                Добавить баннер
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}



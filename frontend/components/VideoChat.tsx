import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { WSClient } from '../lib/ws';
import { createPeer, getMediaStream, PeerConnection, loadIceConfig } from '../lib/webrtc';
import { Controls } from './Controls';
import { ChatPanel } from './ChatPanel';
import { Filters } from './Filters';
import { Toast } from './Toast';
import { VideoPlaceholder } from './VideoPlaceholder';
import { apiUrl, wsUrl } from '../lib/env';

type ChatMessage = { from: 'me' | 'peer' | 'sys'; text: string; ts: number };

const BACKEND_WS = typeof window === 'undefined' ? '' : wsUrl();

export function VideoChat() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isVip, setIsVip] = useState<boolean>(false);
  const [gender, setGender] = useState<string | null>(null);
  const [desiredGender, setDesiredGender] = useState<'any' | 'male' | 'female'>('any');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [queued, setQueued] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ageConfirmed, setAgeConfirmed] = useState<boolean>(true);
  const [mediaReady, setMediaReady] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [wsReady, setWsReady] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [remoteMuted, setRemoteMuted] = useState<boolean>(true);
  const [iceCfg, setIceCfg] = useState<{ iceServers: RTCIceServer[]; forceRelay?: boolean } | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WSClient | null>(null);
  const mainPeerRef = useRef<PeerConnection | null>(null);
  const adminMonitorPeersRef = useRef<Record<string, PeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const hasConnectedRef = useRef<boolean>(false);
  const pendingSignalsRef = useRef<any[]>([]);
  const userInteractedRef = useRef<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const ok = localStorage.getItem('ageConfirmed') === '1';
    setAgeConfirmed(ok);
    // prefetch ICE config
    loadIceConfig().then(setIceCfg).catch(() => {});
  }, []);

  const ensureInit = useCallback(async () => {
    let stored = localStorage.getItem('userId');
    if (!stored) {
      stored = uuidv4();
      localStorage.setItem('userId', stored);
    }
    setUserId(stored);
    const res = await fetch(apiUrl('/api/init'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: stored, gender })
    });
    const data = await res.json();
    setIsVip(!!data.isPremium);
  }, [gender]);

  const connectWS = useCallback(() => {
    if (wsRef.current) return wsRef.current;
    if (!BACKEND_WS) return;
    const ws = new WSClient(BACKEND_WS, (msg) => {
      handleWSMessage(msg);
    });
    ws.connect();
    wsRef.current = ws;
    return ws;
  }, []);

  useEffect(() => {
    ensureInit();
    if (!hasConnectedRef.current) {
      connectWS();
      hasConnectedRef.current = true;
    }
  }, [ensureInit, connectWS]);

  const handleWSMessage = useCallback(
    (msg: any) => {
      if (msg.type === 'ack') {
        setWsReady(true);
      } else if (msg.type === 'queue') {
        setQueued(true);
        setIsSearching(true);
      } else if (msg.type === 'match') {
        setQueued(false);
        setIsSearching(false);
        setRoomId(msg.roomId);
        setPartnerId(msg.partnerId);
        // Pass IDs explicitly to avoid stale state in closure
        startPeer(msg.initiator, msg.partnerId, msg.roomId);
      } else if (msg.type === 'signal') {
        if (msg.monitor) {
          // admin monitor signal
          const peer = adminMonitorPeersRef.current[msg.from];
          if (peer) peer.peer.signal(msg.data);
        } else {
          const peer = mainPeerRef.current;
          if (peer) {
            peer.peer.signal(msg.data);
          } else {
            // queue until peer is created
            pendingSignalsRef.current.push(msg.data);
          }
        }
      } else if (msg.type === 'text') {
        setMessages((m) => [...m, { from: 'peer', text: msg.message, ts: msg.ts }]);
      } else if (msg.type === 'partner_left' || msg.type === 'stopped') {
        cleanupPeer();
        setRoomId(null);
        setPartnerId(null);
        setIsSearching(false);
        setToast('Собеседник отключился');
      } else if (msg.type === 'spectate_request') {
        // create monitor peer towards admin
        if (localStreamRef.current) {
          const p = createPeer({
            initiator: true,
            stream: localStreamRef.current,
            onSignal: (data) => {
              wsRef.current?.send({
                type: 'signal',
                targetUserId: null,
                roomId: msg.roomId,
                data,
                monitor: true,
                adminSocketId: msg.adminSocketId
              });
            },
            onStream: () => {}
          });
          adminMonitorPeersRef.current[msg.adminSocketId] = p;
        }
      }
    },
    []
  );

  const startPeer = useCallback(
    async (initiator: boolean, partner: string, room: string) => {
      if (!userId) return;
      const stream = localStreamRef.current || (await getMediaStream());
      localStreamRef.current = stream;
      if (localVideoRef.current && !localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        await localVideoRef.current.play().catch(() => {});
      }
      const peer = createPeer({
        initiator,
        stream,
        ice: iceCfg || undefined,
        onSignal: (data) => {
          wsRef.current?.send({
            type: 'signal',
            targetUserId: partner,
            roomId: room,
            data
          });
        },
        onStream: async (remote) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remote;
            // Try autoplay muted first to bypass policies
            remoteVideoRef.current.muted = true;
            const playResult = await remoteVideoRef.current.play().catch(() => null);
            if (playResult === null) {
              // show muted overlay; user can unmute
              setRemoteMuted(true);
            } else if (userInteractedRef.current) {
              try {
                remoteVideoRef.current.muted = false;
                await remoteVideoRef.current.play();
                setRemoteMuted(false);
              } catch {
                setRemoteMuted(true);
              }
            }
          }
        },
        onData: (text) => {
          setMessages((m) => [...m, { from: 'peer', text, ts: Date.now() }]);
        }
      });
      mainPeerRef.current = peer;
      // flush any queued remote signals
      if (pendingSignalsRef.current.length) {
        for (const s of pendingSignalsRef.current.splice(0)) {
          try {
            peer.peer.signal(s);
          } catch {
            // ignore
          }
        }
      }
      setMessages((m) => [...m, { from: 'sys', text: 'Подключение...', ts: Date.now() }]);
    },
    [userId]
  );

  const cleanupPeer = useCallback(() => {
    mainPeerRef.current?.destroy();
    mainPeerRef.current = null;
    for (const key of Object.keys(adminMonitorPeersRef.current)) {
      adminMonitorPeersRef.current[key].destroy();
      delete adminMonitorPeersRef.current[key];
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!userId || !wsRef.current) return;
    wsRef.current.send({ type: 'hello', userId, gender, isVip });
  }, [userId, gender, isVip]);

  const onFind = useCallback(() => {
    setMessages([]);
    userInteractedRef.current = true;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current?.resume().catch(() => {});
    } catch {
      // ignore
    }
    if (!localStreamRef.current) {
      // Require media before matchmaking
      (async () => {
        try {
          const stream = await getMediaStream();
          localStreamRef.current = stream;
          setMediaReady(true);
          if (localVideoRef.current && !localVideoRef.current.srcObject) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.muted = true;
            await localVideoRef.current.play().catch(() => {});
          }
          wsRef.current?.send({ type: 'find', desiredGender });
          setIsSearching(true);
        } catch {
          setToast('Разрешите доступ к камере и микрофону');
        }
      })();
    } else {
      wsRef.current?.send({ type: 'find', desiredGender });
      setIsSearching(true);
    }
  }, [desiredGender]);

  const onStop = useCallback(() => {
    wsRef.current?.send({ type: 'stop' });
    cleanupPeer();
    setRoomId(null);
    setPartnerId(null);
  }, [cleanupPeer]);

  const onNext = useCallback(() => {
    setMessages([]);
    userInteractedRef.current = true;
    audioCtxRef.current?.resume().catch(() => {});
    wsRef.current?.send({ type: 'next', desiredGender });
  }, [desiredGender]);

  const onSendText = useCallback(
    (text: string) => {
      const sent = mainPeerRef.current?.sendText(text);
      if (!sent) {
        if (roomId) wsRef.current?.send({ type: 'text', roomId, message: text });
      }
      setMessages((m) => [...m, { from: 'me', text, ts: Date.now() }]);
    },
    [roomId]
  );

  const report = useCallback(() => {
    if (!partnerId || !userId) return;
    fetch(apiUrl('/api/complaint'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reporterId: userId, reportedId: partnerId, reason: 'abuse' })
    }).catch(() => {});
    setToast('Жалоба отправлена');
  }, [partnerId, userId]);

  const onFiltersChange = useCallback(
    (patch: Partial<{ gender: string | null; desiredGender: 'any' | 'male' | 'female' }>) => {
      if (patch.gender !== undefined) setGender(patch.gender);
      if (patch.desiredGender) setDesiredGender(patch.desiredGender);
    },
    []
  );

  const confirmAge = useCallback(() => {
    localStorage.setItem('ageConfirmed', '1');
    setAgeConfirmed(true);
  }, []);

  const requestMedia = useCallback(async () => {
    try {
      const stream = await getMediaStream();
      localStreamRef.current = stream;
      setMediaReady(true);
      if (localVideoRef.current && !localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        await localVideoRef.current.play().catch(() => {});
      }
    } catch {
      setToast('Доступ к камере/микрофону отклонён');
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-4 flex items-center justify-between">
        <div className="font-semibold text-lg">Roulette</div>
        <div className="text-sm text-white/70">Анонимный видеочат</div>
      </header>
      <main className="flex-1 container mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 card">
            <div className="aspect-video grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="relative">
                <video ref={localVideoRef} className="w-full h-full rounded-md bg-black object-cover" playsInline autoPlay muted />
                {!mediaReady && <div className="absolute inset-0"><VideoPlaceholder label="Камера не активна" /></div>}
              </div>
              <div className="relative">
                <video ref={remoteVideoRef} className="w-full h-full rounded-md bg-black object-cover" playsInline autoPlay />
                {!partnerId && !roomId && !isSearching && (
                  <div className="absolute inset-0"><VideoPlaceholder label="Нет собеседника" /></div>
                )}
                {isSearching && <div className="absolute inset-0"><VideoPlaceholder label="Поиск..." /></div>}
                {remoteMuted && partnerId && (
                  <div className="absolute bottom-3 right-3">
                    <button
                      className="btn bg-white/10 hover:bg-white/20"
                      onClick={() => {
                        if (remoteVideoRef.current) {
                          remoteVideoRef.current.muted = false;
                          remoteVideoRef.current.play().catch(() => {});
                          setRemoteMuted(false);
                        }
                      }}
                    >
                      Включить звук
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {!roomId ? (
                <button className="btn w-full sm:w-auto" onClick={onFind} disabled={!userId || queued || !wsReady}>
                  {queued ? 'Поиск...' : 'Найти собеседника'}
                </button>
              ) : (
                <Controls onNext={onNext} onStop={onStop} onReport={report} showReport={false} disabled={!userId} />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <Filters gender={gender} desiredGender={desiredGender} isVip={isVip} onChange={onFiltersChange} />
            <div className="min-h-64">
              <ChatPanel messages={messages} onSend={onSendText} />
            </div>
            <div className="card text-sm text-white/70">
              Поддержка: WebRTC (SimplePeer), аудио+видео, чат. Плавное переключение Next.
            </div>
          </div>
        </div>
      </main>
      <footer className="p-4 flex items-center justify-between text-sm text-white/60">
        <div>© {new Date().getFullYear()} Roulette</div>
        <div>18+ Только для совершеннолетних</div>
      </footer>

      {!ageConfirmed && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="card max-w-md w-full">
            <div className="text-lg font-semibold mb-2">Вам есть 18 лет?</div>
            <div className="text-white/70 mb-4">Для использования сервиса подтвердите, что вам исполнилось 18 лет.</div>
            <div className="flex gap-2 justify-end">
              <a href="https://google.com" className="btn bg-white/10 hover:bg-white/20">
                Нет
              </a>
              <button className="btn" onClick={confirmAge}>
                Да
              </button>
            </div>
          </div>
        </div>
      )}
      {ageConfirmed && !mediaReady && (
        <div className="fixed bottom-4 right-4 z-40">
          <div className="card">
            <div className="text-sm mb-2">Нужно разрешение к камере и микрофону</div>
            <button className="btn w-full" onClick={requestMedia}>
              Разрешить доступ
            </button>
          </div>
        </div>
      )}
      {toast && <Toast text={toast} />}
    </div>
  );
}



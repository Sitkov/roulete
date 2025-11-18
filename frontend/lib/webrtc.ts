import Peer, { Instance } from 'simple-peer';

export type PeerConnection = {
  peer: Instance;
  destroy: () => void;
  sendText: (text: string) => void;
};

let cachedIce: { iceServers: RTCIceServer[]; forceRelay?: boolean } | null = null;

export async function loadIceConfig(): Promise<{ iceServers: RTCIceServer[]; forceRelay?: boolean }> {
  if (cachedIce) return cachedIce;
  try {
    const res = await fetch('/api/ice');
    if (res.ok) {
      const data = await res.json();
      cachedIce = { iceServers: data.iceServers || [], forceRelay: !!data.forceRelay };
      return cachedIce;
    }
  } catch {
    // ignore
  }
  // fallback STUN only
  cachedIce = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
    ]
  };
  return cachedIce;
}

export function createPeer(opts: {
  initiator: boolean;
  stream: MediaStream;
  onSignal: (data: any) => void;
  onStream: (remote: MediaStream) => void;
  onData?: (text: string) => void;
  ice?: { iceServers: RTCIceServer[]; forceRelay?: boolean };
}) {
  const { initiator, stream, onSignal, onStream, onData, ice } = opts;
  const peer = new Peer({
    initiator,
    // При принудительном relay через TURN зачастую стабильнее без trickle
    trickle: ice?.forceRelay ? false : true,
    stream,
    config: {
      iceServers: ice?.iceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
      ],
      // @ts-ignore
      iceTransportPolicy: ice?.forceRelay ? 'relay' : 'all'
    },
  });
  peer.on('signal', onSignal);
  peer.on('stream', onStream);
  // Some environments emit 'track' earlier/more reliably than 'stream'.
  // Mirror to onStream for safety.
  // @ts-ignore
  peer.on('track', (_track: MediaStreamTrack, stream: MediaStream) => {
    if (stream) onStream(stream);
  });
  if (onData) {
    peer.on('data', (buf) => {
      const text = buf.toString('utf8');
      onData(text);
    });
  }
  peer.on('error', () => {});
  return {
    peer,
    destroy: () => peer.destroy(),
    sendText: (text: string) => {
      try {
        peer.send(text);
      } catch {
        // ignore
      }
    }
  } as PeerConnection;
}

export async function getMediaStream() {
  const constraints: MediaStreamConstraints = {
    audio: true,
    video: {
      width: { min: 480, ideal: 1280, max: 1920 },
      height: { min: 360, ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 60 }
    }
  };
  return await navigator.mediaDevices.getUserMedia(constraints);
}




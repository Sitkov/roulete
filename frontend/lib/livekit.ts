import { Room, RoomEvent, RemoteParticipant, createLocalTracks, Track, RemoteTrack, RemoteTrackPublication } from 'livekit-client';
import { apiUrl } from './env';

export type LivekitHandle = {
  room: Room;
  disconnect: () => Promise<void>;
};

export async function connectLivekit(roomId: string, identity: string, onRemoteStream: (s: MediaStream) => void, publish: boolean) {
  const res = await fetch(apiUrl('/api/livekit-token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, identity, admin: !publish })
  });
  if (!res.ok) throw new Error('token_failed');
  const { token, url } = await res.json();
  const room = new Room();
  room.on(RoomEvent.TrackSubscribed, (_track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
    const streams = participant.getTracks().map((t) => t.track?.mediaStream).filter(Boolean) as MediaStream[];
    if (streams[0]) onRemoteStream(streams[0]);
  });
  await room.connect(url, token);
  if (publish) {
    const tracks = await createLocalTracks({ audio: true, video: { facingMode: 'user' } });
    for (const t of tracks) await room.localParticipant.publishTrack(t);
  }
  return {
    room,
    async disconnect() {
      await room.disconnect();
    }
  } as LivekitHandle;
}



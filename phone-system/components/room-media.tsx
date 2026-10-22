"use client";

import { useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import { AudioPresets, Track } from "livekit-client";
import { Camera, CameraOff, Mic, MicOff, PhoneOff, RefreshCw, Volume2 } from "lucide-react";

type Props = {
  serverUrl: string;
  token: string;
  mode: "audio" | "video";
  held?: boolean;
  host?: boolean;
  onDisconnect: () => void;
  onToggleHold?: () => void;
  onError?: (message: string) => void;
};

function MediaStage({ mode, held, host, onDisconnect, onToggleHold }: Omit<Props, "serverUrl" | "token" | "onError">) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    localParticipant.setMicrophoneEnabled(!held, undefined, {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }).catch(() => {});
  }, [held, localParticipant]);

  useEffect(() => {
    if (mode === "video") {
      localParticipant.setCameraEnabled(true).catch(() => {});
    } else {
      localParticipant.setCameraEnabled(false).catch(() => {});
    }
  }, [mode, localParticipant]);

  async function toggleMic() {
    setBusy(true);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled, undefined, {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      });
    } finally { setBusy(false); }
  }
  async function toggleCamera() {
    setBusy(true);
    try { await localParticipant.setCameraEnabled(!isCameraEnabled); }
    finally { setBusy(false); }
  }

  return (
    <div className="media-room">
      <div className="media-grid">
        {tracks.map((track) => (
          <div className={track.participant.isLocal ? "media-tile local-tile" : "media-tile"} key={track.participant.identity}>
            {track.publication?.isSubscribed && track.publication.track ? (
              <VideoTrack trackRef={track as never} />
            ) : (
              <div className="avatar-placeholder">
                <div className="avatar-orb">{(track.participant.name || track.participant.identity || "C").slice(0, 1).toUpperCase()}</div>
                <span>{track.participant.isLocal ? "You" : (track.participant.name || "Caller")}</span>
                {mode === "audio" && <small>FaceTime Audio</small>}
              </div>
            )}
            <span className="tile-label">{track.participant.isLocal ? "You" : (track.participant.name || "Caller")}</span>
          </div>
        ))}
      </div>
      <RoomAudioRenderer />
      <div className="media-controls">
        <button className={isMicrophoneEnabled ? "round-control" : "round-control control-off"} onClick={toggleMic} disabled={busy} aria-label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}>
          {isMicrophoneEnabled ? <Mic /> : <MicOff />}<span>{isMicrophoneEnabled ? "Mute" : "Unmute"}</span>
        </button>
        {mode === "video" && <button className={isCameraEnabled ? "round-control" : "round-control control-off"} onClick={toggleCamera} disabled={busy} aria-label={isCameraEnabled ? "Turn camera off" : "Turn camera on"}>
          {isCameraEnabled ? <Camera /> : <CameraOff />}<span>Camera</span>
        </button>}
        {host && onToggleHold && <button className="round-control" onClick={onToggleHold}><RefreshCw /><span>{held ? "Resume" : "Hold"}</span></button>}
        <button className="round-control end-control" onClick={onDisconnect} aria-label="End call"><PhoneOff /><span>End</span></button>
      </div>
      <div className="room-footnote"><Volume2 size={14} /> Opus audio · Echo cancellation · Noise suppression</div>
    </div>
  );
}

export default function RoomMedia(props: Props) {
  const [connected, setConnected] = useState(false);
  return (
    <LiveKitRoom
      serverUrl={props.serverUrl}
      token={props.token}
      connect
      audio
      video={props.mode === "video"}
      options={{ adaptiveStream: true, dynacast: true, publishDefaults: { audioPreset: AudioPresets.musicHighQuality, dtx: false }, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }}
      onConnected={() => setConnected(true)}
      onDisconnected={() => { setConnected(false); props.onDisconnect(); }}
      onError={(error) => props.onError?.(error.message || "The media connection failed.")}
      className="livekit-shell"
    >
      {connected ? <MediaStage mode={props.mode} held={props.held} host={props.host} onDisconnect={props.onDisconnect} onToggleHold={props.onToggleHold} /> : <div className="connecting"><div className="spinner" />Securely connecting…</div>}
    </LiveKitRoom>
  );
}

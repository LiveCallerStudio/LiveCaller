"use client";
import {LiveKitRoom,RoomAudioRenderer,VideoTrack,useTracks} from "@livekit/components-react";
import {Track} from "livekit-client";
function RemoteMedia(){const tracks=useTracks([Track.Source.Camera],{onlySubscribed:true});const remote=tracks.find(t=>t.participant.identity.startsWith("caller-"));return <><RoomAudioRenderer/>{remote?<VideoTrack trackRef={remote} className="h-full w-full object-contain"/>:null}</>;}
export default function ObsRenderer({token,serverUrl,mode}:{token:string;serverUrl:string;mode:"audio"|"video"}){
 return <div className="fixed inset-0 overflow-hidden bg-transparent"><LiveKitRoom token={token} serverUrl={serverUrl} connect audio={false} video={false} options={{adaptiveStream:true}} onError={e=>console.error("OBS LiveKit connection error",e)}><RemoteMedia/>{mode==="audio"?<div className="absolute inset-0 grid place-items-center bg-transparent"><div className="grid h-28 w-28 place-items-center rounded-full border border-white/10 bg-black/20 text-5xl">🎙️</div></div>:null}</LiveKitRoom></div>;
}

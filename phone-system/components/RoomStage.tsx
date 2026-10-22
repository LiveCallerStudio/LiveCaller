"use client";
import { LiveKitRoom, RoomAudioRenderer, VideoConference } from "@livekit/components-react";
import { Mic, PhoneOff, Radio, Video } from "lucide-react";
type Props={token:string;serverUrl:string;mode:"audio"|"video";host?:boolean;held?:boolean;onAir?:boolean;onEnd?:()=>void};
export default function RoomStage(p:Props){
 return <div className="w-full">
  <LiveKitRoom token={p.token} serverUrl={p.serverUrl} connect audio video={p.mode==="video"} options={{adaptiveStream:true,dynacast:true}} onError={e=>console.error("LiveKit room error",e)}>
   <div className="call-stage min-h-[260px] overflow-hidden">
    {p.mode==="video"?<VideoConference/>:<div className="flex min-h-[260px] flex-col items-center justify-center gap-4"><div className="grid h-28 w-28 place-items-center rounded-full border border-lime-300/20 bg-lime-300/10 text-5xl">🎙️</div><div className="font-semibold">{p.host?"Host audio monitor":"FaceTime Audio"}</div><div className="text-xs text-white/45">Secure audio room</div></div>}
   </div>
   {p.held?<div className="my-3 rounded-xl bg-amber-400/10 p-3 text-center text-sm text-amber-200">Caller is on hold</div>:null}
   <RoomAudioRenderer muted={Boolean(p.held)}/>
   <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
    {p.onAir?<span className="pill pill-live"><Radio size={14}/> ON AIR</span>:null}
    <span className="pill"><Mic size={14}/> Microphone connected</span>
    {p.mode==="video"?<span className="pill"><Video size={14}/> Video</span>:null}
    {p.onEnd?<button className="btn btn-danger" onClick={p.onEnd}><PhoneOff size={18}/> End Call</button>:null}
   </div>
  </LiveKitRoom>
 </div>;
}

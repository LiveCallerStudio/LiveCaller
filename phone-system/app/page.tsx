"use client";
import {useEffect,useState} from "react";
import {Phone,PhoneOff,Video,AudioLines,Radio,ShieldCheck} from "lucide-react";
import RoomStage from "@/components/RoomStage";
type CallStatus="waiting"|"approved"|"held"|"live"|"ended"|"rejected";
export default function CallerPage(){
 const [name,setName]=useState("");const [city,setCity]=useState("");const [mode,setMode]=useState<"audio"|"video">("audio");
 const [id,setId]=useState("");const [key,setKey]=useState("");const [status,setStatus]=useState<CallStatus>("waiting");
 const [token,setToken]=useState("");const [serverUrl,setServerUrl]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 useEffect(()=>{if(!id||!key)return;let active=true;let requested=false;
  const poll=async()=>{try{const r=await fetch("/api/calls/"+id+"?callerKey="+encodeURIComponent(key),{cache:"no-store"});if(!r.ok)return;const d=await r.json();if(!active)return;setStatus(d.status);
   if(["ended","rejected"].includes(d.status)){setToken("");return;}
   if(["approved","held","live"].includes(d.status)&&!requested){requested=true;const tr=await fetch("/api/token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({callId:id,callerKey:key,participant:"caller",mode})});const td=await tr.json();if(!tr.ok)throw new Error(td.error||"Unable to connect");if(active){setToken(td.token);setServerUrl(td.serverUrl);}}
  }catch(e){if(active&&e instanceof Error)setError(e.message);}};
  poll();const timer=setInterval(poll,1800);return()=>{active=false;clearInterval(timer);};
 },[id,key,mode]);
 const begin=async()=>{setBusy(true);setError("");try{if(!name.trim())throw new Error("Enter your name before calling.");const r=await fetch("/api/calls",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({callerName:name.trim(),callerCity:city.trim(),callType:mode})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Unable to start call");setId(d.callId);setKey(d.callerKey);setStatus(d.status);}catch(e){setError(e instanceof Error?e.message:"Call could not start");}finally{setBusy(false);}};
 const end=async()=>{if(id)await fetch("/api/calls/"+id+"/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"caller-end",callerKey:key})}).catch(()=>{});setStatus("ended");setToken("");};
 const reset=()=>{setId("");setKey("");setToken("");setServerUrl("");setStatus("waiting");setError("");};
 const connected=["approved","held","live"].includes(status);
 return <main className="safe-top safe-bottom mx-auto flex min-h-[100dvh] max-w-4xl flex-col px-4 pb-8">
  <header className="flex justify-between py-5 text-sm"><a href="../home.html" className="text-white/55">← Live Caller Studio</a><span className="font-bold tracking-widest text-white/50">⚡ LIVE CALL IN</span></header>
  {!id?<section className="mx-auto my-auto w-full max-w-md py-8"><div className="mb-7 text-center"><div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-lime-300/20 bg-lime-300/10"><Radio size={34} className="text-lime-300"/></div><div className="text-xs font-bold tracking-[.25em] text-lime-300">SCREENED · TWO-WAY · LIVE</div><h1 className="mt-3 text-5xl font-bold">Call in live.</h1><p className="mt-4 text-sm leading-6 text-white/55">FaceTime-style audio or video, screened by the producer before you go on air.</p></div>
  <div className="glass rounded-[28px] p-5"><div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-black/35 p-1.5"><button onClick={()=>setMode("audio")} className={"rounded-xl p-4 text-sm "+(mode==="audio"?"bg-white text-black":"text-white/60")}><AudioLines className="mx-auto mb-1"/>FaceTime Audio</button><button onClick={()=>setMode("video")} className={"rounded-xl p-4 text-sm "+(mode==="video"?"bg-white text-black":"text-white/60")}><Video className="mx-auto mb-1"/>Video Call</button></div>
  <label className="mb-2 block text-xs text-white/55">YOUR NAME</label><input className="field mb-4" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" maxLength={60}/>
  <label className="mb-2 block text-xs text-white/55">CITY (OPTIONAL)</label><input className="field mb-5" value={city} onChange={e=>setCity(e.target.value)} placeholder="Your city" maxLength={80}/>
  {error&&<p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}
  <button className="btn btn-primary min-h-14 w-full" disabled={busy} onClick={begin}>{mode==="audio"?<Phone/>:<Video/>}{busy?"Starting…":mode==="audio"?"Start FaceTime Audio":"Start FaceTime Video"}</button>
  <p className="mt-4 flex gap-2 text-xs leading-5 text-white/40"><ShieldCheck size={16}/> Microphone and camera connect after the producer answers. Keep this page open while waiting.</p></div></section>:
  <section className="mx-auto my-auto w-full max-w-3xl"><div className="mb-5 flex items-center justify-between"><div><div className="text-xs tracking-widest text-lime-300">LIVE CALLER STUDIO</div><h1 className="mt-1 text-2xl font-bold">{name}</h1><p className="mt-1 text-sm text-white/50">{city||"On the line"}</p></div><span className={"pill "+(status==="live"?"pill-live":"pill-wait")}>{status==="waiting"?"Waiting for host":status==="approved"?"Connecting":status==="held"?"On hold":status==="live"?"ON AIR":status==="rejected"?"Declined":"Call ended"}</span></div>
  {token&&serverUrl&&connected?<div className="glass rounded-[30px] p-4"><RoomStage token={token} serverUrl={serverUrl} mode={mode} held={status==="held"} onAir={status==="live"} onEnd={end}/></div>:<div className="glass flex min-h-[330px] flex-col items-center justify-center rounded-[30px] p-8 text-center"><div className="mb-5 text-6xl">{status==="held"?"🎵":"👋"}</div><h2 className="text-2xl font-semibold">{status==="waiting"?"You’re in the screening queue":status==="held"?"You’re on hold":status==="rejected"?"The host couldn’t take your call":"Call ended"}</h2><p className="mt-3 text-sm text-white/50">{status==="waiting"?"You’ll connect automatically when the producer answers.":"Thanks for calling Live Caller Studio."}</p>{["ended","rejected"].includes(status)?<button className="btn btn-muted mt-6" onClick={reset}>Back to call screen</button>:<button className="btn btn-danger mt-6" onClick={end}><PhoneOff size={18}/> Cancel call</button>}</div>}
  <p className="mt-4 flex justify-center gap-2 text-xs text-white/35"><ShieldCheck size={14}/> Use headphones for best sound.</p></section>}
 </main>;
}
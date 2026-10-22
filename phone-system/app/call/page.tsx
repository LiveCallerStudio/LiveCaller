"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Headphones, Mic, Phone, Radio, ShieldCheck, Video, Wifi } from "lucide-react";
import Link from "next/link";
import RoomMedia from "@/components/room-media";

type CallMode = "audio" | "video";
type CallStatus = "waiting" | "answered" | "live" | "held" | "ended" | "rejected" | "completed" | string;

export default function CallerPage() {
  const [mode, setMode] = useState<CallMode>("audio");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [callId, setCallId] = useState("");
  const [collectionName, setCollectionName] = useState<"liveCalls" | "videoCalls">("liveCalls");
  const [callerSecret, setCallerSecret] = useState("");
  const [status, setStatus] = useState<CallStatus>("idle");
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(true);
  const audioContext = useRef<AudioContext | null>(null);

  const endCall = useCallback(async () => {
    if (callId && callerSecret) {
      await fetch("/api/calls/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, collectionName, callerSecret }),
      }).catch(() => {});
    }
    setToken(""); setServerUrl(""); setStatus("ended"); setShowForm(false);
    audioContext.current?.close().catch(()=>{}); audioContext.current = null;
  }, [callId, callerSecret, collectionName]);

  useEffect(() => {
    if (!callId || !callerSecret || ["ended", "rejected", "completed"].includes(status)) return;
    let cancelled = false;
    let tokenRequested = false;
    const check = async () => {
      try {
        const response = await fetch("/api/calls/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId, collectionName, callerSecret }),
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check call status.");
        if (cancelled) return;
        setStatus(data.status);
        if (["answered", "live", "held"].includes(data.status) && !tokenRequested && !token) {
          tokenRequested = true;
          const tokenResponse = await fetch("/api/livekit-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callId, collectionName, role: "caller", callerSecret }),
            cache: "no-store",
          });
          const tokenData = await tokenResponse.json();
          if (!tokenResponse.ok) throw new Error(tokenData.error || "Could not connect the call.");
          if (!cancelled) { setServerUrl(tokenData.serverUrl); setToken(tokenData.token); }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Connection status check failed.");
      }
    };
    check();
    const interval = window.setInterval(check, 1800);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [callId, callerSecret, collectionName, status === "ended" ? "ended" : "active", token]);

  useEffect(() => {
    if (status !== "held" || !token) {
      audioContext.current?.close().catch(()=>{}); audioContext.current = null; return;
    }
    try {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioContext.current = ctx;
      const notes = [261.63, 329.63, 392, 523.25, 392, 329.63, 261.63, 0, 0, 0];
      let index = 0;
      let timer: number;
      const play = () => {
        if (ctx.state === "closed") return;
        const frequency = notes[index++ % notes.length];
        if (frequency) {
          const oscillator = ctx.createOscillator();
          const gain = ctx.createGain();
          oscillator.frequency.value = frequency;
          oscillator.type = "sine";
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
          oscillator.connect(gain); gain.connect(ctx.destination);
          oscillator.start(); oscillator.stop(ctx.currentTime + 0.4);
        }
        timer = window.setTimeout(play, 480);
      };
      ctx.resume().then(play).catch(()=>{});
      return () => { window.clearTimeout(timer); ctx.close().catch(()=>{}); };
    } catch { return; }
  }, [status, token]);

  async function placeCall() {
    setBusy(true); setError("");
    try {
      try {
        const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) { audioContext.current = new Ctx(); await audioContext.current.resume(); }
      } catch {}
      const response = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, city, mode, kind: mode === "video" ? "video" : "audio" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not place your call.");
      setCallId(data.callId); setCollectionName(data.collectionName); setCallerSecret(data.callerSecret);
      setStatus("waiting"); setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place your call.");
    } finally { setBusy(false); }
  }

  const onAir = status === "live";
  const held = status === "held";
  const terminal = ["ended", "rejected", "completed"].includes(status);

  return (
    <main className="caller-page">
      <header className="caller-top">
        <Link href="/" className="brand no-underline"><div className="brand-mark"><Radio size={19}/></div><div>LIVE CALLER<small>STUDIO LINE</small></div></Link>
        <span className="status-pill"><ShieldCheck size={14}/> Private connection</span>
      </header>

      {showForm ? (
        <div className="caller-center">
          <div>
            <div className="caller-avatar"><Headphones size={48}/></div>
            <h1 className="caller-name mt-6">You’re on the line.</h1>
            <p className="caller-subtitle">Request to join the show. The host will answer when ready.</p>
          </div>
          <section className="glass caller-form">
            <div className="mode-switch" role="group" aria-label="Call type">
              <button type="button" className={mode==="audio"?"mode-choice active":"mode-choice"} onClick={()=>setMode("audio")}><Headphones size={17}/> FaceTime Audio</button>
              <button type="button" className={mode==="video"?"mode-choice active":"mode-choice"} onClick={()=>setMode("video")}><Video size={17}/> Video Call</button>
            </div>
            <div><label className="field-label" htmlFor="caller-name">Your name</label><input id="caller-name" className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Name the host will see" autoComplete="name" maxLength={60} required /></div>
            <div><label className="field-label" htmlFor="caller-city">City (optional)</label><input id="caller-city" className="input" value={city} onChange={e=>setCity(e.target.value)} placeholder="Your city" autoComplete="address-level2" maxLength={80}/></div>
            {error && <p className="error-text">{error}</p>}
            <button className="button button-primary py-4" disabled={busy || name.trim().length<2} onClick={placeCall}>{busy ? "Calling…" : <><Phone size={17}/> Request to join the show</>}</button>
            <p className="tiny-note">Your mic{mode==="video"?" and camera":""} are not activated until you connect. Use headphones to reduce feedback.</p>
          </section>
        </div>
      ) : (
        <div className="caller-center">
          {!terminal && !token && <div><div className="caller-avatar">{mode==="video"?<Video size={44}/>:<Headphones size={44}/>}</div><h1 className="caller-name mt-6">{held ? "Please hold" : status==="waiting" ? "Calling the studio…" : "Connecting…"}</h1><p className="caller-subtitle">{held ? "The host will be right with you." : status==="waiting" ? "Your request is in the screening queue." : "Setting up your secure audio connection."}</p><div className="flex justify-center mt-5"><span className="status-pill"><span className="status-dot"/>{held?"On hold":status==="waiting"?"Waiting for host":"Connecting"}</span></div></div>}
          {token && serverUrl && !terminal && <><div className="flex items-center justify-between"><div><div className="eyebrow">{onAir?"ON AIR":held?"ON HOLD":"CONNECTED"}</div><h1 className="text-2xl font-extrabold mt-2">{held ? "Please hold" : onAir ? "You’re live with the host" : "Connected to the studio"}</h1></div><span className="status-pill"><Wifi size={14}/>{mode==="video"?"Video":"Audio"}</span></div><RoomMedia serverUrl={serverUrl} token={token} mode={mode} held={held} onDisconnect={endCall} onError={setError}/>{error&&<p className="error-text">{error}</p>}</>}
          {terminal && <div><div className="caller-avatar"><Phone size={44}/></div><h1 className="caller-name mt-6">{status==="rejected"?"The studio is unavailable":"Call ended"}</h1><p className="caller-subtitle">{status==="rejected"?"The host couldn’t take your call this time.":"Thanks for checking in with Live Caller Studio."}</p><button className="button button-primary w-full mt-6" onClick={()=>{setCallId("");setCallerSecret("");setToken("");setServerUrl("");setStatus("idle");setShowForm(true);setError("");}}>Call again</button></div>}
          {!terminal && <div className="caller-callbar"><button className="round-control end-control" onClick={endCall} aria-label="End call"><Phone size={22}/><span>End</span></button></div>}
          <p className="tiny-note">Keep this page open while your request is waiting. Switching apps or locking your phone may pause browser media.</p>
        </div>
      )}
      <footer className="tiny-note">LIVE CALLER STUDIO · {mode==="video"?"VIDEO CALL":"FACETIME AUDIO"} · <span className="inline-flex items-center gap-1"><ShieldCheck size={12}/> Secure room token</span></footer>
    </main>
  );
}

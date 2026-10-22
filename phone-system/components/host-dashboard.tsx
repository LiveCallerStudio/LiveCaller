"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { Activity, Headphones, LogOut, PhoneCall, Radio, ShieldCheck, Video } from "lucide-react";
import { auth, db } from "@/lib/firebase-client";
import RoomMedia from "@/components/room-media";

type CollectionName = "liveCalls" | "videoCalls";
type CallDoc = {
  id: string;
  collectionName: CollectionName;
  callerName: string;
  callerCity?: string | null;
  status: string;
  callMode: "audio" | "video";
  transport?: string;
  roomName?: string;
  createdAt?: { toMillis?: () => number } | null;
};

async function apiPost(url: string, body: Record<string, unknown>, user: User) {
  const token = await user.getIdToken();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}

export default function HostDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [calls, setCalls] = useState<CallDoc[]>([]);
  const [tab, setTab] = useState<"all" | "audio" | "video">("all");
  const [active, setActive] = useState<CallDoc | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [held, setHeld] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setAuthReady(true);
  }), []);

  useEffect(() => {
    if (!user) { setCalls([]); return; }
    const unsubscribers = (["liveCalls", "videoCalls"] as CollectionName[]).map((collectionName) =>
      onSnapshot(collection(db, collectionName), (snapshot) => {
        const items: CallDoc[] = snapshot.docs.map((document) => {
          const data = document.data();
          return {
            id: document.id,
            collectionName,
            callerName: String(data.callerName || data.name || "Unknown caller"),
            callerCity: data.callerCity || data.city || null,
            status: String(data.status || "waiting"),
            callMode: data.callMode === "video" || collectionName === "videoCalls" ? "video" : "audio",
            transport: data.transport,
            roomName: data.roomName,
            createdAt: data.createdAt || null,
          };
        });
        setCalls((current) => {
          const other = current.filter((item) => item.collectionName !== collectionName);
          return [...other, ...items].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        });
      }, (listenerError) => setError(`Queue listener: ${listenerError.message}`))
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [user]);

  const waiting = useMemo(() => calls.filter((call) => call.status === "waiting"), [calls]);
  const filtered = useMemo(() => waiting.filter((call) => tab === "all" || (tab === "video" ? call.callMode === "video" : call.callMode === "audio")), [waiting, tab]);
  const liveCount = calls.filter((call) => ["answered", "live", "held"].includes(call.status)).length;

  async function login(event: FormEvent) {
    event.preventDefault(); setLoginBusy(true); setAuthError("");
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch (e) { setAuthError(e instanceof Error ? e.message : "Could not sign in."); }
    finally { setLoginBusy(false); }
  }

  async function setCallStatus(call: CallDoc, action: string): Promise<boolean> {
    if (!user) return false;
    setBusyId(call.id); setError("");
    try {
      await apiPost("/api/calls/action", { callId: call.id, collectionName: call.collectionName, action }, user);
      setCalls((items) => items.map((item) => item.id === call.id && item.collectionName === call.collectionName
        ? { ...item, status: action === "resume" ? "answered" : action === "end" ? "ended" : action === "reject" ? "rejected" : action === "hold" ? "held" : action === "live" ? "live" : "answered" }
        : item));
      setActive((current) => current && current.id === call.id && current.collectionName === call.collectionName
        ? { ...current, status: action === "resume" ? "answered" : action === "end" ? "ended" : action === "hold" ? "held" : action === "live" ? "live" : current.status }
        : current);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Call action failed.");
      return false;
    } finally { setBusyId(""); }
  }

  async function answer(call: CallDoc) {
    if (!user) return;
    if (call.transport !== "livekit" || !call.roomName) {
      setError(`${call.callerName} is using the older WebRTC caller page. New LiveKit rooms can only connect to requests made from /call. Ask this caller to retry on the rebuilt calling page.`);
      return;
    }
    setBusyId(call.id); setError("");
    try {
      await apiPost("/api/calls/action", { callId: call.id, collectionName: call.collectionName, action: "answer" }, user);
      const result = await apiPost("/api/livekit-token", { callId: call.id, collectionName: call.collectionName, role: "host" }, user);
      setActive(call); setHeld(false); setServerUrl(result.serverUrl); setToken(result.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not answer this call.");
    } finally { setBusyId(""); }
  }

  async function holdToggle() {
    if (!active) return;
    const action = held ? "resume" : "hold";
    const ok = await setCallStatus(active, action);
    if (ok) setHeld(!held);
  }

  async function bringOnAir() {
    if (active) await setCallStatus(active, "live");
  }

  async function endActive() {
    if (active) await setCallStatus(active, "end");
    setToken(""); setServerUrl(""); setActive(null); setHeld(false);
  }

  if (!authReady) return <main className="page-shell"><div className="connecting"><div className="spinner" />Loading host control room…</div></main>;

  if (!user) return (
    <main className="caller-page">
      <header className="topbar"><div className="brand"><div className="brand-mark"><Radio size={20}/></div><div>LIVE CALLER STUDIO<small>HOST CONTROL ROOM</small></div></div><span className="status-pill"><ShieldCheck size={14}/> Secure sign-in</span></header>
      <div className="caller-center">
        <div><div className="caller-avatar"><Headphones size={45}/></div><h1 className="caller-name">Host sign in</h1><p className="caller-subtitle">Sign in with the producer account authorized for this control room.</p></div>
        <form className="glass caller-form" onSubmit={login}>
          <div><label className="field-label" htmlFor="host-email">Email</label><input id="host-email" className="input" type="email" autoComplete="username" value={email} onChange={(e)=>setEmail(e.target.value)} required /></div>
          <div><label className="field-label" htmlFor="host-password">Password</label><input id="host-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} required /></div>
          {authError && <p className="error-text">{authError}</p>}
          <button className="button button-primary" disabled={loginBusy}>{loginBusy ? "Signing in…" : "Open control room"}</button>
          <p className="tiny-note">Access is checked again by the server against HOST_UIDS. A signed-in account alone is not sufficient.</p>
        </form>
      </div>
    </main>
  );

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Radio size={20}/></div><div>LIVE CALLER STUDIO<small>BROADCAST CONTROL CENTER</small></div></div>
        <div className="flex items-center gap-3"><span className="status-pill"><span className="status-dot"/> Connected</span><button className="button button-subtle" onClick={()=>signOut(auth)}><LogOut size={15}/> Sign out</button></div>
      </header>
      <div className="stats">
        <div className="stat"><b>{waiting.length}</b><span>Waiting requests</span></div>
        <div className="stat"><b>{liveCount}</b><span>In progress</span></div>
        <div className="stat"><b>{calls.filter(c=>c.callMode==="video" && c.status==="waiting").length}</b><span>Video guests</span></div>
      </div>
      {error && <div className="banner mb-4">{error}<button className="ml-3 underline" onClick={()=>setError("")}>Dismiss</button></div>}
      <div className="host-layout">
        <section className="glass panel">
          <div className="flex items-start justify-between gap-3"><div><div className="eyebrow">Caller screening</div><h1 className="section-title mt-2">Incoming requests</h1><p className="muted text-sm mt-2">Screen first, then bring callers on air when you are ready.</p></div><span className="status-pill"><Activity size={14}/>{waiting.length} waiting</span></div>
          <div className="queue-tabs">
            <button className={tab==="all"?"tab active":"tab"} onClick={()=>setTab("all")}>All <span className="count">{waiting.length}</span></button>
            <button className={tab==="audio"?"tab active":"tab"} onClick={()=>setTab("audio")}><PhoneCall size={13} className="inline mr-1"/>Audio</button>
            <button className={tab==="video"?"tab active":"tab"} onClick={()=>setTab("video")}><Video size={13} className="inline mr-1"/>Video <span className="count">{waiting.filter(c=>c.callMode==="video").length}</span></button>
          </div>
          <div className="queue-list">
            {filtered.map((call)=>(
              <article className="queue-item" key={call.collectionName+call.id}>
                <div className="min-w-0"><strong>{call.callerName}</strong><small>{call.callerCity || "Location not provided"} · {call.callMode==="video"?"Video call":"FaceTime Audio"}</small><small>{call.transport==="livekit"?"LiveKit secure room":"Legacy WebRTC request"}</small></div>
                <div className="queue-actions">
                  <button className="mini-button answer" disabled={busyId===call.id || call.transport!=="livekit"} onClick={()=>answer(call)}>{busyId===call.id?"Working…":"Answer"}</button>
                  <button className="mini-button reject" disabled={busyId===call.id} onClick={()=>setCallStatus(call,"reject")}>Reject</button>
                </div>
              </article>
            ))}
            {!filtered.length && <div className="empty-state"><div className="empty-icon"><PhoneCall size={19}/></div><strong className="text-white">You're all caught up</strong><p className="mt-2">New caller requests appear here automatically.</p></div>}
          </div>
        </section>
        <section className="glass panel">
          <div className="flex items-start justify-between gap-3 mb-5"><div><div className="eyebrow">Live room</div><h2 className="section-title mt-2">{active ? active.callerName : "No active caller"}</h2><p className="muted text-sm mt-2">{active ? (active.callMode==="video"?"Video screening room":"Audio screening room") : "Answer a request to start a private screening room."}</p></div>{active && <span className="status-pill"><span className="status-dot"/>{held?"On hold":active.status==="live"?"On air":"Screening"}</span>}</div>
          {active && token && serverUrl ? (
            <>
              <RoomMedia key={active.id} serverUrl={serverUrl} token={token} mode={active.callMode} held={held} host onDisconnect={endActive} onToggleHold={holdToggle} onError={setError}/>
              <div className="grid grid-cols-2 gap-2 mt-4"><button className="button button-green" onClick={bringOnAir} disabled={active.status==="live" || held}><Radio size={16}/> Bring on air</button><button className="button button-red" onClick={endActive}><PhoneCall size={16}/> Disconnect</button></div>
              <p className="tiny-note mt-3">“Bring on air” updates the show state. This room is not automatically mixed into OBS; see deployment notes for broadcast routing.</p>
            </>
          ) : <div className="empty-state"><div className="empty-icon"><Video size={19}/></div><strong className="text-white">Ready for your next caller</strong><p className="mt-2">Your local microphone and camera are only requested after you answer.</p></div>}
        </section>
      </div>
      <footer className="tiny-note mt-8">LIVE CALLER STUDIO · LiveKit WebRTC · Firebase queue · Host access is server-authorized</footer>
    </main>
  );
}

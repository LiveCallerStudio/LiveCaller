import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(req: NextRequest) {
  try {
    const { callId, collectionName, role, callerSecret } = await req.json();
    if (typeof callId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(callId)) {
      return NextResponse.json({ error: "Invalid call request." }, { status: 400 });
    }
    const collection = collectionName === "videoCalls" ? "videoCalls" : "liveCalls";
    if (role !== "host" && role !== "caller") return NextResponse.json({ error: "Invalid role." }, { status: 400 });

    const livekitUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!livekitUrl || !apiKey || !apiSecret) {
      return NextResponse.json({ error: "LiveKit server credentials are not configured." }, { status: 503 });
    }

    const db = adminDb();
    const ref = db.collection(collection).doc(callId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Call request was not found." }, { status: 404 });
    const call = snap.data()!;
    if (["ended", "completed", "rejected", "disconnected"].includes(String(call.status))) {
      return NextResponse.json({ error: "This call has ended." }, { status: 410 });
    }
    if (!call.roomName || call.transport !== "livekit") {
      return NextResponse.json({ error: "This is an older WebRTC request. Ask the caller to start a new call using the rebuilt calling page." }, { status: 409 });
    }

    let identity: string;
    if (role === "host") {
      if (!["answered", "live", "held"].includes(String(call.status))) {
        return NextResponse.json({ error: "Answer the call before opening its media room." }, { status: 409 });
      }
      const header = req.headers.get("authorization") || "";
      const idToken = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!idToken) return NextResponse.json({ error: "Host sign-in is required." }, { status: 401 });
      const decoded = await adminAuth().verifyIdToken(idToken);
      const allowed = (process.env.HOST_UIDS || "").split(",").map(s => s.trim()).filter(Boolean);
      if (!allowed.length || !allowed.includes(decoded.uid)) return NextResponse.json({ error: "This account is not allowed to access the host room. Configure HOST_UIDS." }, { status: 403 });
      identity = `host-${decoded.uid.slice(0, 40)}`;
    } else {
      if (!["answered", "live", "held"].includes(String(call.status))) {
        return NextResponse.json({ error: "The host has not answered this call yet." }, { status: 409 });
      }
      if (typeof callerSecret !== "string" || typeof call.callerSecretHash !== "string") {
        return NextResponse.json({ error: "Caller authorization is invalid." }, { status: 401 });
      }
      const suppliedHash = createHash("sha256").update(callerSecret).digest("hex");
      if (!safeEqual(suppliedHash, call.callerSecretHash)) return NextResponse.json({ error: "Caller authorization failed." }, { status: 401 });
      identity = `caller-${callId.slice(0, 48)}`;
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name: role === "host" ? "Live Caller Host" : String(call.callerName || "Caller").slice(0, 60),
      ttl: "20m",
      metadata: JSON.stringify({ role, callId, collectionName: collection }),
    });
    token.addGrant({
      roomJoin: true,
      room: String(call.roomName),
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return NextResponse.json({ serverUrl: livekitUrl, token: await token.toJwt() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("LiveKit token generation failed", error);
    return NextResponse.json({ error: "Could not authorize the call connection." }, { status: 500 });
  }
}

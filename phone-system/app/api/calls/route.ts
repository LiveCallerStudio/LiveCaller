import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { adminDb } from "@/lib/firebase-admin";
import { isHostRequest } from "@/lib/host-auth";

export const runtime = "nodejs";
const ACTIVE = ["waiting", "approved", "held", "live"] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const callerName = String(body.callerName || "").trim().slice(0, 60);
    const callerCity = String(body.callerCity || "").trim().slice(0, 80);
    const callType = body.callType === "video" ? "video" : "audio";
    if (!callerName) return NextResponse.json({ error: "Enter your name to call in." }, { status: 400 });
    const db = adminDb();
    const lines = await db.doc("hotlineSettings/callLines").get();
    const data = lines.exists ? lines.data() || {} : {};
    const openValue = callType === "video"
      ? (data.videoOpen ?? data.videoLineOpen ?? data.video ?? data.open)
      : (data.phoneOpen ?? data.phoneLineOpen ?? data.phone ?? data.open);
    if (openValue === false || openValue === "closed") {
      return NextResponse.json({ error: "That line is closed right now. Please leave a voice message from the main site." }, { status: 423 });
    }
    const callerKey = randomBytes(24).toString("hex");
    const ref = db.collection("liveCalls").doc();
    const roomName = "lcs-" + ref.id;
    await ref.set({
      callerName, callerCity, callType, roomName, callerKey,
      status: "waiting", createdAt: new Date(), createdAtMs: Date.now(),
      source: "phone-system-livekit", onAir: false, muted: false
    });
    return NextResponse.json({ callId: ref.id, callerKey, status: "waiting" }, { status: 201 });
  } catch (error) {
    console.error("Create call failed:", error);
    return NextResponse.json({ error: "Unable to start the call. Please try again." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isHostRequest(request)) return NextResponse.json({ error: "Unauthorized host." }, { status: 401 });
  try {
    const snap = await adminDb().collection("liveCalls").where("status", "in", [...ACTIVE]).get();
    const calls = snap.docs.map(d => {
      const { callerKey: _secret, ...safe } = d.data();
      return { id: d.id, ...safe };
    }).sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
    return NextResponse.json({ calls });
  } catch (error) {
    console.error("Read call queue failed:", error);
    return NextResponse.json({ error: "Could not load the call queue." }, { status: 500 });
  }
}
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
function sameHash(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function POST(req: NextRequest) {
  try {
    const { callId, collectionName, callerSecret } = await req.json();
    if (typeof callId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(callId) || typeof callerSecret !== "string") {
      return NextResponse.json({ error: "Invalid call reference." }, { status: 400 });
    }
    const collection = collectionName === "videoCalls" ? "videoCalls" : "liveCalls";
    const snap = await adminDb().collection(collection).doc(callId).get();
    if (!snap.exists) return NextResponse.json({ error: "Call not found." }, { status: 404 });
    const call = snap.data()!;
    const supplied = createHash("sha256").update(callerSecret).digest("hex");
    if (typeof call.callerSecretHash !== "string" || !sameHash(supplied, call.callerSecretHash)) {
      return NextResponse.json({ error: "Caller authorization failed." }, { status: 401 });
    }
    return NextResponse.json({
      status: String(call.status || "waiting"),
      callerName: String(call.callerName || "Caller"),
      callMode: call.callMode === "video" ? "video" : "audio",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Call status check failed", error);
    return NextResponse.json({ error: "Could not check call status." }, { status: 500 });
  }
}

import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const { callId, collectionName, callerSecret } = await req.json();
    if (typeof callId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(callId) || typeof callerSecret !== "string") {
      return NextResponse.json({ error: "Invalid call reference." }, { status: 400 });
    }
    const collection = collectionName === "videoCalls" ? "videoCalls" : "liveCalls";
    const ref = adminDb().collection(collection).doc(callId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Call not found." }, { status: 404 });
    const call = snap.data()!;
    const expected = String(call.callerSecretHash || "");
    const supplied = createHash("sha256").update(callerSecret).digest("hex");
    const x = Buffer.from(expected), y = Buffer.from(supplied);
    if (!expected || x.length !== y.length || !timingSafeEqual(x, y)) return NextResponse.json({ error: "Caller authorization failed." }, { status: 401 });
    await ref.set({ status: "ended", endedAt: Date.now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Caller end action failed", error);
    return NextResponse.json({ error: "Could not end the call." }, { status: 500 });
  }
}

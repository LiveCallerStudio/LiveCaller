import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
const allowedActions = new Set(["answer", "hold", "resume", "live", "reject", "end"]);

export async function POST(req: NextRequest) {
  try {
    const header = req.headers.get("authorization") || "";
    const idToken = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "Host sign-in is required." }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken);
    const allowedUids = (process.env.HOST_UIDS || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!allowedUids.length || !allowedUids.includes(decoded.uid)) return NextResponse.json({ error: "This account is not allowed to control calls." }, { status: 403 });

    const { callId, collectionName, action } = await req.json();
    if (typeof callId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(callId) || !allowedActions.has(action)) {
      return NextResponse.json({ error: "Invalid call action." }, { status: 400 });
    }
    const collection = collectionName === "videoCalls" ? "videoCalls" : "liveCalls";
    const ref = adminDb().collection(collection).doc(callId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Call request was not found." }, { status: 404 });
    const current = snap.data()!;
    const transitions: Record<string, string> = {
      answer: "answered", hold: "held", resume: "answered", live: "live",
      reject: "rejected", end: "ended",
    };
    const status = transitions[action as string];
    if (["ended", "completed", "rejected", "disconnected"].includes(String(current.status)) && action !== "end") {
      return NextResponse.json({ error: "This call has already ended." }, { status: 409 });
    }
    await ref.set({
      status,
      updatedAt: FieldValue.serverTimestamp(),
      ...(action === "live" ? { liveSince: Date.now() } : {}),
      ...(action === "hold" ? { heldAt: Date.now() } : {}),
      ...(action === "end" || action === "reject" ? { endedAt: Date.now() } : {}),
    }, { merge: true });
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    console.error("Call action failed", error);
    return NextResponse.json({ error: "Could not update this call." }, { status: 500 });
  }
}

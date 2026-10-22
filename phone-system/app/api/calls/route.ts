import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().replace(/[<>]/g, "").slice(0, max) : "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const callerName = clean(body.name, 60);
    const callerCity = clean(body.city, 80);
    const callMode = body.mode === "video" ? "video" : "audio";
    const collectionName = body.kind === "video" || callMode === "video" ? "videoCalls" : "liveCalls";
    if (callerName.length < 2) return NextResponse.json({ error: "Enter your name so the host knows who is calling." }, { status: 400 });

    const secret = randomBytes(32).toString("base64url");
    const roomName = `lcs-${randomUUID()}`;
    const db = adminDb();
    const docRef = await db.collection(collectionName).add({
      callerName,
      callerCity: callerCity || null,
      callMode,
      transport: "livekit",
      roomName,
      callerSecretHash: createHash("sha256").update(secret).digest("hex"),
      status: "waiting",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ callId: docRef.id, collectionName, callerSecret: secret });
  } catch (error) {
    console.error("Call request creation failed", error);
    return NextResponse.json({ error: "Could not place your call. Please try again." }, { status: 500 });
  }
}

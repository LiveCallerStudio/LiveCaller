import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { adminDb } from "@/lib/firebase-admin";
import { isHostRequest } from "@/lib/host-auth";
export const runtime = "nodejs";
const ACTIVE = ["waiting", "approved", "held", "live"] as const;
const hashKey = (key:string) => createHash("sha256").update(key).digest("hex");
export async function POST(request: NextRequest) {
 try {
  const body=await request.json();
  const callerName=String(body.callerName||"").trim().slice(0,60);
  const callerCity=String(body.callerCity||"").trim().slice(0,80);
  const callType=body.callType==="video"?"video":"audio";
  if(!callerName)return NextResponse.json({error:"Enter your name to call in."},{status:400});
  const db=adminDb();const lineSnap=await db.doc("hotlineSettings/callLines").get();const line=lineSnap.exists?lineSnap.data()||{}:{};
  const open=callType==="video"?(line.videoOpen??line.videoLineOpen??line.video??line.open):(line.phoneOpen??line.phoneLineOpen??line.phone??line.open);
  if(open===false||open==="closed")return NextResponse.json({error:"That line is closed right now. Please leave a voice message from the main site."},{status:423});
  const callerKey=randomBytes(24).toString("hex");const ref=db.collection("liveCalls").doc();
  await ref.set({callerName,callerCity,callType,roomName:"lcs-"+ref.id,callerKeyHash:hashKey(callerKey),status:"waiting",createdAt:new Date(),createdAtMs:Date.now(),source:"phone-system-livekit",onAir:false,muted:false});
  return NextResponse.json({callId:ref.id,callerKey,status:"waiting"},{status:201});
 } catch(error){console.error("Create call failed:",error);return NextResponse.json({error:"Unable to start the call. Please try again."},{status:500});}
}
export async function GET(request:NextRequest){
 if(!isHostRequest(request))return NextResponse.json({error:"Unauthorized host."},{status:401});
 try{const snap=await adminDb().collection("liveCalls").where("status","in",[...ACTIVE]).get();
  const calls=snap.docs.map(d=>{const data=d.data();delete data.callerKey;delete data.callerKeyHash;return{id:d.id,...data};}).sort((a,b)=>Number(b.createdAtMs||0)-Number(a.createdAtMs||0));
  return NextResponse.json({calls});
 }catch(error){console.error("Read call queue failed:",error);return NextResponse.json({error:"Could not load the call queue."},{status:500});}
}
import { NextRequest,NextResponse } from "next/server";
import { createHash,timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/firebase-admin";
import { isHostRequest } from "@/lib/host-auth";
export const runtime="nodejs";
type Action="answer"|"hold"|"resume"|"on-air"|"disconnect"|"reject"|"caller-end";
const matches=(raw:string,stored:string)=>{const a=Buffer.from(createHash("sha256").update(raw).digest("hex"));const b=Buffer.from(stored||"");return a.length===b.length&&timingSafeEqual(a,b);};
export async function POST(request:NextRequest,context:{params:{id:string}}){
 try{
  const body=await request.json();const action=String(body.action||"") as Action;const ref=adminDb().collection("liveCalls").doc(context.params.id);const snap=await ref.get();
  if(!snap.exists)return NextResponse.json({error:"Call not found."},{status:404});
  const call=snap.data()!;const host=isHostRequest(request);
  if(!host&&!(action==="caller-end"&&typeof body.callerKey==="string"&&matches(body.callerKey,call.callerKeyHash)))return NextResponse.json({error:"Unauthorized."},{status:401});
  const changes:Record<string,unknown>={updatedAt:new Date(),updatedAtMs:Date.now()};
  switch(action){
   case "answer":changes.status="approved";changes.answeredAt=new Date();break;
   case "hold":changes.status="held";changes.heldAt=new Date();break;
   case "resume":changes.status="approved";changes.resumedAt=new Date();break;
   case "on-air":changes.status="live";changes.onAir=true;changes.liveSince=Date.now();break;
   case "disconnect":changes.status="ended";changes.onAir=false;changes.endedAt=new Date();break;
   case "reject":changes.status="rejected";changes.onAir=false;changes.endedAt=new Date();break;
   case "caller-end":changes.status="ended";changes.onAir=false;changes.endedAt=new Date();break;
   default:return NextResponse.json({error:"Unknown call action."},{status:400});
  }
  await ref.update(changes);return NextResponse.json({ok:true,status:changes.status});
 }catch(error){console.error("Call action failed:",error);return NextResponse.json({error:"Could not update call state."},{status:500});}
}
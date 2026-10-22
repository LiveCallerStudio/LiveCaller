import {NextRequest,NextResponse} from "next/server";
import {createHash,timingSafeEqual} from "node:crypto";
import {adminDb} from "@/lib/firebase-admin";
export const runtime="nodejs";
const matches=(raw:string,stored:string)=>{const a=Buffer.from(createHash("sha256").update(raw).digest("hex"));const b=Buffer.from(stored||"");return a.length===b.length&&timingSafeEqual(a,b);};
export async function GET(request:NextRequest,context:{params:{id:string}}){
 try{
  const key=request.nextUrl.searchParams.get("callerKey")||"";const snap=await adminDb().collection("liveKitCalls").doc(context.params.id).get();
  if(!snap.exists)return NextResponse.json({error:"Call not found"},{status:404});
  const data=snap.data()!;if(!key||!matches(key,data.callerKeyHash))return NextResponse.json({error:"Caller authorization failed"},{status:401});
  delete data.callerKey;delete data.callerKeyHash;return NextResponse.json({id:snap.id,...data});
 }catch{return NextResponse.json({error:"Could not read call status"},{status:500});}
}
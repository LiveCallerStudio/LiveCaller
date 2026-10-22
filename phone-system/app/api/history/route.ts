import {NextRequest,NextResponse} from "next/server";
import {adminDb} from "@/lib/firebase-admin";
import {isHostRequest} from "@/lib/host-auth";
export const runtime="nodejs";
export async function GET(request:NextRequest){
 if(!isHostRequest(request))return NextResponse.json({error:"Unauthorized host."},{status:401});
 try{
  const snap=await adminDb().collection("callHistory").where("source","==","phone-system-livekit").get();
  const history=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{const time=(x:any)=>x.createdAt?.toMillis?x.createdAt.toMillis():Number(x.createdAtMs||0);return time(b)-time(a);}).slice(0,100);
  return NextResponse.json({history});
 }catch(error){console.error("Call history read failed:",error);return NextResponse.json({error:"Could not load call history."},{status:500});}
}

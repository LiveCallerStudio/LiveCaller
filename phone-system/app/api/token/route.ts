import {NextRequest,NextResponse} from "next/server";
import {createHash,timingSafeEqual} from "node:crypto";
import {AccessToken} from "livekit-server-sdk";
import {adminDb} from "@/lib/firebase-admin";
import {isHostRequest} from "@/lib/host-auth";
export const runtime="nodejs";
const matches=(raw:string,stored:string)=>{const a=Buffer.from(createHash("sha256").update(raw).digest("hex"));const b=Buffer.from(stored||"");return a.length===b.length&&timingSafeEqual(a,b);};
export async function POST(request:NextRequest){
 try{
  const {callId,participant="caller",callerKey,mode="audio"}=await request.json();
  if(!callId||!["caller","host","obs"].includes(participant))return NextResponse.json({error:"A call ID and valid participant are required."},{status:400});
  const snap=await adminDb().collection("liveKitCalls").doc(String(callId)).get();if(!snap.exists)return NextResponse.json({error:"Call not found."},{status:404});
  const call=snap.data()!;if((participant==="host"||participant==="obs")&&!isHostRequest(request))return NextResponse.json({error:"Unauthorized host."},{status:401});
  if(participant==="caller"&&(typeof callerKey!=="string"||!matches(callerKey,call.callerKeyHash)))return NextResponse.json({error:"Caller authorization failed."},{status:401});
  if(["ended","rejected"].includes(call.status))return NextResponse.json({error:"This call has ended."},{status:410});
  const apiKey=process.env.LIVEKIT_API_KEY;const apiSecret=process.env.LIVEKIT_API_SECRET;const serverUrl=process.env.LIVEKIT_URL;
  if(!apiKey||!apiSecret||!serverUrl)return NextResponse.json({error:"LiveKit server credentials are not configured."},{status:503});
  const identity=participant==="host"?"host-"+String(callId):participant==="obs"?"obs-"+String(callId):"caller-"+String(callId);
  const token=new AccessToken(apiKey,apiSecret,{identity,ttl:"2h",name:participant==="host"?"Live Caller Studio Host":String(call.callerName||"Caller")});
  token.addGrant({roomJoin:true,room:String(call.roomName),canPublish:participant!=="obs",canSubscribe:true,canPublishData:participant!=="obs"});
  return NextResponse.json({token:await token.toJwt(),serverUrl,roomName:call.roomName,callType:mode==="video"?"video":"audio"});
 }catch(error){console.error("Token generation failed:",error);return NextResponse.json({error:"Could not create a secure call token."},{status:500});}
}
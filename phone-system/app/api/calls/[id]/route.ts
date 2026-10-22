import {NextRequest,NextResponse} from "next/server";
import {adminDb} from "@/lib/firebase-admin";
export const runtime="nodejs";
export async function GET(request:NextRequest,context:{params:{id:string}}){
 try{
  const key=request.nextUrl.searchParams.get("callerKey")||"";
  const snap=await adminDb().collection("liveCalls").doc(context.params.id).get();
  if(!snap.exists)return NextResponse.json({error:"Call not found"},{status:404});
  const data=snap.data()!;
  if(!key||key!==data.callerKey)return NextResponse.json({error:"Caller authorization failed"},{status:401});
  const {callerKey:_secret,...safe}=data;
  return NextResponse.json({id:snap.id,...safe});
 }catch{return NextResponse.json({error:"Could not read call status"},{status:500});}
}

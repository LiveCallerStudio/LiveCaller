"use client";
import {useEffect,useState} from "react";
import ObsRenderer from "@/components/ObsRenderer";
export default function ObsPage(){
 const [params,setParams]=useState<{token:string;serverUrl:string;mode:"audio"|"video"}|null>(null);
 useEffect(()=>{const p=new URLSearchParams(window.location.search);const token=p.get("token")||"";const serverUrl=p.get("serverUrl")||"";const mode=p.get("mode")==="video"?"video":"audio";if(token&&serverUrl)setParams({token,serverUrl,mode});},[]);
 return <main className="fixed inset-0 overflow-hidden bg-transparent"><style>{ "html,body{background:transparent!important;overflow:hidden!important}" }</style>{params?<ObsRenderer {...params}/>:<div className="grid h-full place-items-center bg-transparent text-center text-sm text-white/50">Waiting for a valid OBS source token…</div>}</main>;
}

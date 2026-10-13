import React,{useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {aiDisclaimer,Report,reviewed,imagingHistoryCompatible} from './domain';
import {getHistoryConclusion,requestHistoryConclusion} from './backend';
import {Button,colors,styles} from './ui';

export default function HistoryConclusion({reports,visible}:{reports:Report[];visible:boolean}){
 const [job,setJob]=useState(''),[summary,setSummary]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const signature=JSON.stringify([visible,[...reports].map(r=>[r.id,r.revision]).sort()]);
 const active=useRef(signature);active.current=signature;
 useEffect(()=>{setJob('');setSummary('');setBusy(false);setError('');},[signature]);
 useEffect(()=>{
  if(!visible||!job)return;
  let cancelled=false;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{const result=await getHistoryConclusion(job);if(cancelled||active.current!==signature)return;
   if(result.status==='done'){setSummary(result.summary||'');setBusy(false);}
   else if(['failed','stale'].includes(result.status)){setError(result.status==='stale'?'A source report changed. Generate a new conclusion.':'AI conclusion is unavailable. Try again.');setBusy(false);}
   else timer=setTimeout(()=>void poll(),2000);
  }catch(caught){if(!cancelled&&active.current===signature){setError(caught instanceof Error?caught.message:'Could not load conclusion.');setBusy(false);}}};
  void poll();return()=>{cancelled=true;clearTimeout(timer);};
 },[signature,job,visible]);
 if(!visible)return null;
 const valid=reports.length>=2&&reports.length<=30&&reports.every(r=>r.dateReviewed&&r.date&&(r.kind==='lab'?r.observations.length>0&&r.observations.every(reviewed):r.kind==='imaging'&&r.conclusionReviewed&&r.conclusion.trim()))&&imagingHistoryCompatible(reports.filter(r=>r.kind==='imaging'));
 async function generate(){const key=signature;setBusy(true);setError('');setSummary('');setJob('');try{const id=await requestHistoryConclusion(reports.map(r=>r.id));if(active.current===key)setJob(id);}catch(caught){if(active.current===key){setError(caught instanceof Error?caught.message:'Could not request conclusion.');setBusy(false);}}}
 return <View style={[styles.card,{gap:12,borderColor:colors.amber}]}><Text style={styles.h2}>AI conclusion · overall evolution</Text><Text style={styles.muted}>What changed across your {reports.length} reports, in two short sentences.</Text><Button label={busy?'Summarizing...':'Generate AI conclusion'} disabled={!valid||busy} onPress={()=>void generate()}/>{!valid&&<Text style={styles.muted}>Choose 2 to 30 reviewed reports with confirmed dates. Imaging reports must cover shared anatomical areas.</Text>}{!!summary&&<><Text style={styles.text}>{summary.replace(aiDisclaimer,'').trim()}</Text><Text style={[styles.muted,{fontSize:12}]}>{aiDisclaimer}</Text></>}{!!error&&<Text accessibilityRole="alert" style={{color:colors.red}}>{error}</Text>}</View>;
}

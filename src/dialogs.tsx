import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, Platform } from 'react-native';
import { Camera, FileText, Upload, X } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { PDFDocument } from 'pdf-lib';
import { Category, MedicalDocument, MedicalEvent, categories, uuid } from './domain';
import { deleteEvent, isDemo, saveEvent, uploadDocument } from './backend';
import { cancelReminder, scheduleReminder } from './device';
import { Button, DatePickerField, TimePickerField, Required, Field, Pill, Sheet, colors, styles } from './ui';

type Props={onClose:()=>void;onSaved:()=>Promise<void>;notify:(s:string)=>void};
function useAction(notify:(s:string)=>void){const[busy,setBusy]=useState(false);const[error,setError]=useState('');return {busy,error,run:async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){const message=e instanceof Error?e.message:'Please try again.';setError(message);notify(message);}finally{setBusy(false);}}};}
function ErrorText({text}:{text:string}){return text?<Text accessibilityRole="alert" style={{color:colors.red,fontSize:13,lineHeight:20}}>{text}</Text>:null;}
export function UploadDialog({mode,onClose,onSaved,notify}:Props&{mode:'file'|'camera'}){
 const {busy,error,run}=useAction(notify);const[picked,setPicked]=useState<{uri:string;name:string;mime:string}[]>([]),[title,setTitle]=useState(''),[category,setCategory]=useState<Category>('Laboratory');
 const uploadAttempt=useRef<{checksum:string;id:string}|null>(null);
 async function choose(camera:boolean){
  if(camera){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted)throw new Error('Camera permission is needed to scan. You can upload an existing file instead.');const result=await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:1,allowsEditing:true});if(!result.canceled){setPicked(prev=>[...prev,{uri:result.assets[0]!.uri,name:'scan-'+Date.now()+'.jpg',mime:'image/jpeg'}]);setTitle(t=>t||'Scanned report');}}
  else{const result=await DocumentPicker.getDocumentAsync({type:['application/pdf','image/jpeg','image/png'],copyToCacheDirectory:true,multiple:false});if(!result.canceled){const a=result.assets[0]!;setPicked([{uri:a.uri,name:a.name,mime:a.mimeType||'application/pdf'}]);setTitle(a.name.replace(/\.[^.]+$/,''));}}
 }
 useEffect(()=>{if(mode==='camera')void run(()=>choose(true));},[]);
 async function read(uri:string){return Platform.OS==='web'?new Uint8Array(await(await fetch(uri)).arrayBuffer()):new File(uri).bytes();}
 async function submit(){
  if(!picked.length)throw new Error('Choose or scan a document first.');if(!title.trim())throw new Error('Add a document title.');
  let bytes=await read(picked[0]!.uri),mime=picked[0]!.mime,name=picked[0]!.name,pages=1;
  if(picked.length>1){if(picked.some(p=>!p.mime.startsWith('image/')))throw new Error('Use only images when combining scan pages.');const pdf=await PDFDocument.create();for(const p of picked){const b=await read(p.uri);const image=p.mime==='image/png'?await pdf.embedPng(b):await pdf.embedJpg(b);const page=pdf.addPage([image.width,image.height]);page.drawImage(image,{x:0,y:0,width:image.width,height:image.height});}bytes=new Uint8Array(await pdf.save());mime='application/pdf';name='scanned-report.pdf';pages=picked.length;}
  if(bytes.byteLength>25*1024*1024)throw new Error('Use a file smaller than 25 MB.');if(mime==='application/pdf'){const pdf=await PDFDocument.load(bytes);pages=pdf.getPageCount();if(pages>50)throw new Error('The MVP supports up to 50 pages per file.');}
  const hash=await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,bytes as Uint8Array<ArrayBuffer>);const checksum=Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
  if(uploadAttempt.current?.checksum!==checksum)uploadAttempt.current={checksum,id:uuid()};
  const doc:MedicalDocument={id:uploadAttempt.current.id,title:title.trim(),filename:name,category,uploadedAt:new Date().toISOString(),status:'queued',pages,bytes:bytes.length,objectKey:'',mime,tags:[],notes:'',rawText:'',checksum};
  await uploadDocument(doc,bytes);await onSaved();notify(isDemo?'Added to this demo session. Paste fictional source text in review to try extraction. Live OCR requires the worker.':'Document saved. Extraction runs locally; review all suggested details against the original.');
 }
 return <Sheet visible title="Add to your health library" subtitle={isDemo?'Demo uploads stay in memory until reload. Use fictional documents only.':'PDF, JPG or PNG · up to 25 MB and 50 pages'} onClose={()=>!busy&&onClose()}><View style={[styles.card,{borderStyle:'dashed',alignItems:'center',gap:15,padding:28}]}><Upload size={30} color={colors.teal}/><Text style={styles.h2}>A clearer record starts here.</Text><Text style={[styles.muted,{textAlign:'center'}]}>Choose a file or photograph each page of a report.</Text><View style={styles.wrap}><Button label="Choose file" icon={Upload} onPress={()=>void run(()=>choose(false))}/><Button label={picked.length?'Scan another page':'Use camera'} icon={Camera} secondary onPress={()=>void run(()=>choose(true))}/></View></View>{picked.map((p,i)=><View key={i} style={styles.between}><View style={[styles.row,{flex:1}]}>{p.mime.startsWith('image')?<Image source={{uri:p.uri}} style={{width:45,height:55,borderRadius:5}}/>:<FileText size={24} color={colors.teal}/>}<Text style={[styles.text,{flex:1}]}>{p.name}</Text></View><Pressable accessibilityLabel={'Remove page '+(i+1)} onPress={()=>setPicked(picked.filter((_,n)=>n!==i))}><X size={17} color={colors.muted}/></Pressable></View>)}<Field label="Document title" value={title} onChange={setTitle}/><Text style={styles.muted}>Category</Text><View style={styles.wrap}>{categories.slice(1).map(c=><Pill key={c} label={c} active={category===c} onPress={()=>setCategory(c as Category)}/>)}</View><ErrorText text={error}/><Button label={busy?'Saving…':'Save document'} disabled={busy||!picked.length} onPress={()=>void run(submit)}/></Sheet>;
}
export function EventDialog({event:initial,allowPrescription=false,onClose,onSaved,notify}:Props&{event:MedicalEvent|string;allowPrescription?:boolean}){
 const {busy,error,run}=useAction(notify);
 const [event,setEvent]=useState<MedicalEvent>(typeof initial==='string'?{id:uuid(),eventType:allowPrescription?'Procedure':'Other',doctor:'',medications:'',title:'',date:initial,time:'',endDate:'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,notes:'',location:'',reminderMinutes:null,reportId:null,documentId:null}:structuredClone(initial));
 const kind=event.eventType||'Other';
 const kinds=allowPrescription?['Procedure','Prescription','Consultation']:event.eventType==='Prescription'?['Procedure','Prescription','Consultation','Other']:['Procedure','Consultation','Other'];
 return <Sheet visible title={allowPrescription?'Care record':typeof initial==='string'?'Add calendar event':'Edit calendar event'} subtitle="Saved care records appear in Documents and Calendar." onClose={()=>!busy&&onClose()}>
 <Text style={styles.h2}>Event type</Text><Required/><View style={styles.wrap}>{kinds.map(type=><Pill key={type} label={type} active={kind===type} onPress={()=>setEvent({...event,eventType:type as MedicalEvent['eventType']})}/>)}</View>
 {kind!=='Consultation'&&<Field required label={kind==='Procedure'?'Procedure name':kind==='Prescription'?'Prescription name':'Event title'} value={event.title} onChange={title=>setEvent({...event,title})}/>}
 <Field required={kind!=='Other'} label="Doctor" value={event.doctor||''} onChange={doctor=>setEvent({...event,doctor})}/>
 <DatePickerField required label={kind==='Consultation'?'Consultation date':kind==='Prescription'?'Prescription date':kind==='Procedure'?'Procedure date':'Event date'} value={event.date} onChange={date=>setEvent({...event,date})}/>
 {(kind==='Consultation'||kind==='Other')&&<TimePickerField label="Time" value={event.time} onChange={time=>setEvent({...event,time})}/>}
 {kind==='Prescription'&&<Field required label="Medications (names, doses and instructions from the prescription)" value={event.medications||''} onChange={medications=>setEvent({...event,medications})} multiline/>}
 <Field label={kind==='Consultation'?'Consultation details':'Details / notes'} value={event.notes} onChange={notes=>setEvent({...event,notes})} multiline/>
 {kind!=='Prescription'&&<Field label="Location" value={event.location} onChange={location=>setEvent({...event,location})}/>}
 {kind==='Other'&&<Field label="End date (optional, for multi-day events)" value={event.endDate} onChange={endDate=>setEvent({...event,endDate})}/>}
 {kind!=='Prescription'&&<Field label="Time zone" value={event.timezone} onChange={timezone=>setEvent({...event,timezone})}/>}
 {(kind==='Consultation'||kind==='Other')&&<><Text style={styles.muted}>Reminder on this device</Text><View style={styles.wrap}>{[null,15,60,1440].map(m=><Pill key={String(m)} label={m===null?'None':m===1440?'1 day before':m+' min before'} active={event.reminderMinutes===m} onPress={()=>setEvent({...event,reminderMinutes:m})}/>)}</View></>}<ErrorText text={error}/>
 <Button label={busy?'Saving...':'Save event'} disabled={busy} onPress={()=>void run(async()=>{const saved={...event,title:kind==='Consultation'?'Consultation':event.title,time:kind==='Procedure'||kind==='Prescription'?'':event.time,endDate:kind==='Other'?event.endDate:'',location:kind==='Prescription'?'':event.location,reminderMinutes:kind==='Procedure'||kind==='Prescription'?null:event.reminderMinutes};await saveEvent(saved);const message=await scheduleReminder(saved);await onSaved();notify(message||'Saved in Documents and Calendar.');})}/>
 {typeof initial!=='string'&&<Button label="Delete event" danger disabled={busy} onPress={()=>void run(async()=>{await deleteEvent(event.id);await cancelReminder(event.id);await onSaved();notify('Record and calendar entry deleted.');})}/>}
 </Sheet>;
}

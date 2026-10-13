import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { ArrowDownToLine, FileText, FlaskConical, ScanLine, Search, FolderOpen, ChevronRight, Camera, FileUp } from 'lucide-react-native';
import { Snapshot, MedicalDocument, MedicalEvent, categories, dateLabel } from '../domain';
import { Badge, Button, CheckRow, Empty, Pill, Sheet, colors, styles } from '../ui';

export default function Documents({ data, onUpload, onOpen, onShare, onShareSelected, onDeleteSelected, onAddCare, onOpenCare }: { onAddCare:()=>void; onOpenCare:(event:MedicalEvent)=>void; data: Snapshot; onUpload: (camera: boolean) => void; onOpen: (d: MedicalDocument) => void; onShare: (d: MedicalDocument) => void; onShareSelected: (documents: MedicalDocument[]) => Promise<void>; onDeleteSelected: (documents: MedicalDocument[]) => Promise<void> }) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState('All documents');
  const [selecting, setSelecting] = useState(false), [selected, setSelected] = useState<string[]>([]), [sharing, setSharing] = useState(false), [deleting, setDeleting] = useState(false), [confirmDelete, setConfirmDelete] = useState(false), [error, setError] = useState('');
  const selection = data.documents.filter(d => selected.includes(d.id));
  const wide = useWindowDimensions().width >= 900;
  const docs = [...data.documents].filter(d => (category === 'All documents' || d.category === category) && [d.title, d.category, d.filename, d.notes, ...d.tags, d.rawText, ...data.reports.filter(r=>r.documentId===d.id).flatMap(r=>[r.panel,r.date,r.facility,...r.observations.map(o=>o.label)])].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const allShownSelected = docs.length > 0 && docs.every(d => selected.includes(d.id));
  const toggleDocument = (id: string) => setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  const toggleAllShown = () => setSelected(ids => allShownSelected ? ids.filter(id => !docs.some(d => d.id === id)) : [...new Set([...ids, ...docs.map(d => d.id)])]);
  const deleteSelection = async () => {
    setDeleting(true); setError('');
    try { await onDeleteSelected(selection); setSelected([]); setSelecting(false); setConfirmDelete(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not delete the selected documents.'); setConfirmDelete(false); }
    finally { setDeleting(false); }
  };
  const pending = data.documents.filter(d => d.status === 'review').length;
  const careCategory = (event:MedicalEvent) => event.eventType==='Procedure'?'Procedures':event.eventType==='Prescription'?'Prescriptions':'Consultations';
  const care = data.events.filter(event=>!event.documentId && event.eventType && event.eventType!=='Other' && (category==='All documents'||category===careCategory(event)) && [event.title,event.doctor,event.notes,event.medications,event.date].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date));
  return <View style={{ gap: 20 }}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}><Button label="Scan Document" icon={Camera} secondary pill small={!wide} onPress={() => onUpload(true)} /></View>
      <View style={{ flex: 1 }}><Button label="Upload Document" icon={FileUp} pill small={!wide} onPress={() => onUpload(false)} /></View>
    </View>
    <Button label="Add procedure, prescription or consultation" secondary onPress={onAddCare}/>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={[styles.card,{flex:1,gap:12,justifyContent:'center',padding:16}]}><View style={styles.between}><Text style={styles.muted}>In your library</Text><FolderOpen size={19} color={colors.teal}/></View><Text style={{fontSize:34,color:colors.ink,fontWeight:'500'}}>{data.documents.filter(d=>['Laboratory','Imaging','Pathology'].includes(d.category)).length}</Text></View>
      <View style={[styles.card,{flex:1,gap:12,justifyContent:'center',padding:16}]}><View style={styles.between}><Text style={styles.muted}>Ready for your review</Text><ScanLine size={19} color={colors.amber}/></View><Text style={{fontSize:34,color:colors.ink,fontWeight:'500'}}>{pending}</Text></View>
    </View>
    <View style={[styles.between,{flexWrap:'wrap'}]}><Text style={styles.h2}>Your documents <Text style={{color:colors.muted,fontSize:13,fontWeight:'400'}}> / {docs.length+care.length}</Text></Text><View style={[styles.row,{backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,borderRadius:10,paddingHorizontal:12,width:wide?300:'100%'}]}><Search size={16} color={colors.muted}/><TextInput accessibilityLabel="Search documents" placeholder="Search documents, dates, or results…" value={query} onChangeText={setQuery} placeholderTextColor={colors.muted} style={{flex:1,paddingVertical:12,fontSize:12,color:colors.ink}}/></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingBottom:2}}>{categories.map(c=><Pill key={c} label={c} active={category===c} onPress={()=>setCategory(c)}/>)}</ScrollView>
    <View style={styles.wrap}><Button label={selecting?'Finish selection':'Select documents'} secondary small onPress={()=>{setSelecting(!selecting);setSelected([]);setError('');}}/></View>
    {care.length>0&&<View style={{gap:12}}><Text style={styles.h2}>Care records</Text>{care.map(event=><Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`Edit ${event.eventType}: ${event.title}`} onPress={()=>onOpenCare(event)} style={[styles.card,{gap:8}]}><Badge label={careCategory(event)}/><Text style={styles.h2}>{event.title}</Text><Text style={styles.muted}>{dateLabel(event.date)}{event.doctor?` · ${event.doctor}`:''}</Text>{!!event.medications&&<Text style={styles.text}>{event.medications}</Text>}{!!event.notes&&<Text style={styles.muted}>{event.notes}</Text>}<Text style={{color:colors.teal}}>Edit record · Synced with Calendar</Text></Pressable>)}</View>}
    {selecting && <View style={[styles.card,{padding:16,gap:12}]}>
      <CheckRow label={`Select all ${docs.length} shown`} checked={allShownSelected} onChange={toggleAllShown} />
      <Text style={styles.muted}>{selection.length} selected</Text>
      <View style={styles.wrap}>
        <Button label={`Share PDF (${selection.length})`} disabled={sharing||deleting||!selection.length||selection.length>20} small onPress={()=>{setSharing(true);void onShareSelected(selection).finally(()=>setSharing(false));}}/>
        <Button label={`Delete (${selection.length})`} danger disabled={sharing||deleting||!selection.length} small onPress={()=>setConfirmDelete(true)}/>
      </View>
      <Text style={styles.muted}>PDF sharing supports up to 20 PDF or image documents, 100 MB total.</Text>
      {!!error && <Text accessibilityRole="alert" style={{color:colors.red}}>{error}</Text>}
    </View>}
    {(docs.length>0||care.length===0)&&<View style={[styles.card,{padding:0,overflow:'hidden'}]}>
      {wide && <View style={{flexDirection:'row',backgroundColor:'#F1F5EF',paddingHorizontal:22,paddingVertical:13}}><Text style={[styles.eyebrow,{flex:3,color:colors.muted,letterSpacing:1}]}>DOCUMENT</Text><Text style={[styles.eyebrow,{flex:1.4,color:colors.muted,letterSpacing:1}]}>EXAMINATION</Text><Text style={[styles.eyebrow,{flex:1.4,color:colors.muted,letterSpacing:1}]}>STATUS</Text><View style={{width:65}}/></View>}
      {docs.length===0 && care.length===0 && <Empty title="No documents here yet" detail="Upload a report or try a different search. Your originals and extracted details will appear here."/>}
      {docs.map((d,i)=>{const r=data.reports.find(r=>r.documentId===d.id);const Icon=d.category==='Laboratory'?FlaskConical:d.category==='Imaging'?ScanLine:FileText;return <View key={d.id} style={{borderTopWidth:i?1:0,borderColor:colors.border,flexDirection:'row',alignItems:'center',padding:wide?22:16,gap:12}}>{selecting&&<CheckRow compact label={'Select '+d.title} checked={selected.includes(d.id)} onChange={()=>toggleDocument(d.id)}/>}<Pressable accessibilityRole="button" accessibilityLabel={`${selecting ? selected.includes(d.id) ? 'Deselect' : 'Select' : 'Open'} ${d.title}`} onPress={()=>selecting?toggleDocument(d.id):onOpen(d)} style={{flex:wide?3:1,flexDirection:'row',alignItems:'center',gap:14}}><View style={{width:43,height:49,borderRadius:10,backgroundColor:d.category==='Imaging'?'#EDF0F8':colors.light,alignItems:'center',justifyContent:'center'}}><Icon size={21} strokeWidth={1.5} color={d.category==='Imaging'?'#777FA7':colors.teal}/></View><View style={{flex:1,gap:5}}><Text style={{fontSize:14,fontWeight:'600',color:colors.ink}}>{d.title}</Text><Text style={[styles.muted,{fontSize:11}]}>{d.category}  ·  {d.pages||'—'} {d.pages===1?'page':'pages'}  ·  {r?.facility||'Facility not added'}</Text>{!wide&&<Badge label={d.status==='ready'?'Accepted':d.status==='review'?'Needs approval':d.status} pending={d.status!=='ready'}/>}</View></Pressable>{wide&&<><Text style={[styles.muted,{flex:1.4,fontSize:12}]}>{r?.date?dateLabel(r.date):'Not confirmed'}</Text><View style={{flex:1.4}}><Badge label={d.status==='ready'?'Accepted':d.status==='review'?'Needs approval':d.status} pending={d.status!=='ready'}/></View></>}{!selecting&&<View style={[styles.row,{gap:2,width:wide?65:32}]}>{wide&&<Pressable accessibilityRole="button" accessibilityLabel={`Download ${d.title}`} onPress={()=>onShare(d)} style={{padding:7}}><ArrowDownToLine size={16} color={colors.muted}/></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel={`Review ${d.title}`} onPress={()=>onOpen(d)} style={{padding:7}}><ChevronRight size={18} color={colors.muted}/></Pressable></View>}</View>})}
    </View>}
    <Sheet visible={confirmDelete} title={`Delete ${selection.length} document${selection.length===1?'':'s'}?`} onClose={()=>!deleting&&setConfirmDelete(false)}>
      <Text style={styles.muted}>This permanently removes the selected originals and their saved report details. This cannot be undone.</Text>
      <View style={styles.wrap}><Button label="Cancel" secondary disabled={deleting} onPress={()=>setConfirmDelete(false)}/><Button label={deleting?'Deleting…':`Delete ${selection.length} document${selection.length===1?'':'s'}`} danger disabled={deleting} onPress={()=>void deleteSelection()}/></View>
    </Sheet>
  </View>;
}

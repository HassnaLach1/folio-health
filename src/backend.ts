import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { MedicalDocument, MedicalEvent, Report, Snapshot, eventSchema, reportSchema, uuid, interpretationInputs } from './domain';
import { demoSnapshot } from './demo';
import { UserProfile, emptyProfile, profileSchema } from './userProfile';

let demoProfile = {...emptyProfile};
export async function loadProfile():Promise<UserProfile>{
  if(!supabase)return {...demoProfile,aiHelp:demoProfile.aiHelp===null?null:demo.preferences?.showAiInterpretation??false};
  const {data,error}=await supabase.rpc('get_profile');check(error);
  return data?profileSchema.parse(data):{...emptyProfile};
}
export async function saveProfile(profile:UserProfile){
  const validated=profileSchema.parse(profile);
  if(!supabase){demoProfile=validated;if(validated.aiHelp!==null)demo.preferences={showAiInterpretation:validated.aiHelp};return;}
  const {error}=await supabase.rpc('save_profile',{item:validated});check(error);
}
export async function profilePhotoUrl(path:string):Promise<string>{
  if(!supabase)return path;
  const {data,error}=await supabase.storage.from('profile-photos').createSignedUrl(path,3600);check(error);return data!.signedUrl;
}
export async function uploadProfilePhoto(bytes:Uint8Array,mime:string):Promise<string>{
  if(!['image/jpeg','image/png'].includes(mime)||bytes.length>5242880)throw new Error('Choose a JPEG or PNG photo under 5 MB.');
  if(!supabase)throw new Error('Connect the local backend to save a profile photo.');
  const {data:{user},error:authError}=await supabase.auth.getUser();check(authError);
  if(!user)throw new Error('Sign in first.');
  const path=`${user.id}/${uuid()}.${mime==='image/png'?'png':'jpg'}`;
  const {error}=await supabase.storage.from('profile-photos').upload(path,bytes,{contentType:mime});check(error);return path;
}
export async function deleteProfilePhoto(path:string){
  if(!supabase)return;
  const {error}=await supabase.storage.from('profile-photos').remove([path]);check(error);
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
// Only auth tokens use browser session storage; medical content is never cached there.
const memory = new Map<string, string>();
const secureStorage = {
  getItem: async (key: string) => {
    if (Platform.OS !== 'web') return SecureStore.getItemAsync(key);
    try { return window.sessionStorage.getItem(key); } catch { return memory.get(key) ?? null; }
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS !== 'web') return SecureStore.setItemAsync(key, value);
    try { window.sessionStorage.setItem(key, value); } catch { memory.set(key, value); }
  },
  removeItem: async (key: string) => {
    if (Platform.OS !== 'web') return SecureStore.deleteItemAsync(key);
    try { window.sessionStorage.removeItem(key); } catch { memory.delete(key); }
  }
};
export const supabase = url && key ? createClient(url, key, { auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType:'pkce' } }) : null;
export async function googleSignInAvailable():Promise<boolean>{
  if(!url||!key)return false;
  const response=await fetch(`${url.replace(/\/$/,'')}/auth/v1/settings`,{headers:{apikey:key}});
  if(!response.ok)throw new Error('Could not check sign-in options.');
  const settings=await response.json();return settings.external?.google===true;
}
export const isDemo = !supabase;
export async function requestHistoryConclusion(ids:string[]):Promise<string>{
 if(!supabase)throw new Error('AI conclusions need the local backend and Bedrock worker.');
 const {data,error}=await supabase.rpc('request_history_conclusion',{ids});check(error);return data as string;
}
export async function getHistoryConclusion(id:string):Promise<{status:string;summary:string|null}>{
 if(!supabase)throw new Error('AI conclusions need the local backend.');
 const {data,error}=await supabase.rpc('get_history_conclusion',{comparison_id:id});check(error);return data;
}
export async function requestImagingComparison(earlier: string, later: string): Promise<string> {
  if (!supabase) throw new Error('Live AI comparisons need the local backend and Bedrock worker.');
  const { data, error } = await supabase.rpc('request_imaging_comparison', { earlier, later }); check(error); return data as string;
}
export async function getImagingComparison(id: string): Promise<{ status: string; summary: string | null }> {
  if (!supabase) throw new Error('Live AI comparisons need the local backend.');
  const { data, error } = await supabase.rpc('get_imaging_comparison', { comparison_id: id }); check(error); return data;
}
export interface DoctorBundle { documents: { id: string; title: string; category: string; mime: string; signedUrl: string }[]; reports: Report[]; expiresAt?: string }
export async function createDoctorAccess(snapshot: Snapshot): Promise<{ link: string; expiresAt: string }> {
  if (!supabase) throw new Error('Doctor access needs the local Supabase backend.');
  const base = Platform.OS === 'web' ? window.location.origin : process.env.EXPO_PUBLIC_DOCTOR_VIEW_URL;
  if (!base) throw new Error('Set EXPO_PUBLIC_DOCTOR_VIEW_URL to the app web address reachable by the doctor.');
  if (['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Open Folio using your computer’s LAN address before creating a link for another device.');
  if (!__DEV__ && new URL(base).protocol !== 'https:') throw new Error('Doctor access requires HTTPS outside local development.');
  const selected = snapshot.documents.filter(doc => doc.status === 'ready');
  if (!selected.length) throw new Error('Review a document before creating doctor access.');
  if (selected.length > 100) throw new Error('Doctor access currently supports up to 100 reviewed documents.');
  const documents: DoctorBundle['documents'] = [];
  for (const doc of selected) {
    const { data, error } = await supabase.storage.from('medical-documents').createSignedUrl(doc.objectKey, 900);
    check(error);
    if (['localhost', '127.0.0.1'].includes(new URL(data!.signedUrl).hostname)) throw new Error('Set the local Supabase URL to your computer’s LAN address so the doctor can open originals.');
    if (!__DEV__ && new URL(data!.signedUrl).protocol !== 'https:') throw new Error('Original-file links require HTTPS outside local development.');
    documents.push({ id: doc.id, title: doc.title, category: doc.category, mime: doc.mime, signedUrl: data!.signedUrl });
  }
  const records: DoctorBundle = { documents, reports: snapshot.reports.filter(report => selected.some(doc => doc.id === report.documentId)).map(({ aiInterpretation, educationalNote, ...sourceReport }) => sourceReport) };
  const { data, error } = await supabase.rpc('create_doctor_access', { records }); check(error);
  const result = data as { token: string; expiresAt: string };
  return { link: `${base.replace(/\/$/, '')}/#doctor-access=${encodeURIComponent(result.token)}`, expiresAt: result.expiresAt };
}
export async function doctorAccessStatus(): Promise<{ expiresAt: string; redeemedAt: string | null } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('doctor_access_status'); check(error);
  return data as { expiresAt: string; redeemedAt: string | null } | null;
}
export async function revokeDoctorAccess() {
  if (!supabase) return;
  const { error } = await supabase.rpc('revoke_doctor_access'); check(error);
}
export async function redeemDoctorAccess(token: string): Promise<DoctorBundle | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('redeem_doctor_access', { secret: token }); check(error);
  return data as DoctorBundle | null;
}
let demo = demoSnapshot();
const localFiles = new Map<string, Uint8Array>();
const check = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
export async function loadSnapshot(): Promise<Snapshot> {
  if (!supabase) return structuredClone(demo);
  const { data, error } = await supabase.rpc('get_snapshot'); check(error);
  return data as Snapshot;
}
export async function saveDocument(document: MedicalDocument) {
  if (!supabase) { demo.documents = demo.documents.map(d => d.id === document.id ? document : d); demo.events = demo.events.map(e => e.documentId === document.id ? { ...e, title: document.title } : e); return; }
  const { error } = await supabase.rpc('edit_document', { doc_id: document.id, new_title: document.title, new_category: document.category, new_notes: document.notes, new_tags: document.tags }); check(error);
}
export async function setAiInterpretationPreference(enabled: boolean) {
  if (!supabase) { demo.preferences = { showAiInterpretation: enabled }; return; }
  const { error } = await supabase.rpc('set_ai_interpretation_preference', { enabled }); check(error);
}
export async function approveDocument(id: string) {
  if (!supabase) {
    const document = demo.documents.find(d => d.id === id);
    if (!document) throw new Error('Document not found');
    demo.documents = demo.documents.map(d => d.id === id ? { ...d, status: 'ready' } : d);
    return;
  }
  const { error } = await supabase.rpc('approve_document', { doc_id: id }); check(error);
}
export async function uploadDocument(document: MedicalDocument, bytes: Uint8Array) {
  if (!supabase) {
    if (demo.documents.some(d => d.checksum === document.checksum)) throw new Error('This exact file is already in your documents.');
    demo.documents.unshift({ ...document, status: 'review' }); localFiles.set(document.id, bytes); return;
  }
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Sign in first.');
  const { data: uploadId, error: createError } = await supabase.rpc('begin_upload', { doc: document }); check(createError);
  const id = uploadId as string;
  const path = `${user.user.id}/${id}/original`;
  const { data: pending, error: stateError } = await supabase.from('documents').select('status').eq('id', id).single(); check(stateError);
  // A lost finalize response can be retried even after the worker has started.
  if (!pending) throw new Error('Upload unavailable. Please retry.');
  if (pending.status !== 'uploading') return;
  const { error } = await supabase.storage.from('medical-documents').upload(path, bytes.buffer as ArrayBuffer, { contentType: document.mime, upsert: true }); check(error);
  const { error: finalizeError } = await supabase.rpc('finish_upload', { doc_id: id }); check(finalizeError);
}
export async function saveReport(report: Report) {
  reportSchema.parse(report);
  if (!supabase) {
    const existing = demo.reports.find(r => r.id === report.id);
    if (existing && existing.revision !== report.revision) throw new Error('This report changed. Reload before saving.');
    demo.reports = [...demo.reports.filter(r => r.id !== report.id), { ...report, aiInterpretation: existing && interpretationInputs(existing) === interpretationInputs(report) ? existing.aiInterpretation : null, revision: report.revision + 1 }];
    demo.documents = demo.documents.map(d => d.id === report.documentId ? { ...d, status: 'review' } : d);
    demo.events = demo.events.filter(e => !(e.documentId === report.documentId && !e.reportId));
    if (report.dateReviewed) {
      const existingEvent = demo.events.find(e => e.reportId === report.id);
      const title = demo.documents.find(d => d.id === report.documentId)?.title ?? report.panel;
      demo.events = [...demo.events.filter(e => e.reportId !== report.id), { id: existingEvent?.id ?? uuid(), title, date: report.date, time: '', endDate: '', timezone: 'Africa/Casablanca', notes: '', location: report.facility, reminderMinutes: null, reportId: report.id, documentId: report.documentId }];
    } else demo.events = demo.events.filter(e => e.reportId !== report.id);
    return;
  }
  const { error } = await supabase.rpc('save_report', { report }); check(error);
}
export async function saveEvent(event: MedicalEvent) {
  eventSchema.parse(event);
  if (event.reportId) throw new Error('Change an examination date through its source report.');
  if (!supabase) { demo.events = [...demo.events.filter(e => e.id !== event.id), {...event,medications:event.eventType==='Prescription'?event.medications||'':''}]; return; }
  const { error } = await supabase.rpc('save_event', { event }); check(error);
}
export async function deleteEvent(id: string) {
  if (!supabase) { demo.events = demo.events.filter(e => e.id !== id || e.reportId); return; }
  const { error } = await supabase.rpc('delete_event', { event_id: id }); check(error);
}
export async function deleteDocument(id: string) {
  if (!supabase) { demo.documents = demo.documents.filter(d => d.id !== id); demo.reports = demo.reports.filter(r => r.documentId !== id); demo.events = demo.events.filter(e => e.documentId !== id); localFiles.delete(id); return; }
  const { data: document, error: lookupError } = await supabase.from('documents').select('object_key').eq('id', id).single(); check(lookupError);
  if (!document) throw new Error('Document not found');
  const { error: removeError } = await supabase.storage.from('medical-documents').remove([document.object_key]); check(removeError);
  const { error } = await supabase.rpc('delete_document_manual', { doc_id: id }); check(error);
}
export async function retryDocument(id: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc('retry_processing', { doc_id: id }); check(error);
}
export async function startManualReview(id: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc('start_manual_review', { doc_id: id }); check(error);
}
export async function originalBytes(document: MedicalDocument): Promise<Uint8Array | null> {
  if (!supabase) return localFiles.get(document.id) ?? null;
  const { data, error } = await supabase.storage.from('medical-documents').download(document.objectKey); check(error);
  return new Uint8Array(await data!.arrayBuffer());
}
export function resetDemo() { demo = demoSnapshot(); demoProfile={...emptyProfile}; localFiles.clear(); }

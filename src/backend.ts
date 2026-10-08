import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { MedicalDocument, MedicalEvent, Report, Snapshot, eventSchema, reportSchema, reportReviewed, uuid } from './domain';
import { demoSnapshot } from './demo';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
// Web authentication is memory-only. Medical content is never written to localStorage.
const memory = new Map<string, string>();
const secureStorage = {
  getItem: async (key: string) => Platform.OS === 'web' ? memory.get(key) ?? null : SecureStore.getItemAsync(key),
  setItem: async (key: string, value: string) => { if (Platform.OS === 'web') memory.set(key, value); else await SecureStore.setItemAsync(key, value); },
  removeItem: async (key: string) => { if (Platform.OS === 'web') memory.delete(key); else await SecureStore.deleteItemAsync(key); }
};
export const supabase = url && key ? createClient(url, key, { auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }) : null;
export const isDemo = !supabase;
let demo = demoSnapshot();
const localFiles = new Map<string, Uint8Array>();
const check = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
export async function loadSnapshot(): Promise<Snapshot> {
  if (!supabase) return structuredClone(demo);
  const { data, error } = await supabase.rpc('get_snapshot'); check(error);
  return data as Snapshot;
}
export async function saveDocument(document: MedicalDocument) {
  if (!supabase) { demo.documents = demo.documents.map(d => d.id === document.id ? document : d); return; }
  const { error } = await supabase.rpc('edit_document', { doc_id: document.id, new_title: document.title, new_category: document.category, new_notes: document.notes, new_tags: document.tags }); check(error);
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
  // The worker confirms storage, file signature, length and checksum before finalizing.
  const { error: finalizeError } = await supabase.rpc('finish_upload', { doc_id: id }); check(finalizeError);
}
export async function saveReport(report: Report) {
  reportSchema.parse(report);
  if (!supabase) {
    const existing = demo.reports.find(r => r.id === report.id);
    if (existing && existing.revision !== report.revision) throw new Error('This report changed. Reload before saving.');
    demo.reports = [...demo.reports.filter(r => r.id !== report.id), { ...report, revision: report.revision + 1 }];
    const related = demo.reports.filter(r => r.documentId === report.documentId);
    demo.documents = demo.documents.map(d => d.id === report.documentId ? { ...d, status: related.every(reportReviewed) ? 'ready' : 'review' } : d);
    if (report.dateReviewed) {
      const existingEvent = demo.events.find(e => e.reportId === report.id);
      demo.events = [...demo.events.filter(e => e.reportId !== report.id), { id: existingEvent?.id ?? uuid(), title: report.panel, date: report.date, time: '', endDate: '', timezone: 'Africa/Casablanca', notes: '', location: report.facility, reminderMinutes: null, reportId: report.id, documentId: report.documentId }];
    } else demo.events = demo.events.filter(e => e.reportId !== report.id);
    return;
  }
  const { error } = await supabase.rpc('save_report', { report }); check(error);
}
export async function saveEvent(event: MedicalEvent) {
  eventSchema.parse(event);
  if (event.reportId) throw new Error('Change an examination date through its source report.');
  if (!supabase) { demo.events = [...demo.events.filter(e => e.id !== event.id), event]; return; }
  const { error } = await supabase.rpc('save_event', { event }); check(error);
}
export async function deleteEvent(id: string) {
  if (!supabase) { demo.events = demo.events.filter(e => e.id !== id || e.reportId); return; }
  const { error } = await supabase.rpc('delete_event', { event_id: id }); check(error);
}
export async function deleteDocument(id: string) {
  if (!supabase) { demo.documents = demo.documents.filter(d => d.id !== id); demo.reports = demo.reports.filter(r => r.documentId !== id); demo.events = demo.events.filter(e => e.documentId !== id); localFiles.delete(id); return; }
  const { error } = await supabase.rpc('request_document_deletion', { doc_id: id }); check(error);
}
export async function retryDocument(id: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc('retry_processing', { doc_id: id }); check(error);
}
export async function originalBytes(document: MedicalDocument): Promise<Uint8Array | null> {
  if (!supabase) return localFiles.get(document.id) ?? null;
  const { data, error } = await supabase.storage.from('medical-documents').download(document.objectKey); check(error);
  return new Uint8Array(await data!.arrayBuffer());
}
export function resetDemo() { demo = demoSnapshot(); localFiles.clear(); }

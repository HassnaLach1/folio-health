import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { PDFDocument } from 'pdf-lib';
import { MedicalDocument, MedicalEvent, Report, escapeHtml, exportHtml } from './domain';
import { originalBytes } from './backend';

export async function shareDocuments(documents: MedicalDocument[]) {
  if (!documents.length || documents.length > 20) throw new Error('Select between 1 and 20 documents.');
  if (documents.reduce((sum, doc) => sum + doc.bytes, 0) > 100 * 1024 * 1024) throw new Error('Share fewer documents: the selection exceeds 100 MB.');
  const merged = await PDFDocument.create();
  for (const doc of documents) {
    const bytes = await originalBytes(doc);
    if (!bytes) throw new Error('One selected document has no original file. Remove it and try again.');
    try {
      if (doc.mime === 'application/pdf') {
        const source = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach(page => merged.addPage(page));
      } else if (doc.mime === 'image/png' || doc.mime === 'image/jpeg') {
        const image = doc.mime === 'image/png' ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
        const page = merged.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      } else throw new Error('Unsupported file type');
    } catch { throw new Error(`Could not add ${doc.title} to the PDF. Check that its original file opens.`); }
  }
  const bytes = await merged.save();
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
    const link = document.createElement('a'); link.href = url; link.download = 'selected-documents.pdf'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000); return;
  }
  const uri = FileSystem.cacheDirectory + `share-selection-${Date.now()}.pdf`;
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  try {
    await FileSystem.writeAsStringAsync(uri, btoa(binary), { encoding: FileSystem.EncodingType.Base64 });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share selected documents' });
  } finally { setTimeout(() => void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}), 60000); }
}

export async function printReports(reports: Report[], title: string, includeUnreviewed: boolean) {
  const html = exportHtml(reports, title, includeUnreviewed);
  if (Platform.OS === 'web') {
    // Expo's web printer prints the current window. Isolate the report-only document.
    await new Promise<void>((resolve,reject)=>{
      const frame=document.createElement('iframe');frame.title='Report PDF';frame.setAttribute('aria-hidden','true');
      Object.assign(frame.style,{position:'fixed',width:'0',height:'0',border:'0'});
      const cleanup=()=>frame.remove();
      frame.onload=()=>{try{const view=frame.contentWindow;if(!view)throw new Error('Could not open report PDF.');view.addEventListener('afterprint',cleanup,{once:true});view.focus();view.print();setTimeout(cleanup,60000);resolve();}catch(error){cleanup();reject(error);}};
      frame.srcdoc=`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${html}</body></html>`;
      document.body.appendChild(frame);
    });return;
  }
  const result = await Print.printToFileAsync({ html });
  try { await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Save or share comparison' }); }
  finally { setTimeout(() => void FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {}), 60000); }
}
export async function shareDocument(doc: MedicalDocument) {
  const bytes = await originalBytes(doc);
  if (!bytes) {
    const html = `<h1>Synthetic sample</h1><pre>${escapeHtml(doc.rawText)}</pre>`;
    if (Platform.OS === 'web') return Print.printAsync({ html });
    const result = await Print.printToFileAsync({ html });
    try { await Sharing.shareAsync(result.uri); }
    finally { setTimeout(() => void FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {}), 60000); }
    return;
  }
  if (Platform.OS === 'web') {
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: doc.mime });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = doc.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); return;
  }
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  const uri = FileSystem.cacheDirectory + `share-${doc.id}.${doc.mime === 'application/pdf' ? 'pdf' : doc.mime === 'image/png' ? 'png' : 'jpg'}`;
  await FileSystem.writeAsStringAsync(uri, btoa(binary), { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType: doc.mime });
  setTimeout(() => void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}), 60000);
}
export async function cleanShareCache() {
  if (Platform.OS === 'web' || !FileSystem.cacheDirectory) return;
  const names = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
  for (const name of names.filter(n => n.startsWith('share-') || n.startsWith('review-'))) await FileSystem.deleteAsync(FileSystem.cacheDirectory + name, { idempotent: true });
}
export async function cancelReminder(id: string) { if (Platform.OS !== 'web') await Notifications.cancelScheduledNotificationAsync(id); }
export async function scheduleReminder(event: MedicalEvent) {
  if (Platform.OS === 'web') return event.reminderMinutes === null ? '' : 'Event saved. Device reminders are available in the Android/iOS app.';
  await cancelReminder(event.id);
  if (event.reminderMinutes === null) return '';
  if (event.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone) return 'Event saved. Reminder not scheduled: select this device’s time zone.';
  const date = new Date(`${event.date}T${event.time}:00`); date.setMinutes(date.getMinutes() - event.reminderMinutes);
  if (date <= new Date()) return 'Event saved. Reminder time is in the past.';
  const permission = await Notifications.requestPermissionsAsync();
  if (!(permission as { granted: boolean }).granted) return 'Event saved. Notifications are disabled in device settings.';
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('appointments', { name: 'Appointments', importance: Notifications.AndroidImportance.DEFAULT });
  await Notifications.scheduleNotificationAsync({ identifier: event.id, content: { title: 'Upcoming event', body: 'Open Folio to see your appointment.', data: { eventId: event.id } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'appointments' } });
  return 'Reminder scheduled on this device.';
}

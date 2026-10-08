import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { MedicalDocument, MedicalEvent, Report, escapeHtml, exportHtml } from './domain';
import { originalBytes } from './backend';
import { archive, ArchiveEntry } from './archive';

export async function shareDocuments(documents: MedicalDocument[]) {
  if (!documents.length || documents.length > 20) throw new Error('Select between 1 and 20 documents.');
  if (documents.reduce((sum, doc) => sum + doc.bytes, 0) > 100 * 1024 * 1024) throw new Error('Share fewer documents: the selection exceeds 100 MB.');
  const entries: ArchiveEntry[] = [];
  for (const doc of documents) {
    const bytes = await originalBytes(doc);
    entries.push(bytes ? { name: doc.filename, bytes } : { name: doc.filename + '.synthetic.txt', bytes: new TextEncoder().encode('SYNTHETIC SAMPLE — no original file\n\n' + doc.rawText) });
  }
  const bytes = archive(entries);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' }));
    const link = document.createElement('a'); link.href = url; link.download = 'selected-documents.zip'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000); return;
  }
  const uri = FileSystem.cacheDirectory + `share-selection-${Date.now()}.zip`;
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  try {
    await FileSystem.writeAsStringAsync(uri, btoa(binary), { encoding: FileSystem.EncodingType.Base64 });
    await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'Share selected documents' });
  } finally { setTimeout(() => void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}), 60000); }
}

export async function printReports(reports: Report[], title: string, includeUnreviewed: boolean) {
  const html = exportHtml(reports, title, includeUnreviewed);
  if (Platform.OS === 'web') { await Print.printAsync({ html }); return; }
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
  for (const name of names.filter(n => n.startsWith('share-'))) await FileSystem.deleteAsync(FileSystem.cacheDirectory + name, { idempotent: true });
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
  if (!permission.granted) return 'Event saved. Notifications are disabled in device settings.';
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('appointments', { name: 'Appointments', importance: Notifications.AndroidImportance.DEFAULT });
  await Notifications.scheduleNotificationAsync({ identifier: event.id, content: { title: 'Upcoming event', body: 'Open Folio to see your appointment.', data: { eventId: event.id } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'appointments' } });
  return 'Reminder scheduled on this device.';
}

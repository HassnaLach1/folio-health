// Run explicitly against a disposable local Supabase stack; never against a hosted project.
import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';

const url = process.env.LOCAL_SUPABASE_URL;
const publishable = process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
if (!url?.startsWith('http://127.0.0.1:') || !publishable || !service) throw new Error('Local Supabase settings are required.');
const admin = createClient(url, service, { auth: { persistSession: false } });
const app = createClient(url, publishable, { auth: { persistSession: false } });
const value = ({ data, error }) => { if (error) throw error; return data; };
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = ''; for (const letter of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(letter).toString(2).padStart(5, '0');
  const bytes = Buffer.from(bits.match(/.{8}/g).map(part => parseInt(part, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', bytes).update(counter).digest();
  const offset = hash.at(-1) & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}

const email = `folio-smoke-${randomUUID()}@example.test`;
const password = `LocalSmoke-${randomUUID()}`;
let userId;
const paths = [];
try {
  userId = value(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
  value(await app.auth.signInWithPassword({ email, password }));
  if (!Array.isArray(value(await app.rpc('get_snapshot')).documents)) throw new Error('Password-only snapshot access failed.');
  const factor = value(await app.auth.mfa.enroll({ factorType: 'totp' }));
  value(await app.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(factor.totp.secret) }));
  const documentId = randomUUID();
  const bytes = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const doc = { id: documentId, title: 'Synthetic local smoke test', filename: 'smoke.pdf', category: 'Other', pages: 1, bytes: bytes.length, mime: 'application/pdf', checksum };
  value(await app.rpc('begin_upload', { doc }));
  const path = `${userId}/${documentId}/original`;
  paths.push(path);
  value(await app.storage.from('medical-documents').upload(path, bytes, { contentType: 'application/pdf' }));
  value(await app.rpc('finish_upload_manual', { doc_id: documentId }));
  const report = { id: randomUUID(), documentId, kind: 'other', panel: 'Synthetic test', date: '2026-10-09', dateReviewed: true, facility: '', bodyRegion: '', conclusion: 'No medical content', conclusionReviewed: true, revision: 0, observations: [] };
  value(await app.rpc('save_report', { report }));
  const snapshot = value(await app.rpc('get_snapshot'));
  if (!snapshot.documents.some(d => d.id === documentId) || !snapshot.reports.some(r => r.id === report.id)) throw new Error('Manual report did not appear in snapshot.');
  if (snapshot.documents.find(d => d.id === documentId)?.status !== 'review') throw new Error('Saving details approved the document without an explicit action.');
  value(await app.rpc('approve_document', { doc_id: documentId }));
  const approved = value(await app.rpc('get_snapshot'));
  if (approved.documents.find(d => d.id === documentId)?.status !== 'ready') throw new Error('Document approval did not change status.');
  if (!approved.events.some(e => e.documentId === documentId && e.reportId === report.id) ||
      !approved.events.some(e => e.documentId === documentId && !e.reportId && e.title === doc.title)) throw new Error('Approval did not create calendar entries with the document title.');
  const approvals = value(await app.from('document_approvals').select('document_id').eq('document_id', documentId));
  if (approvals.length !== 1) throw new Error('Approval table row missing.');
  const savedReport = approved.reports.find(r => r.id === report.id);
  value(await app.rpc('save_report', { report: { ...savedReport, panel: 'Synthetic test correction' } }));
  const corrected = value(await app.rpc('get_snapshot'));
  if (corrected.documents.find(d => d.id === documentId)?.status !== 'review' ||
      corrected.events.some(e => e.documentId === documentId && !e.reportId)) throw new Error('Editing a report did not revoke document approval.');
  value(await app.rpc('approve_document', { doc_id: documentId }));
  value(await app.storage.from('medical-documents').remove([path]));
  value(await app.rpc('delete_document_manual', { doc_id: documentId }));
  const after = value(await app.rpc('get_snapshot'));
  if (after.documents.some(d => d.id === documentId)) throw new Error('Deleted document still appears in snapshot.');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 200]);
  page.drawText('SYNTHETIC CBC REPORT\nLaboratory: Horizon\nDoctor: Dr Example\nExamination date: 2026-10-08\nHemoglobin 12.8 g/dL 12-16', { x: 30, y: 150, size: 14, lineHeight: 22, font: await pdf.embedFont(StandardFonts.Helvetica) });
  const ocrBytes = Buffer.from(await pdf.save());
  const ocrId = randomUUID();
  const ocrPath = `${userId}/${ocrId}/original`;
  paths.push(ocrPath);
  value(await app.rpc('begin_upload', { doc: { ...doc, id: ocrId, title: 'Synthetic OCR smoke test', filename: 'ocr-smoke.pdf', bytes: ocrBytes.length, checksum: createHash('sha256').update(ocrBytes).digest('hex') } }));
  value(await app.storage.from('medical-documents').upload(ocrPath, ocrBytes, { contentType: 'application/pdf' }));
  value(await app.rpc('finish_upload', { doc_id: ocrId }));
  let extracted, extractedSnapshot;
  for (let attempt = 0; attempt < 45; attempt++) {
    const snapshot = value(await app.rpc('get_snapshot'));
    const current = snapshot.documents.find(d => d.id === ocrId);
    if (current?.status === 'failed') throw new Error(`Local extraction failed: ${current.error}`);
    if (current?.status === 'review') { extracted = current.rawText; extractedSnapshot = snapshot; break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!extracted?.includes('Hemoglobin 12.8 g/dL')) throw new Error(`PDF text did not appear in the snapshot: ${JSON.stringify(extracted)}`);
  const extractedDocument = extractedSnapshot.documents.find(d => d.id === ocrId);
  const extractedReport = extractedSnapshot.reports.find(r => r.documentId === ocrId);
  if (extractedDocument?.category !== 'Laboratory' || extractedReport?.kind !== 'lab' || extractedReport.panel !== 'SYNTHETIC CBC REPORT' ||
      extractedReport.date !== '2026-10-08' || extractedReport.doctor !== 'Dr Example' || extractedReport.facility !== 'Horizon' ||
      !extractedReport.observations.some(o => o.label === 'Hemoglobin' && o.value === '12.8' && o.range === '12-16 g/dL'))
    throw new Error('PDF upload did not populate the review fields.');
  value(await app.storage.from('medical-documents').remove([ocrPath]));
  value(await app.rpc('delete_document_manual', { doc_id: ocrId }));
  const canvas = createCanvas(1400, 500);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, 1400, 500);
  context.fillStyle = '#000'; context.font = '36px Arial';
  context.fillText('SYNTHETIC CBC REPORT', 50, 70);
  context.fillText('Hemoglobin 12.8 g/dL 12-16', 50, 150);
  const scanBytes = canvas.toBuffer('image/png');
  const scanId = randomUUID();
  const scanPath = `${userId}/${scanId}/original`;
  paths.push(scanPath);
  value(await app.rpc('begin_upload', { doc: { ...doc, id: scanId, title: 'Synthetic scan smoke test', filename: 'scan.png', mime: 'image/png', bytes: scanBytes.length, checksum: createHash('sha256').update(scanBytes).digest('hex') } }));
  value(await app.storage.from('medical-documents').upload(scanPath, scanBytes, { contentType: 'image/png' }));
  value(await app.rpc('finish_upload', { doc_id: scanId }));
  let scanText;
  for (let attempt = 0; attempt < 45; attempt++) {
    const current = value(await app.rpc('get_snapshot')).documents.find(d => d.id === scanId);
    if (current?.status === 'failed') throw new Error(`Local scan OCR failed: ${current.error}`);
    if (current?.status === 'review') { scanText = current.rawText; break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!/Hemoglobin/i.test(scanText ?? '')) throw new Error(`Scan OCR text did not appear: ${JSON.stringify(scanText)}`);
  value(await app.storage.from('medical-documents').remove([scanPath]));
  value(await app.rpc('delete_document_manual', { doc_id: scanId }));
  console.log('Local password sign-in, TOTP, approval, calendar, PDF text, scan OCR, snapshot, and deletion passed.');
} finally {
  for (const path of paths) await admin.storage.from('medical-documents').remove([path]);
  if (userId) value(await admin.auth.admin.deleteUser(userId));
}

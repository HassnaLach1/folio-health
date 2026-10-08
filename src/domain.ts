import Decimal from 'decimal.js';
import { z } from 'zod';

export const categories = ['All documents', 'Laboratory', 'Imaging', 'Pathology', 'Procedures', 'Prescriptions', 'Consultations', 'Other'] as const;
export type Category = Exclude<typeof categories[number], 'All documents'>;
export type Review = 'pending' | 'reviewed';
export interface Observation { id: string; label: string; parameter: string; value: string; unit: string; range: string; source: string; page: number; review: { value: Review; unit: Review; range: Review }; }
export interface Report { id: string; documentId: string; kind: 'lab' | 'imaging' | 'other'; panel: string; date: string; dateReviewed: boolean; facility: string; bodyRegion: string; conclusion: string; conclusionReviewed: boolean; observations: Observation[]; revision: number; }
export interface MedicalDocument { id: string; title: string; filename: string; category: Category; uploadedAt: string; status: 'queued' | 'processing' | 'review' | 'ready' | 'failed'; pages: number; bytes: number; objectKey: string; mime: string; tags: string[]; notes: string; rawText: string; checksum: string; error?: string; }
export interface MedicalEvent { id: string; title: string; date: string; time: string; timezone: string; endDate: string; notes: string; location: string; reminderMinutes: number | null; reportId: string | null; documentId: string | null; }
export interface Snapshot { documents: MedicalDocument[]; reports: Report[]; events: MedicalEvent[]; }
export const uuid = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
export function validDate(value: string) { if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value; }
export function dateLabel(value: string, short = false) { if (!value) return 'Date not confirmed'; return new Date(value + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: short ? 'short' : 'long', ...(short ? {} : { year: 'numeric' }) }); }
export function reviewed(o: Observation) { return Object.values(o.review).every(v => v === 'reviewed'); }
export function reportReviewed(r: Report) { return r.dateReviewed && (r.kind === 'lab' ? r.observations.length > 0 && r.observations.every(reviewed) : r.conclusionReviewed); }
export const observationSchema = z.object({ id: z.uuid(), label: z.string().trim().min(1).max(160), parameter: z.string().max(120), value: z.string().trim().max(100), unit: z.string().max(80), range: z.string().max(400), source: z.string().max(4000), page: z.number().int().min(1).max(50), review: z.object({ value: z.enum(['pending', 'reviewed']), unit: z.enum(['pending', 'reviewed']), range: z.enum(['pending', 'reviewed']) }) });
export const reportSchema = z.object({ id: z.uuid(), documentId: z.uuid(), kind: z.enum(['lab', 'imaging', 'other']), panel: z.string().trim().min(1).max(120), date: z.string().refine(v => !v || validDate(v), 'Use a valid YYYY-MM-DD date'), dateReviewed: z.boolean(), facility: z.string().max(200), bodyRegion: z.string().max(160), conclusion: z.string().max(20000), conclusionReviewed: z.boolean(), observations: z.array(observationSchema).max(300), revision: z.number().int().nonnegative() }).refine(r => !r.dateReviewed || !!r.date, 'Confirm an examination date first');
export const eventSchema = z.object({ id: z.uuid(), title: z.string().trim().min(1).max(160), date: z.string().refine(validDate, 'Use YYYY-MM-DD'), time: z.string().refine(v => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), 'Use HH:MM'), timezone: z.string().min(1), endDate: z.string().refine(v => !v || validDate(v), 'Use YYYY-MM-DD'), notes: z.string().max(4000), location: z.string().max(200), reminderMinutes: z.number().int().min(0).max(10080).nullable(), reportId: z.string().nullable(), documentId: z.string().nullable() }).refine(e => !e.endDate || e.endDate >= e.date, 'End date must follow start date').refine(e => e.reminderMinutes === null || !!e.time, 'A reminder needs an appointment time');

const aliases: Record<string, string> = { hemoglobin: 'hemoglobin', haemoglobin: 'hemoglobin', hémoglobine: 'hemoglobin', hemoglobine: 'hemoglobin', wbc: 'wbc', leucocytes: 'wbc', leukocytes: 'wbc', 'white blood cells': 'wbc', platelets: 'platelets', plaquettes: 'platelets', rbc: 'rbc', hématies: 'rbc', hematies: 'rbc', hematocrit: 'hematocrit', hématocrite: 'hematocrit' };
export function parameterKey(label: string) { return aliases[label.trim().toLowerCase()] ?? ''; }
const knownUnits: Record<string, string[]> = { hemoglobin: ['g/L', 'g/dL'], wbc: ['10^9/L', '×10⁹/L'], platelets: ['10^9/L', '×10⁹/L'], rbc: ['10^12/L', '×10¹²/L'], hematocrit: ['%'] };
export interface Cell { value: string; unit: string; range: string; converted: boolean; unreviewed: boolean; original: Observation; }
export function normalize(o: Observation): Cell {
  let value = o.value, unit = o.unit, range = o.range, converted = false;
  if (o.parameter === 'hemoglobin' && o.unit === 'g/L') {
    const val = o.value.match(/^(<=|>=|<|>|≤|≥)?\s*(\d+(?:[.,]\d+)?)$/);
    const bounds = o.range.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*(?:g\/L)?$/);
    // Unknown reference syntax remains in its source unit; never silently mix units.
    if (val && (!o.range || bounds)) {
      const scale = (s: string) => new Decimal(s.replace(',', '.')).div(10).toString();
      value = (val[1] ?? '') + scale(val[2]!); unit = 'g/dL';
      range = bounds ? `${scale(bounds[1]!)}–${scale(bounds[2]!)} g/dL` : ''; converted = true;
    }
  }
  if (unit === '10^9/L') unit = '×10⁹/L';
  if (unit === '10^12/L') unit = '×10¹²/L';
  return { value, unit, range, converted, unreviewed: !reviewed(o), original: o };
}
export interface ComparisonRow { key: string; label: string; unit: string; cells: (Cell | null)[]; }
export function comparison(reports: Report[], includeUnreviewed: boolean) {
  const columns = [...reports].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.id.localeCompare(b.id));
  const rows = new Map<string, ComparisonRow>(); let omitted = 0;
  columns.forEach((report, index) => {
    const occurrence = new Map<string, number>();
    report.observations.forEach(o => {
      if (!includeUnreviewed && (!reviewed(o) || !report.dateReviewed)) { omitted++; return; }
      const cell = normalize(o);
      const safeIdentity = o.parameter && knownUnits[o.parameter]?.includes(o.unit) ? o.parameter : `${report.id}:${o.id}`;
      const base = `${safeIdentity}:${cell.unit}`;
      const count = occurrence.get(base) ?? 0; occurrence.set(base, count + 1);
      const key = `${base}:${count}`;
      if (!rows.has(key)) rows.set(key, { key, label: o.label + (count ? ` (${count + 1})` : ''), unit: cell.unit, cells: Array(columns.length).fill(null) });
      rows.get(key)!.cells[index] = { ...cell, unreviewed: cell.unreviewed || !report.dateReviewed };
    });
  });
  return { columns, rows: [...rows.values()], omitted };
}

export function extractCandidates(text: string, documentId: string): Report[] {
  const dateMatch = text.match(/(?:examination date|date de prélèvement|date du prélèvement|exam date)\s*:?\s*(\d{4}-\d{2}-\d{2})/i);
  const date = dateMatch && validDate(dateMatch[1]!) ? dateMatch[1]! : '';
  const isLab = /\b(CBC|NFS|blood count|hémogramme)\b/i.test(text);
  const kind = isLab ? 'lab' : /\b(MRI|IRM|CT|scanner|ultrasound|échographie)\b/i.test(text) ? 'imaging' : 'other';
  const observations: Observation[] = [];
  // Deliberately conservative: a result, unit and optional range must occur on one line.
  for (const [page, pageText] of text.split('\f').entries()) for (const line of pageText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-zÀ-ÿ ]+?)\s*[:|]?\s+([<>≤≥]?\s*\d+(?:[.,]\d+)?)\s+(g\/dL|g\/L|10\^9\/L|×10⁹\/L|10\^12\/L|×10¹²\/L|%)\s*(?:[|([]?\s*(\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?)(?:\s*[^\])]*[\])])?)?\s*$/);
    if (!m || !parameterKey(m[1]!)) continue;
    observations.push({ id: uuid(), label: m[1]!.trim(), parameter: parameterKey(m[1]!), value: m[2]!.trim(), unit: m[3]!, range: m[4] ? `${m[4]} ${m[3]}` : '', source: line.trim(), page: page + 1, review: { value: 'pending', unit: 'pending', range: 'pending' } });
  }
  const conclusion = text.match(/(?:^|\n)\s*(?:Conclusion|Impression)\s*:\s*([\s\S]*?)(?=\n\s*(?:Signed|Signature|Findings|Technique)\s*:|$)/i)?.[1]?.trim() ?? '';
  return [{ id: uuid(), documentId, kind, panel: isLab ? 'CBC / NFS' : text.match(/\b(MRI|IRM|CT|ultrasound)\b/i)?.[0]?.toUpperCase() ?? 'Report', date, dateReviewed: false, facility: '', bodyRegion: '', conclusion, conclusionReviewed: false, observations, revision: 0 }];
}
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function exportHtml(reports: Report[], title: string, includeUnreviewed: boolean) {
  const h = escapeHtml;
  const style = '<style>@page{size:A4 landscape;margin:15mm}body{font:12px Arial;color:#153b38}h1{font-size:25px}table{border-collapse:collapse;width:100%;margin-top:20px}td,th{border:1px solid #cbdad6;padding:10px;text-align:left;vertical-align:top}th{background:#edf4f1}thead{display:table-header-group}tr{break-inside:avoid}small{display:block;color:#526864;margin-top:5px}.page{break-after:page}.page:last-child{break-after:auto}footer{margin-top:20px;font-size:10px}</style>';
  const disclaimer = '<footer>Personal record comparison. No diagnosis or medical interpretation. Reviewed means checked by the user. Refer to original reports.</footer>';
  if (reports[0]?.kind !== 'lab') return style + `<h1>${h(title)}</h1><table><thead><tr><th>Date</th><th>Document</th><th>Conclusion</th></tr></thead><tbody>${[...reports].sort((a,b)=>a.date.localeCompare(b.date)).map(r => `<tr><td>${h(r.date || 'Date missing')}${!r.dateReviewed ? '<small>Unreviewed date</small>' : ''}</td><td>${h(r.panel)}<small>${h(r.documentId.slice(0,8))}</small></td><td>${!r.conclusionReviewed && !includeUnreviewed ? 'Unreviewed conclusion omitted' : h(r.conclusion || 'Conclusion not identified').replace(/\n/g,'<br>')}${!r.conclusionReviewed && includeUnreviewed ? '<small>Unreviewed</small>' : ''}</td></tr>`).join('')}</tbody></table>${disclaimer}`;
  const data = comparison(reports, includeUnreviewed); let html = style;
  for (let start = 0; start < data.columns.length; start += 4) {
    const cols = data.columns.slice(start, start + 4);
    html += `<section class="page"><h1>${h(title)}</h1><p>${data.omitted} unreviewed results omitted. Source-specific ranges appear below each value.</p><table><thead><tr><th>Parameter</th>${cols.map(r => `<th>${h(r.date || 'Date missing')}<small>${h(r.facility)} · ${h(r.documentId.slice(0,8))}</small></th>`).join('')}</tr></thead><tbody>${data.rows.map(row => `<tr><th>${h(row.label)}<small>${h(row.unit)}</small></th>${row.cells.slice(start,start+4).map(c => `<td>${c ? `<b>${h(c.value || 'Not provided')}</b><small>${h(c.range || 'Range not provided')}</small>${c.unreviewed ? '<small>Unreviewed</small>' : ''}${c.converted ? '<small>Converted from g/L · rule hb-1</small>' : ''}` : 'Not reported / omitted'}</td>`).join('')}</tr>`).join('')}</tbody></table>${disclaimer}</section>`;
  }
  return html;
}

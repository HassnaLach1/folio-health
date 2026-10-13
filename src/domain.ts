import Decimal from 'decimal.js';
import { z } from 'zod';

export const categories = ['All documents', 'Laboratory', 'Imaging', 'Pathology', 'Procedures', 'Prescriptions', 'Consultations', 'Other'] as const;
export type Category = Exclude<typeof categories[number], 'All documents'>;
export type Review = 'pending' | 'reviewed';
export interface Observation { id: string; label: string; parameter: string; value: string; unit: string; range: string; source: string; page: number; review: { value: Review; unit: Review; range: Review }; }
export interface Report { id: string; documentId: string; kind: 'lab' | 'imaging' | 'other'; panel: string; panelCode?: string; sourcePage?: number | null; sourcePages?: number[]; educationalNote?: string | null; aiInterpretation?: string | null; date: string; dateReviewed: boolean; facility: string; doctor: string; bodyRegion: string; conclusion: string; findings?: string; conclusionReviewed: boolean; observations: Observation[]; revision: number; }
export interface MedicalDocument { id: string; title: string; filename: string; category: Category; uploadedAt: string; status: 'queued' | 'processing' | 'review' | 'ready' | 'failed'; pages: number; bytes: number; objectKey: string; mime: string; tags: string[]; notes: string; rawText: string; checksum: string; error?: string; }
export type EventType = 'Procedure' | 'Prescription' | 'Consultation' | 'Other';
export interface MedicalEvent { id: string; title: string; date: string; time: string; timezone: string; endDate: string; notes: string; location: string; reminderMinutes: number | null; reportId: string | null; documentId: string | null; eventType?: EventType; doctor?: string; medications?: string; }
export interface Snapshot { documents: MedicalDocument[]; reports: Report[]; events: MedicalEvent[]; preferences?: { showAiInterpretation: boolean }; }
export const uuid = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
export function validDate(value: string) { if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value; }
export function dateLabel(value: string, short = false) { if (!value) return 'Date not confirmed'; return new Date(value + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: short ? 'short' : 'long', ...(short ? {} : { year: 'numeric' }) }); }
export function reviewed(o: Observation) { return Object.values(o.review).every(v => v === 'reviewed'); }
export function reportReviewed(r: Report) { return r.dateReviewed && (r.kind === 'lab' ? r.observations.length > 0 && r.observations.every(reviewed) && (!r.conclusion || r.conclusionReviewed) : r.conclusionReviewed); }
export const observationSchema = z.object({ id: z.uuid(), label: z.string().trim().min(1).max(160), parameter: z.string().max(120), value: z.string().trim().max(100), unit: z.string().max(80), range: z.string().max(400), source: z.string().max(4000), page: z.number().int().min(1).max(50), review: z.object({ value: z.enum(['pending', 'reviewed']), unit: z.enum(['pending', 'reviewed']), range: z.enum(['pending', 'reviewed']) }) });
export const reportSchema = z.object({ id: z.uuid(), documentId: z.uuid(), kind: z.enum(['lab', 'imaging', 'other']), panel: z.string().trim().min(1).max(120), panelCode: z.string().regex(/^(?:[a-z][a-z0-9_]{0,79})?$/).optional(), sourcePage: z.number().int().min(1).max(50).nullable().optional(), sourcePages: z.array(z.number().int().min(1).max(50)).max(50).optional(), educationalNote: z.string().max(1500).nullable().optional(), aiInterpretation: z.string().max(6000).nullable().optional(), date: z.string().refine(v => !v || validDate(v), 'Use a valid YYYY-MM-DD date'), dateReviewed: z.boolean(), facility: z.string().max(200), doctor: z.string().max(200), bodyRegion: z.string().max(160), conclusion: z.string().max(20000), findings: z.string().max(20000).optional(), conclusionReviewed: z.boolean(), observations: z.array(observationSchema).max(300), revision: z.number().int().nonnegative() }).refine(r => !r.dateReviewed || !!r.date, 'Confirm an examination date first');
export const panelAliases: Record<string, string> = { nfs: 'complete_blood_count', cbc: 'complete_blood_count', 'complete blood count': 'complete_blood_count', 'complete blood count (nfs)': 'complete_blood_count', 'kidney function': 'kidney_function', 'kidney function test': 'kidney_function', 'renal function': 'kidney_function', 'liver function': 'liver_function', 'liver panel': 'liver_function', 'lipid panel': 'lipid_panel', catecholamines: 'catecholamines', cathecolamine: 'catecholamines' };
Object.assign(panelAliases, { 'complete blood count (cbc)': 'complete_blood_count', 'numeration formule sanguine': 'complete_blood_count', 'numération formule sanguine': 'complete_blood_count', 'kidney function panel': 'kidney_function', 'bilan rénal': 'kidney_function', 'bilan renal': 'kidney_function', 'liver function panel': 'liver_function', 'bilan hépatique': 'liver_function', 'bilan hepatique': 'liver_function', 'thyroid function panel': 'thyroid_function', 'thyroid function test': 'thyroid_function', 'hemoglobin a1c & glucose': 'glycemic_panel', 'coagulation profile': 'coagulation', 'electrolytes panel': 'electrolytes', 'inflammatory markers': 'inflammatory_markers', 'vitamin & mineral panel': 'vitamins_minerals' });
export function panelKey(report: Pick<Report, 'panel' | 'panelCode'>) { return report.panelCode || panelCodeForName(report.panel); }
const panelLabels:Record<string,string>={kidney_function:'Kidney Function Panel',complete_blood_count:'Complete Blood Count (CBC)',liver_function:'Liver Function Panel',lipid_panel:'Lipid Panel',thyroid_function:'Thyroid Function Panel',glycemic_panel:'Glucose & HbA1c',coagulation:'Coagulation Profile',electrolytes:'Electrolytes Panel'};
export function panelDisplayName(report:Pick<Report,'panel'|'panelCode'>){return panelLabels[panelKey(report)]||report.panel;}
export function imagingRegionsOverlap(a:string,b:string){
 const clean=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 const left=clean(a),right=clean(b);if(left===right)return true;
 const regions=[/\b(chest|thorax|thoracic|thoracique)\b/,/\b(abdomen|abdominal|abdomino)\b/,/\b(pelvis|pelvic|pelvien)\b/,/\b(brain|cerebral|cerebrale|cerveau)\b/,/\b(spine|spinal|rachis|rachidien)\b/,/\b(knee|genou)\b/,/\b(shoulder|epaule)\b/,/\b(heart|cardiac|cardiaque)\b/];
 return regions.some(region=>region.test(left)&&region.test(right));
}
export function imagingHistoryCompatible(reports:Report[]){return reports.every((report,index)=>reports.slice(index+1).every(other=>imagingRegionsOverlap(report.bodyRegion,other.bodyRegion)));}
export function panelCodeForName(name: string) { const label = name.trim().toLowerCase(); return panelAliases[label] || label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0,80) || 'other_report'; }
const analyteExplanations: Record<string, string> = {
  hemoglobin: 'Hemoglobin is the oxygen-carrying protein in red blood cells.',
  wbc: 'White blood cells are immune cells that help the body respond to infection and other challenges.',
  white_blood_cells: 'White blood cells are immune cells that help the body respond to infection and other challenges.',
  rbc: 'Red blood cells carry oxygen from the lungs to body tissues.',
  red_blood_cells: 'Red blood cells carry oxygen from the lungs to body tissues.',
  platelets: 'Platelets are cell fragments involved in blood clotting.',
  hematocrit: 'Hematocrit is the proportion of blood volume occupied by red blood cells.',
  creatinine: 'Creatinine is a waste product from normal muscle metabolism that the kidneys filter from blood.',
  urea: 'Urea is a waste product formed when the body breaks down protein.',
  alt: 'Alanine aminotransferase is an enzyme found mainly in liver cells.',
  ast: 'Aspartate aminotransferase is an enzyme found in liver, muscle, and other tissues.',
  glucose: 'Glucose is a sugar that cells use as an energy source.',
  cholesterol: 'Cholesterol is a lipid used in cell membranes and hormone production.',
};
export function analyteExplanation(parameter: string) { return analyteExplanations[parameter] || analyteExplanations[parameter === 'alanine_aminotransferase' ? 'alt' : parameter === 'aspartate_aminotransferase' ? 'ast' : ''] || ''; }
export const eventSchema = z.object({ id: z.uuid(), title: z.string().trim().min(1).max(160), date: z.string().refine(validDate, 'Use YYYY-MM-DD'), time: z.string().refine(v => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), 'Use HH:MM'), timezone: z.string().min(1), endDate: z.string().refine(v => !v || validDate(v), 'Use YYYY-MM-DD'), notes: z.string().max(4000), location: z.string().max(200), reminderMinutes: z.number().int().min(0).max(10080).nullable(), reportId: z.string().nullable(), documentId: z.string().nullable(), eventType: z.enum(['Procedure','Prescription','Consultation','Other']).optional(), doctor: z.string().max(200).optional(), medications: z.string().max(4000).optional() }).refine(e => !e.endDate || e.endDate >= e.date, 'End date must follow start date').refine(e => e.reminderMinutes === null || !!e.time, 'A reminder needs an appointment time').refine(e => e.eventType !== 'Prescription' || !!e.medications?.trim(), 'Enter the prescribed medications').refine(e=>!e.eventType||e.eventType==='Other'||!!e.doctor?.trim(),'Enter the doctor name');

const aliases: Record<string, string> = { hemoglobin: 'hemoglobin', haemoglobin: 'hemoglobin', hémoglobine: 'hemoglobin', hemoglobine: 'hemoglobin', wbc: 'wbc', leucocytes: 'wbc', leukocytes: 'wbc', 'white blood cells': 'wbc', platelets: 'platelets', plaquettes: 'platelets', rbc: 'rbc', hématies: 'rbc', hematies: 'rbc', hematocrit: 'hematocrit', hématocrite: 'hematocrit' };
Object.assign(aliases, { hgb: 'hemoglobin', hb: 'hemoglobin', creatinine: 'creatinine', créatinine: 'creatinine', alt: 'alanine_aminotransferase', alat: 'alanine_aminotransferase', sgpt: 'alanine_aminotransferase', ast: 'aspartate_aminotransferase', asat: 'aspartate_aminotransferase', sgot: 'aspartate_aminotransferase', white_blood_cells: 'wbc', red_blood_cells: 'rbc', urea: 'urea', urée: 'urea', glucose: 'glucose', glycémie: 'glucose', 'glycémie à jeun':'glucose','glycemie a jeun':'glucose',fasting_glucose:'glucose',glucose_fasting:'glucose' });
export function canonicalParameter(label: string, suggested: string | null) { return aliases[(suggested || '').toLowerCase()] || aliases[label.trim().toLowerCase()] || suggested || ''; }
export const aiDisclaimer = 'This interpretation is generated by an AI model and is not a medical diagnosis. Always consult a qualified healthcare professional for medical advice.';
export function interpretationInputs(report: Report) { return JSON.stringify([report.panel, report.date, report.bodyRegion, report.conclusion, report.findings || '', report.observations.map(o => [o.id, o.label, o.parameter, o.value, o.unit, o.range])]); }
export function parameterKey(label: string) { return aliases[label.trim().toLowerCase()] ?? ''; }
const knownUnits: Record<string, string[]> = { hemoglobin: ['g/L', 'g/dL'], wbc: ['10^9/L', '×10⁹/L'], platelets: ['10^9/L', '×10⁹/L'], rbc: ['10^12/L', '×10¹²/L'], hematocrit: ['%'] };
export interface Cell { value: string; unit: string; range: string; converted: boolean; unreviewed: boolean; original: Observation; }
export function rangeStatus(value: string, range: string): 'low' | 'normal' | 'high' | 'unknown' {
  if (!value.trim() || !range.trim()) return 'unknown';
  range = range.trim().replace(/^\((.*)\)$/, '$1').replace(/^\[(.*)\]$/, '$1');
  const referenceWords = range.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  range = referenceWords.replace(/^(?:inferieur(?:e)?|less|lower)\s+(?:ou egal(?:e)?\s+)?(?:a|than)\s*/i, referenceWords.includes('egal') ? '<= ' : '< ')
    .replace(/^(?:superieur(?:e)?|greater|higher)\s+(?:ou egal(?:e)?\s+)?(?:a|than)\s*/i, referenceWords.includes('egal') ? '>= ' : '> ')
    .replace(/^moins de\s*/, '< ').replace(/^plus de\s*/, '> ');
  const qualitative = (text: string) => {
    const clean = text.trim().toLowerCase();
    if (['negative', 'non-reactive', 'nonreactive', 'not detected', 'absent'].includes(clean)) return 'negative';
    if (['positive', 'reactive', 'detected', 'present'].includes(clean)) return 'positive';
    return null;
  };
  const resultText = qualitative(value), referenceText = qualitative(range);
  if (resultText && referenceText) return resultText === referenceText ? 'normal' : 'high';
  const number = '[+-]?\\d+(?:[.,]\\d+)?';
  const units = '(?:\\s+[A-Za-zµμ/%][A-Za-zµμ/%\\d^.*−-]*)?';
  const bounds = range.trim().match(new RegExp(`^(${number})\\s*(?:[-–—]|to|à)\\s*(${number})${units}$`, 'i'));
  type Interval = { low: number; high: number; lowInclusive: boolean; highInclusive: boolean };
  const interval = (text: string, allowUnit: boolean): Interval | null => {
    const match = text.trim().match(new RegExp(`^(<=|>=|<|>|≤|≥)?\\s*(${number})${allowUnit ? units : ''}$`));
    if (!match) return null;
    const n = Number(match[2]!.replace(',', '.')), operator = match[1];
    if (operator === '<' || operator === '<=' || operator === '≤') return { low: -Infinity, high: n, lowInclusive: false, highInclusive: operator !== '<' };
    if (operator === '>' || operator === '>=' || operator === '≥') return { low: n, high: Infinity, lowInclusive: operator !== '>', highInclusive: false };
    return { low: n, high: n, lowInclusive: true, highInclusive: true };
  };
  const measured = interval(value, false);
  const reference: Interval | null = bounds ? { low: Number(bounds[1]!.replace(',', '.')), high: Number(bounds[2]!.replace(',', '.')), lowInclusive: true, highInclusive: true } : interval(range, true);
  if (!measured || !reference || reference.low > reference.high) return 'unknown';
  if (measured.high < reference.low || (measured.high === reference.low && !(measured.highInclusive && reference.lowInclusive))) return 'low';
  if (measured.low > reference.high || (measured.low === reference.high && !(measured.lowInclusive && reference.highInclusive))) return 'high';
  const lowerFits = measured.low > reference.low || (measured.low === reference.low && (!measured.lowInclusive || reference.lowInclusive));
  const upperFits = measured.high < reference.high || (measured.high === reference.high && (!measured.highInclusive || reference.highInclusive));
  return lowerFits && upperFits ? 'normal' : 'unknown';
}
export function briefRangeSummary(report: Report): string {
  const results = report.observations.map(observation => ({ observation, status: rangeStatus(observation.value, observation.range) }));
  const comparable = results.filter(result => result.status !== 'unknown');
  if (!comparable.length) return 'No clear reference ranges are available for comparison.';
  const outside = comparable.filter(result => result.status !== 'normal');
  const groups=groupObservations(report.observations).filter(group=>group.indices.some(index=>['low','high'].includes(results[index]!.status)));
  const lines = groups.slice(0,4).map(group=>`${group.label}: ${group.indices.map(index=>{const {observation,status}=results[index]!;return `${observation.value} ${observation.unit} — ${status==='normal'?'within':status==='low'?'below':status==='high'?'above':'unclear'} range (${observation.range||'not provided'})`;}).join('; ')}.`);
  if (!outside.length) lines.push(`All ${comparable.length} comparable results are within their printed ranges.`);
  if (groups.length > 4) lines.push(`${groups.length - 4} more parameters are outside range; see the table.`);
  if (comparable.length < results.length) lines.push(`${results.length - comparable.length} results have missing or unclear ranges.`);
  return lines.join('\n');
}
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
export interface ComparisonRow { key: string; label: string; parameter: string; unit: string; cells: (Cell | null)[]; }
export function groupObservations(observations:Observation[]){
 const groups=new Map<string,{key:string;label:string;indices:number[]}>();
 observations.forEach((observation,index)=>{
  const parameter=canonicalParameter(observation.label,observation.parameter)||(observation.label.trim()?`label:${observation.label.trim().toLowerCase()}`:observation.id);
  const key=parameter;
  if(!groups.has(key))groups.set(key,{key,label:observation.label,indices:[]});
  groups.get(key)!.indices.push(index);
 });return [...groups.values()];
}
export interface ComparisonMeasurement extends Cell { sourceReport: Report; }
export interface GroupedComparisonRow{key:string;label:string;parameter:string;cells:(ComparisonMeasurement[]|null)[];}
export function groupedComparison(reports:Report[],includeUnreviewed:boolean){
 const data=comparison(reports,includeUnreviewed);const groups=new Map<string,GroupedComparisonRow>();
 const columns:(Report&{sourceReports:Report[]})[]=[],dateIndices=new Map<string,number>();
 const indices=data.columns.map(report=>{
  // Consolidate the selected panel's same-day sources without changing stored reports.
  // Missing dates cannot establish that two examinations happened on the same day.
  const key=validDate(report.date)?`${panelKey(report)}:${report.date}`:report.id;
  if(!dateIndices.has(key)){dateIndices.set(key,columns.length);columns.push({...report,sourceReports:[]});}
  const index=dateIndices.get(key)!;columns[index]!.sourceReports.push(report);return index;
 });
 for(const column of columns)column.facility=[...new Set(column.sourceReports.map(r=>r.facility).filter(Boolean))].join(' · ');
 for(const row of data.rows){
  const known=/^[a-z][a-z0-9_]{0,119}$/.test(row.parameter);
  const key=known?row.parameter:row.key;
  if(!groups.has(key))groups.set(key,{key,label:row.label,parameter:row.parameter,cells:columns.map(()=>null)});
  row.cells.forEach((cell,index)=>{if(cell){
   const group=groups.get(key)!,target=indices[index]!,sourceReport=data.columns[index]!;
   group.cells[target]??=[];const measurements=group.cells[target]!;
   const signature=(c:Cell)=>JSON.stringify([c.original.value.trim(),c.original.unit.trim().replace(/μ/g,'µ'),c.original.range.trim()]);
   const duplicate=measurements.findIndex(c=>c.sourceReport.id!==sourceReport.id&&signature(c)===signature(cell));
   if(duplicate<0)measurements.push({...cell,sourceReport});
   else if(measurements[duplicate]!.unreviewed&&!cell.unreviewed)measurements[duplicate]={...cell,sourceReport};
  }});
 }
 return {columns,rows:[...groups.values()],omitted:data.omitted};
}
export function comparison(reports: Report[], includeUnreviewed: boolean) {
  const columns = [...reports].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.id.localeCompare(b.id));
  const rows = new Map<string, ComparisonRow>(); let omitted = 0;
  columns.forEach((report, index) => {
    const occurrence = new Map<string, number>();
    report.observations.forEach(o => {
      if (!includeUnreviewed && (!reviewed(o) || !report.dateReviewed)) { omitted++; return; }
      const cell = normalize(o);
      const parameter=canonicalParameter(o.label,o.parameter);
      const safeIdentity = /^[a-z][a-z0-9_]{0,119}$/.test(parameter) && !!o.unit.trim() ? parameter : `${report.id}:${o.id}`;
      const base = `${safeIdentity}:${cell.unit.replace(/μ/g,'µ')}`;
      const count = occurrence.get(base) ?? 0; occurrence.set(base, count + 1);
      const key = `${base}:${count}`;
      if (!rows.has(key)) rows.set(key, { key, label: o.label + (count ? ` (${count + 1})` : ''), parameter, unit: cell.unit, cells: Array(columns.length).fill(null) });
      rows.get(key)!.cells[index] = { ...cell, unreviewed: cell.unreviewed || !report.dateReviewed };
    });
  });
  return { columns, rows: [...rows.values()], omitted };
}

function extractSingleCandidate(text: string, documentId: string, pageOffset = 0): Report {
  const lines = text.replace(/\r/g, '\n').replace(/[’‘]/g, "'").split(/[\n\f]+/).map(line => line.trim()).filter(Boolean);
  const labelled = (labels: string) => lines.map(line => line.match(new RegExp(`^(?:${labels})\\s*(?:[:：-]\\s*|\\s+)(.+)$`, 'i'))?.[1]?.trim() ?? '').find(Boolean) ?? '';
  const labelledColon = (labels: string) => lines.map(line => line.match(new RegExp(`^(?:${labels})\\s*[:：-]\\s*(.+)$`, 'i'))?.[1]?.trim() ?? '').find(Boolean) ?? '';
  const dateLabels = "date d'examen|date de l'examen|date de prélèvement|date du prélèvement|date de compte rendu|examination date|exam date|report date|prélèvement|prelevement|collected on|date";
  // Require a date immediately after the label so a birth-date label cannot hide the examination date.
  const dateText = lines.find(line => new RegExp(`^(?:${dateLabels})\\s*(?:[:：-]\\s*|\\s+)(?=\\d)`, 'i').test(line)) ?? '';
  const rawDate = dateText.match(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/)?.[0] ?? '';
  const parts = rawDate.split(/[-/.]/);
  const date = parts.length === 3 ? (parts[0]!.length === 4 ? parts : parts.reverse()).map((part, index) => index ? part.padStart(2, '0') : part).join('-') : '';
  const facilityHeader = lines.slice(0,12).find(line => /^(?:laboratoire|centre d.imagerie|centre de radiologie|clinique|hôpital|hospital)\s+\D{3,}$/i.test(line) && !/\b(?:rue|avenue|boulevard|tél|tel|fax)\b/i.test(line));
  const performingLab = text.match(/\ble laboratoire\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,60}?)\s+(?:est|a été|has been)\b/i)?.[1];
  const facility = (labelledColon('nom du laboratoire|nom de l.établissement|facility|laboratory|laboratoire|clinic|clinique|hospital|hôpital|établissement|etablissement|centre|center|place|lieu') || facilityHeader || performingLab || '').slice(0,200);
  const doctor = (labelled('médecin prescripteur|medecin prescripteur|médecin traitant|medecin traitant|requested by|requesting physician|attending physician|radiologue|radiologist|prescripteur|physician|doctor|médecin|medecin|docteur') || lines.slice(0,35).find(line => /^(?:Dr\.?|Pr\.?|Docteur)\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{2,}$/i.test(line)) || '').slice(0,200);
  const observations: Observation[] = [];
  const ranges = new Map<string, string>();
  const number = '[<>≤≥]?\\s*\\d+(?:[.,]\\d+)?';
  const unit = '(?:[µμu]?mol|[µμu]?g|mmol|mg|g|ng|pg|m?IU|IU|U|10\\^9|10\\^12|×10⁹|×10¹²)\\/(?:24h|dL|mL|l|L)|%';
  const measured = new RegExp(`^(${number})\\s*(${unit})(?:\\s+N\\s*:\\s*(${number}\\s*[-–à]\\s*\\d+(?:[.,]\\d+)?\\s*(?:${unit})?))?`, 'i');
  const rangeValue = new RegExp(`(${number}\\s*(?:[-–à]\\s*\\d+(?:[.,]\\d+)?)?)\\s*(${unit})`, 'gi');
  const key = (label: string, unitText: string) => `${label.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')}:${unitText.replace(/µ/g, 'μ').toLowerCase()}`;
  let section = '', lastAnalyte = '', referenceMode = false;
  // Laboratory PDFs often put a panel heading above several unlabelled values and list ranges afterward.
  for (const [page, pageText] of text.split('\f').entries()) for (const line of pageText.split(/\r?\n/)) {
    const source = line.trim();
    if (!source) continue;
    const heading = /^[A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9 /.-]{3,}(?:\s*\([^)]*\))*(?:\s*#)?$/.test(source) && !/^(?:CONCLUSION|RÉSULTATS|RESULTATS|VALEURS|BIOLOGISTES|DOCTEUR)\b/.test(source);
    if (heading) { section = source.replace(/\s*#\s*$/, '').trim(); lastAnalyte = ''; referenceMode = false; }
    if (/^validé par\s*:/i.test(source)) { referenceMode = false; continue; }
    const group = source.match(/^(Femmes|Hommes|Women|Men)\s*:/i)?.[1];
    if (group && section) {
      for (const match of source.matchAll(rangeValue)) {
        const rangeKey = key(section, match[2]!);
        ranges.set(rangeKey, [ranges.get(rangeKey), `${group}: ${match[1]!.trim()} ${match[2]}`].filter(Boolean).join('; '));
      }
      continue;
    }
    if (/^valeurs? (?:de référence|usuelles?)/i.test(source)) referenceMode = true;
    if (referenceMode) {
      const candidate = source.replace(/^valeurs? (?:de référence|usuelles?)(?: par 24\s*h(?:eures)?)?\s*:?\s*/i, '');
      const name = candidate.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ -]{2,50}?)\s+(?=[<>≤≥]?\s*\d)/)?.[1]?.trim() ?? '';
      if (name) for (const match of candidate.matchAll(rangeValue)) ranges.set(key(name, match[2]!), `${match[1]!.trim()} ${match[2]}`);
      continue;
    }
    if (/^(?:prélèvement|prelevement|date|enregistré|édité|validé|dossier|patient|sexe|age|né\(e\)|résultats? d'analyses?)\b/i.test(source) && !/^résultat\s*:/i.test(source)) continue;
    const m = source.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 ()/.,+%-]{1,75}?)\s*(?:\||:|\t|\s{2,}|\s+)\s*([<>≤≥]?\s*\d+(?:[.,]\d+)?)\s*\|?\s*(g\/dL|g\/L|mg\/dL|mmol\/L|[µμu]mol\/(?:l|L|24h)|[µμu]g\/(?:l|L|24h)|mmol\/24h|mg\/24h|g\/24h|U\/L|IU\/L|mIU\/L|ng\/mL|pg\/mL|10\^9\/L|×10⁹\/L|10\^12\/L|×10¹²\/L|%)\s*(?:[|([]?\s*(\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?))?\s*[\])]?(?:\s+.*)?$/i);
    // Some labs put the reference interval before the unit, or omit the unit entirely.
    const columns = !m && source.includes('|') ? source.split('|').map(part => part.trim()).filter(Boolean) : [];
    const tabular = columns.length >= 3 && /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 ()/.,+%-]{1,75}$/.test(columns[0]!) && /^[<>≤≥]?\s*\d+(?:[.,]\d+)?$/.test(columns[1]!) && /^\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?(?:\s+[^\d]+)?$/.test(columns[2]!) ? columns : [];
    const numeric = !m && !tabular.length ? source.replace(/^résultat\s*:\s*/i, '').match(measured) : null;
    const label = (m?.[1]?.trim().toLowerCase() === 'résultat' ? section : m?.[1]?.trim()) ?? tabular[0] ?? (numeric ? lastAnalyte || section : '');
    if (!label || /^(?:date|age|patient|dossier|id|reference|référence|page|tel|fax)\b/i.test(label) || observations.length >= 300) continue;
    if (m && m[1]!.trim().toLowerCase() !== 'résultat') lastAnalyte = label;
    if (tabular.length) lastAnalyte = label;
    const resultUnit = m?.[3] ?? (tabular[3] ?? numeric?.[2] ?? '');
    const range = m ? (m[4] ? `${m[4]} ${resultUnit}` : '') : tabular.length ? tabular[2]! : numeric?.[3]?.trim() ?? '';
    observations.push({ id: uuid(), label, parameter: parameterKey(label), value: m?.[2]?.trim() ?? tabular[1] ?? numeric?.[1]?.trim() ?? '', unit: resultUnit, range, source: source.slice(0,4000), page: pageOffset + page + 1, review: { value: 'pending', unit: 'pending', range: 'pending' } });
  }
  for (const observation of observations) if (!observation.range) observation.range = ranges.get(key(observation.label, observation.unit)) ?? '';
  const hasLabHeading = /\b(CBC|NFS|blood count|numération|hemogramme|hémogramme|laboratory results|résultats? d'analyses?|biochemistry|biochimie|catécholamines|catecholamines|créatinine|creatinine)\b/i.test(text);
  const hasImagingHeading = /\b(MRI|IRM|CT|scanner|scaner|TDM|ultrasound|échographie|scintigraphy|scintigraphie|radiograph|radiographie)\b/i.test(text);
  const kind: Report['kind'] = observations.length ? 'lab' : hasImagingHeading ? 'imaging' : hasLabHeading ? 'lab' : 'other';
  const labelledTitle = labelledColon('type de document|report type|nature de l.examen|intitulé de l.examen|examination|examen|exam|type');
  const sectionTitle = lines.find((line, index) => /^[A-ZÀ-Ÿ][A-ZÀ-Ÿ0-9 /.-]{3,}(?:\s*\([^)]*\))*(?:\s*#)?$/.test(line) && /^(?:prélèvement|prelevement|sample|specimen)\s*:/i.test(lines[index + 1] ?? ''));
  const titleLine = lines.slice(0,15).find(line => /\b(CBC|NFS|numération|hemogramme|hémogramme|hematology|haematology|renal|kidney|liver|hepatic|biochimie|bilan|MRI|IRM|CT|scanner|scaner|TDM|échographie|scintigraphy|scintigraphie|radiographie)\b/i.test(line) && !/^(?:conclusion|impression|description|findings|technique|résultats?)\s*[:：]/i.test(line) && !/\d{4}-\d{2}-\d{2}|\d{2}[/.]\d{2}[/.]\d{4}/.test(line));
  const cleanTitle = (candidate: string) => candidate.replace(/^(?:type|examen|examination|exam|report type|type de document)\s*[:：-]\s*/i,'').trim().slice(0,120);
  const panel = cleanTitle(labelledTitle || sectionTitle || titleLine || '') || (kind === 'lab' ? 'Laboratory results' : 'Report');
  const conclusionStart = lines.findIndex(line => /^(?:conclusions?|impression)\s*[:：]?\s*$/i.test(line) || /^(?:conclusions?|impression)\s*[:：]\s*\S/i.test(line));
  const conclusionLines: string[] = [];
  if (conclusionStart >= 0) {
    const first = lines[conclusionStart]!.replace(/^(?:conclusions?|impression)\s*[:：]?\s*/i,'');
    if (first) conclusionLines.push(first);
    for (const line of lines.slice(conclusionStart+1)) {
      if (/^(?:signed|signature|findings|description|technique|médecin|doctor|date|recommendations?|compte rendu)\s*[:：]?/i.test(line) || /^[A-ZÀ-Ÿ ]{4,}:?$/.test(line)) break;
      conclusionLines.push(line);
    }
  }
  const conclusion = conclusionLines.join('\n').slice(0,20000);
  const findingsStart = lines.findIndex(line => /^(?:findings|detailed findings|description|compte rendu)\s*[:：]?/i.test(line));
  const findingsLines: string[] = [];
  if (findingsStart >= 0) {
    const first = lines[findingsStart]!.replace(/^(?:findings|detailed findings|description|compte rendu)\s*[:：]?\s*/i, '');
    if (first) findingsLines.push(first);
    for (const line of lines.slice(findingsStart + 1)) {
      if (/^(?:conclusions?|impression|signature|signed|doctor|médecin|date)\s*[:：]?/i.test(line)) break;
      findingsLines.push(line);
    }
  }
  return { id: uuid(), documentId, kind, panel, panelCode: panelAliases[panel.toLowerCase()], sourcePage: pageOffset + 1, date: validDate(date) ? date : '', dateReviewed: false, facility, doctor, bodyRegion: '', conclusion, findings: findingsLines.join('\n').slice(0,20000), conclusionReviewed: false, observations, revision: 0 };
}
export function extractCandidates(text: string, documentId: string): Report[] {
  const pages = text.split('\f');
  if (pages.length < 2) return [extractSingleCandidate(text, documentId)];
  const parts = pages.map((page, index) => extractSingleCandidate(page, documentId, index));
  const namedLabPanels = parts.filter(part => part.kind === 'lab' && part.observations.length && !['Laboratory results', 'Report'].includes(part.panel));
  if (new Set(namedLabPanels.map(part => part.panel.toLocaleLowerCase())).size < 2) return [extractSingleCandidate(text, documentId)];
  const reports: Report[] = [];
  for (const part of parts) {
    const previous = reports[reports.length - 1];
    if (previous && previous.panel.toLocaleLowerCase() === part.panel.toLocaleLowerCase() && previous.kind === part.kind) {
      previous.observations.push(...part.observations);
      if (!previous.conclusion) previous.conclusion = part.conclusion;
    } else if (part.observations.length || part.conclusion) reports.push(part);
  }
  return reports.length > 1 ? reports : [extractSingleCandidate(text, documentId)];
}
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function exportHtml(reports: Report[], title: string, includeUnreviewed: boolean) {
  const h = escapeHtml;
  const style = '<style>@page{size:A4 landscape;margin:15mm}body{font:12px Arial;color:#153b38}h1{font-size:25px}table{border-collapse:collapse;width:100%;margin-top:20px}td,th{border:1px solid #cbdad6;padding:10px;text-align:left;vertical-align:top}th{background:#edf4f1}thead{display:table-header-group}tr{break-inside:avoid}small{display:block;color:#526864;margin-top:5px}.page{break-after:page}.page:last-child{break-after:auto}footer{margin-top:20px;font-size:10px}</style>';
  const disclaimer = '<footer>Personal record comparison. No diagnosis or medical interpretation. Reviewed means checked by the user. Refer to original reports.</footer>';
  if (reports[0]?.kind !== 'lab') return style + `<h1>${h(title)}</h1><table><thead><tr><th>Date</th><th>Report</th><th>Conclusion</th></tr></thead><tbody>${[...reports].sort((a,b)=>a.date.localeCompare(b.date)).map(r => `<tr><td>${h(r.date || 'Date missing')}${!r.dateReviewed ? '<small>Unreviewed date</small>' : ''}</td><td>${h(r.panel)}<small>${h(r.facility)}</small></td><td>${!r.conclusionReviewed && !includeUnreviewed ? 'Unreviewed conclusion omitted' : h(r.conclusion || 'Conclusion not identified').replace(/\n/g,'<br>')}${!r.conclusionReviewed && includeUnreviewed ? '<small>Unreviewed</small>' : ''}</td></tr>`).join('')}</tbody></table>${disclaimer}`;
  const data = groupedComparison(reports, includeUnreviewed); let html = style;
  for (let start = 0; start < data.columns.length; start += 4) {
    const cols = data.columns.slice(start, start + 4);
    html += `<section class="page"><h1>${h(title)}</h1><p>${data.omitted} unreviewed results omitted. Source-specific ranges appear below each value.</p><table><thead><tr><th>Parameter</th>${cols.map(r => `<th>${h(r.date || 'Date missing')}<small>${h(r.facility)} · ${h([...new Set(r.sourceReports.map(source=>source.documentId.slice(0,8)))].join(', '))}</small></th>`).join('')}</tr></thead><tbody>${data.rows.map(row => `<tr><th>${h(row.label)}</th>${row.cells.slice(start,start+4).map(c => `<td>${c ? c.map(measurement=>`<div><b>${h(measurement.value || 'Not provided')} ${h(measurement.unit)}</b><small>Ref: ${h(measurement.range || 'Range not provided')}</small>${measurement.unreviewed ? '<small>Unreviewed</small>' : ''}${measurement.converted ? '<small>Converted from g/L</small>' : ''}</div>`).join('<hr>') : 'Not reported / omitted'}</td>`).join('')}</tr>`).join('')}</tbody></table>${disclaimer}</section>`;
  }
  return html;
}

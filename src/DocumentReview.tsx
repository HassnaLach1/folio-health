import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, Download, Plus, Trash2 } from 'lucide-react-native';
import { MedicalDocument, Observation, Report, extractCandidates, panelCodeForName, parameterKey, reportSchema, uuid, validDate, interpretationInputs } from './domain';
import { approveDocument, deleteDocument, isDemo, retryDocument, saveDocument, saveReport, startManualReview } from './backend';
import { shareDocument } from './device';
import { Badge, Button, CheckRow, DatePickerField, Field, Pill, Sheet, colors, styles } from './ui';
import DocumentViewer from './DocumentViewer';
import ObservationGroups from './ObservationGroups';
import PanelInsights, { InterpretationToggle } from './PanelInsights';

type PanelOption = { name: string; kind: Report['kind'] };
type Props = { showInterpretation: boolean; onInterpretationChange: (enabled: boolean) => void; document: MedicalDocument; reports: Report[]; knownPanels?: PanelOption[]; onClose: () => void; onSaved: () => Promise<void>; notify: (message: string) => void };
const standardTypes: PanelOption[] = [
  { name: 'Complete Blood Count (NFS)', kind: 'lab' },
  { name: 'Kidney Function Test', kind: 'lab' },
  { name: 'Liver Panel', kind: 'lab' },
  { name: 'Lipid Panel', kind: 'lab' },
  { name: 'Thyroid Function Test', kind: 'lab' },
  { name: 'MRI', kind: 'imaging' },
  { name: 'CT Scan', kind: 'imaging' },
  { name: 'Ultrasound', kind: 'imaging' },
  { name: 'X-ray', kind: 'imaging' },
  { name: 'Other Report', kind: 'other' },
];
function TypePicker({ value, options, onSelect }: { value: string; options: PanelOption[]; onSelect: (option: PanelOption) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const visible = options.filter(option => option.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <View style={{ gap: 7 }}>
    <Text style={[styles.muted, { fontSize: 12, fontWeight: '600' }]}>Type / test or procedure</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Type / test or procedure, ${value || 'choose a type'}`} accessibilityState={{ expanded: open }} onPress={() => { setSearch(''); setOpen(!open); }} style={[styles.input, styles.between]}><Text style={[styles.text, { flex: 1 }]}>{value || 'Choose a type'}</Text><ChevronDown size={18} color={colors.teal} /></Pressable>
    {open && <View style={[styles.card, { padding: 10, gap: 8 }]}><TextInput accessibilityLabel="Search suggested types" placeholder="Search suggested types" value={search} onChangeText={setSearch} placeholderTextColor={colors.muted} style={styles.input} /><ScrollView nestedScrollEnabled style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">{visible.map(option => <Pressable key={option.name.toLowerCase()} accessibilityRole="button" accessibilityState={{ selected: option.name === value }} onPress={() => { onSelect(option); setOpen(false); setSearch(''); }} style={[styles.between, { minHeight: 42, paddingHorizontal: 12, borderRadius: 8, backgroundColor: option.name === value ? colors.light : colors.paper }]}><Text style={styles.text}>{option.name}</Text>{option.name === value && <Check size={16} color={colors.teal} />}</Pressable>)}{!visible.length && <Text style={[styles.muted, { padding: 10 }]}>No matching suggested type.</Text>}</ScrollView></View>}
  </View>;
}
const blankReport = (document: MedicalDocument): Report => ({ id: uuid(), documentId: document.id, kind: document.category === 'Laboratory' ? 'lab' : document.category === 'Imaging' ? 'imaging' : 'other', panel: document.title, date: '', dateReviewed: false, facility: '', doctor: '', bodyRegion: '', conclusion: '', conclusionReviewed: false, observations: [], revision: 0 });
const blankObservation = (): Observation => ({ id: uuid(), label: '', parameter: '', value: '', unit: '', range: '', source: 'Manually entered', page: 1, review: { value: 'pending', unit: 'pending', range: 'pending' } });
const reviewComplete = (item: Report) => (!item.date || item.dateReviewed) && (item.kind !== 'lab' || (item.observations.length > 0 && item.observations.every(observation => Object.values(observation.review).every(value => value === 'reviewed')))) && (!item.conclusion || item.conclusionReviewed);
function suggestedReport(document: MedicalDocument, reports: Report[]): Report {
  const existing = reports[0];
  // Re-read stored source text for untouched reports created by an older worker image.
  // A saved correction (revision > 0) always wins over automated suggestions.
  if (document.status === 'review' && document.rawText && !existing) {
    const extracted = extractCandidates(document.rawText, document.id)[0]!;
    return extracted;
  }
  return existing ?? blankReport(document);
}
function suggestedDocument(document: MedicalDocument, reports: Report[]): MedicalDocument {
  const filenameTitle = document.filename.replace(/\.[^.]+$/, '');
  if (document.status !== 'review' || !document.rawText || reports.length > 0 || ![filenameTitle.toLowerCase(), 'scanned report'].includes(document.title.toLowerCase())) return document;
  const title = suggestedReport(document, reports).panel;
  return title && !['Report', 'Laboratory results'].includes(title) ? { ...document, title } : document;
}

export default function DocumentReview({ showInterpretation, onInterpretationChange, document, reports, knownPanels = [], onClose, onSaved, notify }: Props) {
  const [current, setCurrent] = useState(structuredClone(suggestedDocument(document, reports)));
  const [report, setReport] = useState<Report>(structuredClone(suggestedReport(document, reports)));
  const [drafts, setDrafts] = useState<Record<string, Report>>({});
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => setConfirmed(false), [report, current, drafts]);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  useEffect(() => setSelectedPage(null), [report.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if ((['queued', 'processing'].includes(current.status) && !['queued', 'processing'].includes(document.status)) || reports.some(item => item.id === report.id && item.revision > report.revision)) {
      setCurrent(structuredClone(suggestedDocument(document, reports)));
      setReport(structuredClone(reports.find(item => item.id === report.id) ?? suggestedReport(document, reports)));
    }
  }, [document.status, reports]);
  const valuesVisible = report.kind === 'lab' || report.observations.length > 0;
  const careRecord = ['Procedures','Prescriptions','Consultations'].includes(current.category);
  const conclusionVisible = report.kind !== 'lab' || !!report.conclusion || !!report.findings;
  const typeOptions = [...new Map([{ name: report.panel, kind: report.kind }, ...standardTypes, ...knownPanels].filter(option => option.name && option.name !== 'Report').map(option => [option.name.toLowerCase(), option] as const)).values()];
  const matchedPage = current.rawText.split('\f').findIndex(text => !!report.panel && text.toLowerCase().includes(report.panel.toLowerCase()));
  const sourcePage = selectedPage ?? report.sourcePage ?? report.observations[0]?.page ?? (matchedPage >= 0 ? matchedPage + 1 : Math.max(1, reports.findIndex(item => item.id === report.id) + 1));
  const canSave = !busy && ['review', 'ready', 'failed'].includes(current.status);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Please try again.';
      setError(message); notify(message);
    } finally { setBusy(false); }
  };
  const save = async (approve: boolean) => {
    if (approve && !confirmed) throw new Error('Confirm that you checked all panels against the original document.');
    if (!current.title.trim()) throw new Error('Add a document title.');
    if (report.date && !validDate(report.date)) throw new Error('Use a valid date in YYYY-MM-DD format.');
    const pending = [...reports.filter(item => item.id !== report.id).map(item => drafts[item.id] || item), report];
    const nextReports = pending.map(item => approve ? { ...item, panel: item.panel.trim() || current.title.trim(), dateReviewed: !!item.date, conclusionReviewed: true, observations: item.observations.map(observation => ({ ...observation, review: { value: 'reviewed' as const, unit: 'reviewed' as const, range: 'reviewed' as const } })) } : item);
    nextReports.forEach(item => reportSchema.parse(item));
    await saveDocument({ ...current, title: current.title.trim() });
    for (const item of nextReports) await saveReport(item);
    const accepted = approve && nextReports.every(reviewComplete);
    if (accepted) await approveDocument(current.id);
    setDrafts({});
    await onSaved();
    notify(accepted ? 'Review saved. Document status is Accepted.' : 'Report saved. Review the remaining details before accepting the document.');
  };
  const editObservation = (index: number, patch: Partial<Observation>) => setReport(previous => ({ ...previous, observations: previous.observations.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  return <Sheet visible title="Review document" subtitle="Compare each suggested detail with the original above it." wide onClose={() => !busy && onClose()}>
    <DocumentViewer document={current} page={Math.min(Math.max(1, current.pages), sourcePage)} />
    <View style={styles.wrap}>{(report.sourcePages || []).length > 1 && report.sourcePages!.map(page => <Pill key={page} label={`Page ${page}`} active={sourcePage === page} onPress={() => setSelectedPage(page)} />)}</View>
    <View style={styles.wrap}>
      <Button label="Open / share original" icon={Download} secondary small onPress={() => void run(() => shareDocument(current))} />
      <Badge label={current.status === 'ready' ? 'Accepted' : current.status === 'review' ? 'Needs review' : current.status} pending={current.status !== 'ready'} />
      {current.status === 'failed' && <Button label="Retry extraction" secondary small onPress={() => void run(async () => { await retryDocument(current.id); await onSaved(); })} />}
      {!isDemo && ['queued', 'processing', 'failed'].includes(current.status) && <Button label="Review manually" secondary small onPress={() => void run(async () => { await startManualReview(current.id); await onSaved(); })} />}
    </View>
    {!!current.error && <Text style={{ color: colors.amber }}>{current.error}</Text>}

    <View style={styles.divider} />
    <Text style={styles.h2}>General document details</Text>
    <Field label={current.category==='Procedures'?'Procedure name':current.category==='Prescriptions'?'Prescription name':current.category==='Consultations'?'Consultation name':'Document title / name'} value={current.title} onChange={title => setCurrent({ ...current, title })} />
    <Field label="Notes" value={current.notes} onChange={notes => setCurrent({ ...current, notes })} multiline />

    <View style={styles.divider} />
    <Text style={styles.h2}>IMPORTANT DETAILS</Text>
    <Text style={styles.muted}>These fields are suggested from the document. Correct anything the extraction missed.</Text>
    {reports.length > 1 && <View style={styles.wrap}>{reports.map(item => <Pill key={item.id} label={`${item.panel} · p.${item.sourcePage ?? item.observations[0]?.page ?? 1}`} active={item.id === report.id} onPress={() => { setDrafts(previous => ({ ...previous, [report.id]: report })); setReport(structuredClone(drafts[item.id] || item)); }} />)}</View>}
    {!careRecord && <TypePicker value={report.panel} options={typeOptions} onSelect={option => setReport(previous => ({ ...previous, panel: option.name, panelCode: panelCodeForName(option.name), kind: option.kind }))} />}
    <Text style={styles.muted}>Choose a standardized type or an existing test name to group comparisons across dates.</Text>
    <DatePickerField label={current.category==='Procedures'?'Procedure date':current.category==='Prescriptions'?'Prescription date':current.category==='Consultations'?'Consultation date':'Examination date'} value={report.date} onChange={date => setReport({ ...report, date, dateReviewed: false })} />
    <Field label="Doctor" value={report.doctor ?? ''} onChange={doctor => setReport({ ...report, doctor })} />
    <Field label="Laboratory / facility name" value={report.facility} onChange={facility => setReport({ ...report, facility })} />

    {valuesVisible ? <View style={{ gap: 12 }}>
      <View style={styles.between}><Text style={styles.h2}>Values</Text><Button label="Add row" icon={Plus} small secondary onPress={() => setReport({ ...report, observations: [...report.observations, blankObservation()] })} /></View>
      <Text style={styles.muted}>Values include the unit reported by the laboratory. Leave a range blank if the report does not give one.</Text>
      <ObservationGroups observations={report.observations} onEdit={editObservation} onDelete={index=>setReport(previous=>({...previous,observations:previous.observations.filter((_,i)=>i!==index)}))}/>
      {!report.observations.length && <Text style={styles.muted}>No values found. Add rows from the original document.</Text>}
    </View> : null}

    {conclusionVisible && <View style={{ gap: 8 }}><Field label="Conclusion" value={report.conclusion} onChange={conclusion => setReport({ ...report, conclusion, conclusionReviewed: false })} multiline /><Field label={current.category==='Prescriptions'?'Medications (names, doses and instructions)':current.category==='Consultations'?'Consultation details':'Detailed findings / description'} value={report.findings ?? ''} onChange={findings => setReport({ ...report, findings })} multiline /></View>}

    <InterpretationToggle enabled={showInterpretation} onChange={onInterpretationChange} />
    <PanelInsights report={{ ...report, aiInterpretation: reports.some(original => original.id === report.id && interpretationInputs(original) === interpretationInputs(report)) ? report.aiInterpretation : null }} showInterpretation={showInterpretation} />

    {isDemo && <View style={{ gap: 8 }}><Field label="Fictional source text for extraction demo" value={current.rawText} onChange={rawText => setCurrent({ ...current, rawText })} multiline /><Button label="Extract demo details" secondary onPress={() => { const candidate = extractCandidates(current.rawText, current.id)[0]!; setReport(candidate); if (candidate.panel !== 'Report' && candidate.panel !== 'Laboratory results') setCurrent({ ...current, title: candidate.panel }); }} /></View>}

    <View style={[styles.card, { borderWidth: 2, borderColor: confirmed ? colors.teal : colors.red, gap: 4 }]}>
      <CheckRow large label="I checked all panels, values, dates and conclusions against the original document." checked={confirmed} onChange={() => setConfirmed(!confirmed)} />
      <Text style={{ color: colors.red, fontSize: 15, fontWeight: '700' }}>Required: check this box before saving your review.</Text>
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.red }}>{error}</Text>}
    <View style={styles.wrap}><Button label={busy ? 'Saving…' : 'Save review'} icon={Check} disabled={!canSave || !confirmed} onPress={() => void run(() => save(true))} /><Button label="Save draft" secondary disabled={!canSave} onPress={() => void run(() => save(false))} /></View>
    <View style={styles.divider} />
    {confirmDelete ? <Button label="Confirm deletion" danger disabled={busy} onPress={() => void run(async () => { await deleteDocument(current.id); await onSaved(); notify('Document deleted.'); })} /> : <Button label="Delete document" danger icon={Trash2} onPress={() => setConfirmDelete(true)} />}
  </Sheet>;
}

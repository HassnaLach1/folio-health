import { MedicalDocument, Report, Snapshot, uuid } from './domain';

export function demoSnapshot(): Snapshot {
  const documents: MedicalDocument[] = [], reports: Report[] = [];
  const samples = [
    { date: '2026-06-12', facility: 'Atlas Laboratory', hb: '12.8', wbc: '5.6', platelets: '224' },
    { date: '2026-08-19', facility: 'Atlas Laboratory', hb: '13.1', wbc: '6.2', platelets: '238' },
    { date: '2026-10-02', facility: 'Central Laboratory', hb: '132', wbc: '5.9', platelets: '231' }
  ];
  samples.forEach((s, i) => {
    const id = uuid(), unit = i === 2 ? 'g/L' : 'g/dL';
    const text = `SYNTHETIC DEMONSTRATION RECORD\nCBC / NFS\nExamination date: ${s.date}\nHemoglobin ${s.hb} ${unit} ${i === 2 ? '120-160' : '12-16'}\nWBC ${s.wbc} 10^9/L 4-10\nPlatelets ${s.platelets} 10^9/L 150-400`;
    documents.push({ id, title: `Complete blood count`, filename: `sample-cbc-${s.date}.pdf`, category: 'Laboratory', uploadedAt: s.date + 'T12:00:00Z', status: i === 2 ? 'review' : 'ready', pages: 1, bytes: 245000, objectKey: '', mime: 'application/pdf', tags: ['Blood work'], notes: '', rawText: text, checksum: id });
    reports.push({ id: uuid(), documentId: id, kind: 'lab', panel: 'CBC / NFS', date: s.date, dateReviewed: true, facility: s.facility, doctor: '', bodyRegion: '', conclusion: '', conclusionReviewed: false, revision: 0, observations: [
      { label: 'Hemoglobin', parameter: 'hemoglobin', value: s.hb, unit, range: i === 2 ? '120–160 g/L' : '12–16 g/dL' },
      { label: 'White blood cells', parameter: 'wbc', value: s.wbc, unit: '×10⁹/L', range: '4–10 ×10⁹/L' },
      { label: 'Platelets', parameter: 'platelets', value: s.platelets, unit: '×10⁹/L', range: '150–400 ×10⁹/L' }
    ].map(o => ({ ...o, id: uuid(), source: `${o.label} ${o.value} ${o.unit} (${o.range})`, page: 1, review: { value: i === 2 ? 'pending' : 'reviewed', unit: 'reviewed', range: 'reviewed' } })) });
  });
  const id = uuid();
  const conclusion = 'No acute intracranial abnormality identified.\nThis is fictional text for interface demonstration only.';
  documents.push({ id, title: 'Brain MRI report', filename: 'sample-mri.pdf', category: 'Imaging', uploadedAt: '2026-09-24T12:00:00Z', status: 'ready', pages: 2, bytes: 680000, objectKey: '', mime: 'application/pdf', tags: ['MRI'], notes: '', rawText: `SYNTHETIC DEMONSTRATION RECORD\nMRI\nExamination date: 2026-09-24\nConclusion: ${conclusion}`, checksum: id });
  reports.push({ id: uuid(), documentId: id, kind: 'imaging', panel: 'MRI', date: '2026-09-24', dateReviewed: true, facility: 'Atlas Imaging Centre', doctor: '', bodyRegion: 'Brain', conclusion, conclusionReviewed: true, observations: [], revision: 0 });
  return { documents, reports, events: [
    { id: uuid(), title: 'Annual check-up', date: '2026-10-15', time: '10:30', timezone: 'Africa/Casablanca', endDate: '', notes: 'Bring previous reports.', location: 'Family practice', reminderMinutes: 60, reportId: null, documentId: null },
    { id: uuid(), title: 'Blood test appointment', date: '2026-10-22', time: '09:00', timezone: 'Africa/Casablanca', endDate: '', notes: '', location: 'Atlas Laboratory', reminderMinutes: null, reportId: null, documentId: null }
  ] };
}

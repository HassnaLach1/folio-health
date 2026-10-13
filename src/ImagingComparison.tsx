import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { aiDisclaimer, dateLabel, panelKey, Report, imagingRegionsOverlap } from './domain';
import { getImagingComparison, requestImagingComparison } from './backend';
import { Badge, Button, Pill, colors, styles } from './ui';

export default function ImagingComparison({ reports, showInterpretation, include }: { reports: Report[]; showInterpretation: boolean; include: boolean }) {
  const ordered = [...reports].filter(report => report.kind === 'imaging').sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const [earlierId, setEarlier] = useState(''), [laterId, setLater] = useState('');
  const earlier = ordered.find(report => report.id === earlierId) || ordered[0];
  const later = ordered.find(report => report.id === laterId) || ordered[ordered.length - 1];
  const [job, setJob] = useState(''), [summary, setSummary] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const signature = `${showInterpretation}:${earlier?.id}:${earlier?.revision}:${later?.id}:${later?.revision}`;
  const active = useRef(signature); active.current = signature;
  useEffect(() => { setJob(''); setSummary(''); setError(''); setBusy(false); }, [signature]);
  useEffect(() => {
    if (!job || !showInterpretation) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await getImagingComparison(job);
        if (cancelled || active.current !== signature) return;
        if (result.status === 'done') { setSummary(result.summary || ''); setBusy(false); }
        else if (result.status === 'failed' || result.status === 'stale') { setError(result.status === 'stale' ? 'A report changed. Generate a new comparison.' : 'AI comparison is unavailable. You can retry.'); setBusy(false); }
        else timer = setTimeout(() => void poll(), 2000);
      } catch (caught) { if (!cancelled && active.current === signature) { setError(caught instanceof Error ? caught.message : 'Could not load comparison.'); setBusy(false); } }
    };
    void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [job, signature, showInterpretation]);
  if (ordered.length < 2 || !earlier || !later) return null;
  const sameType = panelKey(earlier) === panelKey(later) && imagingRegionsOverlap(earlier.bodyRegion,later.bodyRegion);
  const reviewed = earlier.dateReviewed && later.dateReviewed && earlier.conclusionReviewed && later.conclusionReviewed;
  const valid = earlier.id !== later.id && sameType && reviewed && earlier.date <= later.date && !!earlier.conclusion.trim() && !!later.conclusion.trim();
  async function generate() {
    setBusy(true); setSummary(''); setError(''); setJob('');
    const key = signature;
    try { const id = await requestImagingComparison(earlier!.id, later!.id); if (active.current === key) setJob(id); }
    catch (caught) { if (active.current === key) { setError(caught instanceof Error ? caught.message : 'Could not request comparison.'); setBusy(false); } }
  }
  return <View style={[styles.card, { gap: 16 }]}>
    <Text style={styles.h2}>Compare two imaging reports</Text>
    {(['Earlier report', 'Later report'] as const).map((label, index) => <View key={label} style={{ gap: 8 }}><Text style={styles.muted}>{label}</Text><ScrollView horizontal contentContainerStyle={{ gap: 8 }}>{ordered.map(report => <Pill key={report.id} label={`${dateLabel(report.date, true)} · ${report.facility || report.id.slice(0, 4)}`} active={report.id === (index ? later.id : earlier.id)} onPress={() => index ? setLater(report.id) : setEarlier(report.id)} />)}</ScrollView></View>)}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{[earlier, later].map((report, index) => <View key={index} style={[styles.card, { flex: 1, minWidth: 240, padding: 16, gap: 8 }]}>
      <Text style={styles.h2}>{dateLabel(report.date)}</Text><Badge label={report.conclusionReviewed ? 'Reviewed' : 'Unreviewed'} pending={!report.conclusionReviewed} />
      {report.conclusionReviewed || include ? <><Text style={[styles.text, { fontWeight: '700' }]}>Conclusion</Text><Text style={styles.text}>{report.conclusion || 'Not reported'}</Text></> : <Text style={styles.muted}>Review this report to display its details.</Text>}
    </View>)}</View>
    {showInterpretation && <View style={{ gap: 10 }}>
      <Text style={styles.h2}>AI comparison · short conclusion</Text>
      <Button label={busy ? 'Comparing…' : summary ? 'Compare again' : 'Generate short comparison'} disabled={!valid || busy} onPress={() => void generate()} />
      {!valid && <Text style={styles.muted}>Choose two reviewed reports with confirmed dates, the same study type and shared anatomical areas, ordered earlier to later.</Text>}
      {!!summary && <><Text style={styles.text}>{summary.replace(aiDisclaimer, '').trim()}</Text><Text style={[styles.muted, { fontSize: 12 }]}>{aiDisclaimer}</Text></>}
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.red }}>{error}</Text>}
    </View>}
  </View>;
}

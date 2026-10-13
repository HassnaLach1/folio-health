import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { DoctorBundle, redeemDoctorAccess } from './backend';
import { dateLabel } from './domain';
import { Badge, Button, Busy, colors, styles } from './ui';

export default function DoctorAccess({ token }: { token: string }) {
  const [bundle, setBundle] = useState<DoctorBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (bundle?.expiresAt && now >= new Date(bundle.expiresAt).getTime()) { setBundle(null); setError('Doctor access has expired. Ask the account owner for a new link.'); } }, [bundle, now]);
  useEffect(() => {
    let active = true;
    void redeemDoctorAccess(token).then(result => {
      if (!active) return;
      if (!result) setError('This link has expired or has already been opened. Ask the account owner for a new link.');
      else { setBundle(result); window.history.replaceState(null, '', window.location.pathname + window.location.search); }
    }).catch(() => { if (active) setError('Could not open this access link. Check the local connection and try again.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);
  return <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 50 }}><View style={{ width: '100%', maxWidth: 850, alignSelf: 'center', gap: 18 }}>
    <Text style={styles.title}>Doctor access</Text>
    {loading ? <Busy/> : error ? <View style={styles.card}><Text style={styles.text}>{error}</Text></View> : bundle?.expiresAt && now >= new Date(bundle.expiresAt).getTime() ? <View style={styles.card}><Text style={styles.text}>Doctor access has expired. Ask the account owner for a new link.</Text></View> : bundle && <>
      <View style={[styles.card, { gap: 8 }]}><Badge label="One-time access opened"/><Text style={styles.muted}>These are the account owner’s reviewed records. This page is held in this browser tab. Original-file links expire after 15 minutes.</Text></View>
      {bundle.documents.map(doc => <View key={doc.id} style={[styles.card, { gap: 12 }]}><Text style={styles.h2}>{doc.title}</Text><Text style={styles.muted}>{doc.category}</Text><Button label="Open original" secondary onPress={() => void Linking.openURL(doc.signedUrl)} />{bundle.reports.filter(report => report.documentId === doc.id).map(report => <View key={report.id} style={{ gap: 5, borderTopWidth: 1, borderColor: colors.border, paddingTop: 10 }}><Text style={[styles.text, { fontWeight: '600' }]}>{report.panel} · {dateLabel(report.date)}</Text>{!report.dateReviewed && <Badge label="Date not reviewed" pending/>}<Text style={styles.muted}>{report.facility}</Text>{!!report.conclusion && <Text style={styles.text}>Conclusion: {report.conclusion}</Text>}{!!report.findings && <Text style={styles.text}>Findings: {report.findings}</Text>}{report.observations.map(observation => <Text key={observation.id} style={styles.muted}>{observation.label}: {observation.value} {observation.unit} {observation.range ? `(${observation.range})` : ''}{Object.values(observation.review).every(state => state === 'reviewed') ? '' : ' · Unreviewed'}</Text>)}</View>)}</View>)}
    </>}
  </View></ScrollView>;
}

import React from 'react';
import { Switch, Text, View } from 'react-native';
import { Report, aiDisclaimer, briefRangeSummary } from './domain';
import { Badge, colors, styles } from './ui';

export function InterpretationToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return <View style={[styles.between, { flexWrap: 'wrap' }]}><View style={{ flex: 1, minWidth: 180, gap: 4 }}><Text style={[styles.text, { fontWeight: '600' }]}>Show AI interpretation</Text><Text style={styles.muted}>Simple range checks and comparisons between reports.</Text></View><Switch accessibilityLabel="Show AI interpretation" value={enabled} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.teal }} thumbColor="#fff" /></View>;
}
export default function PanelInsights({ report, showInterpretation }: { report: Report; showInterpretation: boolean }) {
  return <View style={{ gap: 12 }}>
    {!!report.educationalNote && <View style={[styles.card, { backgroundColor: colors.light, gap: 7 }]}><Text style={styles.h2}>What this panel measures</Text><Badge label="AI educational note" /><Text style={styles.text}>{report.educationalNote}</Text></View>}
    {showInterpretation && <View style={[styles.card, { gap: 8, borderColor: colors.amber }]}><Text style={styles.h2}>{report.observations.length ? 'Results at a glance' : 'AI interpretation'}</Text><Badge label={report.observations.length ? 'Calculated from source values and ranges' : 'Generated from extraction suggestions'} pending /><Text style={styles.text}>{report.observations.length ? briefRangeSummary(report) : report.aiInterpretation?.replace(aiDisclaimer, '').trim() || 'No interpretation is available for this panel.'}</Text>{!!report.aiInterpretation && <Text style={[styles.muted, { fontSize: 12 }]}>{aiDisclaimer}</Text>}</View>}
  </View>;
}

import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Share, Text, View, useWindowDimensions } from 'react-native';
import { CalendarDays, Camera, ChevronRight, Clock3, FileUp, ShieldCheck } from 'lucide-react-native';
import { createDoctorAccess, doctorAccessStatus, isDemo, revokeDoctorAccess } from '../backend';
import { MedicalEvent, Snapshot, dateLabel } from '../domain';
import { Badge, Button, colors, styles } from '../ui';

const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
function urgency(date: string) {
  const days = Math.round((new Date(date + 'T12:00:00').getTime() - new Date(today() + 'T12:00:00').getTime()) / 86400000);
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 7 ? `In ${days} days` : dateLabel(date, true);
}

export default function Home({ data, onUpload, onOpenEvent, onOpenCalendar }: { data: Snapshot; onUpload: (camera: boolean) => void; onOpenEvent: (event: MedicalEvent) => void; onOpenCalendar: () => void }) {
  const wide = useWindowDimensions().width >= 700;
  const [access, setAccess] = useState<{ expiresAt: string; redeemedAt: string | null } | null>(null);
  const [previewActive, setPreviewActive] = useState(false);
  const [link, setLink] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [now, setNow] = useState(Date.now());
  useEffect(() => { if (isDemo) return; let active = true; const refresh = () => void doctorAccessStatus().then(result => { if (active) setAccess(result); }).catch(() => {}); refresh(); const timer = setInterval(() => { setNow(Date.now()); refresh(); }, 30000); return () => { active = false; clearInterval(timer); }; }, []);
  const minutes = access ? Math.max(0, Math.ceil((new Date(access.expiresAt).getTime() - now) / 60000)) : 0;
  const active = !!access && !access.redeemedAt && minutes > 0;
  async function generate() { setBusy(true); setError(''); try { const created = await createDoctorAccess(data); setAccess({ expiresAt: created.expiresAt, redeemedAt: null }); setLink(created.link); setNow(Date.now()); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create access.'); } finally { setBusy(false); } }
  async function share() { try { if (Platform.OS === 'web') await navigator.clipboard.writeText(link); else await Share.share({ message: link }); } catch { setError('Could not share the link. Select and copy the link shown below.'); } }
  async function revoke() { setBusy(true); setError(''); try { await revokeDoctorAccess(); setAccess(null); setLink(''); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not revoke access.'); } finally { setBusy(false); } }
  const upcoming = data.events.filter(event => event.date >= today()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 6);
  return <View style={{ gap: 22 }}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}><Button label="Scan Document" icon={Camera} secondary pill small={!wide} onPress={() => onUpload(true)} /></View>
      <View style={{ flex: 1 }}><Button label="Upload Document" icon={FileUp} pill small={!wide} onPress={() => onUpload(false)} /></View>
    </View>
    <View style={[styles.card, { gap: 12, backgroundColor: '#EEF5ED' }]}>
      <View style={[styles.between, { flexWrap: 'wrap' }]}><View style={[styles.row, { flex: 1 }]}><ShieldCheck size={22} color={colors.teal}/><Text style={styles.h2}>One-time doctor access</Text></View><Badge label={isDemo ? previewActive ? 'Preview · expires in 15 min' : 'Preview · inactive' : active ? `Active · expires in ${minutes} min` : access?.redeemedAt ? 'Opened' : 'Not active'} pending={isDemo ? previewActive : active} /></View>
      <Text style={styles.muted}>{isDemo ? 'Preview how temporary access appears here. No access link is created in this frontend demo.' : 'Share reviewed records with a doctor. The link opens once and expires after 15 minutes. Original-file links also expire after 15 minutes. Use fictional records during this local HTTP trial.'}</Text>
      {!!link && active && <Text selectable style={[styles.text, { fontSize: 12 }]}>{link}</Text>}
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.red }}>{error}</Text>}
      {isDemo && <View style={styles.wrap}><Button label={previewActive ? 'Reset preview' : 'Preview active state'} secondary small onPress={() => setPreviewActive(!previewActive)} /></View>}
      {!isDemo && <View style={styles.wrap}><Button label={busy ? 'Working…' : 'Generate access link'} disabled={busy} onPress={() => void generate()} />{!!link && active && <Button label={Platform.OS === 'web' ? 'Copy link' : 'Share link'} secondary disabled={busy} onPress={() => void share()} />}{active && <Button label="Revoke" danger disabled={busy} onPress={() => void revoke()} />}</View>}
    </View>
    <View style={[styles.between, { flexWrap: 'wrap' }]}><View style={styles.row}><CalendarDays size={20} color={colors.teal}/><Text style={styles.h2}>Upcoming events & actions</Text></View><Button label="Open calendar" secondary small onPress={onOpenCalendar} /></View>
    {upcoming.length === 0 ? <View style={styles.card}><Text style={styles.muted}>No upcoming appointments or tasks. Add one in Calendar.</Text></View> : <View style={{ gap: 10 }}>{upcoming.map(event => <Pressable key={event.id} accessibilityRole="button" onPress={() => onOpenEvent(event)} style={[styles.card, { flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', gap: 12, padding: 17 }]}>
      <View style={{ flex: 1, gap: 5 }}><Text style={[styles.text, { fontWeight: '600' }]}>{event.title}</Text><View style={styles.row}><Clock3 size={13} color={colors.muted}/><Text style={styles.muted}>{dateLabel(event.date)}{event.time ? ` · ${event.time}` : ''}{event.location ? ` · ${event.location}` : ''}</Text></View></View>
      <View style={styles.row}><Badge label={urgency(event.date)} pending={event.date <= today()} /><ChevronRight size={17} color={colors.muted}/></View>
    </Pressable>)}</View>}
  </View>;
}

import React from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, X } from 'lucide-react-native';

export const colors = { bg: '#F7F8F4', paper: '#FFFFFF', ink: '#193B36', muted: '#71817B', teal: '#267C69', light: '#EAF3EC', border: '#E1E7E0', amber: '#956B2A', amberBg: '#FFF5DF', red: '#A84C49' };
export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  card: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 22 },
  title: { fontSize: 34, color: colors.ink, fontWeight: '500', letterSpacing: -1, fontFamily: Platform.OS === 'web' ? 'Georgia, serif' : Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  h2: { fontSize: 19, color: colors.ink, fontWeight: '600', letterSpacing: -.3 },
  text: { fontSize: 14, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: 13, color: colors.muted, lineHeight: 21 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.8, color: colors.teal, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: '#FCFDFC', paddingHorizontal: 13, paddingVertical: 11, minHeight: 44, fontSize: 14, color: colors.ink },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, marginVertical: 16 },
});
export function Label({ children }: { children: React.ReactNode }) { return <Text style={[styles.muted, { fontSize: 12, fontWeight: '600', marginBottom: 6 }]}>{children}</Text>; }
export function Field({ label, value, onChange, multiline, placeholder, secure }: { label: string; value: string; onChange: (s: string) => void; multiline?: boolean; placeholder?: string; secure?: boolean }) {
  return <View style={{ gap: 2, flexGrow: 1 }}><Label>{label}</Label><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} multiline={multiline} placeholder={placeholder} placeholderTextColor={colors.muted} secureTextEntry={secure} autoCapitalize="none" style={[styles.input, multiline && { minHeight: 95, textAlignVertical: 'top' }]} /></View>;
}
export function Button({ label, onPress, icon: Icon, secondary = false, danger = false, disabled = false, small = false }: { label: string; onPress: () => void; icon?: any; secondary?: boolean; danger?: boolean; disabled?: boolean; small?: boolean }) {
  const fg = danger ? colors.red : secondary ? colors.ink : '#fff';
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ hovered, pressed }: any) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingHorizontal: small ? 13 : 18, paddingVertical: small ? 9 : 13, minHeight: 42, backgroundColor: danger ? '#FFF1EF' : secondary ? colors.paper : colors.teal, borderWidth: 1, borderColor: secondary ? colors.border : 'transparent', opacity: disabled ? .45 : pressed ? .7 : hovered ? .87 : 1 })}>{Icon && <Icon size={17} color={fg} strokeWidth={1.8} />}<Text style={{ fontSize: small ? 12 : 13, fontWeight: '600', color: fg }}>{label}</Text></Pressable>;
}
export function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityState={{ selected: active }} onPress={onPress} style={{ borderRadius: 9, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: active ? colors.ink : colors.paper, borderWidth: 1, borderColor: active ? colors.ink : colors.border }}><Text style={{ fontSize: 12, fontWeight: '500', color: active ? '#fff' : colors.muted }}>{label}</Text></Pressable>;
}
export function Badge({ label, pending = false }: { label: string; pending?: boolean }) { return <View style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, backgroundColor: pending ? colors.amberBg : colors.light }}><View style={{ width: 4, height: 4, borderRadius: 4, backgroundColor: pending ? colors.amber : colors.teal }} /><Text style={{ fontSize: 10, fontWeight: '600', color: pending ? colors.amber : colors.teal }}>{label}</Text></View>; }
export function CheckRow({ label, checked, onChange, compact }: { label: string; checked: boolean; onChange: () => void; compact?: boolean }) { return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} aria-checked={checked} onPress={onChange} style={[styles.row, { minHeight: 40 }]}><View style={{ width: 19, height: 19, borderRadius: 5, borderWidth: 1, borderColor: checked ? colors.teal : colors.border, backgroundColor: checked ? colors.teal : '#fff', alignItems: 'center', justifyContent: 'center' }}>{checked && <Check size={13} color="#fff" />}</View>{!compact&&<Text style={[styles.muted, { flex: 1 }]}>{label}</Text>}</Pressable>; }
export function Sheet({ visible, title, subtitle, onClose, children, wide }: { visible: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}><View style={{ flex: 1, backgroundColor: '#15372F77', justifyContent: 'center', alignItems: 'center', padding: 16 }}><View style={{ width: '100%', maxWidth: wide ? 960 : 560, maxHeight: '94%', backgroundColor: colors.bg, borderRadius: 22, overflow: 'hidden' }}><View style={[styles.between, { padding: 22, borderBottomWidth: 1, borderBottomColor: colors.border }]}><View style={{ flex: 1 }}><Text style={styles.h2}>{title}</Text>{subtitle && <Text style={styles.muted}>{subtitle}</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel="Close dialog" onPress={onClose} style={{ padding: 10 }}><X size={20} color={colors.muted} /></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 22, gap: 18 }}>{children}</ScrollView></View></View></Modal>;
}
export function Empty({ title, detail }: { title: string; detail: string }) { return <View style={{ alignItems: 'center', padding: 45, gap: 8 }}><Text style={styles.h2}>{title}</Text><Text style={[styles.muted, { textAlign: 'center', maxWidth: 360 }]}>{detail}</Text></View>; }
export function Busy() { return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.teal} /></View>; }

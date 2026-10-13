import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react-native';
import { MedicalDocument } from './domain';
import { originalBytes } from './backend';
import { colors, styles } from './ui';

export default function DocumentViewer({ document, page = 1 }: { document: MedicalDocument; page?: number }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [selectedPage, setSelectedPage] = useState(page);
  useEffect(() => { setSelectedPage(page); }, [page, document.id]);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setLoading(true); setError(''); setUrl('');
    void originalBytes(document).then(bytes => {
      if (!active) return;
      if (!bytes) return;
      objectUrl = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: document.mime }));
      setUrl(objectUrl);
    }).catch(() => { if (active) setError('Could not load the original document.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [document.id, document.objectKey]);
  const image = document.mime.startsWith('image/');
  const pageCount = Math.max(1, document.pages);
  const sourcePage = Math.min(pageCount, Math.max(1, page));
  const displayedPage = Math.min(pageCount, Math.max(1, selectedPage));
  return <View style={{ gap: 10 }}>
    <View style={[styles.between, { flexWrap: 'wrap' }]}><Text style={styles.h2}>Original document</Text><Text style={styles.muted}>{pageCount} {pageCount === 1 ? 'page' : 'pages'} · Panel source: page {sourcePage}</Text></View>
    <View style={[styles.between, { flexWrap: 'wrap' }]}><View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel="Previous page" disabled={image || displayedPage <= 1} onPress={() => setSelectedPage(displayedPage - 1)} style={{ opacity: image || displayedPage <= 1 ? .4 : 1, padding: 7 }}><ChevronLeft size={20} color={colors.ink} /></Pressable><Text style={styles.text}>Page {displayedPage} of {pageCount}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next page" disabled={image || displayedPage >= pageCount} onPress={() => setSelectedPage(displayedPage + 1)} style={{ opacity: image || displayedPage >= pageCount ? .4 : 1, padding: 7 }}><ChevronRight size={20} color={colors.ink} /></Pressable></View><View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel="Zoom out" disabled={zoom <= 1} onPress={() => setZoom(value => Math.max(1, value - .25))} style={{ opacity: zoom <= 1 ? .4 : 1, padding: 7 }}><ZoomOut size={19} color={colors.ink} /></Pressable><Text style={styles.muted}>{Math.round(zoom * 100)}%</Text><Pressable accessibilityRole="button" accessibilityLabel="Zoom in" disabled={zoom >= 4} onPress={() => setZoom(value => Math.min(4, value + .25))} style={{ opacity: zoom >= 4 ? .4 : 1, padding: 7 }}><ZoomIn size={19} color={colors.ink} /></Pressable></View></View>
    {!image && pageCount > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>{Array.from({ length: pageCount }, (_, index) => index + 1).map(number => <Pressable key={number} accessibilityRole="button" accessibilityLabel={`Page ${number}${number === sourcePage ? ', active panel source' : ''}`} accessibilityState={{ selected: number === displayedPage }} onPress={() => setSelectedPage(number)} style={{ minWidth: 40, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: number === sourcePage ? colors.teal : colors.border, backgroundColor: number === displayedPage ? colors.teal : colors.paper }}><Text style={{ color: number === displayedPage ? '#fff' : colors.ink, fontWeight: '600' }}>{number}</Text></Pressable>)}</ScrollView>}
    <View style={{ height: 420, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E9ECE8' }}>
      {loading ? <ActivityIndicator style={{ marginTop: 170 }} color={colors.teal}/> : error ? <Text style={[styles.muted, { padding: 20 }]}>{error}</Text> : url ? image
        ? React.createElement('div', { style: { width: '100%', height: '100%', overflow: 'auto', textAlign: 'center' } }, React.createElement('img', { src: url, alt: document.title, style: { width: `${zoom * 100}%`, maxWidth: 'none', height: 'auto' } }))
        : React.createElement('iframe', { src: `${url}#page=${displayedPage}&zoom=${Math.round(zoom * 100)}`, title: document.title, style: { width: '100%', height: '100%', border: 0 } })
        : <Text style={[styles.muted, { padding: 20 }]}>{document.rawText || 'Original preview is unavailable. Use Open / share original to view the file.'}</Text>}
    </View>
  </View>;
}

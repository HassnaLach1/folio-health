import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react-native';
import { File, Paths } from 'expo-file-system';
import { MedicalDocument } from './domain';
import { originalBytes } from './backend';
import { colors, styles } from './ui';

let PdfComponent: typeof import('react-native-pdf').default | null = null;
try { PdfComponent = require('react-native-pdf').default; } catch { /* Expo Go lacks the native PDF module. */ }

export default function DocumentViewer({ document, page = 1 }: { document: MedicalDocument; page?: number }) {
  const [uri, setUri] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [selectedPage, setSelectedPage] = useState(page);
  const pdfRef = useRef<{ setPage: (pageNumber: number) => void } | null>(null);
  useEffect(() => { setSelectedPage(page); pdfRef.current?.setPage(page); }, [page, document.id]);
  const [width, setWidth] = useState(320);
  const [ratio, setRatio] = useState(1.4);
  useEffect(() => {
    let active = true;
    const file = new File(Paths.cache, `review-${document.id}-${Date.now()}.${document.mime === 'application/pdf' ? 'pdf' : document.mime === 'image/png' ? 'png' : 'jpg'}`);
    setLoading(true); setError(''); setUri('');
    void originalBytes(document).then(bytes => {
      if (!active || !bytes) return;
      file.write(bytes);
      setUri(file.uri);
    }).catch(() => { if (active) setError('Could not load the original document.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; try { if (file.exists) file.delete(); } catch { /* Cache cleanup is best effort. */ } };
  }, [document.id, document.objectKey]);
  useEffect(() => { if (uri && document.mime.startsWith('image/')) Image.getSize(uri, (w, h) => setRatio(h / w), () => setRatio(1.4)); }, [uri, document.mime]);
  const image = document.mime.startsWith('image/');
  const pageCount = Math.max(1, document.pages);
  const sourcePage = Math.min(pageCount, Math.max(1, page));
  const displayedPage = Math.min(pageCount, Math.max(1, selectedPage));
  const goToPage = (number: number) => { setSelectedPage(number); pdfRef.current?.setPage(number); };
  return <View style={{ gap: 10 }}>
    <View style={[styles.between, { flexWrap: 'wrap' }]}><Text style={styles.h2}>Original document</Text><Text style={styles.muted}>{pageCount} {pageCount === 1 ? 'page' : 'pages'} · Panel source: page {sourcePage}</Text></View>
    <View style={[styles.between, { flexWrap: 'wrap' }]}><View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel="Previous page" disabled={image || displayedPage <= 1} onPress={() => goToPage(displayedPage - 1)} style={{ opacity: image || displayedPage <= 1 ? .4 : 1, padding: 7 }}><ChevronLeft size={20} color={colors.ink} /></Pressable><Text style={styles.text}>Page {displayedPage} of {pageCount}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next page" disabled={image || displayedPage >= pageCount} onPress={() => goToPage(displayedPage + 1)} style={{ opacity: image || displayedPage >= pageCount ? .4 : 1, padding: 7 }}><ChevronRight size={20} color={colors.ink} /></Pressable></View><View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel="Zoom out" disabled={zoom <= 1} onPress={() => setZoom(value => Math.max(1, value - .25))} style={{ opacity: zoom <= 1 ? .4 : 1, padding: 7 }}><ZoomOut size={19} color={colors.ink} /></Pressable><Text style={styles.muted}>{Math.round(zoom * 100)}%</Text><Pressable accessibilityRole="button" accessibilityLabel="Zoom in" disabled={zoom >= 4} onPress={() => setZoom(value => Math.min(4, value + .25))} style={{ opacity: zoom >= 4 ? .4 : 1, padding: 7 }}><ZoomIn size={19} color={colors.ink} /></Pressable></View></View>
    {!image && pageCount > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>{Array.from({ length: pageCount }, (_, index) => index + 1).map(number => <Pressable key={number} accessibilityRole="button" accessibilityLabel={`Page ${number}${number === sourcePage ? ', active panel source' : ''}`} accessibilityState={{ selected: number === displayedPage }} onPress={() => goToPage(number)} style={{ minWidth: 40, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: number === sourcePage ? colors.teal : colors.border, backgroundColor: number === displayedPage ? colors.teal : colors.paper }}><Text style={{ color: number === displayedPage ? '#fff' : colors.ink, fontWeight: '600' }}>{number}</Text></Pressable>)}</ScrollView>}
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height: 420, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E9ECE8' }}>
      {loading ? <ActivityIndicator style={{ marginTop: 170 }} color={colors.teal}/> : error ? <Text style={[styles.muted, { padding: 20 }]}>{error}</Text> : uri ? image
        ? <ScrollView nestedScrollEnabled horizontal><ScrollView nestedScrollEnabled><Image source={{ uri }} resizeMode="contain" style={{ width: width * zoom, height: width * zoom * ratio }} /></ScrollView></ScrollView>
        : PdfComponent ? <PdfComponent ref={pdfRef} key={page} source={{ uri }} page={displayedPage} scale={zoom} style={{ flex: 1, width: '100%' }} minScale={1} maxScale={4} enableDoubleTapZoom scrollEnabled trustAllCerts={false} onPageChanged={number => setSelectedPage(number)} onError={() => setError('Could not display this PDF. Open the original file instead.')} />
        : <Text style={[styles.muted, { padding: 20 }]}>Inline PDF viewing requires the Android APK. Open the original file to review it in Expo Go.</Text>
        : <ScrollView contentContainerStyle={{ padding: 20 }}><Text style={styles.muted}>{document.rawText || 'Original preview is unavailable. Use Open / share original to view the file.'}</Text></ScrollView>}
    </View>
  </View>;
}

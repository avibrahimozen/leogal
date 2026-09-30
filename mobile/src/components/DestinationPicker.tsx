import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { searchPlaces, type GeocodeResult } from '../api/geocode';
import { PLACES, type Place } from '../data/places';
import { normalizeTr } from '../data/regions';
import { colors, radius, spacing } from '../theme';

/**
 * Hedef seçici (modal):
 *  (a) arama kutusu — OpenStreetMap Nominatim ile Türkiye + Kıbrıs'ta yer arar
 *      (500 ms bekleme, en az 3 karakter; bkz. api/geocode.ts politika notu),
 *  (b) arama boşken data/places.ts'teki KKTC hızlı yerleri,
 *  (c) `onPickOnMap` verilirse "Haritadan seç" satırı.
 *
 * Kendi durumunu yönetir; ekrana yalnızca `visible` + geri çağrılar bağlanır.
 */
export interface DestinationPickerProps {
  visible: boolean;
  onClose: () => void;
  /** Seçilen yer; `country` alış noktasına değil hedefe göre (Kıbrıs kutusu) belirlenir. */
  onSelect: (place: Place) => void;
  /** Verilirse listenin en üstünde "📍 Haritadan seç" satırı görünür ve bu çağrılır. */
  onPickOnMap?: () => void;
  /** Verilirse en üstte "📡 Mevcut konumum" satırı görünür (alış noktası seçerken). */
  onUseCurrentLocation?: () => void;
  /** Haritadan seç satırının alt açıklaması */
  mapHint?: string;
  title?: string;
}

const SEARCH_DEBOUNCE_MS = 500;
const MIN_QUERY_LENGTH = 3;

type Row = { key: string; place: Place; detail: string; source: 'local' | 'osm' };

export default function DestinationPicker({
  visible,
  onClose,
  onSelect,
  onPickOnMap,
  onUseCurrentLocation,
  mapHint = 'Hedefi haritada işaretle',
  title = 'Nereye?',
}: DestinationPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const requestSeq = useRef(0);

  // Kapanınca temizle
  useEffect(() => {
    if (!visible) {
      requestSeq.current += 1;
      setQuery('');
      setResults([]);
      setSearching(false);
      setError('');
    }
  }, [visible]);

  // Bekletmeli Nominatim araması; eski istekler sıra numarasıyla yok sayılır
  useEffect(() => {
    const q = query.trim();
    const seq = ++requestSeq.current;
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchPlaces(q, controller.signal);
        if (seq !== requestSeq.current) return;
        setResults(found);
        setError('');
      } catch (e) {
        if (seq !== requestSeq.current || (e instanceof Error && e.name === 'AbortError')) return;
        setResults([]);
        setError('Arama yapılamadı. İnternet bağlantını kontrol et.');
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const rows = useMemo<Row[]>(() => {
    const q = normalizeTr(query);
    const local = (q ? PLACES.filter((p) => normalizeTr(p.name).includes(q) || normalizeTr(p.city).includes(q)) : PLACES).map(
      (p): Row => ({ key: `local:${p.name}`, place: p, detail: p.city, source: 'local' }),
    );
    const remote = results.map(
      (r): Row => ({
        key: `osm:${r.lat},${r.lng}`,
        place: { name: r.name, city: r.city, country: r.country, lat: r.lat, lng: r.lng },
        detail: r.detail || r.city,
        source: 'osm',
      }),
    );
    return [...local, ...remote];
  }, [query, results]);

  const hasQuery = query.trim().length > 0;
  const tooShort = hasQuery && query.trim().length < MIN_QUERY_LENGTH;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.close}>Kapat</Text>
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            placeholder="Adres, yer veya şehir ara..."
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching && <ActivityIndicator style={styles.spinner} color={colors.primary} />}
        </View>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              {onUseCurrentLocation && (
                <Pressable style={styles.mapRow} onPress={onUseCurrentLocation}>
                  <Text style={styles.mapRowText}>📡 Mevcut konumum</Text>
                  <Text style={styles.mapRowHint}>GPS konumunu kullan</Text>
                </Pressable>
              )}
              {onPickOnMap && (
                <Pressable style={styles.mapRow} onPress={onPickOnMap}>
                  <Text style={styles.mapRowText}>📍 Haritadan seç</Text>
                  <Text style={styles.mapRowHint}>{mapHint}</Text>
                </Pressable>
              )}
              {error !== '' && <Text style={styles.error}>{error}</Text>}
              {rows.length > 0 && (
                <Text style={styles.sectionLabel}>{hasQuery ? 'Sonuçlar' : 'Sık gidilen yerler'}</Text>
              )}
            </>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onSelect(item.place)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.place.name}
                </Text>
                <Text style={styles.detail} numberOfLines={1}>
                  {item.detail}
                </Text>
              </View>
              <Text style={styles.tag}>{item.source === 'local' ? '⭐' : item.place.country === 'TR' ? 'TR' : 'KKTC'}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tooShort
                ? 'Aramak için en az 3 karakter yaz.'
                : searching
                  ? 'Aranıyor...'
                  : 'Sonuç bulunamadı. Başka bir arama dene veya haritadan seç.'}
            </Text>
          }
          ListFooterComponent={
            <Text style={styles.attribution}>Arama sonuçları © OpenStreetMap katkıcıları (Nominatim)</Text>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing(4),
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink },
  close: { fontSize: 15, fontWeight: '600', color: colors.info },
  searchWrap: { marginHorizontal: spacing(4), marginBottom: spacing(2), justifyContent: 'center' },
  search: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: spacing(3.5),
    paddingRight: spacing(10),
    fontSize: 16,
    color: colors.ink,
  },
  spinner: { position: 'absolute', right: spacing(3.5) },
  mapRow: {
    marginHorizontal: spacing(4),
    marginBottom: spacing(2),
    padding: spacing(3.5),
    borderRadius: radius.md,
    backgroundColor: '#FEF3C7',
  },
  mapRowText: { fontSize: 16, fontWeight: '700', color: colors.ink },
  mapRowHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: spacing(4),
    paddingTop: spacing(2),
    paddingBottom: spacing(1),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(4),
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  name: { fontSize: 16, fontWeight: '600', color: colors.ink },
  detail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  tag: { fontSize: 12, fontWeight: '700', color: colors.muted, marginLeft: spacing(3) },
  error: { color: colors.danger, fontSize: 13, paddingHorizontal: spacing(4), paddingVertical: spacing(2) },
  empty: { textAlign: 'center', color: colors.muted, marginTop: spacing(8), paddingHorizontal: spacing(6) },
  attribution: { textAlign: 'center', color: colors.muted, fontSize: 11, paddingVertical: spacing(4) },
});

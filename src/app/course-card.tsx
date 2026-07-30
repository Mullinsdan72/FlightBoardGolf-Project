import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Wordmark } from '@/components/Wordmark';
import { useRound } from '@/context/RoundContext';
import type { Hole } from '@/data/seed';
import { colors, font } from '@/theme';

type Row = { par: string; yards: string; handicap: string };

/**
 * Eighteen rows, pre-filled with something plausible.
 *
 * A blank grid of 54 empty boxes is a wall. Par 4 everywhere and stroke index
 * 1..18 in order is wrong on most courses but right on some holes of all of
 * them, so it turns "fill in a card" into "correct a card" — and you can see at
 * a glance which rows you have not touched yet.
 */
const blankRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ par: '4', yards: '', handicap: String(i + 1) }));

/**
 * Type a scorecard in by hand.
 *
 * Reached from "Course not listed?" on the ROUND tab, and deliberately has **no
 * course search on it** — arriving here means search has already failed you, so
 * offering it again is the redundancy this screen exists to remove.
 *
 * Everything else in the app writes as you tap. This is the one place a Save
 * button is right: a half-typed card is not a card, and saving one would put a
 * course in your favourites with nine missing pars.
 */
export default function CourseCardScreen() {
  const { saveManualCourse, toggleFavorite } = useRound();

  const [courseName, setCourseName] = useState('');
  const [location, setLocation] = useState('');
  const [teeName, setTeeName] = useState('');
  const [rows, setRows] = useState<Row[]>(blankRows(18));
  const [busy, setBusy] = useState(false);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const setCount = (count: number) =>
    setRows((prev) => (count <= prev.length ? prev.slice(0, count) : [...prev, ...blankRows(count).slice(prev.length)]));

  const parsed: Hole[] = rows.map((r, i) => ({
    hole: i + 1,
    par: Number(r.par) || 0,
    yards: Number(r.yards) || 0,
    handicap: Number(r.handicap) || 0,
  }));

  const parTotal = parsed.reduce((a, h) => a + h.par, 0);
  const badPar = parsed.some((h) => h.par < 3 || h.par > 6);
  // Stroke index decides which holes a handicap lands on, so a duplicated or
  // missing one silently gives somebody a shot on the wrong hole. Worth checking
  // rather than discovering at the settle-up.
  const indices = parsed.map((h) => h.handicap);
  const badIndex =
    indices.some((n) => n < 1 || n > rows.length) || new Set(indices).size !== rows.length;

  const canSave = courseName.trim().length > 0 && !badPar && !badIndex && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    const courseId = await saveManualCourse({
      courseName: courseName.trim(),
      location: location.trim(),
      teeName: teeName.trim() || 'Default',
      holes: parsed,
    });
    // Nobody types a card twice, so it goes straight into your favourites.
    if (courseId) await toggleFavorite(courseId);
    setBusy(false);

    if (!courseId) {
      Alert.alert('Could not save that card', 'Check your connection and try again — nothing was lost.');
      return;
    }
    router.replace('/(tabs)/round');
  };

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/round'))}
          hitSlop={10}
          style={styles.backBtn}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>ROUND SETUP</Text>
        </Pressable>

        <Wordmark width={160} />
        <Text style={styles.kicker}>Course not listed</Text>
        <Text style={styles.title}>Type the card in</Text>
        <Text style={styles.note}>
          Copy it off the scorecard at the first tee. It saves to your courses, so you only ever do this once for a
          given course.
        </Text>

        <Text style={styles.fieldLabel}>Course name</Text>
        <TextInput
          value={courseName}
          onChangeText={setCourseName}
          placeholder="Gladstan Golf Course"
          placeholderTextColor={colors.ghost}
          style={styles.input}
          autoCapitalize="words"
        />

        <Text style={styles.fieldLabel}>Town · optional</Text>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="Payson, UT"
          placeholderTextColor={colors.ghost}
          style={styles.input}
          autoCapitalize="words"
        />

        <Text style={styles.fieldLabel}>Tee · optional</Text>
        <TextInput
          value={teeName}
          onChangeText={setTeeName}
          placeholder="Blue"
          placeholderTextColor={colors.ghost}
          style={styles.input}
          autoCapitalize="words"
        />

        <Text style={styles.fieldLabel}>How many holes</Text>
        <View style={styles.countRow}>
          {[9, 18].map((n) => (
            <Pressable key={n} onPress={() => setCount(n)} style={[styles.countBtn, rows.length === n && styles.countOn]}>
              <Text style={[styles.countLabel, rows.length === n && styles.countLabelOn]}>{n} HOLES</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.gridHead}>
          <Text style={[styles.headCell, { width: 34 }]}>HOLE</Text>
          <Text style={styles.headCell}>PAR</Text>
          <Text style={styles.headCell}>YARDS</Text>
          <Text style={styles.headCell}>S.I.</Text>
        </View>

        {rows.map((r, i) => (
          <View key={i} style={styles.gridRow}>
            <Text style={styles.holeNo}>{i + 1}</Text>
            <TextInput
              value={r.par}
              onChangeText={(v) => setRow(i, { par: v })}
              style={styles.cell}
              keyboardType="number-pad"
              maxLength={1}
            />
            <TextInput
              value={r.yards}
              onChangeText={(v) => setRow(i, { yards: v })}
              placeholder="–"
              placeholderTextColor={colors.ghost}
              style={styles.cell}
              keyboardType="number-pad"
              maxLength={3}
            />
            <TextInput
              value={r.handicap}
              onChangeText={(v) => setRow(i, { handicap: v })}
              style={styles.cell}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
        ))}

        <Text style={styles.total}>Par {parTotal} over {rows.length} holes</Text>

        {badPar && <Text style={styles.error}>Every par has to be between 3 and 6.</Text>}
        {badIndex && (
          <Text style={styles.error}>
            Stroke index must use each number from 1 to {rows.length} exactly once — it decides which holes a handicap
            gives a shot on, so a repeat quietly puts the shot on the wrong hole.
          </Text>
        )}

        <Pressable onPress={save} disabled={!canSave} style={[styles.saveBtn, !canSave && styles.saveOff]}>
          <Text style={styles.saveLabel}>{busy ? 'SAVING…' : 'SAVE AND USE CARD'}</Text>
          <Text style={styles.saveArrow}>→</Text>
        </Pressable>

        <Text style={styles.note}>
          Saving makes this the round's course and stars it as a favourite. Yardages can be left blank — they show on
          the card but nothing is calculated from them.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 44 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backArrow: { fontFamily: font.heading, fontSize: 20, color: colors.accent, lineHeight: 22 },
  backLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7, color: colors.accent },
  kicker: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.accent,
    marginTop: 18,
  },
  title: { fontFamily: font.heading, fontSize: 28, letterSpacing: -0.6, marginTop: 8, color: colors.text },
  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, marginTop: 12 },
  error: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.accent, marginTop: 12 },
  fieldLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 22,
  },
  input: {
    fontFamily: font.heading,
    fontSize: 19,
    color: colors.text,
    borderBottomWidth: 2,
    borderColor: colors.text,
    paddingVertical: 8,
    marginTop: 8,
  },
  countRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  countBtn: { flex: 1, borderWidth: 2, borderColor: colors.divider, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  countOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  countLabel: { fontFamily: font.heading, fontSize: 11, letterSpacing: 0.5, color: colors.text },
  countLabelOn: { color: '#fff' },
  gridHead: { flexDirection: 'row', gap: 8, marginTop: 26, paddingBottom: 6, borderBottomWidth: 2, borderColor: colors.divider },
  headCell: {
    flex: 1,
    fontFamily: font.bodySemi,
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: colors.divider },
  holeNo: { width: 34, fontFamily: font.heading, fontSize: 14, color: colors.muted },
  cell: {
    flex: 1,
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 11,
  },
  total: { fontFamily: font.heading, fontSize: 15, color: colors.text, marginTop: 16 },
  saveBtn: {
    marginTop: 24,
    height: 76,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  saveOff: { opacity: 0.35 },
  saveLabel: { fontFamily: font.heading, fontSize: 17, letterSpacing: 0.3, color: '#fff' },
  saveArrow: { fontFamily: font.heading, fontSize: 20, color: '#fff' },
});

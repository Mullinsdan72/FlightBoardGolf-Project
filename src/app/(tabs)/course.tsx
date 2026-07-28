import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRound } from '@/context/RoundContext';
import type { Hole } from '@/data/seed';
import { fetchCourseDetail, searchCourses, type CourseSearchResult, type TeeSet } from '@/lib/courseApi';
import type { HolesInPlay, SavedCourse } from '@/hooks/useRoundCourse';
import { parTotalFor } from '@/lib/roundMath';
import { SetupBar, useInSetup } from '@/components/SetupBar';
import { colors, font } from '@/theme';

const PLAY_SETS: Array<{ key: HolesInPlay; label: string; sub: string }> = [
  { key: 'front9', label: 'FRONT 9', sub: 'holes 1–9' },
  { key: 'back9', label: 'BACK 9', sub: 'holes 10–18' },
  { key: 'all18', label: 'ALL 18', sub: 'full round' },
];

export default function CourseScreen() {
  const {
    holes,
    allHoles,
    holesInPlay,
    setHolesInPlay,
    course,
    savedCourses,
    cacheCourse,
    selectCourseTee,
    toggleFavorite,
    favoriteFromSearch,
    saveManualCourse,
  } = useRound();
  const inSetup = useInSetup();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CourseSearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  // "Your courses" is the starred list, nothing more — unstarring is how you
  // take a course off it. Unstarred courses stay in the cache so re-adding one
  // costs no API lookup; they're just not clutter on this screen.
  const favorites = savedCourses.filter((c) => c.isFavorite);
  const selectedCourse = savedCourses.find((c) => c.id === course?.courseId);
  const activeTee = selectedCourse?.tees.find(
    (t) => t.teeName === course?.teeName && t.gender === course?.teeGender,
  );

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 3) {
      setSearchError('Type at least three letters.');
      return;
    }
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const found = await searchCourses(q);
      setResults(found);
      if (!found.length) setSearchError(`Nothing found for “${q}”. Try the club name, or enter the card by hand.`);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  // One lookup per course, ever. Search already returned the full card, so this
  // spends no further quota — it only falls back to a detail fetch if the
  // result somehow arrived without tees.
  const pickSearchResult = async (r: CourseSearchResult) => {
    setPendingId(r.externalId);
    try {
      const detail = r.tees.length
        ? {
            externalId: r.externalId,
            clubName: r.clubName,
            courseName: r.courseName,
            location: r.location,
            tees: r.tees,
            raw: r.raw,
          }
        : await fetchCourseDetail(r.externalId);

      const courseId = await cacheCourse(detail);
      if (!courseId) {
        Alert.alert('Could not save', 'The course was found but could not be saved. Check your connection.');
        return;
      }
      await selectCourseTee(courseId, detail.tees[0], {
        clubName: detail.clubName,
        courseName: detail.courseName || detail.clubName,
        location: detail.location,
      });
      setResults(null);
      setQuery('');
    } catch (err) {
      Alert.alert('Could not load that course', err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  };

  // Starring a search result caches it and favourites it, without making it the
  // round's course — you might want it saved for next week, not for today.
  const starSearchResult = async (r: CourseSearchResult) => {
    const saved = savedCourses.find((c) => c.id === `gca:${r.externalId}`);
    const message = saved
      ? await toggleFavorite(saved.id)
      : await favoriteFromSearch({
          externalId: r.externalId,
          clubName: r.clubName,
          courseName: r.courseName,
          location: r.location,
          tees: r.tees,
          raw: r.raw,
        });
    if (message) Alert.alert('Could not save that favourite', message);
  };

  const star = async (courseId: string) => {
    const message = await toggleFavorite(courseId);
    if (message) Alert.alert('Could not save that favourite', message);
  };

  const pickSaved = async (c: SavedCourse, tee?: TeeSet) => {
    const chosen = tee ?? c.tees[0];
    if (!chosen) {
      Alert.alert('No hole data', 'That saved course has no tee data. Enter its card by hand.');
      return;
    }
    await selectCourseTee(c.id, chosen, {
      clubName: c.clubName,
      courseName: c.courseName || c.clubName,
      location: c.location,
    });
  };

  if (manualOpen) {
    return <ManualCourseForm onCancel={() => setManualOpen(false)} onSave={saveManualCourse} />;
  }

  return (
    <View style={styles.screen}>
      <SetupBar step="course" />
      <View style={[styles.header, inSetup && styles.headerInSetup]}>
        <Text style={styles.kicker}>The card this round is played on</Text>
        <Text style={styles.title}>Course</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled">
        {/* Selected course */}
        <View style={styles.selectedBlock}>
          {course?.courseId || allHoles.length ? (
            <>
              <Text style={styles.selectedName}>{course?.courseName || 'Course'}</Text>
              <Text style={styles.selectedMeta}>
                {activeTee
                  ? [
                      activeTee.courseRating ? `rating ${activeTee.courseRating}` : null,
                      activeTee.slopeRating ? `slope ${activeTee.slopeRating}` : null,
                      activeTee.totalYards ? `${activeTee.totalYards.toLocaleString()} yds` : null,
                    ]
                      .filter(Boolean)
                      .join(' / ') || course?.courseMeta
                  : course?.courseMeta}
              </Text>
              <View style={styles.cacheNote}>
                <View style={styles.cacheDot} />
                <Text style={styles.cacheText}>Saved to this event. Works with no signal at the tee.</Text>
              </View>
            </>
          ) : (
            <Text style={styles.selectedMeta}>No course picked yet — search below.</Text>
          )}
        </View>

        {/* Search */}
        <Text style={styles.sectionLabel}>Find a course</Text>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Course or club name"
            placeholderTextColor={colors.ghost}
            style={styles.searchInput}
            autoCapitalize="words"
            returnKeyType="search"
            onSubmitEditing={runSearch}
          />
          <Pressable onPress={runSearch} disabled={searching} style={styles.searchBtn}>
            <Text style={styles.searchBtnLabel}>{searching ? '…' : 'SEARCH'}</Text>
          </Pressable>
        </View>
        {searchError && <Text style={styles.errorText}>{searchError}</Text>}
        {searching && <ActivityIndicator style={{ marginVertical: 14 }} color={colors.accent} />}

        {results?.map((r) => {
          const alreadySaved = savedCourses.find((c) => c.id === `gca:${r.externalId}`);
          return (
            <View key={r.externalId} style={styles.resultRow}>
              <Pressable style={styles.resultMain} onPress={() => pickSearchResult(r)}>
                <Text style={styles.resultName}>{r.courseName || r.clubName}</Text>
                <Text style={styles.resultMeta}>
                  {[
                    r.clubName !== r.courseName ? r.clubName : null,
                    r.location,
                    r.tees.length ? `${r.tees.length} tees · card included` : 'no card data',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Pressable>
              {pendingId === r.externalId ? (
                <ActivityIndicator color={colors.accent} style={{ width: 52 }} />
              ) : (
                <Pressable onPress={() => starSearchResult(r)} style={styles.starBtn} hitSlop={6}>
                  <Text style={[styles.star, { color: alreadySaved?.isFavorite ? colors.accent : colors.ghost }]}>
                    {alreadySaved?.isFavorite ? '★' : '☆'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}

        {/* Your courses — the starred list only. */}
        {favorites.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>Your courses</Text>
              <Text style={styles.sectionAside}>saved · no lookup</Text>
            </View>
            {favorites.map((c) => (
              <View key={c.id} style={[styles.savedRow, c.id === course?.courseId && styles.savedRowActive]}>
                <Pressable style={styles.savedMain} onPress={() => pickSaved(c)}>
                  <Text style={styles.savedName}>{c.courseName || c.clubName}</Text>
                  <Text style={styles.savedMeta}>
                    {[c.location, `${c.tees.length} tee${c.tees.length === 1 ? '' : 's'}`, c.source === 'manual' ? 'entered by hand' : 'saved']
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Pressable>
                <Pressable onPress={() => star(c.id)} style={styles.starBtn} hitSlop={6}>
                  <Text style={[styles.star, { color: colors.accent }]}>★</Text>
                </Pressable>
              </View>
            ))}
            <Text style={styles.note}>
              Tap a course to play it, or ★ to take it off this list. These load instantly, signal or not, and never spend
              one of your 300 daily lookups.
            </Text>
          </>
        )}

        {/* Tees. The same name can appear for each gender at different ratings,
            so the label carries the gender whenever both are present. */}
        {selectedCourse && selectedCourse.tees.length > 1 && (
          <>
            <Text style={styles.sectionLabel}>Tees</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teeScroll}>
              {selectedCourse.tees.map((t) => {
                const on = t.teeName === course?.teeName && t.gender === course?.teeGender;
                const bothGenders = selectedCourse.tees.some((o) => o.gender !== t.gender);
                return (
                  <Pressable
                    key={`${t.teeName}-${t.gender}`}
                    onPress={() => pickSaved(selectedCourse, t)}
                    style={styles.teeBtn}
                  >
                    <Text style={styles.teeName}>
                      {t.teeName}
                      {bothGenders ? (t.gender === 'female' ? " ♀" : " ♂") : ''}
                    </Text>
                    <Text style={styles.teeYds}>
                      {t.totalYards ? `${t.totalYards.toLocaleString()} yds` : '–'}
                    </Text>
                    <Text style={styles.teeYds}>
                      {t.courseRating ? `${t.courseRating} / ${t.slopeRating ?? '–'}` : ' '}
                    </Text>
                    {on && <View style={styles.teeUnderline} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* Holes in play */}
        {allHoles.length >= 18 && (
          <>
            <Text style={styles.sectionLabel}>Holes in play</Text>
            <View style={styles.playSetRow}>
              {PLAY_SETS.map((p) => {
                const on = holesInPlay === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setHolesInPlay(p.key)}
                    style={[styles.playSetBtn, on && styles.playSetBtnOn]}
                  >
                    <Text style={[styles.playSetLabel, on && { color: colors.white }]}>{p.label}</Text>
                    <Text style={[styles.playSetSub, on && { color: colors.white, opacity: 0.7 }]}>{p.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.note}>
              This is which holes count for scoring — separate from where a group tees off. Currently {holes.length}{' '}
              holes, par {parTotalFor(holes)}.
            </Text>
          </>
        )}

        {/* Hole table */}
        {holes.length > 0 && (
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.colHole]}>HOLE</Text>
              <Text style={[styles.th, styles.colNum]}>PAR</Text>
              <Text style={[styles.th, styles.colNum]}>YDS</Text>
              <Text style={[styles.th, styles.colNum]}>HCP</Text>
            </View>
            {holes.map((h) => (
              <View key={h.hole} style={styles.tr}>
                <Text style={[styles.tdHole, styles.colHole]}>{h.hole}</Text>
                <Text style={[styles.tdPar, styles.colNum]}>{h.par}</Text>
                <Text style={[styles.td, styles.colNum]}>{h.yards || '–'}</Text>
                <Text style={[styles.tdMuted, styles.colNum]}>{h.handicap}</Text>
              </View>
            ))}
          </View>
        )}

        <Pressable onPress={() => setManualOpen(true)} style={styles.manualBtn}>
          <View style={{ flex: 1 }}>
            <Text style={styles.manualTitle}>Course not listed?</Text>
            <Text style={styles.manualSub}>
              Type the card once — par, yards and stroke index — and it's saved for next time
            </Text>
          </View>
          <Text style={styles.manualArrow}>→</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ————————————————————————————————————————————————————————————
// Manual card entry — the fallback for the courses the API doesn't have.
// ————————————————————————————————————————————————————————————

type ManualRow = { par: string; yards: string; handicap: string };

const blankRows = (): ManualRow[] =>
  Array.from({ length: 18 }, (_, i) => ({ par: '4', yards: '', handicap: String(i + 1) }));

function ManualCourseForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (input: { courseName: string; location: string; teeName: string; holes: Hole[] }) => Promise<string | null>;
}) {
  const [courseName, setCourseName] = useState('');
  const [location, setLocation] = useState('');
  const [teeName, setTeeName] = useState('');
  const [rows, setRows] = useState<ManualRow[]>(blankRows);
  const [busy, setBusy] = useState(false);

  const setRow = (i: number, patch: Partial<ManualRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const parsed: Hole[] = rows.map((r, i) => ({
    hole: i + 1,
    par: Number(r.par) || 0,
    yards: Number(r.yards) || 0,
    handicap: Number(r.handicap) || i + 1,
  }));

  const parsInvalid = parsed.some((h) => h.par < 3 || h.par > 6);
  const indexes = parsed.map((h) => h.handicap);
  const indexesValid = new Set(indexes).size === 18 && indexes.every((v) => v >= 1 && v <= 18);
  const canSave = courseName.trim().length > 0 && !parsInvalid && indexesValid && !busy;

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    const id = await onSave({
      courseName: courseName.trim(),
      location: location.trim(),
      teeName: teeName.trim() || 'Default',
      holes: parsed,
    });
    setBusy(false);
    if (id === null) {
      Alert.alert('Could not save', 'The course could not be saved. Check your connection and try again.');
      return;
    }
    onCancel();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.manualHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Not in the database</Text>
          <Text style={styles.title}>Enter the card</Text>
        </View>
        <Pressable onPress={onCancel} style={styles.closeBtn}>
          <Text style={styles.closeLabel}>CANCEL</Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.addBlock}>
          <Text style={styles.fieldLabel}>Course name</Text>
          <TextInput
            value={courseName}
            onChangeText={setCourseName}
            placeholder="Palisade Golf Course"
            placeholderTextColor={colors.ghost}
            style={styles.input}
            autoCapitalize="words"
          />
          <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Where</Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Sterling, UT"
            placeholderTextColor={colors.ghost}
            style={styles.input}
            autoCapitalize="words"
          />
          <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Tee</Text>
          <TextInput
            value={teeName}
            onChangeText={setTeeName}
            placeholder="Blue"
            placeholderTextColor={colors.ghost}
            style={styles.input}
            autoCapitalize="words"
          />
        </View>

        <Text style={styles.sectionLabel}>The 18 holes</Text>
        <View style={styles.manualHeadRow}>
          <Text style={[styles.th, styles.colHole]}>HOLE</Text>
          <Text style={[styles.th, styles.colEntry]}>PAR</Text>
          <Text style={[styles.th, styles.colEntry]}>YDS</Text>
          <Text style={[styles.th, styles.colEntry]}>HCP</Text>
        </View>
        {rows.map((r, i) => (
          <View key={i} style={styles.manualRow}>
            <Text style={[styles.tdHole, styles.colHole]}>{i + 1}</Text>
            <TextInput
              value={r.par}
              onChangeText={(v) => setRow(i, { par: v })}
              style={[styles.cellInput, styles.colEntry]}
              keyboardType="number-pad"
              maxLength={1}
            />
            <TextInput
              value={r.yards}
              onChangeText={(v) => setRow(i, { yards: v })}
              placeholder="—"
              placeholderTextColor={colors.ghost}
              style={[styles.cellInput, styles.colEntry]}
              keyboardType="number-pad"
              maxLength={3}
            />
            <TextInput
              value={r.handicap}
              onChangeText={(v) => setRow(i, { handicap: v })}
              style={[styles.cellInput, styles.colEntry]}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
        ))}

        {parsInvalid && <Text style={styles.errorText}>Every par has to be between 3 and 6.</Text>}
        {!indexesValid && (
          <Text style={styles.errorText}>
            Stroke index must use each number 1–18 exactly once — that's what decides which holes give a stroke.
          </Text>
        )}

        <Pressable onPress={submit} disabled={!canSave} style={[styles.addBtn, !canSave && styles.addBtnDisabled]}>
          <Text style={styles.addBtnLabel}>{busy ? 'SAVING…' : 'SAVE AND USE THIS CARD'}</Text>
          <Text style={styles.addBtnArrow}>→</Text>
        </Pressable>
        <Text style={styles.note}>
          Saved to your account, so the next round here needs no typing and no lookup.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerInSetup: { paddingTop: 18 },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 12 },
  manualHeader: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  kicker: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.accent },
  title: { fontFamily: font.heading, fontSize: 28, letterSpacing: -0.6, marginTop: 8, color: colors.text },
  closeBtn: { borderWidth: 2, borderColor: colors.text, paddingVertical: 11, paddingHorizontal: 13 },
  closeLabel: { fontFamily: font.heading, fontSize: 10.5, letterSpacing: 0.9, color: colors.text },

  selectedBlock: { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 2, borderBottomWidth: 2, borderColor: colors.divider },
  selectedName: { fontFamily: font.heading, fontSize: 18, color: colors.text },
  selectedMeta: { fontFamily: font.body, fontSize: 11.5, color: colors.muted, marginTop: 5 },
  cacheNote: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  cacheDot: { width: 8, height: 8, backgroundColor: colors.accent },
  cacheText: { flex: 1, fontFamily: font.body, fontSize: 11, color: colors.muted },

  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingRight: 20 },
  sectionLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  sectionAside: { fontFamily: font.body, fontSize: 10.5, color: colors.mutedFaint },

  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 20 },
  searchInput: {
    flex: 1,
    fontFamily: font.heading,
    fontSize: 20,
    color: colors.text,
    borderBottomWidth: 2,
    borderColor: colors.text,
    paddingVertical: 8,
  },
  searchBtn: { backgroundColor: colors.text, paddingVertical: 14, paddingHorizontal: 14 },
  searchBtnLabel: { fontFamily: font.heading, fontSize: 11, letterSpacing: 0.9, color: colors.white },
  errorText: { fontFamily: font.body, fontSize: 11.5, lineHeight: 17, color: colors.accent, paddingHorizontal: 20, paddingTop: 12 },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  resultMain: { flex: 1, paddingVertical: 14, paddingLeft: 20, paddingRight: 8 },
  resultName: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  resultMeta: { fontFamily: font.body, fontSize: 11.5, color: colors.muted, marginTop: 3 },

  savedRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: colors.divider },
  savedRowActive: { backgroundColor: 'rgba(236,48,19,0.06)' },
  savedMain: { flex: 1, paddingVertical: 13, paddingLeft: 20, paddingRight: 8 },
  savedName: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  savedMeta: { fontFamily: font.body, fontSize: 11.5, color: colors.muted, marginTop: 3 },
  starBtn: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderColor: colors.divider },
  star: { fontSize: 20 },

  teeScroll: { borderTopWidth: 2, borderBottomWidth: 2, borderColor: colors.divider },
  teeBtn: { minWidth: 96, paddingVertical: 13, paddingHorizontal: 12, borderRightWidth: 1, borderColor: colors.divider },
  teeName: { fontFamily: font.heading, fontSize: 11, color: colors.text },
  teeYds: { fontFamily: font.body, fontSize: 10, color: colors.muted, marginTop: 3 },
  teeUnderline: { height: 3, backgroundColor: colors.accent, marginTop: 9 },

  playSetRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  playSetBtn: { flex: 1, borderWidth: 2, borderColor: colors.divider, paddingVertical: 14, paddingHorizontal: 10 },
  playSetBtnOn: { backgroundColor: colors.text, borderColor: colors.text },
  playSetLabel: { fontFamily: font.heading, fontSize: 12, color: colors.text },
  playSetSub: { fontFamily: font.body, fontSize: 10, color: colors.muted, marginTop: 6 },

  table: { marginTop: 18, borderTopWidth: 2, borderColor: colors.divider },
  tableHead: { flexDirection: 'row', paddingVertical: 9, borderBottomWidth: 2, borderColor: colors.divider },
  manualHeadRow: { flexDirection: 'row', paddingVertical: 9, borderTopWidth: 2, borderBottomWidth: 2, borderColor: colors.divider },
  th: { fontFamily: font.heading, fontSize: 10, letterSpacing: 1, color: colors.muted },
  tr: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.divider },
  manualRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderColor: colors.divider },
  colHole: { width: 76, paddingLeft: 20 },
  colNum: { flex: 1, textAlign: 'right', paddingRight: 20 },
  colEntry: { flex: 1, marginRight: 12 },
  td: { fontFamily: font.body, fontSize: 13, color: 'rgba(32,30,29,0.7)' },
  tdMuted: { fontFamily: font.body, fontSize: 13, color: colors.muted },
  tdPar: { fontFamily: font.heading, fontSize: 14, color: colors.text },
  tdHole: { fontFamily: font.heading, fontSize: 14, color: colors.text },
  cellInput: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
    borderWidth: 2,
    borderColor: colors.divider,
    paddingVertical: 8,
    paddingHorizontal: 10,
    textAlign: 'center',
  },

  addBlock: { paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 2, borderColor: colors.divider },
  fieldLabel: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted },
  input: {
    fontFamily: font.heading,
    fontSize: 20,
    color: colors.text,
    borderBottomWidth: 2,
    borderColor: colors.text,
    paddingVertical: 8,
    marginTop: 8,
  },
  addBtn: {
    marginTop: 20,
    height: 72,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  addBtnDisabled: { opacity: 0.35 },
  addBtnLabel: { fontFamily: font.heading, fontSize: 16, letterSpacing: 0.3, color: '#fff' },
  addBtnArrow: { fontFamily: font.heading, fontSize: 20, color: '#fff' },

  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.divider,
    marginTop: 18,
  },
  manualTitle: { fontFamily: font.heading, fontSize: 13, color: colors.text },
  manualSub: { fontFamily: font.body, fontSize: 11, lineHeight: 16, color: colors.muted, marginTop: 4 },
  manualArrow: { fontFamily: font.heading, fontSize: 16, color: colors.accent },

  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
});

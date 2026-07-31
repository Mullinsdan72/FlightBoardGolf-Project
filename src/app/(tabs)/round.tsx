import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Sheet, type SheetOption } from '@/components/Sheet';
import { Tile, TileGrid } from '@/components/Tile';
import { Wordmark } from '@/components/Wordmark';
import { useRound } from '@/context/RoundContext';
import { useCourseSearch } from '@/hooks/useCourseSearch';
import { useRoundChecklist } from '@/hooks/useRoundChecklist';
import { fetchCourseDetail, type CourseSearchResult } from '@/lib/courseApi';
import type { HolesInPlay } from '@/hooks/useRoundCourse';
import type { ScoringMode } from '@/hooks/useActiveRound';
import { colors, font } from '@/theme';

type Open = null | 'tee' | 'holes' | 'scoring';

const HOLE_LABEL: Record<HolesInPlay, string> = {
  all18: 'All 18',
  front9: 'Front 9',
  back9: 'Back 9',
};

const SCORING_LABEL: Record<ScoringMode, string> = {
  gross: 'Gross',
  net: 'Net',
  lowman: 'Low man',
};

/**
 * Setting a round up, on one screen.
 *
 * This replaces the five-step run-through (`/setup`). That was built to a brief
 * asking for "a logical step by step order and flow" and it did exactly that —
 * and then turned out to be the problem. One screen you can scan beats five you
 * have to walk: the tiles show their own values, so what's still missing is
 * visible at a glance rather than discovered by pressing NEXT.
 *
 * Nothing here has a Save button, and that is the same decision throughout the
 * app: picking a tee, adding a player and drawing teams all write as you tap. A
 * Save button implies they don't, which is precisely how a round ended up with
 * teams on screen that were never drawn.
 */
export default function StartRoundScreen() {
  const {
    activeRound,
    activeRoundId,
    holes,
    holesInPlay,
    setHolesInPlay,
    course,
    savedCourses,
    selectCourseTee,
    cacheCourse,
    toggleFavorite,
    favoriteFromSearch,
    players,
    playersLoaded,
    scoringMode,
    setScoringMode,
    teams,
    teamRoster,
    teamDrawSaved,
    wolf,
    challenge,
    holeGames,
  } = useRound();

  const { openedTiles, markOpened } = useRoundChecklist(activeRoundId);
  /** Tick the tile, then go where it goes. One place, so no tile forgets. */
  const openTile = (key: string, go: () => void) => {
    markOpened(key);
    go();
  };

  const [open, setOpen] = useState<Open>(null);

  const selectedCourse = savedCourses.find((c) => c.id === course?.courseId);
  const favourites = savedCourses.filter((c) => c.isFavorite);

  /**
   * One row per tee name.
   *
   * Gladstan's card has seven tees because Gold and Red each exist twice, once
   * per gender, at the same yardage. Showing both would put two identical rows
   * on screen with no way to tell them apart. Nothing we compute reads course
   * rating or slope — strokes come off the stroke index — so collapsing them is
   * safe. It would stop being safe the day handicaps become a real Index.
   */
  const teeOptions: SheetOption[] = useMemo(() => {
    const seen = new Set<string>();
    const out: SheetOption[] = [];
    for (const t of selectedCourse?.tees ?? []) {
      const key = `${t.teeName.toLowerCase()}|${t.totalYards ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key: `${t.teeName}|${t.gender}`,
        label: t.teeName,
        detail: t.totalYards ? `${t.totalYards.toLocaleString()} yds` : undefined,
        selected: t.teeName === course?.teeName,
      });
    }
    return out.sort((a, b) => Number(b.detail?.replace(/\D/g, '') ?? 0) - Number(a.detail?.replace(/\D/g, '') ?? 0));
  }, [selectedCourse, course?.teeName]);

  const pickTee = async (key: string) => {
    const [teeName, gender] = key.split('|');
    const tee = selectedCourse?.tees.find((t) => t.teeName === teeName && t.gender === gender);
    if (!tee || !selectedCourse) return;
    try {
      await selectCourseTee(selectedCourse.id, tee, {
        clubName: selectedCourse.clubName,
        courseName: selectedCourse.courseName,
        location: selectedCourse.location,
      });
    } catch (err) {
      Alert.alert('Could not use that tee', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const { query, setQuery, clear, searching, results, error: searchError, localMatches, searchNow } =
    useCourseSearch(savedCourses);

  const pickSaved = async (id: string) => {
    const c = savedCourses.find((x) => x.id === id);
    if (!c || !c.tees.length) return;
    try {
      await selectCourseTee(c.id, c.tees[0], {
        clubName: c.clubName,
        courseName: c.courseName,
        location: c.location,
      });
      clear();
    } catch (err) {
      Alert.alert('Could not open that course', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  /**
   * Search already returned the full card, so picking a result must not trigger
   * a second lookup — that would double the quota cost of every course.
   * `fetchCourseDetail` is only for results that arrive without tees.
   */
  const pickResult = async (r: CourseSearchResult) => {
    try {
      const detail = r.tees.length
        ? { externalId: r.externalId, clubName: r.clubName, courseName: r.courseName, location: r.location, tees: r.tees, raw: r.raw }
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
      clear();
    } catch (err) {
      Alert.alert('Could not load that course', err instanceof Error ? err.message : String(err));
    }
  };

  const star = async (courseId: string) => {
    const message = await toggleFavorite(courseId);
    if (message) Alert.alert('Could not save that favourite', message);
  };

  /**
   * Star a search result without making it the round's course.
   *
   * Caching it costs no extra lookup — search already returned the full card —
   * so favouriting from the results list is free, and it is where you actually
   * think "I'll play here again".
   */
  const starResult = async (r: CourseSearchResult) => {
    const already = savedCourses.find((c) => c.id === `gca:${r.externalId}`);
    const message = already
      ? await toggleFavorite(already.id)
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

  const isStarred = (courseId: string) => savedCourses.find((c) => c.id === courseId)?.isFavorite ?? false;

  // Par over the holes actually in play. The tee's own par total is for all 18,
  // so a front-nine round was reading "par 72 · 9 holes".
  const parTotal = holes.reduce((a, h) => a + h.par, 0);

  const teamsValue = !teams.enabled
    ? 'Not playing'
    : teamDrawSaved
      ? `${teamRoster.filter((t) => t.length > 0).length} teams`
      : 'Not drawn';

  const gamesCount = (wolf.enabled ? 1 : 0) + (challenge.enabled ? 1 : 0) + holeGames.length;

  /**
   * The checklist, in one place — used to tick the tiles and to gate the button,
   * so the two can never disagree. A grid showing six checks above a START ROUND
   * that refuses to press is the app arguing with itself.
   *
   * Each entry is done when the setting has a value *or* you have opened its
   * tile. Holes and scoring always hold a working default, so opening them is
   * the only signal you looked and kept it; teams and games are optional, so
   * opening one is the decision.
   */
  const checklist = [
    { key: 'course', label: 'Course', done: !!course?.courseName && holes.length > 0 },
    { key: 'tee', label: 'Tee box', done: !!course?.teeName },
    // A value that isn't the default is a decision somebody made, whether or not
    // this phone was the one that made it — and whether or not it happened
    // before the checklist existed. Only the defaults need to be opened.
    { key: 'holes', label: 'Holes', done: holesInPlay !== 'all18' || openedTiles.has('holes') },
    { key: 'scoring', label: 'Scoring', done: scoringMode !== 'net' || openedTiles.has('scoring') },
    { key: 'players', label: 'Players', done: players.length > 0 },
    { key: 'teams', label: 'Teams', done: teams.enabled || openedTiles.has('teams') },
    { key: 'games', label: 'Games', done: gamesCount > 0 || openedTiles.has('games') },
  ];
  const remaining = checklist.filter((c) => !c.done);
  const ready = remaining.length === 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Wordmark width={170} />
          {activeRoundId && (
            <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={10}>
              <Text style={styles.exit}>THE ROUND ›</Text>
            </Pressable>
          )}
        </View>

        {/* The course, large, the way you'd read it off a scorecard. Not a
            button: switching course is the search box and the favourites list
            below, both of which are visible without tapping anything. */}
        {/* The course is the first thing on the checklist and the one everything
            else waits on — no card, nothing to score against — so it carries the
            same wash as an untouched tile until one is picked. */}
        <View style={[styles.courseBlock, !course?.courseName && styles.courseBlockTodo]}>
          <View style={styles.courseTitleRow}>
            <Text style={styles.courseName} numberOfLines={2}>
              {course?.courseName || 'Pick a course'}
            </Text>
            {course?.courseId && (
              <Pressable onPress={() => star(course.courseId!)} hitSlop={12}>
                <Text style={[styles.star, isStarred(course.courseId) && styles.starOn]}>
                  {isStarred(course.courseId) ? '★' : '☆'}
                </Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.courseMeta}>
            {course?.courseName
              ? [selectedCourse?.location, course.teeName, `par ${parTotal}`, `${holes.length} holes`].filter(Boolean).join(' · ')
              : 'Search below, or pick one you have played'}
          </Text>
        </View>

        {/* Favourites first and small — the course you play every week should
            be one tap and zero lookups, but it shouldn't shout over the one
            you've actually chosen. */}
        {favourites.length > 0 && (
          <View style={styles.favBlock}>
            {favourites.map((c) => {
              const on = c.id === course?.courseId;
              return (
                <Pressable key={c.id} onPress={() => pickSaved(c.id)} style={styles.favRow}>
                  <Text style={[styles.favName, on && styles.favNameOn]} numberOfLines={1}>
                    {on ? '★ ' : ''}
                    {c.courseName || c.clubName}
                  </Text>
                  <Text style={styles.favMeta} numberOfLines={1}>
                    {c.location}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search courses…"
            placeholderTextColor={colors.ghost}
            style={styles.search}
            autoCapitalize="words"
            returnKeyType="search"
            onSubmitEditing={searchNow}
          />
          {searching && <ActivityIndicator color={colors.accent} />}
        </View>
        {searchError && <Text style={styles.searchError}>{searchError}</Text>}

        {localMatches.length > 0 && (
          <>
            <Text style={styles.resultHeader}>On this phone · no lookup</Text>
            {localMatches.map((c) => (
              <View key={c.id} style={styles.resultRow}>
                <Pressable style={{ flex: 1 }} onPress={() => pickSaved(c.id)}>
                  <Text style={styles.resultName}>{c.courseName || c.clubName}</Text>
                  <Text style={styles.resultMeta}>{c.location}</Text>
                </Pressable>
                <Pressable onPress={() => star(c.id)} hitSlop={10}>
                  <Text style={[styles.star, c.isFavorite && styles.starOn]}>{c.isFavorite ? '★' : '☆'}</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {results && results.length > 0 && <Text style={styles.resultHeader}>Found online</Text>}
        {results?.map((r) => {
          const saved = savedCourses.find((c) => c.id === `gca:${r.externalId}`);
          return (
            <View key={r.externalId} style={styles.resultRow}>
              <Pressable style={{ flex: 1 }} onPress={() => pickResult(r)}>
                <Text style={styles.resultName}>{r.courseName || r.clubName}</Text>
                <Text style={styles.resultMeta}>
                  {[r.location, r.tees.length ? `${r.tees.length} tees` : 'no card data'].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
              <Pressable onPress={() => starResult(r)} hitSlop={10}>
                <Text style={[styles.star, saved?.isFavorite && styles.starOn]}>{saved?.isFavorite ? '★' : '☆'}</Text>
              </Pressable>
            </View>
          );
        })}

        <Text style={styles.sectionLabel}>Round setup</Text>

        {/* Six tiles, three across, in the order a round is actually built:
            where you are teeing from, how much of the course, how it is scored,
            who is playing, then the two optional things.

            Each is done when it has a value *or* you have opened it. Value alone
            would leave HOLES and SCORING highlighted forever, since both hold a
            working default; opening alone would tick a tile you glanced at and
            closed. Together they mean "you have dealt with this". */}
        <TileGrid>
          <Tile
            label="Tee box"
            value={course?.teeName || 'Pick'}
            unset={!course?.teeName}
            done={checklist[1].done}
            disabled={!selectedCourse}
            onPress={() => openTile('tee', () => setOpen('tee'))}
          />
          <Tile
            label="Holes"
            value={HOLE_LABEL[holesInPlay]}
            done={checklist[2].done}
            onPress={() => openTile('holes', () => setOpen('holes'))}
          />
          <Tile
            label="Scoring"
            value={SCORING_LABEL[scoringMode]}
            done={checklist[3].done}
            onPress={() => openTile('scoring', () => setOpen('scoring'))}
          />
          <Tile
            label="Players"
            value={!playersLoaded ? '…' : players.length ? `${players.length} in` : 'Add'}
            unset={playersLoaded && players.length === 0}
            done={checklist[4].done}
            onPress={() => openTile('players', () => router.push('/(tabs)/players'))}
          />
          {/* Teams and games are optional, so opening one counts as dealing with
              it — "we're not playing teams today" is a decision. */}
          <Tile
            label="Teams"
            value={teamsValue}
            done={checklist[5].done}
            onPress={() => openTile('teams', () => router.push('/teams'))}
          />
          <Tile
            label="Games"
            value={gamesCount ? `${gamesCount} on` : 'None'}
            done={checklist[6].done}
            // `setup=1` is what turns the GAMES screen into the setup view. From
            // the tab bar it is a scoreboard; the controls belong to this tile.
            onPress={() =>
              openTile('games', () => router.push({ pathname: '/(tabs)/games', params: { setup: '1' } }))
            }
          />
        </TileGrid>

        <Pressable
          onPress={() => router.replace('/(tabs)')}
          disabled={!ready}
          style={[styles.startBtn, !ready && styles.startOff]}
        >
          <Text style={styles.startLabel}>START ROUND</Text>
          <Text style={styles.startArrow}>→</Text>
        </Pressable>

        {/* Name what is left rather than saying "not ready". A disabled button
            with no reason on it is the thing people tap twice and then put the
            phone down. */}
        {!ready && (
          <Text style={styles.note}>
            {remaining.length === 1
              ? `${remaining[0].label} still to do.`
              : `Still to do: ${remaining.map((c) => c.label).join(', ')}.`}
            {!course?.courseName
              ? ' Start with the course — a round with no card has nothing to score against.'
              : ''}
          </Text>
        )}

        {/* Named for the moment you need it, not for what it does. You reach
            for this having just failed to find your course, so "Course not
            listed?" is the sentence in your head — and it opens the card form
            with no search on it, because search is what has already failed. */}
        <Pressable onPress={() => router.push('/course-card')} style={styles.secondaryBtn}>
          <Text style={styles.secondaryLabel}>COURSE NOT LISTED?</Text>
          <Text style={styles.secondaryArrow}>›</Text>
        </Pressable>

        <Pressable onPress={() => router.push('/(tabs)/activity')} style={styles.secondaryBtn}>
          <Text style={styles.secondaryLabel}>PAST ROUNDS</Text>
          <Text style={styles.secondaryArrow}>›</Text>
        </Pressable>
      </ScrollView>

      <Sheet
        visible={open === 'tee'}
        title="Select tee"
        options={teeOptions}
        onPick={pickTee}
        onClose={() => setOpen(null)}
      />

      <Sheet
        visible={open === 'holes'}
        title="Holes in play"
        onClose={() => setOpen(null)}
        onPick={(k) => setHolesInPlay(k as HolesInPlay)}
        options={(['all18', 'front9', 'back9'] as HolesInPlay[]).map((k) => ({
          key: k,
          label: HOLE_LABEL[k],
          detail: k === 'all18' ? '18 holes' : '9 holes',
          selected: holesInPlay === k,
        }))}
      />

      <Sheet
        visible={open === 'scoring'}
        title="How the round is scored"
        onClose={() => setOpen(null)}
        onPick={(k) => setScoringMode(k as ScoringMode)}
        options={[
          { key: 'gross', label: 'Gross', detail: 'handicaps ignored', selected: scoringMode === 'gross' },
          { key: 'net', label: 'Net', detail: 'full handicap', selected: scoringMode === 'net' },
          { key: 'lowman', label: 'Low man', detail: 'best player off scratch', selected: scoringMode === 'lowman' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingTop: 64, paddingBottom: 40 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  exit: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7, color: colors.accent },
  courseBlock: { paddingHorizontal: 20, paddingTop: 22 },
  // Overrides the block's own padding so the wash sits as a card with air
  // around it, rather than a band running edge to edge.
  courseBlockTodo: {
    marginHorizontal: 20,
    marginTop: 18,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: 'rgba(236,48,19,0.10)',
    borderWidth: 2,
    borderColor: 'rgba(236,48,19,0.35)',
    borderRadius: 10,
  },
  courseTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  star: { fontFamily: font.heading, fontSize: 24, color: colors.ghost },
  starOn: { color: colors.accent },
  favBlock: { paddingHorizontal: 20, paddingTop: 18, borderTopWidth: 1, borderColor: colors.divider, marginTop: 18 },
  favRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 7 },
  favName: { fontFamily: font.heading, fontSize: 13, color: colors.text, flexShrink: 1 },
  favNameOn: { color: colors.accent },
  favMeta: { fontFamily: font.body, fontSize: 11, color: colors.muted, flexShrink: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 14,
    borderWidth: 2,
    borderColor: colors.divider,
    paddingHorizontal: 14,
  },
  search: { flex: 1, fontFamily: font.body, fontSize: 15, color: colors.text, paddingVertical: 13 },
  searchError: { fontFamily: font.body, fontSize: 11.5, color: colors.accent, paddingHorizontal: 20, paddingTop: 10 },
  resultHeader: {
    fontFamily: font.bodySemi,
    fontSize: 9.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.divider },
  resultName: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  resultMeta: { fontFamily: font.body, fontSize: 11.5, color: colors.muted, marginTop: 3 },
  courseName: { fontFamily: font.heading, fontSize: 32, letterSpacing: -0.7, color: colors.text },
  courseMeta: { fontFamily: font.body, fontSize: 12.5, color: colors.muted, marginTop: 6 },
  courseSwitch: { fontFamily: font.heading, fontSize: 11, letterSpacing: 0.7, color: colors.accent, marginTop: 10 },
  sectionLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 12,
  },
  startBtn: {
    marginTop: 26,
    marginHorizontal: 20,
    height: 82,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  startOff: { opacity: 0.35 },
  startLabel: { fontFamily: font.heading, fontSize: 19, letterSpacing: 0.3, color: '#fff' },
  startArrow: { fontFamily: font.heading, fontSize: 22, color: '#fff' },
  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, paddingHorizontal: 20, paddingTop: 12 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: colors.divider,
    paddingVertical: 18,
    marginTop: 22,
    marginHorizontal: 20,
  },
  secondaryLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7, color: colors.text },
  secondaryArrow: { fontFamily: font.heading, fontSize: 16, color: colors.ghost },
});

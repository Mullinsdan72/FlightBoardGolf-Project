import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlayerPicker } from '@/components/PlayerPicker';
import { Wordmark } from '@/components/Wordmark';
import { ScoreRing } from '@/components/ScoreRing';
import { WolfPrompt } from '@/components/WolfPrompt';
import { useRound } from '@/context/RoundContext';
import { useSignoffs } from '@/hooks/useSignoff';
import { mayScoreFor, scoreableRoster } from '@/lib/claim';
import { thruFor, toParFor } from '@/lib/roundMath';
import { colors, font, fmtToPar, scoreName } from '@/theme';

type Mode = 'self' | 'scorer';

export default function ScoreEntryScreen() {
  const {
    myId,
    choose,
    userId,
    claimPlayer,
    playersError,
    clear,
    scores,
    setScores,
    postScore,
    live,
    connected,
    players,
    holes,
    pendingCount,
    wolf,
    wolfFor,
    wolfDecisionFor,
    wolfDecide,
    wolfUndecide,
    activeRound,
    activeRoundId,
    amOrganizer,
    scoresHydrated,
  } = useRound();
  const { signoffs, refreshSignoffs } = useSignoffs(activeRoundId);

  // Signing and reopening both happen on CARD, and this screen stays mounted
  // behind it. Without this, an organizer who reopened a card came back to a
  // screen still convinced it was locked.
  useFocusEffect(
    useCallback(() => {
      refreshSignoffs();
    }, [refreshSignoffs]),
  );

  const [holeIndex, setHoleIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('self');
  const [draft, setDraft] = useState<Record<number, Record<string, number>>>({});
  const startedAt = useRef(false);
  const amInRound = !myId || players.some((p) => p.id === myId);

  // A new round starts at its own first hole, not wherever you were standing in
  // the last one. The Score tab stays mounted across a round switch, so both of
  // these survived it — you set up a fresh round and the card opened on the
  // twelfth because that is where the previous round got to.
  useEffect(() => {
    startedAt.current = false;
    setHoleIndex(0);
  }, [activeRoundId]);

  // Then, once this round's scores are actually loaded, jump to the first hole
  // you have not posted. Only once — after that, hole navigation is the
  // golfer's own and the app must not move under them.
  //
  // Found by *searching* for a gap rather than counting posted holes and using
  // the count as an index. Those agree only while holes are posted in order,
  // and the first person to correct the fourth hole after playing the fifth
  // would have been dropped a hole short.
  useEffect(() => {
    if (startedAt.current || !myId || !holes.length || !scoresHydrated) return;
    startedAt.current = true;
    const firstUnplayed = holes.findIndex((h) => scores[h.hole]?.[myId] == null);
    // Index 0 is the lowest hole in play — hole 1 on the front, hole 10 on the
    // back — because `holes` is the round's own card in order. Nothing here
    // may assume hole numbers start at 1.
    setHoleIndex(firstUnplayed === -1 ? holes.length - 1 : firstUnplayed);
  }, [scores, myId, holes, scoresHydrated, activeRoundId]);

  // If this device's chosen player was removed from the round elsewhere,
  // fall back to the picker rather than keep scoring as a ghost player.
  useEffect(() => {
    if (myId && players.length && !amInRound) clear();
  }, [myId, players, amInRound]);

  if (myId === undefined || signoffs === undefined) return <View style={styles.screen} />;
  if (!myId || !amInRound) return <PlayerPicker players={players} onChoose={choose} userId={userId} onClaim={claimPlayer} loadError={playersError} />;

  /**
   * Whose cards this phone is keeping: your own, plus any unclaimed player if
   * you run the round.
   *
   * This is rule 2's "designated scorer", finally built. Most groups have one
   * person marking for everyone — the friends who never installed the app rely
   * on it — and until now group mode wrote for the whole field including people
   * scoring on their own phones.
   */
  const keeping = scoreableRoster(players, { myPlayerId: myId, amOrganizer });
  /** Of those, the ones still editable. A signed card is locked (rule 8). */
  const open = keeping.filter((p) => !signoffs[p.id]);
  const signedAt = signoffs[myId] ?? null;
  const myCardSigned = !!signedAt;

  // The screen goes away only when there is nothing left on it to score. Keying
  // this off your own signature alone is what stopped a scorer finishing three
  // other cards the moment they signed theirs.
  if (open.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={styles.lockedWrap}>
          <Text style={styles.headerLabel}>{activeRound?.name || 'Round'}</Text>
          <Text style={styles.lockedTitle}>
            {keeping.length > 1 ? `All ${keeping.length} cards signed and locked` : 'Your card is signed and locked'}
          </Text>
          <Text style={styles.lockedNote}>
            {signedAt
              ? `Signed ${new Date(signedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. `
              : ''}
            {amOrganizer
              ? 'To fix a mistake, reopen the card on the Card tab — you are running this round, so you can reopen any of them. It comes straight back here to edit.'
              : "Only whoever's running the round can reopen one — check the Card tab for your final scorecard."}
          </Text>
        </View>
      </View>
    );
  }

  if (!holes.length) {
    return (
      <View style={styles.screen}>
        <View style={styles.lockedWrap}>
          <Text style={styles.headerLabel}>{activeRound?.name || 'Round'}</Text>
          <Text style={styles.lockedTitle}>No course picked yet</Text>
          <Text style={styles.lockedNote}>
            Choose a course on the Course tab and its card fills in here — par, yardage and stroke index for every hole.
          </Text>
        </View>
      </View>
    );
  }

  const safeIndex = Math.min(holeIndex, holes.length - 1);
  const holeInfo = holes[safeIndex];
  const hole = holeInfo.hole;
  const par = holeInfo.par;
  const parOf = (h: number) => holes.find((x) => x.hole === h)?.par ?? 4;

  const valueFor = (h: number, playerId: string) =>
    draft[h]?.[playerId] ?? scores[h]?.[playerId] ?? parOf(h);

  const bump = (playerId: string, delta: number) => {
    const next = Math.max(1, Math.min(15, valueFor(hole, playerId) + delta));
    setDraft((prev) => ({ ...prev, [hole]: { ...(prev[hole] || {}), [playerId]: next } }));
  };

  // Your own card being signed doesn't end your job if you are marking for
  // others — it just takes your own stepper away, so the self view would write
  // to a locked card.
  const effectiveMode: Mode = myCardSigned ? 'scorer' : mode;

  const myScore = valueFor(hole, myId);
  const myToPar = toParFor(holes, scores, myId);
  const thru = thruFor(holes, scores, myId);
  // Every hole, on every card this phone still has open. Marking for four and
  // being offered "sign my card" after finishing only your own would be
  // premature; so would waiting on a card that is already signed.
  const allHolesPosted =
    holes.length > 0 && open.every((p) => holes.every((h) => scores[h.hole]?.[p.id] != null));

  const isLastHole = safeIndex === holes.length - 1;

  // Posts whatever's currently showing for the hole being left. Called both
  // by the POST button (which also advances) and by jumping to a different
  // hole via the chip strip — leaving a hole is the commit, not a separate
  // step you have to remember.
  const postCurrentHole = () => {
    // Group mode posts for the cards you are actually keeping, not for the whole
    // field. Somebody who has claimed their own row is scoring on their own
    // phone, and writing over them from here would be the one thing rule 2
    // exists to prevent.
    const entries = effectiveMode === 'self' ? [myId] : open.map((p) => p.id);
    const nextScores = { ...scores, [hole]: { ...(scores[hole] || {}) } };
    for (const playerId of entries) {
      const strokes = valueFor(hole, playerId);
      nextScores[hole][playerId] = strokes;
      postScore(hole, playerId, strokes);
    }
    setScores(nextScores);
    setDraft((prev) => ({ ...prev, [hole]: {} }));
  };

  const commitHole = () => {
    postCurrentHole();
    if (!isLastHole) setHoleIndex(safeIndex + 1);
  };

  const goToHole = (index: number) => {
    if (index !== safeIndex) postCurrentHole();
    setHoleIndex(index);
  };

  const others = keeping.filter((p) => p.id !== myId);
  // Shown and refused, never hidden. A four-ball that lists two names looks
  // broken, and the fix people reach for is a duplicate row.
  const theirOwn = players.filter((p) => !mayScoreFor(p, { myPlayerId: myId, amOrganizer }));

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {/* The way to Rounds for everybody. FIELD used to be the only door to
                it, and FIELD is the organizer's tab now — a player still has to be
                able to switch to the round they're actually playing. */}
            {/* A bordered chip, not a caption. As small uppercase text this
                read as a label and nobody found it — including the person who
                commissioned the app. */}
            {/* Opens /start, which is the round's home: course, tee, holes,
                scoring, players, teams, games. This is the door back into setup
                from inside a round — the one that was missing the day a fourth
                player turned up and there was nowhere to add him. Past rounds
                and switching live one link further on, from there. */}
            <Pressable onPress={() => router.push('/(tabs)/round')} hitSlop={8} style={styles.roundChip}>
              <Text style={styles.roundChipName} numberOfLines={1}>
                {activeRound?.name || 'Round'}
              </Text>
              <Text style={styles.roundChipCta}>SET UP · SWITCH ⌄</Text>
            </Pressable>
            {/* Says what's actually true: queued scores are saved on the phone
                and will sync — not lost, and not silently pending either. */}
            {pendingCount > 0 ? (
              <View style={[styles.offlineBadge, styles.badgeUnder]}>
                <View style={styles.offlineDot} />
                <Text style={styles.offlineText}>SAVED · {pendingCount} TO SYNC</Text>
              </View>
            ) : !live ? (
              <View style={[styles.offlineBadge, styles.badgeUnder]}>
                <View style={[styles.offlineDot, { backgroundColor: colors.mutedFaint }]} />
                <Text style={[styles.offlineText, { color: colors.muted }]}>THIS PHONE ONLY</Text>
              </View>
            ) : !connected ? (
              <View style={[styles.offlineBadge, styles.badgeUnder]}>
                <View style={[styles.offlineDot, { backgroundColor: colors.mutedFaint }]} />
                <Text style={[styles.offlineText, { color: colors.muted }]}>CONNECTING</Text>
              </View>
            ) : null}
          </View>
          {/* Small, and out to the right, so it sits beside the round name rather
              than above the hole number. This is the screen you read between
              shots — the logo can be here, but it doesn't get to take a line. */}
          <Wordmark width={128} />
        </View>

        <View style={styles.holeRow}>
          <Text style={styles.holeNum}>{hole}</Text>
          <View style={styles.holeMeta}>
            <Text style={styles.parLabel}>PAR {par}</Text>
            <Text style={styles.yds}>
              {holeInfo.yards} yds · HCP {holeInfo.handicap}
            </Text>
          </View>
          <View style={styles.toParBox}>
            <Text style={styles.toPar}>{fmtToPar(myToPar)}</Text>
            <Text style={styles.thru}>THRU {thru}</Text>
          </View>
        </View>

        {wolf.enabled && (
          <WolfPrompt
            hole={hole}
            players={players}
            myId={myId}
            wolfId={wolfFor(hole)}
            decision={wolfDecisionFor(hole)}
            stake={wolf.stake}
            loneMultiplier={wolf.loneMultiplier}
            onDecide={(w, p) => wolfDecide(hole, w, p)}
            onUndo={() => wolfUndecide(hole)}
          />
        )}

        {myCardSigned ? (
          <Text style={styles.scorerNote}>
            Your card is signed. You are still marking {others.length === 1 ? others[0].name : `${others.length} others`}{' '}
            — post their holes below.
          </Text>
        ) : (
          <View style={styles.modeRow}>
            <Pressable style={[styles.modeBtn, styles.modeBtnDivider]} onPress={() => setMode('self')}>
              <Text style={styles.modeLabel}>EVERYONE SCORES</Text>
              {mode === 'self' && <View style={styles.modeUnderline} />}
            </Pressable>
            <Pressable style={styles.modeBtn} onPress={() => setMode('scorer')}>
              <Text style={styles.modeLabel}>{keeping.length > 1 ? "I'M SCORING FOR ALL" : "I'M SCORING"}</Text>
              {mode === 'scorer' && <View style={styles.modeUnderline} />}
            </Pressable>
          </View>
        )}

        {effectiveMode === 'self' ? (
          <>
            <View style={styles.stepperRow}>
              <Pressable style={[styles.stepperBtn, styles.stepperBtnRight]} onPress={() => bump(myId, -1)}>
                <Text style={styles.stepperGlyph}>−</Text>
              </Pressable>
              <View style={styles.stepperCenter}>
                <ScoreRing strokes={myScore} par={par} size={146} innerSize={130} fontSize={92} />
                <Text style={styles.scoreLabel}>{scoreName(myScore, par)}</Text>
              </View>
              <Pressable style={[styles.stepperBtn, styles.stepperBtnLeft]} onPress={() => bump(myId, 1)}>
                <Text style={styles.stepperGlyph}>+</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>Everyone · this hole</Text>
            {others.map((p) => {
              const done = scores[hole]?.[p.id] != null;
              return (
                <View key={p.id} style={styles.otherRow}>
                  <View style={[styles.dot, { backgroundColor: done ? colors.accent : colors.dividerFaint }]} />
                  <Text style={styles.otherName}>{p.name}</Text>
                  <Text style={styles.otherState}>{done ? 'posted' : 'still playing'}</Text>
                  <Text style={styles.otherVal}>{done ? scores[hole][p.id] : '–'}</Text>
                </View>
              );
            })}
          </>
        ) : (
          <View>
            {/* Only the cards this phone keeps get steppers. Showing one for a
                player who is scoring on their own phone was a lie: the number
                moved on screen and `postCurrentHole` threw it away. */}
            {open.map((p) => {
              const val = valueFor(hole, p.id);
              const pToPar = toParFor(holes, scores, p.id);
              return (
                <View key={p.id} style={styles.scorerRow}>
                  <View style={styles.scorerName}>
                    <Text style={styles.scorerNameText}>{p.id === myId ? p.name + ' (you)' : p.name}</Text>
                    <Text style={styles.scorerMeta}>
                      HCP {p.handicap} · {fmtToPar(pToPar)}
                    </Text>
                  </View>
                  <Pressable style={styles.scorerBtn} onPress={() => bump(p.id, -1)}>
                    <Text style={styles.scorerGlyph}>−</Text>
                  </Pressable>
                  <View style={styles.scorerRingWrap}>
                    <ScoreRing strokes={val} par={par} size={58} innerSize={50} fontSize={32} />
                  </View>
                  <Pressable style={styles.scorerBtn} onPress={() => bump(p.id, 1)}>
                    <Text style={styles.scorerGlyph}>+</Text>
                  </Pressable>
                </View>
              );
            })}

            {keeping.length > open.length && (
              <Text style={styles.scorerNote}>
                {keeping
                  .filter((p) => !open.some((o) => o.id === p.id))
                  .map((p) => (p.id === myId ? 'Your card' : p.name))
                  .join(', ')}{' '}
                — signed and locked. Reopen on the Card tab to edit.
              </Text>
            )}

            {theirOwn.length > 0 && (
              <Text style={styles.scorerNote}>
                {theirOwn.map((p) => p.name).join(', ')} {theirOwn.length === 1 ? 'is' : 'are'} scoring on{' '}
                {theirOwn.length === 1 ? 'their own phone' : 'their own phones'}, so {theirOwn.length === 1 ? 'that card is' : 'those cards are'}{' '}
                theirs to keep. Their scores still show on the leaderboard.
              </Text>
            )}

            <Text style={styles.scorerNote}>
              Everyone in the round sees these numbers land live. Any player can dispute a hole for 5 minutes after it
              posts.
            </Text>
          </View>
        )}

        {/* The only way back to the player picker. It used to be reachable by
            being removed from the roster on the FIELD tab, which is now the
            organizer's — picking the wrong name would otherwise be permanent. */}
        <Pressable onPress={clear} style={styles.whoRow} hitSlop={6}>
          <Text style={styles.whoText}>
            Scoring as {players.find((p) => p.id === myId)?.name ?? 'you'}
          </Text>
          <Text style={styles.whoSwitch}>NOT YOU?</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.holeChipsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {holes.map((h, i) => {
            const isCurrent = i === safeIndex;
            const isPosted = scores[h.hole]?.[myId] != null;
            return (
              <Pressable
                key={h.hole}
                onPress={() => goToHole(i)}
                style={[
                  styles.chip,
                  { backgroundColor: isCurrent ? colors.accent : isPosted ? colors.text : 'transparent' },
                ]}
              >
                <Text style={[styles.chipText, { color: isCurrent || isPosted ? colors.white : colors.ghost }]}>
                  {h.hole}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <Pressable style={styles.postBtn} onPress={commitHole}>
        {/* This used to read "POST · ROUND COMPLETE" on the last hole. That
            described where you were standing rather than what the button did —
            it posts a score, and it never completed anything. Reported as
            "doesn't seem to be working", and it wasn't: the label was the bug. */}
        <Text style={styles.postLabel}>
          {isLastHole ? `POST · HOLE ${holes[safeIndex].hole}` : `POST · HOLE ${holes[safeIndex + 1].hole}`}
        </Text>
        <Text style={styles.postArrow}>→</Text>
      </Pressable>

      {/* Signing your card is what submits your round, and it lives on CARD —
          but nothing on this screen ever said so, which is why finishing a round
          felt like it wasn't working. Only offered once every hole has a number
          on it: a card signed on the fourteenth is a card signed by accident. */}
      {allHolesPosted && (
        <Pressable
          style={styles.signBtn}
          onPress={() =>
            router.push(
              open[0].id === myId ? '/(tabs)/card' : { pathname: '/(tabs)/card', params: { player: open[0].id } },
            )
          }
        >
          <Text style={styles.signLabel}>
            {open.length > 1
              ? `ALL POSTED · SIGN ${open.length} CARDS`
              : open[0].id === myId
                ? `ALL ${holes.length} POSTED · SIGN MY CARD`
                : `ALL ${holes.length} POSTED · SIGN ${open[0].name.toUpperCase()}'S CARD`}
          </Text>
          <Text style={styles.signArrow}>→</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 24 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 58,
    paddingHorizontal: 20,
  },
  headerLeft: { flex: 1 },
  roundChip: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderColor: colors.text,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  roundChipName: { fontFamily: font.heading, fontSize: 13, color: colors.text },
  roundChipCta: { fontFamily: font.bodySemi, fontSize: 8.5, letterSpacing: 1.1, color: colors.accent, marginTop: 3 },
  badgeUnder: { marginTop: 7 },
  headerLabel: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted },
  lockedWrap: { paddingTop: 58, paddingHorizontal: 20 },
  lockedTitle: { fontFamily: font.heading, fontSize: 24, color: colors.accent, marginTop: 16 },
  lockedNote: { fontFamily: font.body, fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 10 },
  offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  offlineDot: { width: 7, height: 7, backgroundColor: colors.accent },
  offlineText: { fontFamily: font.heading, fontSize: 9.5, letterSpacing: 1.2, color: colors.accent },
  holeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginTop: 6, paddingHorizontal: 20, paddingBottom: 12 },
  holeNum: { fontFamily: font.heading, fontSize: 82, lineHeight: 82, letterSpacing: -4, color: colors.text },
  holeMeta: { paddingBottom: 6 },
  parLabel: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  yds: { fontFamily: font.body, fontSize: 11.5, color: colors.muted, marginTop: 4 },
  toParBox: { marginLeft: 'auto', paddingBottom: 6, alignItems: 'flex-end' },
  toPar: { fontFamily: font.heading, fontSize: 22, color: colors.accent },
  thru: { fontFamily: font.bodySemi, fontSize: 9.5, letterSpacing: 1.1, textTransform: 'uppercase', color: colors.muted, marginTop: 5 },
  modeRow: { flexDirection: 'row', borderTopWidth: 2, borderBottomWidth: 2, borderColor: colors.divider },
  modeBtn: { flex: 1, paddingVertical: 11, paddingHorizontal: 14 },
  modeBtnDivider: { borderRightWidth: 1, borderRightColor: colors.divider },
  modeLabel: { fontFamily: font.heading, fontSize: 11, letterSpacing: 0.6, color: colors.text },
  modeUnderline: { height: 3, backgroundColor: colors.accent, marginTop: 9 },
  stepperRow: { flexDirection: 'row', borderBottomWidth: 2, borderColor: colors.divider },
  stepperBtn: { width: 104, height: 206, alignItems: 'center', justifyContent: 'center' },
  stepperBtnRight: { borderRightWidth: 2, borderColor: colors.divider },
  stepperBtnLeft: { borderLeftWidth: 2, borderColor: colors.divider },
  stepperGlyph: { fontFamily: font.heading, fontSize: 60, color: colors.text },
  stepperCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  scoreLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 1.8, color: colors.accent },
  sectionLabel: {
    fontFamily: font.bodySemi,
    fontSize: 9.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  dot: { width: 9, height: 9 },
  otherName: { flex: 1, fontFamily: font.bodySemi, fontSize: 13.5, color: colors.text },
  otherState: { fontFamily: font.body, fontSize: 11, color: colors.muted },
  otherVal: { fontFamily: font.heading, fontSize: 17, width: 26, textAlign: 'right', color: colors.text },
  scorerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderColor: colors.divider,
  },
  scorerName: { flex: 1, paddingHorizontal: 14 },
  scorerNameText: { fontFamily: font.heading, fontSize: 14, color: colors.text },
  scorerMeta: { fontFamily: font.body, fontSize: 10.5, color: colors.muted, marginTop: 5 },
  scorerBtn: { width: 76, height: 96, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 2, borderColor: colors.divider },
  scorerGlyph: { fontFamily: font.heading, fontSize: 34, color: colors.text },
  scorerRingWrap: { width: 66, alignItems: 'center', justifyContent: 'center' },
  scorerNote: { fontFamily: font.body, fontSize: 11.5, lineHeight: 17, color: colors.muted, padding: 20 },
  whoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  whoText: { fontFamily: font.body, fontSize: 11.5, color: colors.muted },
  whoSwitch: { fontFamily: font.heading, fontSize: 10.5, letterSpacing: 0.9, color: colors.accent },
  holeChipsRow: { borderTopWidth: 2, borderBottomWidth: 1, borderColor: colors.divider },
  chip: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: colors.divider },
  chipText: { fontFamily: font.heading, fontSize: 12 },
  signBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 62,
    paddingHorizontal: 20,
    borderTopWidth: 2,
    borderColor: colors.text,
  },
  signLabel: { fontFamily: font.heading, fontSize: 14, letterSpacing: 0.5, color: colors.text },
  signArrow: { fontFamily: font.heading, fontSize: 18, color: colors.text },
  postBtn: {
    height: 72,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  postLabel: { fontFamily: font.heading, fontSize: 17, letterSpacing: 0.3, color: '#fff' },
  postArrow: { fontFamily: font.heading, fontSize: 20, color: '#fff' },
});

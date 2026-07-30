import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlayerPicker } from '@/components/PlayerPicker';
import { Wordmark } from '@/components/Wordmark';
import { ScoreRing } from '@/components/ScoreRing';
import { useRound } from '@/context/RoundContext';
import { useSignoff } from '@/hooks/useSignoff';
import {
  cardBlocksFor,
  grossFor,
  netToParFor,
  parTotalFor,
  stablefordFor,
  strokesReceivedFor,
  thruFor,
  youFirst,
} from '@/lib/roundMath';
import { colors, font, fmtToPar, markForScore } from '@/theme';

const LEGEND: Array<{ label: string; strokes: number; par: number }> = [
  { label: 'Eagle or better', strokes: 3, par: 5 },
  { label: 'Birdie', strokes: 3, par: 4 },
  { label: 'Par', strokes: 4, par: 4 },
  { label: 'Bogey', strokes: 5, par: 4 },
  { label: 'Double +', strokes: 6, par: 4 },
];

const HOLD_STEP = 8;
const HOLD_INTERVAL_MS = 40;

export default function ScorecardScreen() {
  const {
    myId,
    choose,
    userId,
    claimPlayer,
    playersError,
    clear,
    scores,
    players,
    holes,
    course,
    amOrganizer,
    activeRoundId,
    activeRound,
    rounds,
    switchRound,
  } = useRound();

  // Which player's card is on screen. Defaults to you, but any player in the
  // round can be viewed — reading a partner's card is normal at the turn.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // A leaderboard row can send a player here via the route. Tracked by last
  // applied value so arriving from the board doesn't fight with the in-page
  // switcher on every re-render.
  const params = useLocalSearchParams<{ player?: string }>();
  const appliedParam = useRef<string | null>(null);

  useEffect(() => {
    const requested = typeof params.player === 'string' && params.player ? params.player : null;
    if (!requested) {
      appliedParam.current = null;
      return;
    }
    if (requested === appliedParam.current) return;
    appliedParam.current = requested;
    setViewingId(requested === myId ? null : requested);
    setSwitcherOpen(false);
  }, [params.player, myId]);

  // Clearing the param matters: without it, returning to your own card leaves
  // the old player on the route, so tapping that same row again would do
  // nothing — the value wouldn't have changed.
  const backToMyCard = () => {
    setViewingId(null);
    appliedParam.current = null;
    router.setParams({ player: '' });
  };

  const shownId = viewingId ?? myId ?? null;
  const isOwnCard = !!myId && shownId === myId;

  // Signing is only ever your own card, so this tracks the *viewed* player to
  // show their status truthfully while the hold-to-sign control stays gated to
  // your own (CLAUDE.md rules 2 and 8).
  const { signedAt, sign, reopen } = useSignoff(activeRoundId, shownId);
  const [hold, setHold] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const me = myId ? players.find((p) => p.id === myId) : undefined;
  const viewed = shownId ? players.find((p) => p.id === shownId) : undefined;

  // If this device's chosen player was removed from the round elsewhere,
  // fall back to the picker rather than crash on a missing player.
  useEffect(() => {
    if (myId && players.length && !me) clear();
  }, [myId, players, me]);

  // Likewise if the player being viewed leaves the round: snap back to your own
  // card instead of rendering a card for someone who isn't in it.
  useEffect(() => {
    if (viewingId && players.length && !players.some((p) => p.id === viewingId)) backToMyCard();
  }, [viewingId, players]);

  // Reset the hold when switching cards, so a part-filled bar can't carry over
  // from one player to another.
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    setHold(0);
  }, [shownId]);

  if (myId === undefined || signedAt === undefined) return <View style={styles.screen} />;
  if (!myId || !me) return <PlayerPicker players={players} onChoose={choose} userId={userId} onClaim={claimPlayer} loadError={playersError} />;

  const who = viewed ?? me;
  const cardId = who.id;

  const thru = thruFor(holes, scores, cardId);
  const complete = holes.length > 0 && thru === holes.length;
  const parTotal = parTotalFor(holes);
  const gross = grossFor(holes, scores, cardId);
  const net = gross - strokesReceivedFor(holes, scores, cardId, who.handicap);
  const blocks = cardBlocksFor(holes, scores, cardId);
  const signed = !!signedAt;

  const holdStart = () => {
    // Never sign for somebody else, whatever the UI happens to be showing.
    if (!isOwnCard || signed || !complete) return;
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setHold((prev) => {
        const next = prev + HOLD_STEP;
        if (next >= 100) {
          if (timer.current) clearInterval(timer.current);
          sign();
          return 100;
        }
        return next;
      });
    }, HOLD_INTERVAL_MS);
  };
  const holdStop = () => {
    if (timer.current) clearInterval(timer.current);
    if (!signed) setHold(0);
  };

  const confirmReopen = () => {
    Alert.alert(
      `Reopen ${isOwnCard ? 'your' : who.name + "'s"} card?`,
      'A signed card is meant to stay locked — that is what makes it stand in for the paper one. Reopening lets the scores be edited again, and everyone in the round will see it unlock.',
      [
        { text: 'Leave it signed', style: 'cancel' },
        {
          text: 'Reopen',
          style: 'destructive',
          onPress: async () => {
            setHold(0);
            const message = await reopen();
            if (message) Alert.alert('Could not reopen that card', message);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Wordmark width={160} />
        {/* Round history lives here because the card is the thing you go back to
            look at. FIELD used to be the only way to Rounds and it's the
            organizer's tab now, so a player needs this door. */}
        <Text style={[styles.headerLabel, { marginTop: 12 }]}>{activeRound?.name || 'Round'}</Text>
        <Text style={styles.headerLabel}>
          {[course?.courseName, course?.courseMeta].filter(Boolean).join(' · ') || 'No course picked'}
        </Text>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => setSwitcherOpen((v) => !v)}
            style={styles.nameBtn}
            hitSlop={8}
            disabled={players.length < 2}
          >
            <Text style={styles.name}>{who.name}</Text>
            {players.length > 1 && (
              <Text style={styles.nameHint}>
                {isOwnCard ? 'YOUR CARD' : 'VIEWING'} · TAP TO SWITCH {switcherOpen ? '▲' : '▼'}
              </Text>
            )}
          </Pressable>
          {complete ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.grossHero}>{gross}</Text>
              <Text style={styles.toParHero}>{fmtToPar(gross - parTotal)} GROSS</Text>
            </View>
          ) : (
            <Text style={styles.progressNote}>
              {thru} of {holes.length || '–'} played
            </Text>
          )}
        </View>
      </View>


      {switcherOpen && (
        <View style={styles.switcher}>
          {/* Your own card is the one you open most, so it's the first offered
              rather than wherever the alphabet happens to put you. */}
          {youFirst(players, myId).map((p) => {
            const on = p.id === cardId;
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  setViewingId(p.id === myId ? null : p.id);
                  setSwitcherOpen(false);
                }}
                style={[styles.switchRow, on && styles.switchRowOn]}
              >
                <View style={[styles.switchDot, { backgroundColor: on ? colors.accent : 'transparent' }]} />
                <Text style={styles.switchName}>
                  {p.name}
                  {p.id === myId ? ' (you)' : ''}
                </Text>
                <Text style={styles.switchMeta}>
                  HCP {p.handicap} · {thruFor(holes, scores, p.id)} played
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <ScrollView style={styles.scroll}>
        {blocks.map((b) => (
          <View key={b.label} style={styles.block}>
            <View style={styles.blockHeaderRow}>
              <Text style={styles.blockLabel}>{b.label}</Text>
              {b.holes.map((h) => (
                <Text key={h.hole} style={styles.blockHoleNum}>
                  {h.hole}
                </Text>
              ))}
              <Text style={styles.blockTotLabel}>TOT</Text>
            </View>
            {/* The tee actually being played, off the round's own card — the
                same yardages the course setup wrote down, not the course's
                longest tee. */}
            {b.yardsTotal > 0 && (
              <View style={styles.blockRow}>
                <Text style={styles.ydsRowLabel}>YDS</Text>
                {b.holes.map((h) => (
                  <Text key={h.hole} style={styles.ydsCell}>
                    {h.yards || '–'}
                  </Text>
                ))}
                <Text style={styles.ydsTot}>{b.yardsTotal}</Text>
              </View>
            )}
            <View style={styles.blockRow}>
              <Text style={styles.parRowLabel}>PAR</Text>
              {b.holes.map((h) => (
                <Text key={h.hole} style={styles.parCell}>
                  {h.par}
                </Text>
              ))}
              <Text style={styles.parTot}>{b.parTotal}</Text>
            </View>
            <View style={[styles.blockRow, styles.scoreRow]}>
              <Text style={styles.scoreRowLabel}>SCORE</Text>
              {b.holes.map((h) => (
                <View key={h.hole} style={styles.scoreCell}>
                  {h.strokes != null ? (
                    <ScoreRing strokes={h.strokes} par={h.par} size={30} innerSize={25} fontSize={15} />
                  ) : (
                    <Text style={styles.dash}>–</Text>
                  )}
                </View>
              ))}
              <Text style={styles.scoreTot}>{b.total ?? '–'}</Text>
            </View>
          </View>
        ))}

        <View style={styles.totalsRow}>
          <View style={styles.totalCell}>
            <Text style={styles.totalVal}>{complete ? gross : '–'}</Text>
            <Text style={styles.totalLabel}>Gross</Text>
          </View>
          {/* Every figure here belongs to the card on screen, not to whoever is
              holding the phone. These two read `me`/`myId` once, which showed
              your own Stableford and your own handicap on a partner's card while
              the gross and net beside them were theirs. */}
          <View style={styles.totalCell}>
            <Text style={styles.totalVal}>{complete ? net : '–'}</Text>
            <Text style={styles.totalLabel}>Net ({who.handicap})</Text>
          </View>
          <View style={[styles.totalCell, { borderRightWidth: 0 }]}>
            <Text style={styles.totalVal}>{complete ? stablefordFor(holes, scores, cardId) : '–'}</Text>
            <Text style={styles.totalLabel}>Stableford</Text>
          </View>
        </View>

        <View style={styles.legendRow}>
          {LEGEND.map((l) => {
            const mark = markForScore(l.strokes, l.par);
            return (
              <View key={l.label} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendOuter,
                    { borderRadius: mark.radius === 999 ? 14 : 0, borderColor: mark.ringColor, borderWidth: mark.ringWidth },
                  ]}
                >
                  <View
                    style={[
                      styles.legendInner,
                      { borderRadius: mark.radius === 999 ? 11.5 : 0, borderColor: mark.innerRingColor, borderWidth: mark.innerRingWidth },
                    ]}
                  >
                    <Text style={[styles.legendVal, { color: mark.color }]}>{l.strokes}</Text>
                  </View>
                </View>
                <Text style={styles.legendLabel}>{l.label}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.signSection}>
          {/* A signed card is the thing you keep and show people — the one place
              in the round where a mark belongs, the way a paper card carries the
              club's. Only once it's signed; an unfinished card isn't a document
              yet. */}
          {signed && (
            <View style={styles.cardMark}>
              <Wordmark width={150} />
            </View>
          )}
          {signed ? (
            <>
              <Text style={styles.signedTitle}>Card signed and locked</Text>
              <Text style={styles.signedNote}>
                {who.name} · {new Date(signedAt!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · posted to{' '}
                {course?.courseName || 'this round'}.
              </Text>
            </>
          ) : !isOwnCard ? (
            <Text style={styles.signNote}>
              {who.name} hasn't signed yet. Only they can sign their own card — this is their round to look at, not to
              confirm.
            </Text>
          ) : complete ? (
            <Text style={styles.signNote}>By signing you confirm every number above. This is the paper card — once it's in, it's in.</Text>
          ) : holes.length ? (
            <Text style={styles.signNote}>
              {holes.length - thru} hole{holes.length - thru === 1 ? '' : 's'} left to play — sign-off unlocks once your
              round is complete.
            </Text>
          ) : (
            <Text style={styles.signNote}>Pick a course on the Course tab and your card appears here.</Text>
          )}

          {signed && amOrganizer && (
            <Pressable onPress={confirmReopen} style={styles.reopenBtn}>
              <Text style={styles.reopenLabel}>REOPEN THIS CARD</Text>
            </Pressable>
          )}
          {signed && !amOrganizer && (
            <Text style={styles.signNote}>
              A signed card stays locked. Only whoever's running the round can reopen one, from this screen.
            </Text>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {!isOwnCard ? (
          <Pressable style={styles.footerBtnDark} onPress={backToMyCard}>
            <Text style={styles.footerBtnDarkLabel}>BACK TO MY CARD</Text>
            <Text style={styles.footerBtnDarkArrow}>→</Text>
          </Pressable>
        ) : signed ? (
          <Pressable style={styles.footerBtnDark} onPress={() => router.push('/(tabs)/board')}>
            <Text style={styles.footerBtnDarkLabel}>BACK TO THE LEADERBOARD</Text>
            <Text style={styles.footerBtnDarkArrow}>→</Text>
          </Pressable>
        ) : (
          <Pressable
            onPressIn={holdStart}
            onPressOut={holdStop}
            disabled={!complete}
            style={[styles.holdBtn, !complete && styles.holdBtnDisabled]}
          >
            <View style={[styles.holdFill, { width: `${hold}%` }]} />
            <View style={styles.holdContent}>
              <Text style={[styles.holdLabel, { color: hold > 48 ? '#fff' : colors.text }]}>HOLD TO SIGN</Text>
              <Text style={[styles.holdPct, { color: hold > 48 ? '#fff' : colors.text }]}>
                {hold > 0 && hold < 100 ? 'HOLD…' : 'PRESS'}
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 12 },
  headerLabel: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 },
  name: { fontFamily: font.heading, fontSize: 28, letterSpacing: -0.6, color: colors.text },
  nameBtn: { flex: 1 },
  nameHint: {
    fontFamily: font.heading,
    fontSize: 9,
    letterSpacing: 1.1,
    color: colors.accent,
    marginTop: 6,
  },
  switcher: { borderTopWidth: 2, borderColor: colors.divider },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: colors.divider,
  },
  switchRowOn: { backgroundColor: 'rgba(236,48,19,0.06)' },
  switchDot: { width: 9, height: 9 },
  switchName: { flex: 1, fontFamily: font.heading, fontSize: 15, color: colors.text },
  switchMeta: { fontFamily: font.body, fontSize: 11, color: colors.muted },
  switchNote: { fontFamily: font.body, fontSize: 11, lineHeight: 17, color: colors.muted, paddingHorizontal: 20, paddingVertical: 12 },
  grossHero: { fontFamily: font.heading, fontSize: 34, color: colors.text, textAlign: 'right' },
  toParHero: { fontFamily: font.heading, fontSize: 11, color: colors.accent, marginTop: 5, textAlign: 'right' },
  progressNote: { fontFamily: font.bodySemi, fontSize: 12, color: colors.muted },
  scroll: { flex: 1, borderTopWidth: 2, borderColor: colors.divider },
  block: { borderBottomWidth: 2, borderColor: colors.divider },
  blockHeaderRow: { flexDirection: 'row', paddingVertical: 8, paddingLeft: 20, backgroundColor: 'rgba(32,30,29,0.045)' },
  blockLabel: { width: 46, fontFamily: font.heading, fontSize: 9.5, letterSpacing: 1, color: colors.muted },
  blockHoleNum: { flex: 1, textAlign: 'center', fontFamily: font.heading, fontSize: 10, color: colors.muted },
  blockTotLabel: { width: 42, textAlign: 'center', fontFamily: font.heading, fontSize: 9.5, letterSpacing: 0.6, color: colors.muted },
  blockRow: { flexDirection: 'row', paddingVertical: 9, paddingLeft: 20, borderTopWidth: 1, borderColor: colors.divider },
  // Yardage sits quieter than par — it's reference, not a number you read off.
  ydsRowLabel: { width: 46, fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 0.8, color: colors.mutedFaint },
  ydsCell: { flex: 1, textAlign: 'center', fontFamily: font.body, fontSize: 9.5, color: colors.mutedFaint },
  ydsTot: { width: 42, textAlign: 'center', fontFamily: font.bodySemi, fontSize: 9.5, color: colors.mutedFaint },
  parRowLabel: { width: 46, fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 0.8, color: colors.muted },
  parCell: { flex: 1, textAlign: 'center', fontFamily: font.body, fontSize: 12, color: 'rgba(32,30,29,0.7)' },
  parTot: { width: 42, textAlign: 'center', fontFamily: font.bodySemi, fontSize: 12, color: 'rgba(32,30,29,0.7)' },
  scoreRow: { alignItems: 'center', paddingVertical: 11 },
  scoreRowLabel: { width: 46, fontFamily: font.heading, fontSize: 10, letterSpacing: 0.8, color: colors.text },
  scoreCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dash: { fontFamily: font.heading, fontSize: 15, color: colors.ghost },
  scoreTot: { width: 42, textAlign: 'center', fontFamily: font.heading, fontSize: 16, color: colors.text },
  totalsRow: { flexDirection: 'row', borderBottomWidth: 2, borderColor: colors.divider },
  totalCell: { flex: 1, paddingVertical: 13, paddingHorizontal: 16, borderRightWidth: 1, borderColor: colors.divider },
  totalVal: { fontFamily: font.heading, fontSize: 22, color: colors.text },
  totalLabel: { fontFamily: font.bodySemi, fontSize: 9.5, letterSpacing: 1.1, textTransform: 'uppercase', color: colors.muted, marginTop: 5 },
  legendRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 20, gap: 4, borderBottomWidth: 2, borderColor: colors.divider },
  legendItem: { flex: 1, alignItems: 'center', gap: 6 },
  legendOuter: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  legendInner: { width: 23, height: 23, alignItems: 'center', justifyContent: 'center' },
  legendVal: { fontFamily: font.heading, fontSize: 13 },
  legendLabel: { fontFamily: font.bodySemi, fontSize: 8.5, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted, textAlign: 'center' },
  signSection: { padding: 20, borderBottomWidth: 2, borderColor: colors.divider },
  cardMark: { marginBottom: 16, opacity: 0.85 },
  signNote: { fontFamily: font.body, fontSize: 12, lineHeight: 19, color: 'rgba(32,30,29,0.65)' },
  signedTitle: { fontFamily: font.heading, fontSize: 15, color: colors.accent },
  signedNote: { fontFamily: font.body, fontSize: 12, lineHeight: 19, color: 'rgba(32,30,29,0.65)', marginTop: 8 },
  reopenBtn: { marginTop: 16, borderWidth: 2, borderColor: colors.text, paddingVertical: 13, alignItems: 'center' },
  reopenLabel: { fontFamily: font.heading, fontSize: 11, letterSpacing: 1, color: colors.text },
  footer: { borderTopWidth: 2, borderColor: colors.divider },
  holdBtn: { height: 82, backgroundColor: colors.bg, overflow: 'hidden', paddingHorizontal: 20, paddingBottom: 26, justifyContent: 'center' },
  holdBtnDisabled: { opacity: 0.4 },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accent },
  holdContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  holdLabel: { fontFamily: font.heading, fontSize: 17, letterSpacing: 0.3 },
  holdPct: { fontFamily: font.heading, fontSize: 13, letterSpacing: 1 },
  footerBtnDark: {
    height: 82,
    backgroundColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 26,
  },
  footerBtnDarkLabel: { fontFamily: font.heading, fontSize: 17, color: colors.white },
  footerBtnDarkArrow: { fontFamily: font.heading, fontSize: 20, color: colors.white },
});

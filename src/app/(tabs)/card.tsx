import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlayerPicker } from '@/components/PlayerPicker';
import { ScoreRing } from '@/components/ScoreRing';
import { useRound } from '@/context/RoundContext';
import { COURSE_META, COURSE_NAME, PLAYERS } from '@/data/seed';
import { usePlayerIdentity } from '@/hooks/usePlayerIdentity';
import { useSignoff } from '@/hooks/useSignoff';
import { cardBlocksFor, netToParFor, stablefordFor, thruFor, toParFor } from '@/lib/roundMath';
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
  const { myId, choose } = usePlayerIdentity();
  const { scores } = useRound();
  const { signedAt, sign } = useSignoff(myId);
  const [hold, setHold] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  if (myId === undefined || signedAt === undefined) return <View style={styles.screen} />;
  if (!myId) return <PlayerPicker onChoose={choose} />;

  const me = PLAYERS.find((p) => p.id === myId)!;
  const thru = thruFor(scores, myId);
  const complete = thru === 18;
  const gross = toParFor(scores, myId) + 72; // par 72 course
  const blocks = cardBlocksFor(scores, myId);
  const signed = !!signedAt;

  const holdStart = () => {
    if (signed || !complete) return;
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

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>
          {COURSE_NAME} · {COURSE_META}
        </Text>
        <View style={styles.headerRow}>
          <Text style={styles.name}>{me.name}</Text>
          {complete ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.grossHero}>{gross}</Text>
              <Text style={styles.toParHero}>{fmtToPar(gross - 72)} GROSS</Text>
            </View>
          ) : (
            <Text style={styles.progressNote}>{thru} of 18 played</Text>
          )}
        </View>
      </View>

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
          <View style={styles.totalCell}>
            <Text style={styles.totalVal}>{complete ? netToParFor(scores, myId, me.handicap) + 72 : '–'}</Text>
            <Text style={styles.totalLabel}>Net ({me.handicap})</Text>
          </View>
          <View style={[styles.totalCell, { borderRightWidth: 0 }]}>
            <Text style={styles.totalVal}>{complete ? stablefordFor(scores, myId) : '–'}</Text>
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
          {signed ? (
            <>
              <Text style={styles.signedTitle}>Card signed and locked</Text>
              <Text style={styles.signedNote}>
                {me.name} · {new Date(signedAt!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · posted to{' '}
                {COURSE_NAME}.
              </Text>
            </>
          ) : complete ? (
            <Text style={styles.signNote}>By signing you confirm every number above. This is the paper card — once it's in, it's in.</Text>
          ) : (
            <Text style={styles.signNote}>
              {18 - thru} hole{18 - thru === 1 ? '' : 's'} left to play — sign-off unlocks once your round is complete.
            </Text>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {signed ? (
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
  signNote: { fontFamily: font.body, fontSize: 12, lineHeight: 19, color: 'rgba(32,30,29,0.65)' },
  signedTitle: { fontFamily: font.heading, fontSize: 15, color: colors.accent },
  signedNote: { fontFamily: font.body, fontSize: 12, lineHeight: 19, color: 'rgba(32,30,29,0.65)', marginTop: 8 },
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

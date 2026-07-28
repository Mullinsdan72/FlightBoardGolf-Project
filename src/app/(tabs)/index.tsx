import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlayerPicker } from '@/components/PlayerPicker';
import { ScoreRing } from '@/components/ScoreRing';
import { HOLES, PLAYERS, ROUND_NAME } from '@/data/seed';
import { useLiveScores } from '@/hooks/useLiveScores';
import { usePlayerIdentity } from '@/hooks/usePlayerIdentity';
import { parFor, thruFor, toParFor } from '@/lib/roundMath';
import { colors, font, fmtToPar, scoreName } from '@/theme';

type Mode = 'self' | 'scorer';

export default function ScoreEntryScreen() {
  const { myId, choose } = usePlayerIdentity();
  const { scores, setScores, postScore, live, connected } = useLiveScores();

  const [hole, setHole] = useState(1);
  const [mode, setMode] = useState<Mode>('self');
  const [draft, setDraft] = useState<Record<number, Record<string, number>>>({});
  const startedAt = useRef(false);

  // Jump to the first unplayed hole once, the first time this player's
  // posted scores load — after that, hole navigation is the golfer's own.
  useEffect(() => {
    if (startedAt.current || !myId) return;
    const thru = thruFor(scores, myId);
    if (thru > 0) {
      startedAt.current = true;
      setHole(Math.min(18, thru + 1));
    }
  }, [scores, myId]);

  if (myId === undefined) return <View style={styles.screen} />;
  if (!myId) return <PlayerPicker onChoose={choose} />;

  const holeInfo = HOLES[hole - 1];
  const par = holeInfo.par;

  const valueFor = (h: number, playerId: string) =>
    draft[h]?.[playerId] ?? scores[h]?.[playerId] ?? HOLES[h - 1].par;

  const bump = (playerId: string, delta: number) => {
    const next = Math.max(1, Math.min(15, valueFor(hole, playerId) + delta));
    setDraft((prev) => ({ ...prev, [hole]: { ...(prev[hole] || {}), [playerId]: next } }));
  };

  const myScore = valueFor(hole, myId);
  const myToPar = toParFor(scores, myId);
  const thru = thruFor(scores, myId);

  const commitHole = () => {
    const entries = mode === 'self' ? [myId] : PLAYERS.map((p) => p.id);
    const nextScores = { ...scores, [hole]: { ...(scores[hole] || {}) } };
    for (const playerId of entries) {
      const strokes = valueFor(hole, playerId);
      nextScores[hole][playerId] = strokes;
      postScore(hole, playerId, strokes);
    }
    setScores(nextScores);
    setDraft((prev) => ({ ...prev, [hole]: {} }));
    if (hole < 18) setHole(hole + 1);
  };

  const others = PLAYERS.filter((p) => p.id !== myId);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Text style={styles.headerLabel}>{ROUND_NAME} · Group 12</Text>
          {(!live || !connected) && (
            <View style={styles.offlineBadge}>
              <View style={styles.offlineDot} />
              <Text style={styles.offlineText}>{live ? 'CONNECTING' : 'OFFLINE · LOCAL ONLY'}</Text>
            </View>
          )}
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

        <View style={styles.modeRow}>
          <Pressable style={[styles.modeBtn, styles.modeBtnDivider]} onPress={() => setMode('self')}>
            <Text style={styles.modeLabel}>EVERYONE SCORES</Text>
            {mode === 'self' && <View style={styles.modeUnderline} />}
          </Pressable>
          <Pressable style={styles.modeBtn} onPress={() => setMode('scorer')}>
            <Text style={styles.modeLabel}>I'M SCORING FOR ALL</Text>
            {mode === 'scorer' && <View style={styles.modeUnderline} />}
          </Pressable>
        </View>

        {mode === 'self' ? (
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

            <Text style={styles.sectionLabel}>Group 12 · this hole</Text>
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
            {PLAYERS.map((p) => {
              const val = valueFor(hole, p.id);
              const pToPar = toParFor(scores, p.id);
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
            <Text style={styles.scorerNote}>
              Everyone in Group 12 sees these numbers land live. Any player can dispute a hole for 5 minutes after it
              posts.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.holeChipsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {HOLES.map((h) => {
            const isCurrent = h.hole === hole;
            const isPosted = scores[h.hole]?.[myId] != null;
            return (
              <Pressable
                key={h.hole}
                onPress={() => setHole(h.hole)}
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
        <Text style={styles.postLabel}>{hole < 18 ? `POST · HOLE ${hole + 1}` : 'POST · ROUND COMPLETE'}</Text>
        <Text style={styles.postArrow}>→</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 24 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 58,
    paddingHorizontal: 20,
  },
  headerLabel: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted },
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
  holeChipsRow: { borderTopWidth: 2, borderBottomWidth: 1, borderColor: colors.divider },
  chip: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: colors.divider },
  chipText: { fontFamily: font.heading, fontSize: 12 },
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

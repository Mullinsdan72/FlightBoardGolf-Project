import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlayerPicker } from '@/components/PlayerPicker';
import { ScoreRing } from '@/components/ScoreRing';
import { useRound } from '@/context/RoundContext';
import { netToParFor, thruFor, toParFor } from '@/lib/roundMath';
import { colors, font, fmtToPar } from '@/theme';

type Tab = 'group' | 'field';

export default function LeaderboardScreen() {
  const { myId, choose, clear, scores, live, connected, players, playersLoaded, holes, activeRound } =
    useRound();
  const [tab, setTab] = useState<Tab>('field');
  const amInRound = !myId || players.some((p) => p.id === myId);

  // If this device's chosen player was removed from the round elsewhere,
  // fall back to the picker rather than render a row for a ghost player.
  useEffect(() => {
    if (myId && players.length && !amInRound) clear();
  }, [myId, players, amInRound]);

  if (myId === undefined || !playersLoaded) return <View style={styles.screen} />;
  if (!myId || !amInRound) return <PlayerPicker players={players} onChoose={choose} />;

  // Hand the Card tab the player to show. It reads this off the route rather
  // than sharing state, so the card is also reachable by URL on web.
  const openCard = (playerId: string) =>
    router.navigate({ pathname: '/(tabs)/card', params: { player: playerId } });

  const roundLength = holes.length || 18;

  const realRows = players.map((p) => ({
    id: p.id,
    name: p.id === myId ? p.name + ' (you)' : p.name,
    club: 'Group 12',
    handicap: p.handicap,
    toPar: toParFor(holes, scores, p.id),
    // Same stroke-index allocation the scorecard uses, so a player's net here
    // and on their card can never disagree.
    net: netToParFor(holes, scores, p.id, p.handicap),
    thru: thruFor(holes, scores, p.id),
    isYou: p.id === myId,
  }));

  // Only real players. There used to be six invented names padding this board
  // out; they made a demo look convincing but there was no way to remove them,
  // and a leaderboard that shows people who aren't playing is just wrong.
  const fieldRows = realRows
    .map((r) => ({ ...r, thruLabel: r.thru === roundLength ? 'F' : String(r.thru) }))
    .sort((a, b) => a.toPar - b.toPar);

  const groupRows = realRows
    .slice()
    .sort((a, b) => a.toPar - b.toPar)
    .map((r) => ({ ...r, note: `HCP ${r.handicap} · net ${fmtToPar(r.net)}` }));

  const myMini = holes.map((h) => ({ hole: h.hole, par: h.par, strokes: scores[h.hole]?.[myId] }));

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <View style={styles.headerTop}>
          <Text style={styles.headerLabel}>{activeRound?.name || 'Round'}</Text>
          <View style={styles.liveBadge}>
            <View style={[styles.liveDot, { backgroundColor: live && connected ? colors.accent : colors.mutedFaint }]} />
            <Text style={styles.liveText}>{live ? (connected ? 'LIVE' : 'CONNECTING') : 'LOCAL ONLY'}</Text>
          </View>
        </View>
        <Text style={styles.title}>Leaderboard</Text>
      </View>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tabBtn, styles.tabDivider]} onPress={() => setTab('group')}>
          <Text style={styles.tabLabel}>MY GROUP</Text>
          {tab === 'group' && <View style={styles.tabUnderline} />}
        </Pressable>
        <Pressable style={styles.tabBtn} onPress={() => setTab('field')}>
          <Text style={styles.tabLabel}>FIELD · {fieldRows.length}</Text>
          {tab === 'field' && <View style={styles.tabUnderline} />}
        </Pressable>
      </View>

      <ScrollView>
        {tab === 'field' &&
          fieldRows.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={() => openCard(r.id)}
              style={[styles.fieldRow, r.isYou && styles.rowYou]}
            >
              <Text style={styles.pos}>{i + 1}</Text>
              <View style={styles.fieldNameCol}>
                <Text style={styles.fieldName}>{r.name}</Text>
                <Text style={styles.fieldClub}>{r.club}</Text>
              </View>
              <Text style={[styles.fieldToPar, { color: r.toPar < 0 ? colors.accent : colors.text }]}>
                {fmtToPar(r.toPar)}
              </Text>
              <Text style={styles.fieldThru}>{r.thruLabel}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}

        {tab === 'group' && (
          <>
            {groupRows.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => openCard(r.id)}
                style={[styles.groupRow, r.isYou && styles.rowYou]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupName}>{r.name}</Text>
                  <Text style={styles.groupNote}>{r.note}</Text>
                </View>
                <Text style={[styles.groupToPar, { color: r.toPar < 0 ? colors.accent : colors.text }]}>
                  {fmtToPar(r.toPar)}
                </Text>
                <Text style={styles.groupThru}>{r.thru === roundLength ? 'F' : `thru ${r.thru}`}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}

            <View style={styles.miniSection}>
              <Text style={styles.miniLabel}>Hole by hole · you</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                {myMini.map((c) => (
                  <View key={c.hole} style={styles.miniCell}>
                    <Text style={styles.miniHole}>{c.hole}</Text>
                    {c.strokes != null ? (
                      <ScoreRing strokes={c.strokes} par={c.par} size={30} innerSize={25} fontSize={14} />
                    ) : (
                      <Text style={styles.miniDash}>–</Text>
                    )}
                  </View>
                ))}
              </ScrollView>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerRow: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 12 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLabel: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7 },
  liveText: { fontFamily: font.heading, fontSize: 9.5, letterSpacing: 1.1, color: colors.accent },
  title: { fontFamily: font.heading, fontSize: 28, letterSpacing: -0.6, marginTop: 8, color: colors.text },
  tabRow: { flexDirection: 'row', borderTopWidth: 2, borderBottomWidth: 2, borderColor: colors.divider },
  tabBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
  tabDivider: { borderRightWidth: 1, borderRightColor: colors.divider },
  tabLabel: { fontFamily: font.heading, fontSize: 11, letterSpacing: 0.5, color: colors.text },
  tabUnderline: { height: 3, backgroundColor: colors.accent, marginTop: 9 },
  rowYou: { backgroundColor: 'rgba(236,48,19,0.08)' },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingLeft: 14,
    paddingRight: 20,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    gap: 4,
  },
  pos: { fontFamily: font.heading, fontSize: 13, width: 30, color: colors.mutedFaint },
  fieldNameCol: { flex: 1 },
  fieldName: { fontFamily: font.bodySemi, fontSize: 14.5, color: colors.text },
  fieldClub: { fontFamily: font.body, fontSize: 10.5, color: colors.muted, marginTop: 4 },
  fieldToPar: { fontFamily: font.heading, fontSize: 20, width: 56, textAlign: 'right' },
  fieldThru: { fontFamily: font.body, fontSize: 11, width: 52, textAlign: 'right', color: colors.muted },
  chevron: { fontFamily: font.heading, fontSize: 13, color: colors.ghost, width: 14, textAlign: 'right' },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderColor: colors.divider,
  },
  groupName: { fontFamily: font.heading, fontSize: 17, color: colors.text },
  groupNote: { fontFamily: font.body, fontSize: 11, color: colors.muted, marginTop: 5 },
  groupToPar: { fontFamily: font.heading, fontSize: 26, marginLeft: 8 },
  groupThru: { fontFamily: font.body, fontSize: 11, marginLeft: 8, color: colors.muted },
  miniSection: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 2, borderColor: colors.divider },
  miniLabel: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase', color: colors.muted },
  miniCell: { width: 38, alignItems: 'center', gap: 7, borderRightWidth: 1, borderColor: colors.divider, paddingVertical: 2 },
  miniHole: { fontFamily: font.bodySemi, fontSize: 9.5, color: colors.muted },
  miniDash: { fontFamily: font.heading, fontSize: 14, color: colors.ghost, height: 30, textAlignVertical: 'center' },
});

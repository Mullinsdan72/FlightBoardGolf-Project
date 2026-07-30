import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlayerPicker } from '@/components/PlayerPicker';
import { Wordmark } from '@/components/Wordmark';
import { ScoreRing } from '@/components/ScoreRing';
import { useRound } from '@/context/RoundContext';
import { netToParFor, thruFor, toParFor, youFirst } from '@/lib/roundMath';
import { formatName, handicapName } from '@/lib/teams';
import { colors, font, fmtToPar } from '@/theme';

type Tab = 'group' | 'field' | 'teams';

export default function LeaderboardScreen() {
  const {
    myId,
    choose,
    userId,
    claimPlayer,
    playersError,
    clear,
    scores,
    live,
    connected,
    players,
    playersLoaded,
    holes,
    activeRound,
    teams,
    teamSegments,
    teamStandingsFor,
    teamDrawSavedFor,
    teamsForSegment,
  } = useRound();
  const [tab, setTab] = useState<Tab>('field');
  const amInRound = !myId || players.some((p) => p.id === myId);
  const teamsOn = teams.enabled;

  // Teams can be switched off mid-round; don't strand the user on a tab that
  // has stopped existing.
  useEffect(() => {
    if (!teamsOn && tab === 'teams') setTab('field');
  }, [teamsOn, tab]);

  // If this device's chosen player was removed from the round elsewhere,
  // fall back to the picker rather than render a row for a ghost player.
  useEffect(() => {
    if (myId && players.length && !amInRound) clear();
  }, [myId, players, amInRound]);

  if (myId === undefined || !playersLoaded) return <View style={styles.screen} />;
  if (!myId || !amInRound) return <PlayerPicker players={players} onChoose={choose} userId={userId} onClaim={claimPlayer} loadError={playersError} />;

  // Hand the Card tab the player to show. It reads this off the route rather
  // than sharing state, so the card is also reachable by URL on web.
  const openCard = (playerId: string) =>
    router.navigate({ pathname: '/(tabs)/card', params: { player: playerId } });

  const roundLength = holes.length || 18;

  const realRows = players.map((p) => ({
    id: p.id,
    name: p.id === myId ? p.name + ' (you)' : p.name,
    club: `HCP ${p.handicap}`,
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
  // Ranked first, *then* pinned. The position is stamped on from the ranked
  // order and travels with the row, so pinning yourself to the top can't
  // promote you to first — the column stops reading 1,2,3 straight down, which
  // is the honest cost of not having to hunt for your own name.
  const fieldRows = youFirst(
    realRows
      .map((r) => ({ ...r, thruLabel: r.thru === roundLength ? 'F' : String(r.thru) }))
      .sort((a, b) => a.toPar - b.toPar)
      .map((r, i) => ({ ...r, pos: i + 1 })),
    myId,
  );

  // Which team a player is on, so a group row can say it without a second lookup
  // per render. Only meaningful for the segment being played.
  const letterFor = (playerId: string): string | null => {
    if (!teamsOn) return null;
    for (let seg = 0; seg < teamSegments.length; seg++) {
      if (!teamDrawSavedFor(seg)) continue;
      const idx = teamsForSegment(seg).findIndex((ids) => ids.includes(playerId));
      if (idx >= 0) return String.fromCharCode(65 + idx);
    }
    return null;
  };

  // No position column on this one, so pinning costs nothing to read.
  const groupRows = youFirst(
    realRows
      .slice()
      .sort((a, b) => a.toPar - b.toPar),
    myId,
  )
    .map((r) => {
      const letter = letterFor(r.id);
      return {
        ...r,
        note: `HCP ${r.handicap} · net ${fmtToPar(r.net)}${letter ? ` · Team ${letter}` : ''}`,
      };
    });

  const myMini = holes.map((h) => ({ hole: h.hole, par: h.par, strokes: scores[h.hole]?.[myId] }));

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <Wordmark width={160} />
        <View style={[styles.headerTop, { marginTop: 12 }]}>
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
        <Pressable style={[styles.tabBtn, teamsOn && styles.tabDivider]} onPress={() => setTab('field')}>
          <Text style={styles.tabLabel}>FIELD · {fieldRows.length}</Text>
          {tab === 'field' && <View style={styles.tabUnderline} />}
        </Pressable>
        {/* Only when there's a team game on — an empty tab is worse than no tab. */}
        {teamsOn && (
          <Pressable style={styles.tabBtn} onPress={() => setTab('teams')}>
            <Text style={styles.tabLabel}>
              TEAMS · {teams.handicapMode === 'lowman' ? 'LOW MAN' : teams.handicapMode.toUpperCase()}
            </Text>
            {tab === 'teams' && <View style={styles.tabUnderline} />}
          </Pressable>
        )}
      </View>

      <ScrollView>
        {tab === 'field' &&
          fieldRows.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => openCard(r.id)}
              style={[styles.fieldRow, r.isYou && styles.rowYou]}
            >
              <Text style={styles.pos}>{r.pos}</Text>
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

        {tab === 'teams' && (
          <>
            {teamSegments.map((segment, seg) => {
              const drawn = teamDrawSavedFor(seg);
              const standings = drawn ? teamStandingsFor(seg) : [];
              return (
                <View key={segment.label}>
                  {teamSegments.length > 1 && <Text style={styles.segHeader}>{segment.label}</Text>}
                  {!drawn && (
                    <Pressable onPress={() => router.push('/teams')} style={styles.emptyRow}>
                      <Text style={styles.emptyText}>
                        No teams drawn{teamSegments.length > 1 ? ' for these holes' : ''} yet — tap to set them up.
                      </Text>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  )}
                  {standings.map((s, i) => {
                    const mine = !!myId && s.playerIds.includes(myId);
                    return (
                      <View key={s.teamIndex} style={[styles.groupRow, mine && styles.rowYou]}>
                        <Text style={styles.pos}>{s.toPar == null ? '–' : i + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.groupName}>
                            Team {String.fromCharCode(65 + s.teamIndex)}
                            {mine ? ' (yours)' : ''}
                          </Text>
                          <Text style={styles.groupNote}>
                            {s.playerIds.length
                              ? s.playerIds
                                  .map((id) => players.find((p) => p.id === id)?.name ?? 'Unknown')
                                  .join(' · ')
                              : 'Nobody on it'}
                          </Text>
                        </View>
                        <Text
                          style={[styles.groupToPar, { color: (s.toPar ?? 0) < 0 ? colors.accent : colors.text }]}
                        >
                          {s.toPar == null ? '–' : fmtToPar(s.toPar)}
                        </Text>
                        <Text style={styles.groupThru}>
                          {s.holesCounted ? `${s.holesCounted} in` : 'none in'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}
            <Text style={styles.teamsNote}>
              {formatName(teams.format)}, {handicapName(teams.handicapMode)}. A hole counts once every
              player on the team has posted it, so a team waiting on somebody sits behind until that score lands — the
              figure would otherwise drop the moment it did. To-par is measured over the holes that counted.
              {teamSegments.length > 1
                ? ' The two halves are separate contests between different teams, so there is no combined total.'
                : ''}
            </Text>
          </>
        )}

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
  segHeader: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.divider,
  },
  emptyText: { flex: 1, fontFamily: font.body, fontSize: 12, lineHeight: 17, color: colors.muted },
  teamsNote: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, padding: 20 },
});

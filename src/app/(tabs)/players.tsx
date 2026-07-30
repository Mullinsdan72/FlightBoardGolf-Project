import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useRound } from '@/context/RoundContext';
import { thruFor } from '@/lib/roundMath';
import { formatName, handicapName } from '@/lib/teams';
import { colors, font } from '@/theme';

export default function PlayersScreen() {
  const {
    myId,
    players,
    addPlayer,
    removePlayer,
    scores,
    holes,
    organizerId,
    amOrganizer,
    claimOrganizer,
    activeRound,
    teams,
  } = useRound();
  const [name, setName] = useState('');
  const [handicap, setHandicap] = useState('');
  const [busy, setBusy] = useState(false);
  // Who's being replaced, if anyone. A swap is the same form as an add, with the
  // outgoing player taken off once the incoming one is in.
  const [swapping, setSwapping] = useState<string | null>(null);

  const organizerName = organizerId ? (players.find((p) => p.id === organizerId)?.name ?? null) : null;

  const trimmedName = name.trim();
  const parsedHandicap = handicap.trim() === '' ? 0 : Number(handicap.trim());
  const handicapValid = Number.isInteger(parsedHandicap) && parsedHandicap >= 0 && parsedHandicap <= 54;
  const canAdd = trimmedName.length > 0 && handicapValid && !busy;

  const swappingFor = swapping ? players.find((p) => p.id === swapping) : null;

  /**
   * Add a player, or put one in somebody else's place.
   *
   * A substitution is add-then-remove rather than a rename, because they're two
   * different golfers: the person who dropped out keeps whatever they posted, and
   * the one taking their place starts on a clean card. Renaming would hand a
   * stranger someone else's scores.
   */
  const submit = async () => {
    if (!canAdd) return;
    setBusy(true);
    const added = await addPlayer(trimmedName, parsedHandicap);
    if (added && swappingFor) {
      await removePlayer(swappingFor.id);
    }
    setName('');
    setHandicap('');
    setSwapping(null);
    setBusy(false);
  };

  // claimOrganizer reports why it failed; a button that silently does nothing is
  // indistinguishable from a missing database column, which is exactly how this
  // went wrong the first time.
  const setOrganizer = async (playerId: string | null) => {
    const message = await claimOrganizer(playerId);
    if (message) Alert.alert('Could not change who is running the round', message);
  };

  const confirmRemove = (playerId: string, playerName: string) => {
    const played = thruFor(holes, scores, playerId);
    const warning =
      played > 0
        ? `${playerName} has ${played} hole${played === 1 ? '' : 's'} posted. Removing them takes them off this round — their posted scores stay in the database but stop showing on the board.`
        : `Remove ${playerName} from this round?`;
    Alert.alert('Remove player', warning, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePlayer(playerId) },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        {/* This screen is no longer a tab — it is reached from the PLAYERS tile
            on /start — so it needs a way back of its own. A tab screen without a
            tab is a room with the door bricked up. */}
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/round'))}
          hitSlop={10}
          style={styles.backBtn}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>ROUND SETUP</Text>
        </Pressable>
        <Text style={styles.kicker}>{activeRound?.name || 'Round'}</Text>
        <Text style={styles.title}>Players</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statVal}>{players.length}</Text>
          <Text style={styles.statLabel}>Players</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statVal}>1</Text>
          <Text style={styles.statLabel}>Group</Text>
        </View>
        <View style={[styles.statCell, { borderRightWidth: 0 }]}>
          <Text style={[styles.statVal, { color: colors.accent }]}>
            {players.filter((p) => thruFor(holes, scores, p.id) > 0).length}
          </Text>
          <Text style={styles.statLabel}>Started</Text>
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Running this round</Text>
        <View style={styles.organizerBlock}>
          <View style={{ flex: 1 }}>
            <Text style={styles.organizerName}>
              {organizerName ?? 'Nobody yet'}
              {amOrganizer ? ' (you)' : ''}
            </Text>
            <Text style={styles.organizerNote}>
              Whoever's running the round picks the course, sets up the games, and can reopen a signed card. With no
              sign-in anyone can take it over, so this records who's in charge rather than truly restricting anything.
            </Text>
          </View>
          {myId && !amOrganizer && (
            <Pressable onPress={() => setOrganizer(myId)} style={styles.claimBtn}>
              <Text style={styles.claimLabel}>THAT'S ME</Text>
            </Pressable>
          )}
          {amOrganizer && (
            <Pressable onPress={() => setOrganizer(null)} style={styles.claimBtn}>
              <Text style={styles.claimLabel}>HAND OVER</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.sectionLabel}>Playing this round</Text>
        {players.map((p) => {
          const played = thruFor(holes, scores, p.id);
          return (
            <View key={p.id} style={[styles.playerRow, p.id === myId && styles.rowYou]}>
              <View style={[styles.dot, { backgroundColor: played > 0 ? colors.accent : colors.dividerFaint }]} />
              <View style={styles.playerNameCol}>
                <Text style={styles.playerName}>{p.id === myId ? `${p.name} (you)` : p.name}</Text>
                <Text style={styles.playerMeta}>
                  HCP {p.handicap} · {played > 0 ? `${played} played` : 'not started'}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setSwapping((prev) => (prev === p.id ? null : p.id));
                  setName('');
                  setHandicap('');
                }}
                style={[styles.removeBtn, swapping === p.id && styles.swapBtnOn]}
                hitSlop={8}
              >
                <Text style={[styles.removeLabel, swapping === p.id && styles.swapLabelOn]}>
                  {swapping === p.id ? 'SWAPPING' : 'SWAP'}
                </Text>
              </Pressable>
              <Pressable onPress={() => confirmRemove(p.id, p.name)} style={styles.removeBtn} hitSlop={8}>
                <Text style={styles.removeLabel}>REMOVE</Text>
              </Pressable>
            </View>
          );
        })}

        <Text style={styles.sectionLabel}>
          {swappingFor ? `Who is playing instead of ${swappingFor.name}` : 'Add a player'}
        </Text>
        {swappingFor && (
          <Text style={styles.swapNote}>
            {thruFor(holes, scores, swappingFor.id) > 0
              ? `${swappingFor.name} has holes posted. They keep them, but come off the board — the player you add starts on a clean card.`
              : `${swappingFor.name} comes off the round as soon as their replacement is in.`}
          </Text>
        )}
        <View style={styles.addBlock}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="First and last"
            placeholderTextColor={colors.ghost}
            style={styles.input}
            autoCapitalize="words"
            returnKeyType="next"
          />
          <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Handicap</Text>
          <TextInput
            value={handicap}
            onChangeText={setHandicap}
            placeholder="0"
            placeholderTextColor={colors.ghost}
            style={styles.input}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {handicap.trim() !== '' && !handicapValid && (
            <Text style={styles.errorText}>Handicap must be a whole number from 0 to 54.</Text>
          )}
        </View>

        {swappingFor && (
          <Pressable onPress={() => setSwapping(null)} style={styles.cancelSwap}>
            <Text style={styles.cancelSwapLabel}>CANCEL THE SWAP</Text>
          </Pressable>
        )}
        <Pressable onPress={submit} disabled={!canAdd} style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}>
          <Text style={styles.addBtnLabel}>
            {busy
              ? swappingFor
                ? 'SWAPPING…'
                : 'ADDING…'
              : swappingFor
                ? `REPLACE ${swappingFor.name.toUpperCase()}`
                : 'ADD TO THE ROUND'}
          </Text>
          <Text style={styles.addBtnArrow}>→</Text>
        </Pressable>

        <Pressable onPress={() => router.push('/(tabs)/round')} style={styles.teamsBtn}>
          <View style={{ flex: 1 }}>
            <Text style={styles.teamsLabel}>SET UP THE ROUND</Text>
            <Text style={styles.teamsNote}>Step by step: course, players, invites, teams, games</Text>
          </View>
          <Text style={styles.teamsArrow}>›</Text>
        </Pressable>

        {/* Players, then teams, then side games — the design's own step order. */}
        <Pressable onPress={() => router.push('/teams')} style={styles.teamsBtn}>
          <View style={{ flex: 1 }}>
            <Text style={styles.teamsLabel}>TEAMS</Text>
            <Text style={styles.teamsNote}>
              {teams.enabled
                ? `${formatName(teams.format)} ${handicapName(teams.handicapMode)} · ${teams.count} team${teams.count === 1 ? '' : 's'} of ${teams.size}`
                : 'Best ball or team total, drawn by handicap'}
            </Text>
          </View>
          <Text style={styles.teamsArrow}>›</Text>
        </Pressable>

        <Text style={styles.note}>
          Everyone here shows up in score entry's group view, on the leaderboard, and in the scorer mode that posts for
          the whole group. Adding by phone number and texting the round link come with sign-in, in a later phase.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  backArrow: { fontFamily: font.heading, fontSize: 20, color: colors.accent, lineHeight: 22 },
  backLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7, color: colors.accent },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 12 },
  kicker: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.accent },
  title: { fontFamily: font.heading, fontSize: 28, letterSpacing: -0.6, marginTop: 8, color: colors.text },
  statsRow: { flexDirection: 'row', borderTopWidth: 2, borderBottomWidth: 2, borderColor: colors.divider },
  statCell: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRightWidth: 1, borderColor: colors.divider },
  statVal: { fontFamily: font.heading, fontSize: 26, color: colors.text },
  statLabel: { fontFamily: font.bodySemi, fontSize: 9.5, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.muted, marginTop: 5 },
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
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  rowYou: { backgroundColor: 'rgba(236,48,19,0.06)' },
  organizerBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderColor: colors.divider,
  },
  organizerName: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  organizerNote: { fontFamily: font.body, fontSize: 11, lineHeight: 16, color: colors.muted, marginTop: 5 },
  claimBtn: { borderWidth: 2, borderColor: colors.text, paddingVertical: 9, paddingHorizontal: 11 },
  claimLabel: { fontFamily: font.heading, fontSize: 10, letterSpacing: 0.9, color: colors.text },
  dot: { width: 9, height: 9 },
  playerNameCol: { flex: 1 },
  playerName: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  playerMeta: { fontFamily: font.body, fontSize: 11, color: colors.muted, marginTop: 4 },
  removeBtn: { borderWidth: 1, borderColor: colors.divider, paddingVertical: 7, paddingHorizontal: 9 },
  removeLabel: { fontFamily: font.heading, fontSize: 10, letterSpacing: 0.8, color: colors.mutedFaint },
  swapBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  swapLabelOn: { color: '#fff' },
  swapNote: { fontFamily: font.body, fontSize: 11.5, lineHeight: 17, color: colors.text, paddingHorizontal: 20, paddingBottom: 12 },
  cancelSwap: { paddingHorizontal: 20, paddingTop: 14 },
  cancelSwapLabel: { fontFamily: font.heading, fontSize: 10.5, letterSpacing: 0.9, color: colors.accent },
  addBlock: { paddingHorizontal: 20, paddingBottom: 4, borderTopWidth: 1, borderColor: colors.divider, paddingTop: 16 },
  fieldLabel: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted },
  input: {
    fontFamily: font.heading,
    fontSize: 22,
    color: colors.text,
    borderBottomWidth: 2,
    borderColor: colors.text,
    paddingVertical: 8,
    marginTop: 8,
  },
  errorText: { fontFamily: font.body, fontSize: 11.5, color: colors.accent, marginTop: 10 },
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
  addBtnLabel: { fontFamily: font.heading, fontSize: 17, letterSpacing: 0.3, color: '#fff' },
  addBtnArrow: { fontFamily: font.heading, fontSize: 20, color: '#fff' },
  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, padding: 20 },
  teamsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.divider,
  },
  teamsLabel: { fontFamily: font.heading, fontSize: 14, letterSpacing: 0.4, color: colors.text },
  teamsNote: { fontFamily: font.body, fontSize: 11, color: colors.muted, marginTop: 5 },
  teamsArrow: { fontFamily: font.heading, fontSize: 18, color: colors.ghost },
});

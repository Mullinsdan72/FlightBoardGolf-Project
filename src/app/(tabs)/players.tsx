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

  const organizerName = organizerId ? (players.find((p) => p.id === organizerId)?.name ?? null) : null;

  const trimmedName = name.trim();
  const parsedHandicap = handicap.trim() === '' ? 0 : Number(handicap.trim());
  const handicapValid = Number.isInteger(parsedHandicap) && parsedHandicap >= 0 && parsedHandicap <= 54;
  const canAdd = trimmedName.length > 0 && handicapValid && !busy;

  const submit = async () => {
    if (!canAdd) return;
    setBusy(true);
    await addPlayer(trimmedName, parsedHandicap);
    setName('');
    setHandicap('');
    setBusy(false);
  };

  // claimOrganizer reports why it failed; a button that silently does nothing is
  // indistinguishable from a missing database column, which is exactly how this
  // went wrong the first time.
  const setOrganizer = async (playerId: string | null) => {
    const message = await claimOrganizer(playerId);
    if (message) Alert.alert('Could not change the organizer', message);
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
        {/* The round name is the way to Rounds, since the tab bar is full. */}
        <Pressable onPress={() => router.push('/rounds')} hitSlop={8}>
          <Text style={styles.kicker}>{activeRound?.name || 'Round'} · SWITCH ›</Text>
        </Pressable>
        <Text style={styles.title}>The field</Text>
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
        <Text style={styles.sectionLabel}>Organizer</Text>
        <View style={styles.organizerBlock}>
          <View style={{ flex: 1 }}>
            <Text style={styles.organizerName}>
              {organizerName ?? 'Nobody yet'}
              {amOrganizer ? ' (you)' : ''}
            </Text>
            <Text style={styles.organizerNote}>
              The organizer is the only one who can reopen a signed card. Without sign-in anyone can take the role, so
              it records who's running the round rather than truly restricting it.
            </Text>
          </View>
          {myId && !amOrganizer && (
            <Pressable onPress={() => setOrganizer(myId)} style={styles.claimBtn}>
              <Text style={styles.claimLabel}>TAKE IT</Text>
            </Pressable>
          )}
          {amOrganizer && (
            <Pressable onPress={() => setOrganizer(null)} style={styles.claimBtn}>
              <Text style={styles.claimLabel}>GIVE UP</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.sectionLabel}>Group 12</Text>
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
              <Pressable onPress={() => confirmRemove(p.id, p.name)} style={styles.removeBtn} hitSlop={8}>
                <Text style={styles.removeLabel}>REMOVE</Text>
              </Pressable>
            </View>
          );
        })}

        <Text style={styles.sectionLabel}>Add a player</Text>
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

        <Pressable onPress={submit} disabled={!canAdd} style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}>
          <Text style={styles.addBtnLabel}>{busy ? 'ADDING…' : 'ADD TO THE ROUND'}</Text>
          <Text style={styles.addBtnArrow}>→</Text>
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

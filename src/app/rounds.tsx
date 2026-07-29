import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRound } from '@/context/RoundContext';
import { SetupBar, useInSetup } from '@/components/SetupBar';
import { Wordmark } from '@/components/Wordmark';
import { colors, font } from '@/theme';

const todayIso = () => new Date().toISOString().slice(0, 10);

const prettyDate = (iso: string | null) => {
  if (!iso) return 'no date';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

export default function RoundsScreen() {
  const {
    myId,
    players,
    rounds,
    roundsLoaded,
    activeRoundId,
    switchRound,
    createRound,
    deleteRound,
  } = useRound();
  const inSetup = useInSetup();

  const [name, setName] = useState('');
  const [playedOn, setPlayedOn] = useState(todayIso());
  const [busy, setBusy] = useState(false);

  const me = myId ? players.find((p) => p.id === myId) : undefined;
  const trimmed = name.trim();
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(playedOn.trim());
  const canCreate = trimmed.length > 0 && dateValid && !busy;

  // This screen is reached two ways and only one of them has a back stack: by
  // tapping the round name on FIELD (pushed, so back works), or by the tabs
  // layout redirecting here because no round exists yet (replaced, so there is
  // nothing to go back to). Without both branches the redirect left you stranded
  // on this screen with no tab bar and no way off it.
  const enterRound = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const openRound = async (roundId: string) => {
    if (roundId !== activeRoundId) await switchRound(roundId);
    enterRound();
  };

  const submit = async () => {
    if (!canCreate) return;
    setBusy(true);
    // Creating a round makes you its organizer and puts you in the field — that
    // is what creating a round means. `me` may be undefined the very first time,
    // before this device has picked a player; the round is still created and you
    // add yourself on the FIELD tab.
    const { error } = await createRound({
      name: trimmed,
      playedOn: playedOn.trim(),
      creatorPlayerId: me?.id ?? null,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Could not create the round', error);
      return;
    }
    setName('');
    setPlayedOn(todayIso());
    // A brand new round has no course and nobody in it, so the useful next
    // screen is the run-through, not the score card.
    router.replace('/setup');
  };

  const confirmDelete = (roundId: string, roundName: string) => {
    Alert.alert(
      `Delete ${roundName || 'this round'}?`,
      'Every score, sign-off and side-game record for this round goes with it. There is no undo.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const message = await deleteRound(roundId);
            if (message) Alert.alert('Could not delete that round', message);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <SetupBar step="round" />
      <View style={[styles.header, inSetup && styles.headerInSetup]}>
        {!inSetup && <Wordmark />}
        <Text style={[styles.kicker, !inSetup && { marginTop: 16 }]}>Your rounds</Text>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Rounds</Text>
          {/* Only offer the way out once there's a round to go to. With none, the
              tabs would just redirect straight back here. */}
          {activeRoundId != null && (
            <Pressable onPress={enterRound} style={styles.doneBtn} hitSlop={8}>
              <Text style={styles.doneLabel}>DONE</Text>
              <Text style={styles.doneArrow}>→</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>New round</Text>
        <View style={styles.addBlock}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Saturday at Gladstan"
            placeholderTextColor={colors.ghost}
            style={styles.input}
            autoCapitalize="words"
          />
          <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Date played</Text>
          <TextInput
            value={playedOn}
            onChangeText={setPlayedOn}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.ghost}
            style={styles.input}
            autoCapitalize="none"
            onSubmitEditing={submit}
          />
          {playedOn.trim() !== '' && !dateValid && (
            <Text style={styles.errorText}>Use the form 2026-08-08.</Text>
          )}
        </View>

        <Pressable onPress={submit} disabled={!canCreate} style={[styles.addBtn, !canCreate && styles.addBtnDisabled]}>
          <Text style={styles.addBtnLabel}>{busy ? 'CREATING…' : 'CREATE AND OPEN'}</Text>
          <Text style={styles.addBtnArrow}>→</Text>
        </Pressable>
        <Text style={styles.note}>
          {me
            ? `You'll be the organizer of this round and in the field, so nobody has to claim the role. Then pick a course and add the rest of the group.`
            : `The round will be created without you in it, because this device hasn't picked a player yet. Add yourself on the FIELD tab afterwards.`}
        </Text>

        <Text style={styles.sectionLabel}>{rounds.length ? 'All rounds' : 'No rounds yet'}</Text>
        {!roundsLoaded && <Text style={styles.note}>Loading…</Text>}
        {rounds.map((r) => {
          const active = r.id === activeRoundId;
          const organizer = r.organizerId ? players.find((p) => p.id === r.organizerId) : null;
          return (
            <View key={r.id} style={[styles.roundRow, active && styles.roundRowActive]}>
              <Pressable style={styles.roundMain} onPress={() => openRound(r.id)}>
                <Text style={styles.roundName}>
                  {r.name || 'Untitled round'}
                  {active ? ' · OPEN' : ''}
                </Text>
                <Text style={styles.roundMeta}>
                  {[
                    prettyDate(r.playedOn),
                    r.courseName || 'no course yet',
                    organizer ? `run by ${organizer.name}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Pressable>
              <Pressable onPress={() => confirmDelete(r.id, r.name)} style={styles.deleteBtn} hitSlop={6}>
                <Text style={styles.deleteLabel}>×</Text>
              </Pressable>
            </View>
          );
        })}
        <Text style={styles.note}>
          Tap a round to open it — you'll go straight back to the round, and every tab then shows that round's scores,
          card and side games. Old rounds stay put, so last week's card survives.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerInSetup: { paddingTop: 18 },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  doneBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 4 },
  doneLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.6, color: colors.accent },
  doneArrow: { fontFamily: font.heading, fontSize: 14, color: colors.accent },
  kicker: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.accent },
  title: { fontFamily: font.heading, fontSize: 28, letterSpacing: -0.6, marginTop: 8, color: colors.text },
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
  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, paddingHorizontal: 20, paddingTop: 12 },
  addBlock: { paddingHorizontal: 20, paddingTop: 4, borderTopWidth: 2, borderColor: colors.divider },
  fieldLabel: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted, marginTop: 14 },
  input: {
    fontFamily: font.heading,
    fontSize: 20,
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
  addBtnLabel: { fontFamily: font.heading, fontSize: 16, letterSpacing: 0.3, color: '#fff' },
  addBtnArrow: { fontFamily: font.heading, fontSize: 20, color: '#fff' },
  roundRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: colors.divider },
  roundRowActive: { backgroundColor: 'rgba(236,48,19,0.06)' },
  roundMain: { flex: 1, paddingVertical: 14, paddingLeft: 20, paddingRight: 8 },
  roundName: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  roundMeta: { fontFamily: font.body, fontSize: 11.5, color: colors.muted, marginTop: 4 },
  deleteBtn: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderColor: colors.divider },
  deleteLabel: { fontFamily: font.heading, fontSize: 20, color: colors.mutedFaint },
});

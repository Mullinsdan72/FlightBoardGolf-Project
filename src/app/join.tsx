import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRound } from '@/context/RoundContext';
import { cleanName } from '@/lib/invite';
import { colors, font } from '@/theme';

// Where an invite link lands: flightboard://join?round=<id>
//
// Two jobs, in order — switch this device to the round it was invited to, then
// let whoever is holding the phone say which player they are. Joining is not
// automatic: with no sign-in the link is the only credential, and silently
// adding a player because a link was opened would put strangers in the field.
export default function JoinScreen() {
  const params = useLocalSearchParams<{ round?: string }>();
  const roundId = typeof params.round === 'string' ? params.round : null;

  const { rounds, roundsLoaded, activeRoundId, switchRound, players, playersLoaded, addPlayer, choose, myId } =
    useRound();

  const [name, setName] = useState('');
  const [handicap, setHandicap] = useState('');
  const [busy, setBusy] = useState(false);
  const [switched, setSwitched] = useState(false);

  const target = roundId ? rounds.find((r) => r.id === roundId) : null;

  // Move this device onto the invited round before showing its field.
  useEffect(() => {
    if (!roundId || switched || !roundsLoaded) return;
    if (!rounds.some((r) => r.id === roundId)) return;
    if (activeRoundId !== roundId) switchRound(roundId);
    setSwitched(true);
  }, [roundId, switched, roundsLoaded, rounds, activeRoundId, switchRound]);

  const goToRound = () => router.replace('/(tabs)');

  const parsedHandicap = handicap.trim() === '' ? 0 : Number(handicap.trim());
  const handicapValid = Number.isInteger(parsedHandicap) && parsedHandicap >= 0 && parsedHandicap <= 54;
  const canJoin = cleanName(name).length > 0 && handicapValid && !busy;

  const joinAsNew = async () => {
    if (!canJoin) return;
    setBusy(true);
    // Become the player just created, rather than landing back on a picker.
    const newId = await addPlayer(cleanName(name), parsedHandicap);
    setBusy(false);
    if (!newId) {
      Alert.alert('Could not join', 'Adding you to the round failed. Check your signal and try again.');
      return;
    }
    await choose(newId);
    goToRound();
  };

  if (!roundId) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Invite</Text>
          <Text style={styles.title}>That link is missing a round</Text>
        </View>
        <Text style={styles.note}>
          Ask whoever invited you to send it again. A Flight Board invite looks like
          flightboard://join?round=… and carries the round it belongs to.
        </Text>
        <Pressable onPress={goToRound} style={styles.primaryBtn}>
          <Text style={styles.primaryLabel}>GO TO THE APP</Text>
          <Text style={styles.primaryArrow}>→</Text>
        </Pressable>
      </View>
    );
  }

  if (!roundsLoaded) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Invite</Text>
          <Text style={styles.title}>Finding the round…</Text>
        </View>
      </View>
    );
  }

  if (!target) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Invite</Text>
          <Text style={styles.title}>That round isn't here</Text>
        </View>
        <Text style={styles.note}>
          It may have been deleted, or this phone may be pointed at a different Flight Board database than the person
          who invited you. Ask them to check the round still exists.
        </Text>
        <Pressable onPress={goToRound} style={styles.primaryBtn}>
          <Text style={styles.primaryLabel}>GO TO THE APP</Text>
          <Text style={styles.primaryArrow}>→</Text>
        </Pressable>
      </View>
    );
  }

  const alreadyIn = !!myId && players.some((p) => p.id === myId);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.kicker}>You're invited to</Text>
        <Text style={styles.title}>{target.name || 'a round'}</Text>
        <Text style={styles.sub}>
          {[target.playedOn, target.courseName].filter(Boolean).join(' · ') || 'Course to be confirmed'}
        </Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled">
        {alreadyIn && (
          <>
            <Text style={styles.note}>
              You're already in this round on this phone. Nothing to do — go and score.
            </Text>
            <Pressable onPress={goToRound} style={styles.primaryBtn}>
              <Text style={styles.primaryLabel}>OPEN THE ROUND</Text>
              <Text style={styles.primaryArrow}>→</Text>
            </Pressable>
          </>
        )}

        {!alreadyIn && (
          <>
            <Text style={styles.sectionLabel}>Already in the field?</Text>
            {!playersLoaded && <Text style={styles.note}>Loading the field…</Text>}
            {playersLoaded && players.length === 0 && (
              <Text style={styles.note}>Nobody has been added yet. Add yourself below.</Text>
            )}
            {players.map((p) => (
              <Pressable
                key={p.id}
                onPress={async () => {
                  await choose(p.id);
                  goToRound();
                }}
                style={styles.playerRow}
              >
                <Text style={styles.playerName}>{p.name}</Text>
                <Text style={styles.playerMeta}>HCP {p.handicap} · TAP IF THIS IS YOU</Text>
              </Pressable>
            ))}

            <Text style={styles.sectionLabel}>Not on the list</Text>
            <View style={styles.addBlock}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.ghost}
                style={styles.input}
                autoCapitalize="words"
              />
              <TextInput
                value={handicap}
                onChangeText={setHandicap}
                placeholder="Handicap"
                placeholderTextColor={colors.ghost}
                style={styles.input}
                keyboardType="number-pad"
                onSubmitEditing={joinAsNew}
              />
              {handicap.trim() !== '' && !handicapValid && (
                <Text style={styles.errorText}>Handicap must be a whole number from 0 to 54.</Text>
              )}
            </View>
            <Pressable
              onPress={() => {
                if (!canJoin) {
                  Alert.alert('Name needed', 'Put your name in so the rest of the group knows whose scores are whose.');
                  return;
                }
                joinAsNew();
              }}
              style={[styles.primaryBtn, !canJoin && styles.primaryBtnDisabled]}
            >
              <Text style={styles.primaryLabel}>{busy ? 'JOINING…' : 'JOIN THE ROUND'}</Text>
              <Text style={styles.primaryArrow}>→</Text>
            </Pressable>
          </>
        )}

        <Text style={styles.note}>
          Anyone with this link can join, because there's no sign-in yet — it's an invitation, not a password. Don't
          post it anywhere public.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 16 },
  kicker: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.accent },
  title: { fontFamily: font.heading, fontSize: 28, letterSpacing: -0.6, marginTop: 8, color: colors.text },
  sub: { fontFamily: font.body, fontSize: 12, color: colors.muted, marginTop: 8 },
  sectionLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, padding: 20 },
  playerRow: { paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderColor: colors.divider },
  playerName: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  playerMeta: { fontFamily: font.body, fontSize: 11, color: colors.muted, marginTop: 4 },
  addBlock: { paddingHorizontal: 20, borderTopWidth: 1, borderColor: colors.divider, paddingTop: 8 },
  input: {
    fontFamily: font.heading,
    fontSize: 20,
    color: colors.text,
    borderBottomWidth: 2,
    borderColor: colors.text,
    paddingVertical: 8,
    marginTop: 14,
  },
  errorText: { fontFamily: font.body, fontSize: 11.5, color: colors.accent, marginTop: 10 },
  primaryBtn: {
    marginTop: 20,
    height: 72,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  primaryBtnDisabled: { opacity: 0.35 },
  primaryLabel: { fontFamily: font.heading, fontSize: 16, letterSpacing: 0.3, color: '#fff' },
  primaryArrow: { fontFamily: font.heading, fontSize: 20, color: '#fff' },
});

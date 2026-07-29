import { useState } from 'react';
import { router } from 'expo-router';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRound } from '@/context/RoundContext';
import { thruFor } from '@/lib/roundMath';
import {
  APP_STORE_URL,
  cleanName,
  inviteLink,
  inviteMessage,
  normalizePhone,
  readyToPlay,
  setupSteps,
  nextStep as firstUndone,
  STEP_ROUTE,
  STEP_TITLE,
  stepAfter,
  type SetupStep,
} from '@/lib/invite';
import { Wordmark } from '@/components/Wordmark';
import { colors, font } from '@/theme';

type Invitee = { name: string; phone: string | null };

// The organizer's run-through, in the order a round is actually built. It links
// to the screens that already do each job rather than reimplementing them —
// what a first-time organizer is missing isn't the screens, it's knowing which
// one comes next and when they're done.
export default function SetupScreen() {
  const {
    myId,
    players,
    addPlayer,
    removePlayer,
    scores,
    activeRound,
    activeRoundId,
    course,
    holes,
    teams,
    teamRoster,
    wolf,
    challenge,
    holeGames,
    amOrganizer,
  } = useRound();

  const [name, setName] = useState('');
  const [handicap, setHandicap] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickedFromContacts, setPickedFromContacts] = useState<Invitee[]>([]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  const gamesOn = (wolf.enabled ? 1 : 0) + (challenge.enabled ? 1 : 0) + holeGames.length;

  const steps = setupSteps({
    hasRound: !!activeRoundId,
    roundName: activeRound?.name ?? '',
    courseName: course?.courseName ?? null,
    holeCount: holes.length,
    teeName: course?.teeName ?? null,
    playerCount: players.length,
    teamsOn: teams.enabled,
    teamCount: teamRoster.filter((t) => t.length > 0).length,
    gamesOn,
  });

  const ready = readyToPlay(steps);
  const next = firstUndone(steps);

  // `setup: '1'` rides along so the screen it lands on knows it's part of the
  // run-through and shows the back/next bar. Without it the Course tab is just
  // the Course tab, which is how the run-through used to strand people.
  const goTo = (key: SetupStep['key']) => {
    if (key === 'players') return; // handled inline below
    router.push({ pathname: STEP_ROUTE[key] as any, params: { setup: '1' } });
  };

  const parsedHandicap = handicap.trim() === '' ? 0 : Number(handicap.trim());
  const handicapValid = Number.isInteger(parsedHandicap) && parsedHandicap >= 0 && parsedHandicap <= 54;
  const canAdd = cleanName(name).length > 0 && handicapValid && !busy;

  const addNow = async (playerName: string) => {
    setBusy(true);
    await addPlayer(playerName, parsedHandicap);
    setName('');
    setHandicap('');
    setBusy(false);
  };

  const submitPlayer = async () => {
    if (!canAdd) return;
    const tidy = cleanName(name);
    // Adding the same person twice is the easy mistake here, and it's not
    // obvious afterwards — two identical rows on a leaderboard read as a
    // rendering glitch rather than a duplicate. Two real golfers can share a
    // name though, so this asks rather than refuses.
    const clash = players.find((p) => p.name.toLowerCase() === tidy.toLowerCase());
    if (clash) {
      Alert.alert(
        `${clash.name} is already in`,
        'Add a second player with the same name, or cancel and use their surname or a nickname to tell them apart.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add anyway', onPress: () => addNow(tidy) },
        ],
      );
      return;
    }
    await addNow(tidy);
  };

  /**
   * Pull names and numbers off the phone.
   *
   * Nothing is uploaded and nothing is added to the round automatically — the
   * picked contacts land in a staging list that the organizer confirms. Reading
   * somebody's address book and silently posting it to a database is not a thing
   * this app should do.
   */
  const pickFromContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Contacts not allowed',
        'Flight Board can only read your contacts if you allow it in Settings. You can always type players in by hand instead.',
      );
      return;
    }
    const picked = await Contacts.presentContactPickerAsync();
    if (!picked) return;
    const phone = picked.phoneNumbers?.[0]?.number ?? null;
    const contactName = cleanName(picked.name ?? '');
    if (!contactName) {
      Alert.alert('That contact has no name', 'Pick another, or type them in by hand.');
      return;
    }
    setPickedFromContacts((prev) =>
      prev.some((p) => p.name === contactName) ? prev : [...prev, { name: contactName, phone }],
    );
  };

  /**
   * Take a player back off the round.
   *
   * Warns when they already have scores, because removing them takes them off
   * the board — their posted holes stay in the database but stop counting, and
   * anything derived from them (teams, a wolf hole, the settle-up) moves.
   * Adding the wrong name twice during setup is the common case though, and that
   * one should be a two-tap fix.
   */
  const confirmRemove = (playerId: string, playerName: string) => {
    const played = thruFor(holes, scores, playerId);
    Alert.alert(
      `Remove ${playerName}?`,
      played > 0
        ? `${playerName} has ${played} hole${played === 1 ? '' : 's'} posted. Removing them takes them off this round — their scores stay in the database but stop showing on the board.`
        : 'They come straight off the round. Nothing else is affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removePlayer(playerId) },
      ],
    );
  };

  const addPicked = async (invitee: Invitee) => {
    setBusy(true);
    await addPlayer(invitee.name, 0);
    setPickedFromContacts((prev) => prev.filter((p) => p.name !== invitee.name));
    setBusy(false);
  };

  /**
   * Text everyone the link.
   *
   * The link only opens the app once Flight Board is a real build on the phone —
   * a custom scheme means nothing to Expo Go, and there's no App Store listing
   * to fall back to. Said out loud rather than hidden, because a link that
   * quietly does nothing is worse than one you were warned about.
   */
  const sendInvites = async (numbers: string[]) => {
    if (!activeRoundId) return;
    const available = await SMS.isAvailableAsync();
    if (!available) {
      Alert.alert('No messaging on this device', 'Copy the link from below and send it however you like.');
      return;
    }
    const body = inviteMessage({
      roundName: activeRound?.name ?? 'a round',
      courseName: course?.courseName ?? null,
      playedOn: activeRound?.playedOn ?? null,
      organizerName: players.find((p) => p.id === myId)?.name ?? null,
      roundId: activeRoundId,
    });
    try {
      await SMS.sendSMSAsync(numbers, body);
    } catch (err) {
      Alert.alert('Could not open Messages', String(err));
    }
  };

  const [manualPhone, setManualPhone] = useState('');

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Wordmark />
        <Text style={[styles.kicker, { marginTop: 14 }]}>{activeRound?.name || 'New round'}</Text>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Set up the round</Text>
          <Pressable onPress={goBack} style={styles.doneBtn} hitSlop={8}>
            <Text style={styles.doneLabel}>CLOSE</Text>
            <Text style={styles.doneArrow}>→</Text>
          </Pressable>
        </View>
      </View>

      {!amOrganizer && (
        <View style={styles.readOnlyBar}>
          <Text style={styles.readOnlyText}>
            You're not the organizer of this round, so this is a view of how far along it is rather than something to
            fill in.
          </Text>
        </View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>
            {steps.filter((s) => s.done).length} of {steps.length} done
          </Text>
          <Text style={styles.progressNext}>
            {ready ? 'Ready to play' : next ? `Next: ${next.title.toLowerCase()}` : ''}
          </Text>
        </View>

        {steps.map((step, i) => {
          const isPlayers = step.key === 'players';
          const isNext = next?.key === step.key;
          return (
            <View key={step.key} style={[styles.step, isNext && styles.stepNext]}>
              <Pressable
                onPress={() => !isPlayers && goTo(step.key)}
                disabled={isPlayers}
                style={styles.stepHead}
              >
                <View style={[styles.stepNum, step.done && styles.stepNumDone]}>
                  <Text style={[styles.stepNumText, step.done && styles.stepNumTextDone]}>
                    {step.done ? '✓' : i + 1}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>
                    {step.title}
                    {step.optional ? ' · optional' : ''}
                  </Text>
                  <Text style={styles.stepDetail}>{step.detail}</Text>
                  <Text style={styles.stepBlurb}>{step.blurb}</Text>
                </View>
                {!isPlayers && <Text style={styles.stepArrow}>›</Text>}
              </Pressable>

              {isPlayers && amOrganizer && (
                <View style={styles.playersBlock}>
                  {players.map((p) => (
                    <View key={p.id} style={styles.playerRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.playerName}>
                          {p.name}
                          {p.id === myId ? ' (you)' : ''}
                        </Text>
                        <Text style={styles.playerMeta}>HCP {p.handicap}</Text>
                      </View>
                      <Pressable onPress={() => confirmRemove(p.id, p.name)} style={styles.tinyBtn} hitSlop={8}>
                        <Text style={styles.tinyLabel}>REMOVE</Text>
                      </Pressable>
                    </View>
                  ))}
                  {!players.length && (
                    <Text style={styles.hint}>Nobody added yet.</Text>
                  )}

                  <Text style={styles.fieldLabel}>Add by name</Text>
                  <View style={styles.inlineRow}>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder="First and last"
                      placeholderTextColor={colors.ghost}
                      style={[styles.input, { flex: 1 }]}
                      autoCapitalize="words"
                    />
                    <TextInput
                      value={handicap}
                      onChangeText={setHandicap}
                      placeholder="HCP"
                      placeholderTextColor={colors.ghost}
                      style={[styles.input, { width: 74 }]}
                      keyboardType="number-pad"
                      onSubmitEditing={submitPlayer}
                    />
                  </View>
                  {handicap.trim() !== '' && !handicapValid && (
                    <Text style={styles.errorText}>Handicap must be a whole number from 0 to 54.</Text>
                  )}
                  <Pressable
                    onPress={submitPlayer}
                    disabled={!canAdd}
                    style={[styles.smallBtn, !canAdd && styles.smallBtnDisabled]}
                  >
                    <Text style={styles.smallBtnLabel}>{busy ? 'ADDING…' : 'ADD PLAYER'}</Text>
                  </Pressable>

                  <Text style={styles.fieldLabel}>From your contacts</Text>
                  <Pressable onPress={pickFromContacts} style={styles.smallBtn}>
                    <Text style={styles.smallBtnLabel}>PICK A CONTACT</Text>
                  </Pressable>
                  {pickedFromContacts.map((c) => (
                    <View key={c.name} style={styles.pickedRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.playerName}>{c.name}</Text>
                        <Text style={styles.playerMeta}>{c.phone ?? 'no number'}</Text>
                      </View>
                      {c.phone && (
                        <Pressable onPress={() => sendInvites([c.phone as string])} style={styles.tinyBtn}>
                          <Text style={styles.tinyLabel}>TEXT</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => addPicked(c)} style={styles.tinyBtn}>
                        <Text style={styles.tinyLabel}>ADD</Text>
                      </Pressable>
                    </View>
                  ))}
                  <Text style={styles.hint}>
                    Nothing is read from your contacts until you tap, nothing is uploaded, and nobody joins the round
                    until you add them.
                  </Text>

                  <Text style={styles.fieldLabel}>Text an invite</Text>
                  <View style={styles.inlineRow}>
                    <TextInput
                      value={manualPhone}
                      onChangeText={setManualPhone}
                      placeholder="Phone number"
                      placeholderTextColor={colors.ghost}
                      style={[styles.input, { flex: 1 }]}
                      keyboardType="phone-pad"
                    />
                    <Pressable
                      onPress={() => {
                        const n = normalizePhone(manualPhone);
                        if (!n) {
                          Alert.alert("That doesn't look like a phone number", 'Check it and try again.');
                          return;
                        }
                        sendInvites([n]);
                        setManualPhone('');
                      }}
                      style={styles.smallBtn}
                    >
                      <Text style={styles.smallBtnLabel}>SEND</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.hint}>
                    The message invites them to a live leaderboard for {activeRound?.name || 'this round'} and carries
                    this link:
                  </Text>
                  <Text style={styles.linkText} selectable>
                    {activeRoundId ? inviteLink(activeRoundId) : '—'}
                  </Text>
                  {/* Two honest limits, stated where they matter rather than
                      discovered by a friend staring at a dead link. */}
                  <Pressable
                    onPress={() => goTo(stepAfter('players') as SetupStep['key'])}
                    style={styles.nextStepBtn}
                  >
                    <Text style={styles.nextStepLabel}>
                      NEXT · {STEP_TITLE[stepAfter('players') as SetupStep['key']].toUpperCase()}
                    </Text>
                    <Text style={styles.nextStepArrow}>›</Text>
                  </Pressable>

                  <Text style={styles.warnText}>
                    That link won't open anything yet. It needs Flight Board installed as a real app — inside Expo Go
                    there's nothing for it to open
                    {APP_STORE_URL ? '.' : ", and there's no App Store listing to send them to."} Until then, invite by
                    text so they know when and where, and add them here yourself.
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        <Pressable
          onPress={() => router.replace('/(tabs)')}
          disabled={!ready}
          style={[styles.beginBtn, !ready && styles.beginBtnDisabled]}
        >
          <Text style={styles.beginLabel}>{ready ? 'BEGIN THE ROUND' : `STILL TO DO: ${next?.title.toUpperCase()}`}</Text>
          <Text style={styles.beginArrow}>→</Text>
        </Pressable>
        <Text style={styles.outerHint}>
          Teams and side games can wait — you can turn them on at the first tee, or not at all. A course and at least two
          players are what a round actually needs.
        </Text>
        {busy && <ActivityIndicator style={{ marginVertical: 16 }} color={colors.accent} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  kicker: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.accent },
  title: { fontFamily: font.heading, fontSize: 28, letterSpacing: -0.6, marginTop: 8, color: colors.text },
  doneBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 4 },
  doneLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.6, color: colors.accent },
  doneArrow: { fontFamily: font.heading, fontSize: 14, color: colors.accent },
  readOnlyBar: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 2, borderBottomWidth: 2, borderColor: colors.divider },
  readOnlyText: { fontFamily: font.body, fontSize: 11.5, lineHeight: 17, color: colors.muted },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.divider,
  },
  progressText: { fontFamily: font.heading, fontSize: 13, color: colors.text },
  progressNext: { fontFamily: font.bodySemi, fontSize: 11, color: colors.accent },
  step: { borderBottomWidth: 1, borderColor: colors.divider },
  stepNext: { backgroundColor: 'rgba(236,48,19,0.05)' },
  stepHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  stepNum: { width: 26, height: 26, borderWidth: 2, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  stepNumDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepNumText: { fontFamily: font.heading, fontSize: 12, color: colors.text },
  stepNumTextDone: { color: '#fff' },
  stepTitle: { fontFamily: font.heading, fontSize: 15.5, color: colors.text },
  stepDetail: { fontFamily: font.bodySemi, fontSize: 11.5, color: colors.text, marginTop: 5 },
  stepBlurb: { fontFamily: font.body, fontSize: 11, lineHeight: 16, color: colors.muted, marginTop: 5 },
  stepArrow: { fontFamily: font.heading, fontSize: 18, color: colors.ghost },
  playersBlock: { paddingHorizontal: 20, paddingBottom: 18, gap: 4 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  playerName: { fontFamily: font.bodySemi, fontSize: 13, color: colors.text },
  playerMeta: { fontFamily: font.body, fontSize: 11, color: colors.muted },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  fieldLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 18,
  },
  inlineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: {
    fontFamily: font.heading,
    fontSize: 17,
    color: colors.text,
    borderBottomWidth: 2,
    borderColor: colors.text,
    paddingVertical: 7,
    marginTop: 6,
  },
  errorText: { fontFamily: font.body, fontSize: 11.5, color: colors.accent, marginTop: 8 },
  smallBtn: { borderWidth: 2, borderColor: colors.text, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', marginTop: 10 },
  smallBtnDisabled: { opacity: 0.35 },
  smallBtnLabel: { fontFamily: font.heading, fontSize: 11, letterSpacing: 0.8, color: colors.text },
  tinyBtn: { borderWidth: 1, borderColor: colors.divider, paddingVertical: 7, paddingHorizontal: 10 },
  tinyLabel: { fontFamily: font.heading, fontSize: 10, letterSpacing: 0.7, color: colors.text },
  hint: { fontFamily: font.body, fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 12 },
  outerHint: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, padding: 20 },
  linkText: { fontFamily: font.body, fontSize: 11, color: colors.accent, marginTop: 8 },
  nextStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: colors.text,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 18,
  },
  nextStepLabel: { fontFamily: font.heading, fontSize: 11.5, letterSpacing: 0.7, color: colors.text },
  nextStepArrow: { fontFamily: font.heading, fontSize: 16, color: colors.text },
  warnText: { fontFamily: font.body, fontSize: 11, lineHeight: 17, color: colors.text, marginTop: 10 },
  beginBtn: {
    marginTop: 24,
    height: 76,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  beginBtnDisabled: { opacity: 0.35 },
  beginLabel: { fontFamily: font.heading, fontSize: 15, letterSpacing: 0.3, color: '#fff' },
  beginArrow: { fontFamily: font.heading, fontSize: 20, color: '#fff' },
});

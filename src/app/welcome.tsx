import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Wordmark } from '@/components/Wordmark';
import { useRound } from '@/context/RoundContext';
import { cleanName, defaultRoundName, isoDaysFromNow, prettyDay } from '@/lib/invite';
import { colors, font } from '@/theme';

/**
 * The first screen on a fresh install: name, day, done.
 *
 * What this replaces was a dead end. A new phone has no player, so creating a
 * round set no organizer; with no organizer the FIELD tab hides, the setup
 * screen goes read-only, and the person who just created the round can't add
 * themselves to it or pick a course. The way out was a tab that wasn't there.
 *
 * So the first thing asked is your name, and creating the round mints you,
 * seats you in the field and makes you the organizer in one go. Everything else
 * — course, players, games — can wait for the run-through.
 */
export default function WelcomeScreen() {
  const { createRound, choose, rounds, userId, authStage } = useRound();

  const [name, setName] = useState('');
  const [dayOffset, setDayOffset] = useState(0);
  const [busy, setBusy] = useState(false);

  const tidy = cleanName(name);
  // Waiting for auth to answer counts as signed out for layout, but not for
  // long: `authStage` always leaves 'loading'. Showing the gate for a frame is
  // better than showing a name box that is about to be replaced.
  const signedOut = !userId;
  const canStart = tidy.length > 0 && !busy;

  const start = async () => {
    if (!canStart) return;
    setBusy(true);
    const playedOn = isoDaysFromNow(dayOffset);
    const { playerId, error } = await createRound({
      name: defaultRoundName(playedOn),
      playedOn,
      creatorName: tidy,
      // Handicaps are set on the FIELD tab, where there's a list of players to
      // set them against. Asking for one on the first screen is a second
      // question before anything has been seen, and it's the one a casual
      // player doesn't know off the top of their head.
      creatorHandicap: 0,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Could not start the round', error);
      return;
    }
    // Become the player just created, so nothing asks who you are again.
    if (playerId) await choose(playerId);
    router.replace('/(tabs)/round');
  };

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <Wordmark width={220} />

        <Text style={styles.lede}>
          A live scoring leaderboard without the math. Everyone's round as it happens, the games being played inside it,
          and you keep your own score.
        </Text>

        {/* One question at a time, and only ever the one you can answer.

            This screen used to ask for your name *and* show the sign-in gate at
            once, with START A ROUND greyed out underneath. So a new phone typed
            its name, found the only live button was TEXT ME A CODE, went and
            signed in — and came back to an empty name box, because this screen
            unmounts on the trip and its state goes with it. Being asked the same
            question twice in three taps is the app looking like it wasn't
            listening, and it was reported exactly that way.

            Signing in genuinely has to be first: every write is gated on an
            account, so creating your player needs one and creating a round needs
            you to already own the player you name as organizer. Given that, a
            name box before sign-in is a question with nowhere to put the answer.
            So it is not shown until it can be used. */}
        {signedOut ? (
          <View style={styles.gate}>
            <Text style={styles.gateTitle}>Start with your number</Text>
            <Text style={styles.gateBody}>
              Your rounds and your scores belong to your phone number — it is how the group knows it is you, and how an
              invite finds you. One text, no password.
            </Text>
            <Pressable onPress={() => router.push('/signin')} style={styles.gateBtn}>
              <Text style={styles.gateBtnLabel}>TEXT ME A CODE</Text>
              <Text style={styles.gateBtnArrow}>→</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.fieldLabel}>Your name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="First and last"
              placeholderTextColor={colors.ghost}
              style={styles.input}
              autoCapitalize="words"
              autoFocus
            />

            <Text style={styles.fieldLabel}>When are you playing</Text>
            {/* Chips rather than a typed date: nobody should have to know that
                2026-08-01 is the format on the first screen of an app. */}
            <View style={styles.dayRow}>
              {[0, 1, 2].map((offset) => (
                <Pressable
                  key={offset}
                  onPress={() => setDayOffset(offset)}
                  style={[styles.dayBtn, dayOffset === offset && styles.dayBtnOn]}
                >
                  <Text style={[styles.dayLabel, dayOffset === offset && styles.dayLabelOn]}>
                    {offset === 0 ? 'TODAY' : offset === 1 ? 'TOMORROW' : prettyDay(isoDaysFromNow(2)).toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={start}
              disabled={!canStart}
              style={[styles.startBtn, !canStart && styles.startBtnOff]}
            >
              <Text style={styles.startLabel}>{busy ? 'STARTING…' : 'START A ROUND'}</Text>
              <Text style={styles.startArrow}>→</Text>
            </Pressable>
          </>
        )}

        {/* No "sign in above first" any more — there is nothing below to
            explain, because the form only appears once you have. */}
        {!signedOut && (
          <Text style={styles.note}>
            You'll be running this round: you pick the course and who's in it. Next comes the course, then everyone
            playing. It takes about a minute, and handicaps and anything else can be set once you're in.
          </Text>
        )}

        {/* Somebody who was texted a code isn't starting a round, they're
            joining one. Both doors on the first screen.

            This pointed at `/join?round=`, which needs a working deep link and
            is refused by RLS regardless — a guest cannot read a round they are
            not yet in, which is precisely the round they are trying to join. A
            code goes through a `security definer` lookup instead, so it works
            from a cold install with nothing but five characters. */}
        <Pressable onPress={() => router.replace('/joincode')} style={styles.secondaryBtn}>
          <Text style={styles.secondaryLabel}>I HAVE A ROUND CODE</Text>
          <Text style={styles.secondaryArrow}>›</Text>
        </Pressable>

        {/* Only when there is no gate above it — two sign-in buttons on one
            screen is a screen that cannot decide what it wants. */}
        {!!userId && (
          <Pressable onPress={() => router.push('/signin')} style={styles.secondaryBtn}>
            <Text style={styles.secondaryLabel}>USE A DIFFERENT NUMBER</Text>
            <Text style={styles.secondaryArrow}>›</Text>
          </Pressable>
        )}

        {rounds.length > 0 && (
          <Pressable onPress={() => router.replace('/(tabs)/activity')} style={styles.secondaryBtn}>
            <Text style={styles.secondaryLabel}>SEE ROUNDS ALREADY ON HERE</Text>
            <Text style={styles.secondaryArrow}>›</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: {
    marginTop: 26,
    padding: 16,
    backgroundColor: 'rgba(236,48,19,0.10)',
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 10,
  },
  gateTitle: { fontFamily: font.heading, fontSize: 18, color: colors.text },
  gateBody: { fontFamily: font.body, fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 8 },
  gateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    height: 56,
    paddingHorizontal: 16,
    backgroundColor: colors.accent,
  },
  gateBtnLabel: { fontFamily: font.heading, fontSize: 14, letterSpacing: 0.5, color: '#fff' },
  gateBtnArrow: { fontFamily: font.heading, fontSize: 18, color: '#fff' },
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingTop: 72, paddingHorizontal: 20, paddingBottom: 40 },
  lede: { fontFamily: font.body, fontSize: 13.5, lineHeight: 21, color: colors.muted, marginTop: 18 },
  fieldLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 26,
  },
  input: {
    fontFamily: font.heading,
    fontSize: 22,
    color: colors.text,
    borderBottomWidth: 2,
    borderColor: colors.text,
    paddingVertical: 9,
    marginTop: 8,
  },
  errorText: { fontFamily: font.body, fontSize: 11.5, color: colors.accent, marginTop: 9 },
  dayRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  dayBtn: { flex: 1, borderWidth: 2, borderColor: colors.divider, paddingVertical: 14, alignItems: 'center' },
  dayBtnOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  dayLabel: { fontFamily: font.heading, fontSize: 11, letterSpacing: 0.6, color: colors.text },
  dayLabelOn: { color: '#fff' },
  startBtn: {
    marginTop: 30,
    height: 78,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  startBtnOff: { opacity: 0.35 },
  startLabel: { fontFamily: font.heading, fontSize: 17, letterSpacing: 0.3, color: '#fff' },
  startArrow: { fontFamily: font.heading, fontSize: 20, color: '#fff' },
  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, marginTop: 14 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: colors.divider,
    paddingVertical: 18,
    marginTop: 14,
  },
  secondaryLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7, color: colors.text },
  secondaryArrow: { fontFamily: font.heading, fontSize: 16, color: colors.ghost },
});

import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Wordmark } from '@/components/Wordmark';
import { useRound } from '@/context/RoundContext';
import { prettyDay } from '@/lib/invite';
import { isJoinCodeValid, JOIN_CODE_LENGTH } from '@/lib/joinCode';
import { colors, font } from '@/theme';

/**
 * Join a round with the code the organizer read out.
 *
 * The second way in, and the one that always works. An invitation is *pushed* —
 * somebody types your number, your phone matches it, and a screen appears; when
 * any link in that chain misses there is nothing you can do but wait. This is
 * the same job done as a *pull*: you type five characters and you are in,
 * whether or not the organizer typed your number correctly, or at all, and
 * whether or not anybody made you a seat.
 *
 * Two steps, because confirming is worth a beat. Type the code, see the round —
 * course, day, who is running it, how many are playing — then take your seat.
 * Joining the wrong round is not a mistake anybody discovers quickly.
 */
export default function JoinCodeScreen() {
  const {
    codeRound,
    codeSeats,
    lookingUpCode,
    joiningByCode,
    lookUp,
    clearCode,
    joinByCode,
    authStage,
  } = useRound();

  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [addingSelf, setAddingSelf] = useState(false);
  const [name, setName] = useState('');
  const [handicap, setHandicap] = useState('');

  const parsedHandicap = handicap.trim() === '' ? 0 : Number(handicap.trim());
  const handicapOk = Number.isFinite(parsedHandicap) && parsedHandicap >= 0 && parsedHandicap <= 54;

  const find = async () => {
    setProblem(null);
    const message = await lookUp(code);
    setProblem(message);
  };

  const startOver = () => {
    clearCode();
    setProblem(null);
    setAddingSelf(false);
    setName('');
    setHandicap('');
  };

  /** Take a seat and land on the card. */
  const take = async (who: { playerId?: string; name?: string; handicap?: number }) => {
    const message = await joinByCode(code, who);
    if (message) {
      Alert.alert('Could not join that round', message);
      return;
    }
    router.replace('/(tabs)');
  };

  // Signing in has to happen before a seat can be taken — a seat records *whose*
  // it is. Said here rather than at the door, so somebody sent to this screen is
  // told why rather than bounced.
  if (authStage !== 'signedIn') {
    return (
      <View style={styles.screen}>
        <View style={styles.head}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backLabel}>BACK</Text>
          </Pressable>
          <Text style={styles.title}>Join a round</Text>
          <Text style={styles.body}>
            Sign in with your phone number first. A seat in a round records whose it is, so the app has to know who you
            are before it can give you one.
          </Text>
        </View>
        <Pressable style={styles.primary} onPress={() => router.push('/signin')}>
          <Text style={styles.primaryLabel}>SIGN IN WITH YOUR PHONE</Text>
          <Text style={styles.primaryArrow}>→</Text>
        </Pressable>
      </View>
    );
  }

  // ------------------------------------------------------------ step one
  if (!codeRound) {
    return (
      <View style={styles.screen}>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={styles.head}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
              <Text style={styles.backArrow}>‹</Text>
              <Text style={styles.backLabel}>BACK</Text>
            </Pressable>
            <Wordmark width={160} />
            <Text style={styles.title}>Join a round</Text>
            <Text style={styles.body}>
              Whoever is running the round has a {JOIN_CODE_LENGTH}-character code. Type it in and you're in — it works
              whether or not they have your number.
            </Text>
          </View>

          <TextInput
            value={code}
            onChangeText={(t) => {
              setCode(t);
              setProblem(null);
            }}
            placeholder="ABCDE"
            placeholderTextColor={colors.ghost}
            autoCapitalize="characters"
            autoCorrect={false}
            // No `oneTimeCode` here: this is not a texted passcode, and iOS
            // offering the last SMS code for it would be actively wrong.
            maxLength={8}
            style={styles.codeField}
          />
          {!!problem && <Text style={styles.error}>{problem}</Text>}
        </ScrollView>

        <Pressable
          style={[styles.primary, (!isJoinCodeValid(code) || lookingUpCode) && styles.primaryOff]}
          disabled={!isJoinCodeValid(code) || lookingUpCode}
          onPress={find}
        >
          <Text style={styles.primaryLabel}>{lookingUpCode ? 'LOOKING…' : 'FIND THE ROUND'}</Text>
          <Text style={styles.primaryArrow}>→</Text>
        </Pressable>
      </View>
    );
  }

  // ------------------------------------------------------------ step two
  const free = codeSeats.filter((s) => !s.taken);
  const already = codeSeats.find((s) => s.mine);

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.head}>
          <Pressable onPress={startOver} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backLabel}>A DIFFERENT CODE</Text>
          </Pressable>
          <Text style={styles.kicker}>This is the round</Text>
          <Text style={styles.title}>{codeRound.courseName || codeRound.roundName || 'A round'}</Text>
        </View>

        <View style={styles.card}>
          {!!codeRound.roundName && <Text style={styles.roundName}>{codeRound.roundName}</Text>}
          {!!codeRound.playedOn && <Text style={styles.meta}>{prettyDay(codeRound.playedOn)}</Text>}
          {!!codeRound.organizerName && <Text style={styles.meta}>Run by {codeRound.organizerName}</Text>}
          <Text style={styles.meta}>
            {codeRound.fieldSize} {codeRound.fieldSize === 1 ? 'player' : 'players'} so far
          </Text>
        </View>

        {/* Already in. Not an error — tapping join twice, or coming back to a
            round you joined last week, is ordinary. */}
        {already && (
          <>
            <Text style={styles.body}>You're already in this round as {already.name}.</Text>
            <Pressable style={styles.seatRow} onPress={() => take({ playerId: already.playerId })}>
              <Text style={styles.seatName}>OPEN IT</Text>
              <Text style={styles.seatArrow}>→</Text>
            </Pressable>
          </>
        )}

        {!already && (
          <>
            <Text style={styles.sectionLabel}>Which one are you?</Text>
            {free.length === 0 && (
              <Text style={styles.body}>
                Nobody has made you a seat in this round yet — that's fine, add yourself below.
              </Text>
            )}

            {/* Taken seats are shown and refused, never hidden. A field of nine
                that lists four names looks broken, and the fix somebody reaches
                for is adding themselves twice. */}
            {codeSeats.map((s) => (
              <Pressable
                key={s.playerId}
                disabled={s.taken || joiningByCode}
                onPress={() => take({ playerId: s.playerId })}
                style={[styles.seatRow, s.taken && styles.seatRowTaken]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.seatName, s.taken && styles.seatNameTaken]}>{s.name}</Text>
                  <Text style={styles.seatMeta}>
                    HCP {s.handicap}
                    {s.taken ? ' · already taken' : ''}
                  </Text>
                </View>
                {!s.taken && <Text style={styles.seatArrow}>→</Text>}
              </Pressable>
            ))}

            <Text style={styles.sectionLabel}>Not on the list?</Text>
            {!addingSelf ? (
              <Pressable style={styles.secondaryBtn} onPress={() => setAddingSelf(true)}>
                <Text style={styles.secondaryLabel}>ADD ME TO THIS ROUND</Text>
                <Text style={styles.seatArrow}>›</Text>
              </Pressable>
            ) : (
              <View style={styles.addBox}>
                <Text style={styles.fieldLabel}>YOUR NAME</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Dan Mullins"
                  placeholderTextColor={colors.ghost}
                  autoCapitalize="words"
                  style={styles.field}
                />
                <Text style={styles.fieldLabel}>HANDICAP</Text>
                <TextInput
                  value={handicap}
                  onChangeText={setHandicap}
                  placeholder="0"
                  placeholderTextColor={colors.ghost}
                  keyboardType="number-pad"
                  style={styles.field}
                />
                {!handicapOk && handicap.trim() !== '' && (
                  <Text style={styles.error}>A handicap is a number between 0 and 54.</Text>
                )}
                <Pressable
                  style={[styles.primaryInline, (!name.trim() || !handicapOk || joiningByCode) && styles.primaryOff]}
                  disabled={!name.trim() || !handicapOk || joiningByCode}
                  onPress={() => take({ name: name.trim(), handicap: parsedHandicap })}
                >
                  <Text style={styles.primaryLabel}>{joiningByCode ? 'JOINING…' : 'JOIN THIS ROUND'}</Text>
                  <Text style={styles.primaryArrow}>→</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { paddingTop: 58, paddingHorizontal: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 18 },
  backArrow: { fontFamily: font.heading, fontSize: 20, color: colors.accent, lineHeight: 22 },
  backLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7, color: colors.accent },
  kicker: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.accent,
    marginTop: 10,
  },
  title: { fontFamily: font.heading, fontSize: 30, letterSpacing: -0.8, color: colors.text, marginTop: 8 },
  body: { fontFamily: font.body, fontSize: 13, lineHeight: 20, color: colors.muted, paddingHorizontal: 20, paddingTop: 16 },
  // Big, spaced and centred: this gets read off somebody else's phone or heard
  // across a car park, and every character has to be unmistakable.
  codeField: {
    marginHorizontal: 20,
    marginTop: 24,
    backgroundColor: '#e7e4e2',
    borderRadius: 10,
    paddingVertical: 18,
    fontFamily: font.heading,
    fontSize: 38,
    letterSpacing: 10,
    textAlign: 'center',
    color: colors.text,
  },
  error: { fontFamily: font.body, fontSize: 12.5, lineHeight: 19, color: colors.accent, paddingHorizontal: 20, paddingTop: 14 },
  card: { marginHorizontal: 20, marginTop: 20, backgroundColor: '#e7e4e2', borderRadius: 10, padding: 16 },
  roundName: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  meta: { fontFamily: font.body, fontSize: 12.5, color: colors.muted, marginTop: 6 },
  sectionLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 8,
  },
  seatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.divider,
  },
  seatRowTaken: { opacity: 0.45 },
  seatName: { fontFamily: font.heading, fontSize: 16, color: colors.text },
  seatNameTaken: { color: colors.muted },
  seatMeta: { fontFamily: font.body, fontSize: 11.5, color: colors.muted, marginTop: 3 },
  seatArrow: { fontFamily: font.heading, fontSize: 18, color: colors.accent },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  secondaryLabel: { fontFamily: font.heading, fontSize: 13, letterSpacing: 0.7, color: colors.text },
  addBox: { paddingHorizontal: 20, paddingTop: 6 },
  fieldLabel: {
    fontFamily: font.bodySemi,
    fontSize: 9.5,
    letterSpacing: 1.2,
    color: colors.muted,
    marginTop: 14,
    marginBottom: 6,
  },
  field: {
    backgroundColor: '#e7e4e2',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: font.body,
    fontSize: 15,
    color: colors.text,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 72,
    paddingHorizontal: 20,
    backgroundColor: colors.accent,
  },
  primaryInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 64,
    paddingHorizontal: 18,
    marginTop: 22,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  primaryOff: { opacity: 0.4 },
  primaryLabel: { fontFamily: font.heading, fontSize: 16, letterSpacing: 0.3, color: '#fff' },
  primaryArrow: { fontFamily: font.heading, fontSize: 20, color: '#fff' },
});

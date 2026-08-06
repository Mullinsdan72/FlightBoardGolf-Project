import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Wordmark } from '@/components/Wordmark';
import { useRound } from '@/context/RoundContext';
import { claimRoster } from '@/lib/claim';
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { prettyPhone } from '@/lib/phone';
import { colors, font } from '@/theme';

/**
 * Who this phone is.
 *
 * Absorbs the player picker and the "NOT YOU?" link that used to hang off the
 * bottom of the Score tab — both were answers to "which player am I", asked in
 * two different places. This is the place.
 *
 * It shows the player in the *open round*, because that is the only roster this
 * device has loaded. Identity itself (`myId`) is global and remembered; the row
 * you see here is that player as they appear in this round.
 */
export default function MeScreen() {
  const {
    myId,
    choose,
    clear,
    players,
    playersLoaded,
    setHandicap,
    myProfile,
    myOwnedPlayers,
    myProfileLoaded,
    reloadMyProfile,
    userId,
    userPhone,
    claimPlayer,
    signOut,
    authStage,
  } = useRound();

  // Who this phone is, from the player row itself rather than from the open
  // round's roster. Opening an old round you weren't in used to make the app
  // forget you and ask again, which is exactly what it should never do.
  const me = myProfile ?? (myId ? players.find((p) => p.id === myId) : undefined);
  const [hcp, setHcp] = useState('');
  // The picker is a deliberate act now, not the default state of the screen.
  const [picking, setPicking] = useState(false);
  /**
   * Who this phone could be: the round's field, plus every row your account
   * already owns.
   *
   * The roster alone is empty when there are no rounds, so a signed-in person
   * had nothing to pick and could not get back onto their own claimed row —
   * which then refuses every write, because a round may only be created naming
   * a player you own. The key was on the wrong side of the door.
   */
  const pickable = [...players];
  for (const owned of myOwnedPlayers) {
    if (!pickable.some((p) => p.id === owned.id)) pickable.push(owned);
  }
  const rows = claimRoster(pickable, userId);

  const saveHandicap = async () => {
    if (!me) return;
    const n = Number(hcp.trim());
    if (!Number.isFinite(n) || n < 0 || n > 54) {
      Alert.alert('That handicap looks wrong', 'Use a whole number between 0 and 54.');
      return;
    }
    const message = await setHandicap(me.id, Math.round(n));
    if (message) Alert.alert('Could not save that handicap', message);
    else {
      setHcp('');
      // The roster refreshes itself; the profile is fetched separately and has
      // to be told.
      await reloadMyProfile();
    }
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will need a code texted to your number to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Wordmark width={160} />

        <Text style={styles.kicker}>This phone</Text>
        <Text style={styles.title}>{me ? me.name : 'Nobody picked yet'}</Text>
        {me && (
          <Text style={styles.meta}>
            HCP {me.handicap}
            {userPhone ? ` · ${prettyPhone(userPhone)}` : ''}
            {me.userId ? ' · claimed' : ' · not claimed'}
          </Text>
        )}

        {me && (
          <>
            <Text style={styles.fieldLabel}>Change your handicap</Text>
            <View style={styles.hcpRow}>
              <TextInput
                value={hcp}
                onChangeText={setHcp}
                placeholder={String(me.handicap)}
                placeholderTextColor={colors.ghost}
                style={styles.input}
                keyboardType="number-pad"
                onSubmitEditing={saveHandicap}
              />
              <Pressable onPress={saveHandicap} style={styles.saveBtn} disabled={!hcp.trim()}>
                <Text style={[styles.saveLabel, !hcp.trim() && { opacity: 0.4 }]}>SAVE</Text>
              </Pressable>
            </View>
            <Text style={styles.note}>
              Strokes come off the stroke index, so this is the number every net figure and every team allowance is
              worked out from.
            </Text>
          </>
        )}

        {/* Which player this device is. The picker used to be a separate screen
            reached from the bottom of SCORE; it belongs here — but it is no
            longer the *default* state of this screen. If the phone knows who
            you are it says so, and changing that is a deliberate tap. */}
        {me && !picking && (
          <Pressable onPress={() => setPicking(true)} style={styles.linkRow}>
            <Text style={styles.linkLabel}>NOT YOU? PICK SOMEONE ELSE</Text>
            <Text style={styles.linkArrow}>›</Text>
          </Pressable>
        )}

        {(!me || picking) && (
          <>
            <Text style={styles.sectionLabel}>{me ? 'Pick someone else' : 'Which one are you?'}</Text>
            {!myProfileLoaded && <Text style={styles.note}>Loading…</Text>}
            {playersLoaded && pickable.length === 0 && (
              <Text style={styles.note}>
                {userId
                  ? 'No player row belongs to your account yet. Start a round from ACTIVITY and you will be seated in it.'
                  : 'Nobody is in the open round yet. Add players on the ROUND tab, or open a different round from ACTIVITY.'}
              </Text>
            )}
          </>
        )}
        {(!me || picking) &&
          rows.map((p) => {
          const locked = !!userId && p.status === 'taken';
          return (
            <Pressable
              key={p.id}
              disabled={locked}
              onPress={async () => {
                if (userId && p.status === 'free') {
                  const message = await claimPlayer(p.id);
                  if (message) {
                    Alert.alert('Could not claim that player', message);
                    return;
                  }
                }
                await choose(p.id);
                setPicking(false);
                // The profile is fetched separately from the roster and has to
                // be told, exactly as saving a handicap already does. Without
                // this the header still reads "not claimed" after a claim that
                // worked — and the one screen that reports whether you are
                // claimed is the screen you check before locking down RLS.
                await reloadMyProfile();
              }}
              style={[styles.row, p.id === myId && styles.rowOn, locked && styles.rowLocked]}
            >
              <Text style={styles.rowName}>{p.name}</Text>
              <Text style={styles.rowMeta}>
                {locked ? 'signed in already' : p.id === myId ? 'that’s you' : `HCP ${p.handicap}`}
              </Text>
            </Pressable>
          );
        })}

        <Text style={styles.sectionLabel}>Account</Text>
        {authStage === 'signedIn' ? (
          <>
            <Text style={styles.note}>
              Signed in as {userPhone ? prettyPhone(userPhone) : 'your number'}. Signing in is what will let your rounds
              follow you to a new phone.
            </Text>
            {/* The door that did not exist.

                `/invited` was reachable by exactly one automatic redirect, and
                when that redirect missed there was no way in at all — no button
                anywhere in the app meaning "somebody added me, let me in". A
                whole group spent a morning force-closing the app because the
                only available fix was to make the automatic path fire again.

                It says CHECK rather than showing a count, because the count is
                the thing that was wrong: the screen answers honestly either
                way, and offering to look is useful precisely when the app
                believes there is nothing to find. */}
            <Pressable onPress={() => router.push('/joincode')} style={styles.linkRow}>
              <Text style={styles.linkLabel}>JOIN A ROUND WITH A CODE</Text>
              <Text style={styles.linkArrow}>›</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/invited')} style={styles.linkRow}>
              <Text style={styles.linkLabel}>CHECK FOR INVITATIONS</Text>
              <Text style={styles.linkArrow}>›</Text>
            </Pressable>
            <Pressable onPress={confirmSignOut} style={styles.linkRow}>
              <Text style={styles.linkLabel}>SIGN OUT</Text>
              <Text style={styles.linkArrow}>›</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => router.push('/signin')} style={styles.linkRow}>
            <Text style={styles.linkLabel}>SIGN IN WITH YOUR PHONE</Text>
            <Text style={styles.linkArrow}>›</Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => {
            clear();
            Alert.alert('Forgotten', 'This phone no longer has a player picked. Choose one above.');
          }}
          style={styles.linkRow}
        >
          <Text style={styles.linkLabel}>FORGET WHO THIS PHONE IS</Text>
          <Text style={styles.linkArrow}>›</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>Legal</Text>
        {PRIVACY_URL && (
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL as string)} style={styles.linkRow}>
            <Text style={styles.linkLabel}>PRIVACY POLICY</Text>
            <Text style={styles.linkArrow}>›</Text>
          </Pressable>
        )}
        {TERMS_URL && (
          <Pressable onPress={() => Linking.openURL(TERMS_URL as string)} style={styles.linkRow}>
            <Text style={styles.linkLabel}>TERMS OF SERVICE</Text>
            <Text style={styles.linkArrow}>›</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 40 },
  kicker: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.accent,
    marginTop: 16,
  },
  title: { fontFamily: font.heading, fontSize: 30, letterSpacing: -0.6, marginTop: 8, color: colors.text },
  meta: { fontFamily: font.body, fontSize: 12.5, color: colors.muted, marginTop: 6 },
  fieldLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 26,
  },
  hcpRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  input: {
    flex: 1,
    fontFamily: font.heading,
    fontSize: 22,
    color: colors.text,
    borderBottomWidth: 2,
    borderColor: colors.text,
    paddingVertical: 8,
    marginTop: 8,
  },
  saveBtn: { paddingVertical: 12 },
  saveLabel: { fontFamily: font.heading, fontSize: 13, letterSpacing: 0.7, color: colors.accent },
  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, marginTop: 10 },
  sectionLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 30,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  rowOn: { backgroundColor: 'rgba(236,48,19,0.06)' },
  rowLocked: { opacity: 0.4 },
  rowName: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  rowMeta: { fontFamily: font.body, fontSize: 11.5, color: colors.muted },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: colors.divider,
    paddingVertical: 17,
  },
  linkLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7, color: colors.text },
  linkArrow: { fontFamily: font.heading, fontSize: 16, color: colors.ghost },
});

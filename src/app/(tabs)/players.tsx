import { useState } from 'react';
import { router } from 'expo-router';
import * as SMS from 'expo-sms';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRound } from '@/context/RoundContext';
import { pickContact } from '@/lib/contacts';
import { APP_STORE_URL, cleanName, inviteMessage } from '@/lib/invite';
import { isPhoneValid, prettyPhone, samePhone, toE164 } from '@/lib/phone';
import { thruFor } from '@/lib/roundMath';
import { colors, font } from '@/theme';

type Adding = null | 'number' | 'name';

/**
 * Who is playing.
 *
 * Three ways in, in the order they should be reached for:
 *
 *   1. **Contacts** — best, because it captures a name *and* a number in one
 *      tap. The number is what makes an invite possible and what lets that
 *      person claim their own row when they later sign in.
 *   2. **A typed number** — same benefits, for somebody not in your phone.
 *   3. **A name alone** — the guest who doesn't want the app. Added, never
 *      invited, because there is nowhere to send an invite to.
 *
 * Adding and inviting are deliberately two actions. Sending a text is
 * outward-facing and cannot be undone, so a mistapped contact must not already
 * have messaged a stranger — and it lets you add four people, then invite them
 * together.
 */
export default function PlayersScreen() {
  const {
    players,
    playersLoaded,
    playersError,
    addPlayer,
    removePlayer,
    myId,
    scores,
    holes,
    activeRound,
    activeRoundId,
    course,
  } = useRound();

  const [adding, setAdding] = useState<Adding>(null);
  const [name, setName] = useState('');
  const [phone, setPhoneInput] = useState('');
  const [handicap, setHandicap] = useState('');
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);

  const swappingFor = swapping ? players.find((p) => p.id === swapping) : null;
  const tidy = cleanName(name);
  const parsedHandicap = handicap.trim() === '' ? 0 : Number(handicap.trim());
  const handicapOk = Number.isFinite(parsedHandicap) && parsedHandicap >= 0 && parsedHandicap <= 54;
  const canAdd = tidy.length > 0 && handicapOk && !busy && (adding !== 'number' || isPhoneValid(phone));

  const reset = () => {
    setName('');
    setPhoneInput('');
    setHandicap('');
    setAdding(null);
    setSwapping(null);
  };

  /** Add somebody, having checked they aren't already here twice over. */
  const commit = async (who: { name: string; phone: string | null }) => {
    // A number is the only reliable identity we have, so it is checked first.
    // The same person picked from contacts and typed by hand must not become two
    // players with two scorecards.
    if (who.phone) {
      const clash = players.find((p) => p.phone && samePhone(p.phone, who.phone!));
      if (clash) {
        Alert.alert('Already in the round', `${clash.name} is already playing on that number.`);
        return;
      }
    }
    const sameName = players.find((p) => p.name.toLowerCase() === who.name.toLowerCase());
    if (sameName) {
      const go = await new Promise<boolean>((resolve) =>
        Alert.alert(
          `${who.name} is already in this round`,
          'Two of the same name is confusing on a leaderboard, but two people really can share one. Add them anyway?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Add anyway', onPress: () => resolve(true) },
          ],
        ),
      );
      if (!go) return;
    }

    setBusy(true);
    const added = await addPlayer(who.name, parsedHandicap, who.phone);
    // A swap adds before it removes, so a failed add can never leave the round
    // a player short.
    if (added && swappingFor) await removePlayer(swappingFor.id);
    setBusy(false);
    reset();
  };

  const fromContacts = async () => {
    const out = await pickContact();
    if (!out.ok) {
      if (out.reason === 'denied') {
        Alert.alert(
          'Contacts not allowed',
          'Flight Board can only read your contacts if you allow it in Settings. You can always type someone in instead.',
        );
      } else if (out.reason === 'noName') {
        Alert.alert(
          'Could not read a name from that contact',
          'It may only have a company or an email on it. Type them in by hand instead.',
        );
      }
      return;
    }
    await commit(out.contact);
  };

  const submit = async () => {
    if (!canAdd) return;
    await commit({ name: tidy, phone: adding === 'number' ? toE164(phone) : null });
  };

  /**
   * Text somebody the link to this round.
   *
   * Warns first, because `flightboard://` resolves to nothing until there is a
   * real build — the message arrives, the link does nothing, and your friend
   * asks why. Better they hear that from you than watch it fail. The same text
   * starts working the day the build lands, unchanged.
   */
  const invite = async (playerId: string) => {
    const who = players.find((p) => p.id === playerId);
    if (!who?.phone || !activeRoundId) return;

    if (!APP_STORE_URL) {
      const go = await new Promise<boolean>((resolve) =>
        Alert.alert(
          'Invite links do not open yet',
          `${who.name} will get the message, but the link won't open Flight Board until the app is properly installed rather than run through Expo Go. Send it anyway?`,
          [
            { text: 'Not yet', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Send anyway', onPress: () => resolve(true) },
          ],
        ),
      );
      if (!go) return;
    }

    if (!(await SMS.isAvailableAsync())) {
      Alert.alert('No messaging on this device', 'Send them the link from a phone that can text.');
      return;
    }
    await SMS.sendSMSAsync([who.phone], inviteMessage({ roundId: activeRoundId, roundName: activeRound?.name ?? '' }));
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/round'))}
          hitSlop={10}
          style={styles.backBtn}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>ROUND SETUP</Text>
        </Pressable>
        <Text style={styles.kicker}>
          {[activeRound?.name, course?.courseName].filter(Boolean).join(' · ') || 'Round'}
        </Text>
        <Text style={styles.title}>Players</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        {playersError && <Text style={styles.error}>{playersError}</Text>}

        <Text style={styles.sectionLabel}>Playing this round · {players.length}</Text>
        {!playersLoaded && <Text style={styles.note}>Loading…</Text>}
        {playersLoaded && players.length === 0 && (
          <Text style={styles.note}>Nobody yet. Add everyone playing, starting with yourself.</Text>
        )}

        {players.map((p) => {
          const played = thruFor(holes, scores, p.id);
          return (
            <View key={p.id} style={[styles.row, p.id === myId && styles.rowYou]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>
                  {p.name}
                  {p.id === myId ? ' (you)' : ''}
                </Text>
                <Text style={styles.rowMeta}>
                  HCP {p.handicap} · {played > 0 ? `${played} played` : 'not started'}
                  {p.phone ? ` · ${prettyPhone(p.phone)}` : ' · no number'}
                </Text>
              </View>

              {/* A dead INVITE button is worse than none, so somebody added by
                  name alone simply doesn't get one. */}
              {p.phone && p.id !== myId && (
                <Pressable onPress={() => invite(p.id)} style={styles.rowBtn} hitSlop={6}>
                  <Text style={styles.rowBtnLabel}>INVITE</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => {
                  setSwapping((prev) => (prev === p.id ? null : p.id));
                  setAdding('name');
                }}
                style={styles.rowBtn}
                hitSlop={6}
              >
                <Text style={[styles.rowBtnLabel, swapping === p.id && { color: colors.accent }]}>SWAP</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(`Remove ${p.name}?`, 'Their scores for this round go with them.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removePlayer(p.id) },
                  ])
                }
                style={styles.rowBtn}
                hitSlop={6}
              >
                <Text style={[styles.rowBtnLabel, { color: colors.mutedFaint }]}>×</Text>
              </Pressable>
            </View>
          );
        })}

        <Text style={styles.sectionLabel}>
          {swappingFor ? `Who is playing instead of ${swappingFor.name}` : 'Add a player'}
        </Text>
        {swappingFor && (
          <Pressable onPress={reset} style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
            <Text style={styles.cancelSwap}>CANCEL THE SWAP</Text>
          </Pressable>
        )}

        {/* Contacts first, on purpose: the only route that captures a name and a
            number in one tap, and the number is what makes both the invite and a
            future claim possible. */}
        <Pressable onPress={fromContacts} style={styles.bigBtn}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigLabel}>FROM MY CONTACTS</Text>
            <Text style={styles.bigNote}>Name and number in one tap. Nothing is uploaded.</Text>
          </View>
          <Text style={styles.bigArrow}>›</Text>
        </Pressable>

        <Pressable onPress={() => setAdding(adding === 'number' ? null : 'number')} style={styles.bigBtn}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigLabel}>BY PHONE NUMBER</Text>
            <Text style={styles.bigNote}>For someone not in your phone. Can be invited.</Text>
          </View>
          <Text style={styles.bigArrow}>{adding === 'number' ? '⌃' : '›'}</Text>
        </Pressable>

        <Pressable onPress={() => setAdding(adding === 'name' ? null : 'name')} style={styles.bigBtn}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigLabel}>JUST A NAME</Text>
            <Text style={styles.bigNote}>The guest who doesn’t want the app. No invite.</Text>
          </View>
          <Text style={styles.bigArrow}>{adding === 'name' ? '⌃' : '›'}</Text>
        </Pressable>

        {adding && (
          <View style={styles.form}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="First and last"
              placeholderTextColor={colors.ghost}
              style={styles.input}
              autoCapitalize="words"
            />

            {adding === 'number' && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Mobile number</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhoneInput}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={colors.ghost}
                  style={styles.input}
                  keyboardType="phone-pad"
                />
                {phone.trim() !== '' && !isPhoneValid(phone) && (
                  <Text style={styles.error}>That doesn’t look like a phone number yet.</Text>
                )}
              </>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Handicap</Text>
            <TextInput
              value={handicap}
              onChangeText={setHandicap}
              placeholder="0"
              placeholderTextColor={colors.ghost}
              style={styles.input}
              keyboardType="number-pad"
              onSubmitEditing={submit}
            />
            {!handicapOk && <Text style={styles.error}>Use a whole number between 0 and 54.</Text>}

            <Pressable onPress={submit} disabled={!canAdd} style={[styles.addBtn, !canAdd && styles.addOff]}>
              <Text style={styles.addLabel}>
                {busy ? 'ADDING…' : swappingFor ? `REPLACE ${swappingFor.name.toUpperCase()}` : 'ADD TO THE ROUND'}
              </Text>
              <Text style={styles.addArrow}>→</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.note}>
          Adding somebody and inviting them are two separate taps. Anyone with a number gets an INVITE button on their
          row, so a mistapped contact can never text a stranger — and you can add everyone first, then invite them
          together.
        </Text>
      </ScrollView>

      {/* Adding players has no natural end — the list just sits there, and the
          only way out was a small back-link in the header nobody looked at. A
          finish button says the step is over and puts you back where the round
          gets set up. `replace`, not `push`: going "back" from the setup screen
          should not land you in the roster again. */}
      <Pressable onPress={() => router.replace('/(tabs)/round')} style={styles.doneBtn}>
        <Text style={styles.doneLabel}>
          DONE · {players.length} PLAYER{players.length === 1 ? '' : 'S'}
        </Text>
        <Text style={styles.doneArrow}>→</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  doneBtn: {
    height: 68,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  doneLabel: { fontFamily: font.heading, fontSize: 15, letterSpacing: 0.4, color: '#fff' },
  doneArrow: { fontFamily: font.heading, fontSize: 19, color: '#fff' },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  backArrow: { fontFamily: font.heading, fontSize: 20, color: colors.accent, lineHeight: 22 },
  backLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7, color: colors.accent },
  kicker: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.accent },
  title: { fontFamily: font.heading, fontSize: 28, letterSpacing: -0.6, marginTop: 8, color: colors.text },
  sectionLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 10,
  },
  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, paddingHorizontal: 20, paddingTop: 14 },
  error: { fontFamily: font.body, fontSize: 11.5, color: colors.accent, paddingHorizontal: 20, paddingTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  rowYou: { backgroundColor: 'rgba(236,48,19,0.06)' },
  rowName: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  rowMeta: { fontFamily: font.body, fontSize: 11, color: colors.muted, marginTop: 3 },
  rowBtn: { paddingHorizontal: 7, paddingVertical: 6 },
  rowBtnLabel: { fontFamily: font.heading, fontSize: 11, letterSpacing: 0.5, color: colors.text },
  cancelSwap: { fontFamily: font.heading, fontSize: 11.5, letterSpacing: 0.6, color: colors.accent },
  bigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 10,
    backgroundColor: '#e7e4e2',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  bigLabel: { fontFamily: font.heading, fontSize: 13.5, letterSpacing: 0.5, color: colors.text },
  bigNote: { fontFamily: font.body, fontSize: 11, color: colors.muted, marginTop: 4 },
  bigArrow: { fontFamily: font.heading, fontSize: 17, color: colors.ghost },
  form: { paddingHorizontal: 20, paddingTop: 18 },
  fieldLabel: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: colors.muted },
  input: {
    fontFamily: font.heading,
    fontSize: 20,
    color: colors.text,
    borderBottomWidth: 2,
    borderColor: colors.text,
    paddingVertical: 8,
    marginTop: 8,
  },
  addBtn: {
    marginTop: 22,
    height: 68,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  addOff: { opacity: 0.35 },
  addLabel: { fontFamily: font.heading, fontSize: 15, letterSpacing: 0.3, color: '#fff' },
  addArrow: { fontFamily: font.heading, fontSize: 19, color: '#fff' },
});

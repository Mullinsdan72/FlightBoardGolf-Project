import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Wordmark } from '@/components/Wordmark';
import { useRound } from '@/context/RoundContext';
import { prettyDay } from '@/lib/invite';
import { colors, font } from '@/theme';

/**
 * "Somebody has put you in a round. Join it?"
 *
 * The organizer builds the field the night before by typing names and mobile
 * numbers, so the first thing a guest's phone should do on opening is offer the
 * round that is already waiting for them — not the ROUND tab, which invites
 * them to organize a second copy of the round they were invited to.
 *
 * Answering is deliberately two buttons and no default. Joining claims a player
 * row, and a row claimed by the wrong person is somebody else's scorecard on
 * your phone; that is never something to do because a screen timed out.
 */
export default function InvitedScreen() {
  const { invites, joinInvite, declineInvite } = useRound();
  const [busy, setBusy] = useState(false);

  const waiting = invites ?? [];
  const first = waiting[0];

  // Nothing waiting — arrived here by a stale link or by joining the last one.
  // Never a dead end: the round's home is one tap away.
  if (!first) {
    return (
      <View style={styles.screen}>
        <View style={styles.head}>
          <Wordmark width={160} />
          <Text style={styles.title}>Nothing waiting</Text>
          <Text style={styles.body}>
            No one has added you to a round you haven't joined. If you're expecting one, check the organizer has your
            mobile number — that's how the app matches an invitation to a phone.
          </Text>
        </View>
        <Pressable style={styles.primary} onPress={() => router.replace('/(tabs)/round')}>
          <Text style={styles.primaryLabel}>SET A ROUND UP</Text>
          <Text style={styles.primaryArrow}>→</Text>
        </Pressable>
      </View>
    );
  }

  const join = async () => {
    setBusy(true);
    const message = await joinInvite(first);
    setBusy(false);
    if (message) {
      Alert.alert('Could not join that round', message);
      return;
    }
    // Straight to scoring. You are a player in somebody else's round; the setup
    // is theirs and the card is yours.
    router.replace('/(tabs)');
  };

  const notNow = async () => {
    await declineInvite(first.roundId);
    // Not asked about this round again. If it was the only one, the layout's
    // own opening decision takes over from here.
    if (waiting.length > 1) return;
    router.replace('/(tabs)/round');
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.head}>
          <Wordmark width={160} />
          <Text style={styles.kicker}>You've been invited</Text>
          <Text style={styles.title}>{first.courseName || first.roundName || 'A round'}</Text>
        </View>

        <View style={styles.card}>
          {!!first.roundName && <Text style={styles.roundName}>{first.roundName}</Text>}
          {!!first.playedOn && <Text style={styles.meta}>{prettyDay(first.playedOn)}</Text>}
          {/* The name they typed, because it is how you will appear on the
              leaderboard — and because a wrong name here is the first sign the
              invitation belongs to somebody else. */}
          <Text style={styles.meta}>You're in the field as {first.playerName}</Text>
        </View>

        <Text style={styles.body}>
          Joining puts this round on your phone and opens your card. Your scores post live to everyone else in it.
        </Text>

        {waiting.length > 1 && (
          <Text style={styles.more}>
            {waiting.length - 1} more invitation{waiting.length - 1 === 1 ? '' : 's'} after this one.
          </Text>
        )}
      </ScrollView>

      <Pressable style={[styles.primary, busy && styles.primaryBusy]} disabled={busy} onPress={join}>
        <Text style={styles.primaryLabel}>{busy ? 'JOINING…' : 'YES, JOIN THIS ROUND'}</Text>
        <Text style={styles.primaryArrow}>→</Text>
      </Pressable>
      <Pressable style={styles.secondary} disabled={busy} onPress={notNow}>
        <Text style={styles.secondaryLabel}>NOT NOW</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { paddingTop: 58, paddingHorizontal: 20 },
  kicker: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.accent,
    marginTop: 22,
  },
  title: { fontFamily: font.heading, fontSize: 30, letterSpacing: -0.8, color: colors.text, marginTop: 8 },
  card: { marginHorizontal: 20, marginTop: 20, backgroundColor: '#e7e4e2', borderRadius: 10, padding: 16 },
  roundName: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  meta: { fontFamily: font.body, fontSize: 12.5, color: colors.muted, marginTop: 6 },
  body: { fontFamily: font.body, fontSize: 13, lineHeight: 20, color: colors.muted, paddingHorizontal: 20, paddingTop: 18 },
  more: { fontFamily: font.bodySemi, fontSize: 11.5, color: colors.accent, paddingHorizontal: 20, paddingTop: 14 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 72,
    paddingHorizontal: 20,
    backgroundColor: colors.accent,
  },
  primaryBusy: { opacity: 0.6 },
  primaryLabel: { fontFamily: font.heading, fontSize: 16, letterSpacing: 0.3, color: '#fff' },
  primaryArrow: { fontFamily: font.heading, fontSize: 20, color: '#fff' },
  secondary: { alignItems: 'center', paddingVertical: 18 },
  secondaryLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.9, color: colors.muted },
});

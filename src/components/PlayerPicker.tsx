import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Wordmark } from '@/components/Wordmark';
import type { SeedPlayer } from '@/data/seed';
import { colors, font } from '@/theme';

// Still how a device says which player it is, but no longer the only door:
// phone sign-in exists now, and this screen is where you reach it. Picking a
// name off a list stays for the moment because most of a field is unclaimed —
// an organizer types Steve in long before Steve ever opens the app.
export function PlayerPicker({ players, onChoose }: { players: SeedPlayer[]; onChoose: (id: string) => void }) {
  // An empty roster is a normal state, not an error — it's what a fresh round
  // looks like before anyone has been added. Without this the screen would be a
  // dead end: a question with no answers.
  if (!players.length) {
    return (
      <View style={styles.wrap}>
        <Wordmark />
        <Text style={[styles.kicker, { marginTop: 18 }]}>Nobody in this round yet</Text>
        <Text style={styles.title}>Add the players first</Text>
        <Text style={styles.body}>
          Open the <Text style={styles.bodyStrong}>PLAYERS</Text> tab and add everyone playing — name and handicap. Then
          come back here and pick which one is you.
        </Text>
        <SignInLink />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {/* The first screen a new phone ever shows, so the one place a name badge
          genuinely helps: it says what you've just opened. */}
      <Wordmark />
      <Text style={[styles.kicker, { marginTop: 18 }]}>No sign-in yet</Text>
      <Text style={styles.title}>Who are you?</Text>
      <Text style={styles.body}>
        Phone-number sign-in comes later. For now, pick your name so your device knows which score is yours.
      </Text>
      <View style={styles.list}>
        {players.map((p) => (
          <Pressable key={p.id} onPress={() => onChoose(p.id)} style={styles.row}>
            <Text style={styles.rowName}>{p.name}</Text>
            <Text style={styles.rowMeta}>HCP {p.handicap}</Text>
            <Text style={styles.rowArrow}>→</Text>
          </Pressable>
        ))}
      </View>
      <SignInLink />
    </View>
  );
}

/**
 * The way to a real account.
 *
 * Deliberately not the loudest thing on the screen: signing in doesn't yet
 * decide which player you are, so pushing everyone through it first would add a
 * step without removing one. It gets promoted when claiming lands.
 */
function SignInLink() {
  return (
    <Pressable onPress={() => router.push('/signin')} style={styles.signInBtn}>
      <Text style={styles.signInLabel}>SIGN IN WITH YOUR PHONE</Text>
      <Text style={styles.signInArrow}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingTop: 64, paddingHorizontal: 20 },
  kicker: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.accent },
  title: { fontFamily: font.heading, fontSize: 30, letterSpacing: -0.6, marginTop: 8, color: colors.text },
  body: { fontFamily: font.body, fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 10 },
  bodyStrong: { fontFamily: font.heading, color: colors.text },
  list: { marginTop: 24, borderTopWidth: 2, borderTopColor: colors.divider },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowName: { flex: 1, fontFamily: font.heading, fontSize: 16, color: colors.text },
  rowMeta: { fontFamily: font.body, fontSize: 11.5, color: colors.muted },
  rowArrow: { fontFamily: font.heading, fontSize: 16, color: colors.accent },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: colors.divider,
    paddingVertical: 18,
    marginTop: 22,
  },
  signInLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7, color: colors.text },
  signInArrow: { fontFamily: font.heading, fontSize: 16, color: colors.ghost },
});

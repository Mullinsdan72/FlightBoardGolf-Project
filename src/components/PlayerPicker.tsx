import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Wordmark } from '@/components/Wordmark';
import type { SeedPlayer } from '@/data/seed';
import { claimRoster } from '@/lib/claim';
import { colors, font } from '@/theme';

// Still how a device says which player it is, but no longer the only door:
// phone sign-in exists now, and this screen is where you reach it. Picking a
// name off a list stays for the moment because most of a field is unclaimed —
// an organizer types Steve in long before Steve ever opens the app.
export function PlayerPicker({
  players,
  onChoose,
  userId,
  onClaim,
}: {
  players: SeedPlayer[];
  onChoose: (id: string) => void;
  /** Signed in as. Null keeps the old pick-a-name behaviour untouched. */
  userId?: string | null;
  /** Take an unclaimed row. Returns an error message, or null. */
  onClaim?: (id: string) => Promise<string | null>;
}) {
  const signedIn = !!userId && !!onClaim;
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const rows = claimRoster(players, userId);

  const take = async (id: string) => {
    if (!onClaim) return onChoose(id);
    setBusy(id);
    setProblem(await onClaim(id));
    setBusy(null);
  };
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
          Add everyone playing — name and handicap — then come back here and pick which one is you.
        </Text>
        {/* Buttons, not instructions. This screen used to say "open the PLAYERS
            tab", which is hidden unless you organize the round — so the one
            person who most needed it was told to tap something that wasn't
            there. A door beats a direction. */}
        <Pressable onPress={() => router.push('/setup')} style={styles.primaryBtn}>
          <Text style={styles.primaryLabel}>SET THIS ROUND UP</Text>
          <Text style={styles.primaryArrow}>→</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/rounds')} style={styles.signInBtn}>
          <Text style={styles.signInLabel}>OPEN A DIFFERENT ROUND</Text>
          <Text style={styles.signInArrow}>›</Text>
        </Pressable>
        <SignInLink />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {/* The first screen a new phone ever shows, so the one place a name badge
          genuinely helps: it says what you've just opened. */}
      <Wordmark />
      <Text style={[styles.kicker, { marginTop: 18 }]}>{signedIn ? 'Signed in' : 'No sign-in yet'}</Text>
      <Text style={styles.title}>Which one are you?</Text>
      <Text style={styles.body}>
        {signedIn
          ? 'Tap your name to claim it. That links this round to your account, on every phone you sign in on — so nobody has to ask who you are again.'
          : 'Pick your name so your device knows which score is yours. Signing in with your number makes it stick.'}
      </Text>
      <View style={styles.list}>
        {rows.map((p) => {
          // A row somebody else has claimed is shown and refused, not hidden.
          // A four-ball that displays two names looks broken, and the organizer
          // "fixes" it by adding a duplicate — the exact mess claiming prevents.
          const locked = signedIn && p.status === 'taken';
          return (
            <Pressable
              key={p.id}
              onPress={() => !locked && take(p.id)}
              disabled={locked || busy != null}
              style={[styles.row, locked && styles.rowLocked]}
            >
              <Text style={styles.rowName}>{p.name}</Text>
              <Text style={styles.rowMeta}>
                {locked ? 'signed in already' : `HCP ${p.handicap}`}
              </Text>
              <Text style={styles.rowArrow}>{busy === p.id ? '…' : locked ? '' : '→'}</Text>
            </Pressable>
          );
        })}
      </View>
      {problem && <Text style={styles.problem}>{problem}</Text>}
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
  rowLocked: { opacity: 0.4 },
  problem: { fontFamily: font.body, fontSize: 11.5, color: colors.accent, marginTop: 12 },
  primaryBtn: {
    marginTop: 26,
    height: 72,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  primaryLabel: { fontFamily: font.heading, fontSize: 16, letterSpacing: 0.3, color: '#fff' },
  primaryArrow: { fontFamily: font.heading, fontSize: 20, color: '#fff' },
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

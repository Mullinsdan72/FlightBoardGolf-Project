import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRound } from '@/context/RoundContext';
import { holeGameName, settleEverything, type GamePositions } from '@/lib/sideGames';
import { fmtMoney } from '@/lib/wolf';
import { colors, font } from '@/theme';

// Where every side game converges into the fewest payments that clear the group.
//
// The app never moves money (CLAUDE.md rule 6) — this works out who owes whom
// and stops there. Cash changes hands in the clubhouse.
export default function SettleScreen() {
  const {
    myId,
    players,
    activeRound,
    wolf,
    wolfLedger,
    holeGames,
    holeGameLedgers,
    challenge,
    challengePositions,
  } = useRound();

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown';
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  // Every game that moves money between these players. A game that's switched
  // off isn't in the settlement at all — not in it at zero.
  const games: GamePositions[] = [];
  if (wolf.enabled) {
    games.push({ key: 'wolf', name: 'Wolf', positions: wolfLedger.totals });
  }
  if (challenge.enabled && Object.keys(challengePositions).length) {
    games.push({ key: 'challenge', name: 'Team challenge', positions: challengePositions });
  }
  for (const ledger of holeGameLedgers) {
    const game = holeGames.find((g) => g.id === ledger.gameId);
    games.push({
      key: ledger.gameId,
      name: holeGameName(ledger.type),
      positions: ledger.positions,
    });
    void game;
  }

  const settlement = settleEverything(games);
  const positions = players
    .map((p) => ({ id: p.id, name: p.name, cents: settlement.totals[p.id] ?? 0 }))
    .sort((a, b) => b.cents - a.cents);

  // Money that doesn't sum to zero is money somebody argues about. It should be
  // impossible — every ledger here is zero-sum by construction — so if it ever
  // isn't, say so rather than paying out a number that came from nowhere.
  const drift = Object.values(settlement.totals).reduce((a, b) => a + b, 0);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{activeRound?.name || 'Round'}</Text>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Settle up</Text>
          <Pressable onPress={goBack} style={styles.doneBtn} hitSlop={8}>
            <Text style={styles.doneLabel}>DONE</Text>
            <Text style={styles.doneArrow}>→</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView>
        {drift !== 0 && (
          <View style={styles.driftBar}>
            <Text style={styles.driftText}>
              These games don't balance — they come to {fmtMoney(drift)} rather than zero. Don't pay anything off this
              screen until that's sorted out.
            </Text>
          </View>
        )}

        {!games.length && (
          <Text style={styles.note}>
            No side games running. Turn Wolf on from the GAMES tab, or add closest to the pin or longest drive there, and
            the money works itself out here.
          </Text>
        )}

        {games.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Who pays who</Text>
            {settlement.allSquare && <Text style={styles.squareText}>All square. Nobody owes anybody.</Text>}
            {settlement.payments.map((p, i) => (
              <View
                key={`${p.fromId}-${p.toId}-${i}`}
                style={[styles.payRow, (p.fromId === myId || p.toId === myId) && styles.rowYou]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.payFrom}>
                    {nameOf(p.fromId)}
                    {p.fromId === myId ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.payTo}>
                    pays {nameOf(p.toId)}
                    {p.toId === myId ? ' (you)' : ''}
                  </Text>
                </View>
                <Text style={styles.payAmt}>{fmtMoney(p.cents).replace('+', '')}</Text>
              </View>
            ))}
            {settlement.payments.length > 0 && (
              <Text style={styles.note}>
                Netted across every game — {settlement.payments.length} payment
                {settlement.payments.length === 1 ? '' : 's'} settles all of it. Losing a fiver at one game and winning
                it back at another against the same player is no payment at all, not two people swapping notes.
              </Text>
            )}

            <Text style={styles.sectionLabel}>Everyone's position</Text>
            {positions.map((p) => (
              <View key={p.id} style={[styles.posRow, p.id === myId && styles.rowYou]}>
                <Text style={styles.posName}>
                  {p.name}
                  {p.id === myId ? ' (you)' : ''}
                </Text>
                <Text
                  style={[
                    styles.posAmt,
                    { color: p.cents > 0 ? colors.accent : p.cents < 0 ? colors.text : colors.mutedFaint },
                  ]}
                >
                  {fmtMoney(p.cents)}
                </Text>
              </View>
            ))}

            <Text style={styles.sectionLabel}>By game</Text>
            {games.map((g) => (
              <View key={g.key} style={styles.gameBlock}>
                <Text style={styles.gameName}>{g.name}</Text>
                {players.map((p) => {
                  const cents = g.positions[p.id] ?? 0;
                  return (
                    <View key={p.id} style={styles.gameRow}>
                      <Text style={styles.gamePlayer}>{p.name}</Text>
                      <Text
                        style={[
                          styles.gameAmt,
                          { color: cents > 0 ? colors.accent : cents < 0 ? colors.text : colors.mutedFaint },
                        ]}
                      >
                        {fmtMoney(cents)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
            <Text style={styles.note}>
              Each game is shown on its own so a figure somebody disputes can be traced to where it came from. A single
              number nobody can explain is what starts the argument this screen exists to end.
            </Text>
          </>
        )}

        <View style={styles.footer}>
          <View style={styles.footerDot} />
          <Text style={styles.footerText}>
            Flight Board works out who owes who and settles nothing. Cash it out in the clubhouse like adults.
          </Text>
        </View>
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
  driftBar: { backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 14 },
  driftText: { fontFamily: font.bodySemi, fontSize: 12, lineHeight: 18, color: '#fff' },
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
  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, paddingHorizontal: 20, paddingTop: 12 },
  squareText: { fontFamily: font.heading, fontSize: 16, color: colors.text, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 2, borderColor: colors.divider },
  rowYou: { backgroundColor: 'rgba(236,48,19,0.08)' },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  payFrom: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  payTo: { fontFamily: font.body, fontSize: 11.5, color: colors.muted, marginTop: 4 },
  payAmt: { fontFamily: font.heading, fontSize: 22, color: colors.accent },
  posRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  posName: { fontFamily: font.bodySemi, fontSize: 13.5, color: colors.text },
  posAmt: { fontFamily: font.heading, fontSize: 15 },
  gameBlock: { borderTopWidth: 2, borderColor: colors.divider, paddingBottom: 6 },
  gameName: { fontFamily: font.heading, fontSize: 14, color: colors.text, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderColor: colors.dividerFaint ?? colors.divider,
  },
  gamePlayer: { fontFamily: font.body, fontSize: 12.5, color: colors.text },
  gameAmt: { fontFamily: font.bodySemi, fontSize: 12.5 },
  footer: { flexDirection: 'row', gap: 10, padding: 20, marginTop: 8, borderTopWidth: 2, borderColor: colors.divider },
  footerDot: { width: 8, height: 8, backgroundColor: colors.accent, marginTop: 4 },
  footerText: { flex: 1, fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SeedPlayer } from '@/data/seed';
import { fmtMoney, type WolfDecision } from '@/lib/wolf';
import { colors, font } from '@/theme';

// The black strip above the scoring controls: who has the wolf on this hole,
// and — when it's you — the four choices. The wolf tees last, watches the
// drives, then picks a partner or takes on the field alone.
export function WolfPrompt({
  hole,
  players,
  myId,
  wolfId,
  decision,
  stake,
  loneMultiplier,
  onDecide,
  onUndo,
}: {
  hole: number;
  players: SeedPlayer[];
  myId: string;
  wolfId: string | null;
  decision: WolfDecision | null;
  stake: number;
  loneMultiplier: number;
  onDecide: (wolfId: string, partnerId: string | null) => void;
  onUndo: () => void;
}) {
  if (!wolfId) return null;
  const wolf = players.find((p) => p.id === wolfId);
  if (!wolf) return null;

  const isMine = wolfId === myId;
  const partners = players.filter((p) => p.id !== wolfId);
  const partner = decision?.partnerId ? players.find((p) => p.id === decision.partnerId) : null;
  const loneStake = stake * loneMultiplier;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <View style={styles.dot} />
        <Text style={styles.head}>
          {isMine ? 'YOU HAVE THE WOLF' : `${wolf.name.toUpperCase()} HAS THE WOLF`}
        </Text>
        <Text style={styles.tee}>wolf tees last</Text>
      </View>

      {decision ? (
        <View style={styles.decidedRow}>
          <Text style={styles.decided}>
            {decision.partnerId === null
              ? `Going alone · ${fmtMoney(loneStake * 100).replace('+', '')} a man`
              : `With ${partner?.name ?? 'partner'} · ${fmtMoney(stake * 100).replace('+', '')} a man`}
          </Text>
          <Pressable onPress={onUndo} hitSlop={8} style={styles.undoBtn}>
            <Text style={styles.undoLabel}>CHANGE</Text>
          </Pressable>
        </View>
      ) : isMine ? (
        <View style={styles.choices}>
          {partners.map((p) => (
            <Pressable key={p.id} onPress={() => onDecide(wolfId, p.id)} style={styles.choice}>
              <Text style={styles.choiceLabel} numberOfLines={1}>
                {p.name.split(' ')[0].toUpperCase()}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={() => onDecide(wolfId, null)} style={[styles.choice, styles.choiceLone]}>
            <Text style={styles.choiceLabel}>LONE {loneMultiplier}×</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.waiting}>
          Waiting on {wolf.name.split(' ')[0]} to pick a partner or go alone. Their choice shows up here.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.text,
    paddingHorizontal: 20,
    paddingTop: 11,
    paddingBottom: 13,
    borderTopWidth: 2,
    borderColor: colors.divider,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot: { width: 7, height: 7, backgroundColor: colors.accent },
  head: { flex: 1, fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7, color: colors.white },
  tee: { fontFamily: font.body, fontSize: 10, color: 'rgba(243,242,242,0.55)' },
  choices: { flexDirection: 'row', gap: 6, marginTop: 11 },
  choice: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: 'rgba(243,242,242,0.4)',
    alignItems: 'center',
  },
  choiceLone: { borderColor: colors.accent },
  choiceLabel: { fontFamily: font.heading, fontSize: 9.5, letterSpacing: 0.4, color: colors.white },
  decidedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 9 },
  decided: { flex: 1, fontFamily: font.bodySemi, fontSize: 11.5, color: 'rgba(243,242,242,0.85)' },
  undoBtn: { borderWidth: 2, borderColor: 'rgba(243,242,242,0.4)', paddingVertical: 7, paddingHorizontal: 9 },
  undoLabel: { fontFamily: font.heading, fontSize: 9.5, letterSpacing: 0.8, color: colors.white },
  waiting: { fontFamily: font.body, fontSize: 10.5, lineHeight: 15, color: 'rgba(243,242,242,0.55)', marginTop: 8 },
});

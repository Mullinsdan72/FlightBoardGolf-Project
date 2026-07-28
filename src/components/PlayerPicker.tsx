import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PLAYERS } from '@/data/seed';
import { colors, font } from '@/theme';

// Stands in for phone sign-in until Build Guide Phase 2 wires up Supabase
// phone auth. Each device picks which seeded player it is, once.
export function PlayerPicker({ onChoose }: { onChoose: (id: string) => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>No sign-in yet</Text>
      <Text style={styles.title}>Who are you?</Text>
      <Text style={styles.body}>
        Phone-number sign-in comes later. For now, pick your name so your device knows which score is yours.
      </Text>
      <View style={styles.list}>
        {PLAYERS.map((p) => (
          <Pressable key={p.id} onPress={() => onChoose(p.id)} style={styles.row}>
            <Text style={styles.rowName}>{p.name}</Text>
            <Text style={styles.rowMeta}>HCP {p.handicap}</Text>
            <Text style={styles.rowArrow}>→</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingTop: 64, paddingHorizontal: 20 },
  kicker: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.accent },
  title: { fontFamily: font.heading, fontSize: 30, letterSpacing: -0.6, marginTop: 8, color: colors.text },
  body: { fontFamily: font.body, fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 10 },
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
});

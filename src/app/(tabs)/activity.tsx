import { useMemo } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Wordmark } from '@/components/Wordmark';
import { useRound } from '@/context/RoundContext';
import { useRoundHistory } from '@/hooks/useRoundHistory';
import { colors, font, fmtToPar } from '@/theme';

const prettyDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * Every round you have played, one card each.
 *
 * Replaces `/rounds` as the place round history lives, and retires the
 * past-rounds switcher that had to be bolted onto the Card tab back when Card
 * was the last door standing.
 *
 * Your own score is large at the top of each card and the finishing order sits
 * under it, because the two questions you ask about a past round are "what did I
 * shoot" and "did I beat him".
 */
export default function ActivityScreen() {
  const { rounds, roundsLoaded, activeRoundId, switchRound, deleteRound, myId } = useRound();

  const roundIds = useMemo(() => rounds.map((r) => r.id), [rounds]);
  const { history, historyLoaded, historyError } = useRoundHistory(roundIds);

  /**
   * Read a past round without disturbing the one being played.
   *
   * This used to switch the active round and drop you on the Card tab, which
   * did two wrong things at once: a finished round became editable, and reading
   * last Saturday's result while standing on the third tee took today's round
   * off your screen.
   */
  const openHistory = (roundId: string) => router.push({ pathname: '/history', params: { round: roundId } });

  /** Make a round the one being played. The only action here that changes state. */
  const resume = async (roundId: string) => {
    if (roundId !== activeRoundId) await switchRound(roundId);
    router.push('/(tabs)');
  };

  const confirmDelete = (roundId: string, name: string) =>
    Alert.alert(
      `Delete ${name || 'this round'}?`,
      'Every score, sign-off and side-game record for this round goes with it. There is no undo.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const message = await deleteRound(roundId);
            if (message) Alert.alert('Could not delete that round', message);
          },
        },
      ],
    );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Wordmark width={160} />
        <Text style={styles.title}>Activity</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {!roundsLoaded && <Text style={styles.note}>Loading…</Text>}
        {historyError && <Text style={styles.error}>{historyError}</Text>}

        {roundsLoaded && rounds.length === 0 && (
          <Text style={styles.note}>
            No rounds yet. Set one up on the ROUND tab and it will show here once you have played it.
          </Text>
        )}

        {rounds.map((r) => {
          const h = history[r.id];
          const mine = h?.players.find((p) => p.id === myId);
          const played = h?.players.filter((p) => p.holesPlayed > 0) ?? [];
          return (
            <View key={r.id} style={[styles.card, r.id === activeRoundId && styles.cardActive]}>
              <View style={styles.cardTop}>
                <Text style={styles.course} numberOfLines={1}>
                  {r.courseName || 'No course'}
                </Text>
                <Text style={styles.date}>{prettyDate(r.playedOn)}</Text>
              </View>
              <Text style={styles.roundName}>
                {r.name || 'Untitled round'}
                {r.id === activeRoundId ? ' · OPEN' : ''}
              </Text>

              {/* Your number, big. Rule 4: a round with nothing posted has no
                  total, so it says so rather than showing a zero. */}
              <View style={styles.scoreRow}>
                <Text style={styles.gross}>{mine?.gross ?? '–'}</Text>
                {mine?.toPar != null && <Text style={styles.toPar}>{fmtToPar(mine.toPar)}</Text>}
                <Text style={styles.holes}>
                  {mine?.holesPlayed ? `${mine.holesPlayed} holes` : 'nothing posted'}
                </Text>
              </View>

              {played.length > 0 && (
                <View style={styles.field}>
                  {h!.players.map((p, i) => (
                    <View key={p.id} style={styles.fieldRow}>
                      <Text style={styles.pos}>{p.toPar == null ? '–' : i + 1}</Text>
                      <Text style={[styles.fieldName, p.id === myId && styles.fieldNameYou]} numberOfLines={1}>
                        {p.name}
                        {p.id === myId ? ' (you)' : ''}
                      </Text>
                      <Text style={styles.fieldScore}>{p.gross ?? '–'}</Text>
                      <Text style={styles.fieldToPar}>{p.toPar == null ? '' : fmtToPar(p.toPar)}</Text>
                    </View>
                  ))}
                </View>
              )}
              {!historyLoaded && <Text style={styles.note}>Loading scores…</Text>}

              <View style={styles.actions}>
                <Pressable onPress={() => openHistory(r.id)} style={styles.action}>
                  <Text style={styles.actionLabel}>OPEN</Text>
                </Pressable>
                {r.id !== activeRoundId && (
                  <Pressable onPress={() => resume(r.id)} style={styles.action}>
                    <Text style={styles.actionLabel}>PLAY THIS ONE</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => confirmDelete(r.id, r.name)} style={styles.action}>
                  <Text style={[styles.actionLabel, { color: colors.mutedFaint }]}>DELETE</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        <Pressable onPress={() => router.push('/rounds')} style={styles.newBtn}>
          <Text style={styles.newLabel}>+ NEW ROUND</Text>
          <Text style={styles.newArrow}>›</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontFamily: font.heading, fontSize: 28, letterSpacing: -0.6, marginTop: 12, color: colors.text },
  note: { fontFamily: font.body, fontSize: 12, color: colors.muted, paddingHorizontal: 20, paddingTop: 12 },
  error: { fontFamily: font.body, fontSize: 12, color: colors.accent, paddingHorizontal: 20, paddingTop: 12 },
  card: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: '#e7e4e2',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 16,
  },
  cardActive: { borderColor: colors.accent },
  cardTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  course: { fontFamily: font.heading, fontSize: 16, color: colors.text, flexShrink: 1 },
  date: { fontFamily: font.body, fontSize: 11.5, color: colors.muted },
  roundName: { fontFamily: font.body, fontSize: 12, color: colors.muted, marginTop: 3 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 12 },
  gross: { fontFamily: font.heading, fontSize: 44, letterSpacing: -1.5, color: colors.text },
  toPar: { fontFamily: font.heading, fontSize: 17, color: colors.accent },
  holes: { fontFamily: font.body, fontSize: 11.5, color: colors.muted },
  field: { marginTop: 12, borderTopWidth: 1, borderColor: colors.divider, paddingTop: 8 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  pos: { fontFamily: font.heading, fontSize: 12, color: colors.muted, width: 16 },
  fieldName: { flex: 1, fontFamily: font.body, fontSize: 13, color: colors.text },
  fieldNameYou: { fontFamily: font.bodySemi },
  fieldScore: { fontFamily: font.heading, fontSize: 14, color: colors.text, width: 34, textAlign: 'right' },
  fieldToPar: { fontFamily: font.body, fontSize: 12, color: colors.muted, width: 38, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 18, marginTop: 14, borderTopWidth: 1, borderColor: colors.divider, paddingTop: 12 },
  action: {},
  actionLabel: { fontFamily: font.heading, fontSize: 11.5, letterSpacing: 0.7, color: colors.accent },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 22,
    borderTopWidth: 1,
    borderColor: colors.divider,
    paddingVertical: 18,
  },
  newLabel: { fontFamily: font.heading, fontSize: 13, letterSpacing: 0.7, color: colors.text },
  newArrow: { fontFamily: font.heading, fontSize: 16, color: colors.ghost },
});

import { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Wordmark } from '@/components/Wordmark';
import { useRound } from '@/context/RoundContext';
import { useRoundHistory } from '@/hooks/useRoundHistory';
import { colors, font, fmtToPar } from '@/theme';

const prettyDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * A round that has already been played, read-only.
 *
 * Opening a past round used to switch the whole app to it and drop you on the
 * Card tab — which meant a finished round could be edited by accident, and the
 * card showed live scoring controls for something that finished a week ago.
 *
 * This is a record instead: the finishing order and nothing you can press. It
 * does **not** switch the active round, so reading last Saturday's result while
 * standing on the third tee can't take today's round off your screen.
 */
export default function HistoryScreen() {
  const { rounds, myId } = useRound();
  const params = useLocalSearchParams<{ round?: string }>();
  const roundId = typeof params.round === 'string' ? params.round : null;

  const round = rounds.find((r) => r.id === roundId) ?? null;
  const ids = useMemo(() => (roundId ? [roundId] : []), [roundId]);
  const { history, historyLoaded, historyError } = useRoundHistory(ids);
  const entry = roundId ? history[roundId] : undefined;
  const played = entry?.players.filter((p) => p.holesPlayed > 0) ?? [];

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/activity'));

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={back} hitSlop={10} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>ACTIVITY</Text>
        </Pressable>

        <Wordmark width={160} />

        <Text style={styles.kicker}>{prettyDate(round?.playedOn ?? null)}</Text>
        <Text style={styles.title}>{round?.courseName || 'Round'}</Text>
        <Text style={styles.meta}>
          {[round?.name, entry?.holeCount ? `${entry.holeCount} holes` : null].filter(Boolean).join(' · ')}
        </Text>

        {historyError && <Text style={styles.error}>{historyError}</Text>}
        {!historyLoaded && <Text style={styles.note}>Loading…</Text>}

        {historyLoaded && played.length === 0 && (
          <Text style={styles.note}>
            Nobody posted a score in this round. Nothing to show — which is different from a round of zeros, and this
            says so rather than inventing one.
          </Text>
        )}

        {played.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Final leaderboard</Text>
            {entry!.players.map((p, i) => (
              <View key={p.id} style={[styles.row, p.id === myId && styles.rowYou]}>
                <Text style={styles.pos}>{p.toPar == null ? '–' : i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {p.name}
                    {p.id === myId ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.sub}>
                    HCP {p.handicap}
                    {p.holesPlayed > 0 && p.holesPlayed !== entry!.holeCount
                      ? ` · only ${p.holesPlayed} of ${entry!.holeCount} posted`
                      : ''}
                  </Text>
                </View>
                <Text style={styles.gross}>{p.gross ?? '–'}</Text>
                <Text style={[styles.toPar, { color: (p.toPar ?? 0) < 0 ? colors.accent : colors.muted }]}>
                  {p.toPar == null ? '' : fmtToPar(p.toPar)}
                </Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.note}>
          A finished round is a record. Nothing here can be edited — to change a score you would reopen the round from
          ACTIVITY and score it live, which is deliberately more work than reading it.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 40 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backArrow: { fontFamily: font.heading, fontSize: 20, color: colors.accent, lineHeight: 22 },
  backLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7, color: colors.accent },
  kicker: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.accent,
    marginTop: 18,
  },
  title: { fontFamily: font.heading, fontSize: 28, letterSpacing: -0.6, marginTop: 8, color: colors.text },
  meta: { fontFamily: font.body, fontSize: 12.5, color: colors.muted, marginTop: 6 },
  sectionLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 28,
    marginBottom: 4,
  },
  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, marginTop: 18 },
  error: { fontFamily: font.body, fontSize: 12, color: colors.accent, marginTop: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  rowYou: { backgroundColor: 'rgba(236,48,19,0.06)' },
  pos: { fontFamily: font.heading, fontSize: 14, color: colors.muted, width: 18 },
  name: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  sub: { fontFamily: font.body, fontSize: 11, color: colors.muted, marginTop: 3 },
  gross: { fontFamily: font.heading, fontSize: 19, color: colors.text, width: 40, textAlign: 'right' },
  toPar: { fontFamily: font.heading, fontSize: 14, width: 44, textAlign: 'right' },
});

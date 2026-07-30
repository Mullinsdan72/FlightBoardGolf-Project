import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { useRound } from '@/context/RoundContext';
import { colors, font } from '@/theme';

const TAB_META: Record<string, { label: string; sub: string }> = {
  index: { label: 'SCORE', sub: 'hole-by-hole' },
  // Spelled out when there's room for it. At six tabs there isn't.
  board: { label: 'BOARD', sub: 'live' },
  card: { label: 'CARD', sub: 'sign off' },
  players: { label: 'PLAYERS', sub: 'add · swap' },
  course: { label: 'COURSE', sub: 'the card' },
  games: { label: 'GAMES', sub: 'side bets' },
};

function ModernistTabBar({ state, navigation, visible }: any) {
  const insets = useSafeAreaInsets();
  // Hidden routes stay mounted and navigable — the leaderboard opens a player's
  // card by pushing to it, and a route missing from the navigator would break
  // that. They're only left out of the bar.
  const routes = state.routes.filter((r: any) => visible.includes(r.name));
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {routes.map((route: any, i: number) => {
        const focused = state.routes[state.index]?.key === route.key;
        const meta = TAB_META[route.name] ?? { label: route.name.toUpperCase(), sub: '' };
        const label = route.name === 'board' && routes.length <= 4 ? 'LEADERBOARD' : meta.label;
        return (
          <Pressable
            key={route.key}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={[styles.tab, i < routes.length - 1 && styles.tabDivider]}
          >
            <View style={[styles.topBar, { backgroundColor: focused ? colors.accent : 'transparent' }]} />
            <View style={styles.tabInner}>
              <Text style={[styles.label, { color: focused ? colors.text : colors.mutedFaint }]} numberOfLines={1}>
                {label}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {meta.sub}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  const { activeRoundId, roundsLoaded, roundsError, amOrganizer, wolf, challenge, holeGames, myId } = useRound();

  // Nothing to score against until a round exists, so send a first-time user
  // (or anyone who just deleted their last round) to create one.
  // A blank screen is the worst thing this layout can render, and returning
  // null while loading is one failed fetch away from doing it forever. If the
  // round list actually failed, say so — the message is the database's own, and
  // it names the problem in one line where silence named nothing.
  if (roundsError && !activeRoundId) {
    return (
      <View style={loadStyles.wrap}>
        <Text style={loadStyles.kicker}>Could not load your rounds</Text>
        <Text style={loadStyles.body}>{roundsError}</Text>
        <Text style={loadStyles.hint}>
          Usually the phone has no connection to the database. Check signal, then close and reopen the app.
        </Text>
      </View>
    );
  }
  if (activeRoundId === undefined || !roundsLoaded || myId === undefined) return null;
  // A phone with no player and no round has never been used. Send it to the
  // welcome rather than to a form asking it to name a round — and creating one
  // there mints the player too, which is what stops the organizer-less dead end.
  if (activeRoundId === null && !myId) return <Redirect href="/welcome" />;
  if (activeRoundId === null) return <Redirect href="/rounds" />;

  // Setting the round up is the organizer's job, so the roster and the course
  // are their tabs. A player gets the four screens they actually use, which is
  // most of the point — six tabs of which two do nothing for you is clutter.
  //
  // This is a tidier screen, not a permission. With no sign-in any device can
  // pick any player and become the organizer, and the routes stay reachable by
  // URL. The real boundary arrives with accounts and RLS.
  const anyGame = wolf.enabled || challenge.enabled || holeGames.length > 0;
  const visible = ['index', 'board', 'card'];
  // A game nobody has set up isn't worth a tab; the organizer keeps it to set
  // one up with.
  if (anyGame || amOrganizer) visible.push('games');
  // Hiding these two is tidiness for a player, and a trap for anyone else. A
  // round nobody has claimed, or one with an empty field, has to be set up by
  // whoever is holding the phone — and the picker's own advice is "open the
  // PLAYERS tab", which isn't there to open. Same rule as `canSetUp` on /setup:
  // an unclaimed round belongs to whoever turns up.
  // Nothing else. PLAYERS and COURSE both came off the bar because /start is
  // the round's home now — course, tee, holes, scoring, players, teams and
  // games are all tiles on one screen, reached by tapping the round name on
  // SCORE. Four tabs, the same four for everyone, because the organizer's job
  // stopped needing tabs of its own.
  //
  // Both routes still exist and /start links to both, which is the whole reason
  // this is safe: hiding a tab must never hide the last way to something.

  return (
    <Tabs
      tabBar={(props) => <ModernistTabBar {...props} visible={visible} />}
      screenOptions={{ headerShown: false }}
    >
        <Tabs.Screen name="index" options={{ title: 'Score' }} />
        <Tabs.Screen name="board" options={{ title: 'Board' }} />
        <Tabs.Screen name="card" options={{ title: 'Card' }} />
        <Tabs.Screen name="players" options={{ title: 'Field' }} />
        <Tabs.Screen name="course" options={{ title: 'Course' }} />
      <Tabs.Screen name="games" options={{ title: 'Games' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderTopWidth: 2,
    borderTopColor: colors.divider,
  },
  tab: { flex: 1 },
  tabDivider: { borderRightWidth: 1, borderRightColor: colors.divider },
  topBar: { height: 3 },
  tabInner: { paddingHorizontal: 6, paddingTop: 12, paddingBottom: 2 },
  label: { fontFamily: font.heading, fontSize: 10.5, letterSpacing: 0.2 },
  sub: { fontFamily: font.body, fontSize: 8, color: colors.mutedFaint, marginTop: 5 },
});

const loadStyles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingTop: 96, paddingHorizontal: 24 },
  kicker: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  body: { fontFamily: font.heading, fontSize: 20, color: colors.text, marginTop: 10 },
  hint: { fontFamily: font.body, fontSize: 12.5, lineHeight: 19, color: colors.muted, marginTop: 14 },
});

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
  players: { label: 'FIELD', sub: 'roster' },
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
  const { activeRoundId, roundsLoaded, amOrganizer, wolf, challenge, holeGames, myId } = useRound();

  // Nothing to score against until a round exists, so send a first-time user
  // (or anyone who just deleted their last round) to create one.
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
  if (amOrganizer) visible.push('players', 'course');

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

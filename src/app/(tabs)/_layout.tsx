import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { useRound } from '@/context/RoundContext';
import { colors, font } from '@/theme';

const TAB_META: Record<string, { label: string; sub: string }> = {
  index: { label: 'SCORE', sub: 'hole-by-hole' },
  board: { label: 'BOARD', sub: 'live' },
  card: { label: 'CARD', sub: 'sign off' },
  players: { label: 'FIELD', sub: 'roster' },
  course: { label: 'COURSE', sub: 'the card' },
  games: { label: 'GAMES', sub: 'wolf' },
};

function ModernistTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route: any, i: number) => {
        const focused = state.index === i;
        const meta = TAB_META[route.name] ?? { label: route.name.toUpperCase(), sub: '' };
        return (
          <Pressable
            key={route.key}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={[styles.tab, i < state.routes.length - 1 && styles.tabDivider]}
          >
            <View style={[styles.topBar, { backgroundColor: focused ? colors.accent : 'transparent' }]} />
            <View style={styles.tabInner}>
              <Text style={[styles.label, { color: focused ? colors.text : colors.mutedFaint }]}>{meta.label}</Text>
              <Text style={styles.sub}>{meta.sub}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  const { activeRoundId, roundsLoaded } = useRound();

  // Nothing to score against until a round exists, so send a first-time user
  // (or anyone who just deleted their last round) to create one.
  if (activeRoundId === undefined || !roundsLoaded) return null;
  if (activeRoundId === null) return <Redirect href="/rounds" />;

  return (
    <Tabs tabBar={(props) => <ModernistTabBar {...props} />} screenOptions={{ headerShown: false }}>
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

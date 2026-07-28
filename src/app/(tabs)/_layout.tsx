import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '@/theme';

const TAB_META: Record<string, { label: string; sub: string }> = {
  index: { label: 'SCORE', sub: 'hole-by-hole' },
  board: { label: 'BOARD', sub: 'live' },
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
  return (
    <Tabs tabBar={(props) => <ModernistTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Score' }} />
      <Tabs.Screen name="board" options={{ title: 'Board' }} />
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
  tabInner: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2 },
  label: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.7 },
  sub: { fontFamily: font.body, fontSize: 9.5, color: colors.mutedFaint, marginTop: 6 },
});

import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  STEP_ROUTE,
  STEP_TITLE,
  stepAfter,
  stepBefore,
  stepCount,
  stepNumber,
  type StepKey,
} from '@/lib/invite';
import { colors, font } from '@/theme';

/**
 * Whether this screen is being shown as part of the run-through.
 *
 * Screens pad their own header by 58 to clear the notch. When the bar is above
 * them it has already done that, so they need to stop — otherwise the bar is
 * followed by a hole.
 */
export function useInSetup(): boolean {
  const params = useLocalSearchParams<{ setup?: string }>();
  return params.setup === '1';
}

/**
 * The wayfinding for the setup run-through.
 *
 * Shown only when a screen was reached from `/setup` — the Course tab is a tab
 * in its own right the rest of the time, and doesn't want a wizard bar on it.
 * The flag rides along on the route (`?setup=1`) so every hop keeps it.
 *
 * Without this the run-through sent you to the Course tab and abandoned you
 * there: no sense of which step you were on, no way forward, and no obvious way
 * back. There is no Save button because nothing here needs saving — picking a
 * course, adding a player and drawing teams all write as you tap.
 *
 * It sits above every screen's own header, so it clears the status bar itself.
 * The screens use a fixed `paddingTop: 58` for the notch, which does nothing for
 * anything rendered above them — the first version of this bar came out
 * underneath the clock and the battery icons.
 */
export function SetupBar({ step }: { step: StepKey }) {
  const params = useLocalSearchParams<{ setup?: string }>();
  const insets = useSafeAreaInsets();
  if (params.setup !== '1') return null;

  const prev = stepBefore(step);
  const next = stepAfter(step);

  const go = (key: StepKey) =>
    router.replace({ pathname: STEP_ROUTE[key] as any, params: { setup: '1' } });

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
      <Pressable onPress={() => router.replace('/setup')} style={styles.progress} hitSlop={6}>
        <Text style={styles.stepCount}>
          STEP {stepNumber(step)} OF {stepCount}
        </Text>
        <Text style={styles.stepTitle}>{STEP_TITLE[step]}</Text>
        <Text style={styles.stepHint}>tap for all steps</Text>
      </Pressable>

      <View style={styles.dots}>
        {Array.from({ length: stepCount }, (_, i) => (
          <View key={i} style={[styles.dot, i + 1 === stepNumber(step) && styles.dotOn]} />
        ))}
      </View>

      <View style={styles.buttons}>
        <Pressable
          onPress={() => prev && go(prev)}
          disabled={!prev}
          style={[styles.btn, styles.backBtn, !prev && styles.hidden]}
        >
          <Text style={styles.backLabel} numberOfLines={1}>
            ‹ {prev ? STEP_TITLE[prev].toUpperCase() : ''}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => (next ? go(next) : router.replace('/setup'))}
          style={[styles.btn, styles.nextBtn]}
        >
          <Text style={styles.nextLabel} numberOfLines={1}>
            {next ? `NEXT · ${STEP_TITLE[next].toUpperCase()}` : 'FINISH'} ›
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.text, paddingHorizontal: 16, paddingBottom: 14 },
  progress: { alignItems: 'center' },
  stepCount: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.4, color: 'rgba(255,255,255,0.55)' },
  stepTitle: { fontFamily: font.heading, fontSize: 19, color: '#fff', marginTop: 5 },
  stepHint: { fontFamily: font.body, fontSize: 9.5, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 11 },
  dot: { width: 22, height: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotOn: { backgroundColor: colors.accent },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 13 },
  // Big enough to hit with a thumb on a cart path.
  btn: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  backBtn: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  hidden: { opacity: 0 },
  backLabel: { fontFamily: font.heading, fontSize: 11, letterSpacing: 0.6, color: '#fff' },
  nextBtn: { backgroundColor: colors.accent },
  nextLabel: { fontFamily: font.heading, fontSize: 11.5, letterSpacing: 0.6, color: '#fff' },
});

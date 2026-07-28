import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
 */
export function SetupBar({ step }: { step: StepKey }) {
  const params = useLocalSearchParams<{ setup?: string }>();
  if (params.setup !== '1') return null;

  const prev = stepBefore(step);
  const next = stepAfter(step);

  const go = (key: StepKey) =>
    router.replace({ pathname: STEP_ROUTE[key] as any, params: { setup: '1' } });

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={() => prev && go(prev)}
        disabled={!prev}
        style={[styles.side, !prev && styles.disabled]}
        hitSlop={6}
      >
        <Text style={styles.sideLabel}>{prev ? `‹ ${STEP_TITLE[prev].toUpperCase()}` : ''}</Text>
      </Pressable>

      <Pressable onPress={() => router.replace('/setup')} style={styles.middle} hitSlop={6}>
        <Text style={styles.stepText}>
          STEP {stepNumber(step)} OF {stepCount}
        </Text>
        <Text style={styles.stepTitle}>{STEP_TITLE[step]}</Text>
      </Pressable>

      <Pressable
        onPress={() => (next ? go(next) : router.replace('/setup'))}
        style={styles.side}
        hitSlop={6}
      >
        <Text style={[styles.sideLabel, styles.nextLabel]}>
          {next ? `${STEP_TITLE[next].toUpperCase()} ›` : 'FINISH ›'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  side: { flex: 1 },
  disabled: { opacity: 0.3 },
  sideLabel: { fontFamily: font.heading, fontSize: 9.5, letterSpacing: 0.6, color: '#fff' },
  nextLabel: { color: colors.accent, textAlign: 'right' },
  middle: { alignItems: 'center' },
  stepText: { fontFamily: font.bodySemi, fontSize: 8.5, letterSpacing: 1.1, color: 'rgba(255,255,255,0.6)' },
  stepTitle: { fontFamily: font.heading, fontSize: 11, color: '#fff', marginTop: 3 },
});

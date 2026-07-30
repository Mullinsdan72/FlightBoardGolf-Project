import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font } from '@/theme';

/**
 * One setting, showing its own value.
 *
 * The tile grid replaced a five-step run-through, and this is why it works: a
 * tile with nothing set is *visibly* empty, so the screen guides you without
 * marching you. You can scan six tiles in a second and see what's left; you
 * cannot scan five screens.
 *
 * `unset` is styled rather than hidden — an empty tile is information.
 */
export function Tile({
  label,
  value,
  unset,
  onPress,
  disabled,
}: {
  label: string;
  value: string;
  /** Nothing chosen yet. Draws the value in ghost and marks the border. */
  unset?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.tile, unset && styles.tileUnset, disabled && styles.tileOff]}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, unset && styles.valueUnset]} numberOfLines={2}>
        {value}
      </Text>
    </Pressable>
  );
}

/** Lays tiles out three to a row, wrapping. */
export function TileGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20 },
  tile: {
    // Three across, with two 10px gaps and 20px of padding either side.
    width: '31.5%',
    minHeight: 84,
    // A filled, rounded tile rather than the app's usual square hairline rule.
    // Deliberate deviation from the zero-radius house style, asked for so the
    // grid reads as a set of objects you can press rather than as ruled-off
    // sections of the page.
    backgroundColor: '#e7e4e2',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: 11,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  tileUnset: { borderColor: colors.accent, backgroundColor: 'rgba(236,48,19,0.07)' },
  tileOff: { opacity: 0.4 },
  label: {
    fontFamily: font.bodySemi,
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  value: { fontFamily: font.heading, fontSize: 15, color: colors.text, marginTop: 8 },
  valueUnset: { color: colors.accent },
});

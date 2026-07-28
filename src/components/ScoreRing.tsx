import { StyleSheet, Text, View } from 'react-native';
import { colors, font, markForScore } from '@/theme';

// Traditional golf notation: a circle around a score means under par, a
// square (no radius) means over par, and a doubled ring means two-or-more
// either direction. This is the one place in the whole design that's allowed
// a rounded corner. See CLAUDE.md: never store this — always derive it from
// the score and the hole's par.
export function ScoreRing({
  strokes,
  par,
  size = 58,
  innerSize = 50,
  fontSize = 32,
}: {
  strokes: number;
  par: number;
  size?: number;
  innerSize?: number;
  fontSize?: number;
}) {
  const mark = markForScore(strokes, par);
  return (
    <View
      style={[
        styles.outer,
        {
          width: size,
          height: size,
          borderRadius: mark.radius === 999 ? size / 2 : 0,
          borderWidth: mark.ringWidth,
          borderColor: mark.ringColor,
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: mark.radius === 999 ? innerSize / 2 : 0,
            borderWidth: mark.innerRingWidth,
            borderColor: mark.innerRingColor,
          },
        ]}
      >
        <Text style={[styles.num, { fontSize, color: mark.color }]}>{strokes}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center', justifyContent: 'center' },
  num: { fontFamily: font.heading, letterSpacing: -0.5 },
});

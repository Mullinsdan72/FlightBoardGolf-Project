import { Image, StyleSheet, View } from 'react-native';

/**
 * The Flight Board lockup, for the screens somebody meets before they've used
 * the app: the setup run-through and the invite landing.
 *
 * Deliberately not on the scoring screens. Once you're playing, the screen's job
 * is the hole number and your score — a logo there is just something else
 * competing for a glance you're taking between shots.
 *
 * The artwork is dark text on a transparent background, so it belongs on the
 * light background only. `scripts/build-icons.py` regenerates it from
 * `assets/flightboard-wordmark.png`.
 */
export function Wordmark({ width = 190 }: { width?: number }) {
  return (
    <View style={styles.wrap}>
      <Image
        source={require('@/../assets/images/wordmark.png')}
        style={{ width, height: width * (275 / 1200) }}
        resizeMode="contain"
        accessibilityLabel="Flight Board Golf"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-start' },
});

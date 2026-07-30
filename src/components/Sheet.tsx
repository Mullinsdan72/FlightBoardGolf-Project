import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '@/theme';

export type SheetOption = {
  key: string;
  label: string;
  /** Right-hand detail — a yardage, a count, whatever the number is. */
  detail?: string;
  /** Marked as the current value. */
  selected?: boolean;
};

/**
 * A bottom sheet of choices.
 *
 * The pattern behind the whole lobby: a tile shows its value, tapping it opens
 * this, tapping a row sets it and closes. **There is deliberately no Save** —
 * the tile is the state. A confirm step is a step you can forget, which is
 * exactly how a round ended up with teams on screen that were never drawn.
 *
 * The page stays visible behind the scrim so you never lose your place, and
 * Cancel sits gapped away from the choices so it can't be caught by a thumb
 * reaching for the last option.
 */
export function Sheet({
  visible,
  title,
  options,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SheetOption[];
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tapping the dimmed page behind is the gesture everyone tries first. */}
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <ScrollView bounces={false} style={styles.list}>
            {options.map((o) => (
              <Pressable
                key={o.key}
                onPress={() => {
                  onPick(o.key);
                  onClose();
                }}
                style={[styles.row, o.selected && styles.rowOn]}
              >
                <Text style={[styles.rowLabel, o.selected && styles.rowLabelOn]}>{o.label}</Text>
                {o.detail ? <Text style={styles.rowDetail}>{o.detail}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <Pressable onPress={onClose} style={styles.cancel}>
          <Text style={styles.cancelLabel}>CANCEL</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(32,30,29,0.45)' },
  dock: { paddingHorizontal: 12, backgroundColor: 'transparent' },
  card: { backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.text },
  title: {
    fontFamily: font.bodySemi,
    fontSize: 10.5,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 15,
    borderBottomWidth: 2,
    borderColor: colors.divider,
  },
  list: { maxHeight: 420 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 19,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: colors.divider,
  },
  rowOn: { backgroundColor: 'rgba(236,48,19,0.08)' },
  rowLabel: { fontFamily: font.heading, fontSize: 17, color: colors.text },
  rowLabelOn: { color: colors.accent },
  rowDetail: { fontFamily: font.body, fontSize: 12.5, color: colors.muted },
  cancel: {
    marginTop: 10,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.divider,
  },
  cancelLabel: { fontFamily: font.heading, fontSize: 13, letterSpacing: 0.8, color: colors.text },
});

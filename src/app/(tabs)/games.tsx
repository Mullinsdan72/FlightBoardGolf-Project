import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlayerPicker } from '@/components/PlayerPicker';
import { useRound } from '@/context/RoundContext';
import { fmtMoney, parThreeDraw } from '@/lib/wolf';
import { colors, font } from '@/theme';

type Tab = 'standings' | 'setup';

const MULTIPLIERS = [2, 3, 4];

export default function GamesScreen() {
  const {
    myId,
    choose,
    players,
    holes,
    wolf,
    wolfLoaded,
    wolfOrder,
    wolfDecisions,
    wolfSetSettings,
    wolfShuffleOrder,
    wolfLedger,
    wolfPayments,
    wolfHolesDecided,
  } = useRound();
  const [tab, setTab] = useState<Tab>('standings');

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown';
  const firstNameOf = (id: string) => nameOf(id).split(' ')[0];

  // The ledger marks your own holes and your own swing, so it needs to know who
  // you are before it can render anything honestly.
  if (!wolfLoaded || myId === undefined) return <View style={styles.screen} />;
  if (!myId) return <PlayerPicker players={players} onChoose={choose} />;

  const canPlay = players.length >= 3;
  const par3s = parThreeDraw(wolfOrder, holes, wolfDecisions);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Side games</Text>
        <Text style={styles.title}>Wolf</Text>
      </View>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tabBtn, styles.tabDivider]} onPress={() => setTab('standings')}>
          <Text style={styles.tabLabel}>STANDINGS</Text>
          {tab === 'standings' && <View style={styles.tabUnderline} />}
        </Pressable>
        <Pressable style={styles.tabBtn} onPress={() => setTab('setup')}>
          <Text style={styles.tabLabel}>SETUP</Text>
          {tab === 'setup' && <View style={styles.tabUnderline} />}
        </Pressable>
      </View>

      <ScrollView>
        {!canPlay && (
          <Text style={styles.note}>
            Wolf needs at least three players — one wolf and two to play against. Add players on the FIELD tab.
          </Text>
        )}

        {tab === 'setup' && canPlay && (
          <>
            <Pressable
              onPress={() => wolfSetSettings({ enabled: !wolf.enabled })}
              style={[styles.toggleRow, wolf.enabled && styles.toggleRowOn]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>{wolf.enabled ? 'Wolf is running' : 'Wolf is off'}</Text>
                <Text style={styles.toggleSub}>
                  {wolf.enabled
                    ? 'The prompt shows at every tee on the Score tab.'
                    : 'Turn it on to pick a wolf each hole and track the money.'}
                </Text>
              </View>
              <View style={[styles.switchBox, wolf.enabled && styles.switchBoxOn]}>
                <Text style={[styles.switchMark, wolf.enabled && { color: colors.white }]}>
                  {wolf.enabled ? '✓' : ''}
                </Text>
              </View>
            </Pressable>

            <Text style={styles.sectionLabel}>Stake a hole</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => wolfSetSettings({ stake: Math.max(0, wolf.stake - 1) })}
                style={[styles.stepBtn, styles.stepBtnRight]}
              >
                <Text style={styles.stepGlyph}>−</Text>
              </Pressable>
              <View style={styles.stepValue}>
                <Text style={styles.stepValueText}>${wolf.stake}</Text>
              </View>
              <Pressable
                onPress={() => wolfSetSettings({ stake: Math.min(500, wolf.stake + 1) })}
                style={[styles.stepBtn, styles.stepBtnLeft]}
              >
                <Text style={styles.stepGlyph}>+</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>Lone wolf multiplier</Text>
            <View style={styles.multRow}>
              {MULTIPLIERS.map((m) => {
                const on = wolf.loneMultiplier === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => wolfSetSettings({ loneMultiplier: m })}
                    style={[styles.multBtn, on && styles.multBtnOn]}
                  >
                    <Text style={[styles.multLabel, on && { color: colors.white }]}>{m}×</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.note}>
              Going alone is worth {fmtMoney(wolf.stake * wolf.loneMultiplier * 100).replace('+', '')} a man — beat all{' '}
              {players.length - 1} and you take{' '}
              {fmtMoney(wolf.stake * wolf.loneMultiplier * (players.length - 1) * 100).replace('+', '')}; lose and you
              pay the same.
            </Text>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>Rotation</Text>
              <Pressable onPress={wolfShuffleOrder} style={styles.shuffleBtn}>
                <Text style={styles.shuffleLabel}>SHUFFLE</Text>
              </Pressable>
            </View>
            {wolfOrder.map((id, i) => (
              <View key={id} style={styles.orderRow}>
                <Text style={styles.orderNum}>{i + 1}</Text>
                <Text style={styles.orderName}>
                  {nameOf(id)}
                  {id === myId ? ' (you)' : ''}
                </Text>
                <Text style={styles.orderMeta}>wolf on {i + 1}, {i + 1 + wolfOrder.length}, …</Text>
              </View>
            ))}
            {wolfHolesDecided > 0 && (
              <Text style={styles.warnNote}>
                {wolfHolesDecided} hole{wolfHolesDecided === 1 ? '' : 's'} already decided. Shuffling now only changes
                who's up on holes still to come — it can't rewrite what's been played.
              </Text>
            )}

            {par3s.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Who gets the par 3s</Text>
                <View style={styles.par3Row}>
                  {par3s.map((p) => (
                    <View key={p.hole} style={styles.par3Cell}>
                      <Text style={styles.par3Hole}>{p.hole}</Text>
                      <Text
                        style={[styles.par3Name, p.playerId === myId && { color: colors.accent }]}
                        numberOfLines={1}
                      >
                        {p.playerId ? firstNameOf(p.playerId) : '–'}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.note}>
                  Eighteen holes don't divide evenly by {wolfOrder.length}, so a fixed rotation hands the same seat most
                  of the short holes — and going alone on a par 3 is the good draw. Shuffle until this looks fair.
                </Text>
              </>
            )}
          </>
        )}

        {tab === 'standings' && canPlay && (
          <>
            {!wolf.enabled && <Text style={styles.note}>Wolf is off. Turn it on under SETUP.</Text>}

            <Text style={styles.sectionLabel}>Where everyone stands</Text>
            {players
              .map((p) => ({ p, cents: wolfLedger.totals[p.id] ?? 0 }))
              .sort((a, b) => b.cents - a.cents)
              .map(({ p, cents }) => (
                <View key={p.id} style={[styles.standRow, p.id === myId && styles.rowYou]}>
                  <Text style={styles.standName}>
                    {p.name}
                    {p.id === myId ? ' (you)' : ''}
                  </Text>
                  <Text
                    style={[
                      styles.standVal,
                      { color: cents > 0 ? colors.accent : cents < 0 ? colors.text : colors.mutedFaint },
                    ]}
                  >
                    {cents === 0 ? 'square' : fmtMoney(cents)}
                  </Text>
                </View>
              ))}

            <Text style={styles.sectionLabel}>Who pays who</Text>
            {wolfPayments.length === 0 ? (
              <Text style={styles.note}>Nothing to settle yet — nobody's up or down.</Text>
            ) : (
              wolfPayments.map((pay, i) => (
                <View
                  key={`${pay.fromId}-${pay.toId}-${i}`}
                  style={[styles.payRow, (pay.fromId === myId || pay.toId === myId) && styles.rowYou]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payFrom}>{nameOf(pay.fromId)}</Text>
                    <Text style={styles.payTo}>pays {nameOf(pay.toId)}</Text>
                  </View>
                  <Text style={styles.payAmount}>{fmtMoney(pay.cents).replace('+', '')}</Text>
                </View>
              ))
            )}
            <Text style={styles.note}>
              Netted to the fewest payments that clear the group, so nobody hands over money they're owed straight back.
              Flight Board tracks who owes who and never moves any money.
            </Text>

            <Text style={styles.sectionLabel}>Hole by hole</Text>
            {wolfLedger.rows.length === 0 ? (
              <Text style={styles.note}>No holes decided yet. The wolf picks at the tee, on the Score tab.</Text>
            ) : (
              <>
                <View style={styles.ledgerHead}>
                  <Text style={[styles.lh, styles.colHole]}>H</Text>
                  <Text style={[styles.lh, styles.colWolf]}>WOLF</Text>
                  <Text style={[styles.lh, styles.colWith]}>WITH</Text>
                  <Text style={[styles.lh, styles.colSwing]}>YOU</Text>
                </View>
                {wolfLedger.rows.map((r) => {
                  const mine = wolfLedger.rows.length ? (r.swings[myId] ?? 0) : 0;
                  return (
                    <View key={r.hole} style={[styles.ledgerRow, r.wolfId === myId && styles.rowYou]}>
                      <Text style={[styles.ldHole, styles.colHole]}>{r.hole}</Text>
                      <Text style={[styles.ldName, styles.colWolf]} numberOfLines={1}>
                        {firstNameOf(r.wolfId)}
                      </Text>
                      <Text
                        style={[styles.ldWith, styles.colWith, r.lone && { color: colors.accent }]}
                        numberOfLines={1}
                      >
                        {r.lone ? `LONE ${wolf.loneMultiplier}×` : firstNameOf(r.partnerId as string)}
                      </Text>
                      <View style={styles.colSwing}>
                        {r.outcome === 'pending' ? (
                          <Text style={styles.ldPending}>open</Text>
                        ) : r.outcome === 'push' ? (
                          <Text style={styles.ldPush}>push</Text>
                        ) : (
                          <Text style={[styles.ldSwing, { color: mine > 0 ? colors.accent : colors.text }]}>
                            {fmtMoney(mine)}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
                <Text style={styles.note}>
                  "Open" means the hole isn't scored yet — every player has to post before a hole pays. A tie on best
                  ball is a push and moves nothing.
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 12 },
  kicker: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.accent },
  title: { fontFamily: font.heading, fontSize: 28, letterSpacing: -0.6, marginTop: 8, color: colors.text },
  tabRow: { flexDirection: 'row', borderTopWidth: 2, borderBottomWidth: 2, borderColor: colors.divider },
  tabBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
  tabDivider: { borderRightWidth: 1, borderRightColor: colors.divider },
  tabLabel: { fontFamily: font.heading, fontSize: 11, letterSpacing: 0.5, color: colors.text },
  tabUnderline: { height: 3, backgroundColor: colors.accent, marginTop: 9 },

  sectionLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 20 },
  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, paddingHorizontal: 20, paddingTop: 12 },
  warnNote: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.accent, paddingHorizontal: 20, paddingTop: 12 },
  rowYou: { backgroundColor: 'rgba(236,48,19,0.06)' },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderColor: colors.divider,
  },
  toggleRowOn: { backgroundColor: 'rgba(236,48,19,0.06)' },
  toggleTitle: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  toggleSub: { fontFamily: font.body, fontSize: 11, lineHeight: 16, color: colors.muted, marginTop: 4 },
  switchBox: { width: 26, height: 26, borderWidth: 2, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  switchBoxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  switchMark: { fontFamily: font.heading, fontSize: 14, color: colors.text },

  stepper: { flexDirection: 'row', borderWidth: 2, borderColor: colors.divider, marginHorizontal: 20 },
  stepBtn: { width: 66, height: 60, alignItems: 'center', justifyContent: 'center' },
  stepBtnRight: { borderRightWidth: 2, borderColor: colors.divider },
  stepBtnLeft: { borderLeftWidth: 2, borderColor: colors.divider },
  stepGlyph: { fontFamily: font.heading, fontSize: 28, color: colors.text },
  stepValue: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stepValueText: { fontFamily: font.heading, fontSize: 28, color: colors.text },

  multRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  multBtn: { flex: 1, borderWidth: 2, borderColor: colors.divider, paddingVertical: 16, alignItems: 'center' },
  multBtnOn: { backgroundColor: colors.text, borderColor: colors.text },
  multLabel: { fontFamily: font.heading, fontSize: 16, color: colors.text },

  shuffleBtn: { borderWidth: 2, borderColor: colors.text, paddingVertical: 9, paddingHorizontal: 12, marginTop: 8 },
  shuffleLabel: { fontFamily: font.heading, fontSize: 10, letterSpacing: 0.9, color: colors.text },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  orderNum: { fontFamily: font.heading, fontSize: 15, width: 20, color: colors.mutedFaint },
  orderName: { flex: 1, fontFamily: font.heading, fontSize: 15, color: colors.text },
  orderMeta: { fontFamily: font.body, fontSize: 10.5, color: colors.muted },

  par3Row: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  par3Cell: { flex: 1, borderWidth: 2, borderColor: colors.divider, paddingVertical: 12, alignItems: 'center' },
  par3Hole: { fontFamily: font.heading, fontSize: 18, color: colors.text },
  par3Name: { fontFamily: font.body, fontSize: 10.5, color: colors.muted, marginTop: 5 },

  standRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  standName: { flex: 1, fontFamily: font.bodySemi, fontSize: 14, color: colors.text },
  standVal: { fontFamily: font.heading, fontSize: 18 },

  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  payFrom: { fontFamily: font.heading, fontSize: 16, color: colors.text },
  payTo: { fontFamily: font.body, fontSize: 11.5, color: colors.muted, marginTop: 3 },
  payAmount: { fontFamily: font.heading, fontSize: 22, color: colors.accent },

  ledgerHead: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderColor: colors.divider,
  },
  lh: { fontFamily: font.heading, fontSize: 9, letterSpacing: 0.9, color: colors.muted },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: colors.divider,
  },
  colHole: { width: 28 },
  colWolf: { flex: 1, paddingRight: 8 },
  colWith: { flex: 1, paddingRight: 8 },
  colSwing: { width: 62, alignItems: 'flex-end' },
  ldHole: { fontFamily: font.heading, fontSize: 14, color: colors.mutedFaint },
  ldName: { fontFamily: font.bodySemi, fontSize: 13.5, color: colors.text },
  ldWith: { fontFamily: font.body, fontSize: 12, color: colors.muted },
  ldSwing: { fontFamily: font.heading, fontSize: 15 },
  ldPending: { fontFamily: font.body, fontSize: 11, color: colors.ghost },
  ldPush: { fontFamily: font.body, fontSize: 11, color: colors.muted },
});

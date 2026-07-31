import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRound } from '@/context/RoundContext';
import { allowanceFor, formatName, handicapName, type HandicapMode, type TeamFormat } from '@/lib/teams';
import { colors, font, fmtToPar } from '@/theme';

const SIZES = [1, 2, 3, 4];
const FORMATS: TeamFormat[] = ['bestball', 'total'];

const HANDICAP_MODES: Array<{ mode: HandicapMode; label: string }> = [
  { mode: 'gross', label: 'GROSS' },
  { mode: 'net', label: 'NET' },
  { mode: 'lowman', label: 'LOW MAN' },
];

const HANDICAP_NOTE: Record<HandicapMode, string> = {
  gross:
    'Strokes as played, handicaps ignored. Fine when everyone plays off much the same mark; a mixed group usually wants one of the other two.',
  net: 'Every player gets their full handicap, hole by hole off the stroke index — the same allocation as the net figure on their own card. In a best ball the low net ball wins the hole, which is not always the low gross one.',
  lowman:
    'The best player in the game plays off scratch and everyone else gets the difference. Fewer shots change hands than full net, and they are given inside the group rather than against par. The usual way a fourball is played.',
};

const FORMAT_NOTE: Record<TeamFormat, string> = {
  bestball:
    "Everyone plays their own ball; the team takes the low score on each hole. Score entry doesn't change — you post your own number as usual.",
  total:
    "Everyone plays their own ball and posts their own card; the team score is every player's total added together. A solo player simply carries their own number.",
};

export default function TeamsScreen() {
  const {
    myId,
    players,
    amOrganizer,
    activeRound,
    teams,
    teamsLoaded,
    teamsError,
    teamSegments,
    teamSegIndex,
    setTeamSegIndex,
    teamRoster,
    teamUnassigned,
    teamDrawSaved,
    teamStandings,
    teamMaxCount,
    teamSetSettings,
    setScoringMode,
    teamAutoDraw,
    teamAcceptDraw,
    teamRedraw,
    teamAssign,
    teamClear,
  } = useRound();

  const [picked, setPicked] = useState<string | null>(null);

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown';
  const hcpOf = (id: string) => players.find((p) => p.id === id)?.handicap ?? 0;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  // Spell out who's giving shots to whom. "Off the low man" is only fair if
  // everybody can see which mark it's measured from.
  const inGame = players.filter((p) => teamRoster.some((ids) => ids.includes(p.id)));
  const pool = inGame.length ? inGame : players;
  const lowMan = pool.reduce<(typeof pool)[number] | null>(
    (best, p) => (best == null || p.handicap < best.handicap ? p : best),
    null,
  );
  const lowManName = lowMan?.name ?? null;
  const lowManHcp = lowMan?.handicap ?? 0;
  const shotList = allowanceFor(pool, 'lowman')
    .filter((p) => p.handicap > 0)
    .map((p) => `${players.find((q) => q.id === p.id)?.name ?? '?'} ${p.handicap}`)
    .join(', ') || 'nobody, everyone is off the same mark';

  // Report failures rather than leaving a button that looks broken — a save that
  // silently does nothing is indistinguishable from a missing table.
  const run = async (action: () => Promise<string | null>, what: string) => {
    const message = await action();
    if (message) Alert.alert(`Could not ${what}`, message);
  };

  const tapPlayer = (id: string) => {
    if (!amOrganizer) return;
    setPicked((prev) => (prev === id ? null : id));
  };

  const tapTeam = async (teamIndex: number) => {
    if (!amOrganizer || !picked) return;
    const who = picked;
    setPicked(null);
    await run(() => teamAssign(who, teamIndex), 'move that player');
  };

  const confirmClear = () =>
    Alert.alert('Clear these teams?', 'The draw for this stretch of holes is removed. Scores are untouched.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => run(() => teamClear(), 'clear the draw') },
    ]);

  // A loading screen with no way off it is a trap, and this one was: the header
  // rendered, the body said "Loading…", and if the flag never settled there was
  // nothing to tap. Every early return from here carries the same DONE control
  // the loaded screen has.
  if (!teamsLoaded) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header]}>
          <Text style={styles.kicker}>{activeRound?.name || 'Round'}</Text>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Teams</Text>
            <Pressable onPress={goBack} style={styles.doneBtn} hitSlop={8}>
              <Text style={styles.doneLabel}>DONE</Text>
              <Text style={styles.doneArrow}>→</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.note}>Loading…</Text>
      </View>
    );
  }

  const segment = teamSegments[teamSegIndex];
  const enoughPlayers = players.length >= 2;

  return (
    <View style={styles.screen}>
      <View style={[styles.header]}>
        <Text style={styles.kicker}>{activeRound?.name || 'Round'}</Text>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Teams</Text>
          <Pressable onPress={goBack} style={styles.doneBtn} hitSlop={8}>
            <Text style={styles.doneLabel}>DONE</Text>
            <Text style={styles.doneArrow}>→</Text>
          </Pressable>
        </View>
      </View>

      {!!teamsError && <Text style={styles.error}>{teamsError}</Text>}

      {/* Terms are visible to everyone playing under them and editable only by
          the organizer. Hiding them from someone whose money is on it would be
          the wrong instinct — the same rule the Wolf setup tab follows. */}
      {!amOrganizer && (
        <View style={styles.readOnlyBar}>
          <Text style={styles.readOnlyText}>
            Whoever's running the round draws the teams. You can see everything here; you just can't change it.
          </Text>
        </View>
      )}

      <ScrollView>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Play in teams</Text>
            <Text style={styles.toggleNote}>
              {teams.enabled ? 'Team standings show below.' : 'Off — the round is scored individually.'}
            </Text>
          </View>
          <Pressable
            onPress={() => amOrganizer && teamSetSettings({ enabled: !teams.enabled })}
            disabled={!amOrganizer}
            style={[styles.switch, teams.enabled && styles.switchOn, !amOrganizer && styles.disabled]}
          >
            <Text style={[styles.switchLabel, teams.enabled && styles.switchLabelOn]}>
              {teams.enabled ? 'ON' : 'OFF'}
            </Text>
          </Pressable>
        </View>

        {!enoughPlayers && (
          <Text style={styles.note}>
            Add at least two players on the PLAYERS tab before drawing teams.
          </Text>
        )}

        <Text style={styles.sectionLabel}>How teams play</Text>
        {FORMATS.map((f) => (
          <Pressable
            key={f}
            onPress={() => amOrganizer && teamSetSettings({ format: f })}
            disabled={!amOrganizer}
            style={[styles.optionRow, teams.format === f && styles.optionOn]}
          >
            <View style={[styles.radio, teams.format === f && styles.radioOn]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.optionLabel}>{formatName(f).toUpperCase()}</Text>
              <Text style={styles.optionNote}>{FORMAT_NOTE[f]}</Text>
            </View>
          </Pressable>
        ))}
        <Text style={styles.note}>
          Scramble, alternate shot and shamble aren't here yet: they need one number per group instead of one per player,
          which changes score entry rather than teams.
        </Text>

        {/* This is the round's setting, not the team game's — it governs the
            leaderboard and every side game too. Editable here because this is
            where you're thinking about it, but it is not scoped to teams. */}
        <Text style={styles.sectionLabel}>Handicaps · whole round</Text>
        <View style={styles.sizeRow}>
          {HANDICAP_MODES.map(({ mode, label }) => (
            <Pressable
              key={mode}
              onPress={() => amOrganizer && setScoringMode(mode)}
              disabled={!amOrganizer}
              style={[styles.modeBtn, teams.handicapMode === mode && styles.sizeBtnOn]}
            >
              <Text style={[styles.modeLabel, teams.handicapMode === mode && styles.sizeLabelOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.note}>{HANDICAP_NOTE[teams.handicapMode]}</Text>
        {teams.handicapMode === 'lowman' && lowManName && (
          <Text style={styles.note}>
            {lowManName} is the low man here, off {lowManHcp}, so they play off scratch. Everyone else gets the gap:{' '}
            {shotList}.
          </Text>
        )}

        <Text style={styles.sectionLabel}>Team size</Text>
        <View style={styles.sizeRow}>
          {SIZES.map((s) => (
            <Pressable
              key={s}
              onPress={() =>
                amOrganizer &&
                teamSetSettings({
                  size: s,
                  // Keep the count buildable with the field you actually have.
                  count: Math.max(1, Math.min(teams.count, Math.floor(players.length / s) || 1)),
                })
              }
              disabled={!amOrganizer}
              style={[styles.sizeBtn, teams.size === s && styles.sizeBtnOn]}
            >
              <Text style={[styles.sizeLabel, teams.size === s && styles.sizeLabelOn]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.counterRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>How many teams</Text>
            <Text style={styles.toggleNote}>
              {teams.count} × {teams.size} needs {teams.count * teams.size} players. You have {players.length}
              {teams.count * teams.size > players.length ? ' — some teams will be short.' : '.'}
            </Text>
          </View>
          <Pressable
            onPress={() => amOrganizer && teamSetSettings({ count: Math.max(1, teams.count - 1) })}
            disabled={!amOrganizer}
            style={[styles.stepBtn, !amOrganizer && styles.disabled]}
          >
            <Text style={styles.stepLabel}>−</Text>
          </Pressable>
          <Text style={styles.counterVal}>{teams.count}</Text>
          <Pressable
            onPress={() => amOrganizer && teamSetSettings({ count: Math.min(26, teams.count + 1) })}
            disabled={!amOrganizer}
            style={[styles.stepBtn, !amOrganizer && styles.disabled]}
          >
            <Text style={styles.stepLabel}>+</Text>
          </Pressable>
        </View>
        {teamMaxCount < teams.count && (
          <Text style={styles.warnText}>
            {players.length} players fill {teamMaxCount} full team{teamMaxCount === 1 ? '' : 's'} of {teams.size}.
          </Text>
        )}

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Re-draw at the turn</Text>
            <Text style={styles.toggleNote}>
              {teamSegments.length > 1
                ? 'Two sets of teams — new partners for the second half.'
                : 'Needs a full 18 to have a turn to re-draw at.'}
            </Text>
          </View>
          <Pressable
            onPress={() => amOrganizer && teamSetSettings({ redrawAtTurn: !teams.redrawAtTurn })}
            disabled={!amOrganizer}
            style={[styles.switch, teams.redrawAtTurn && styles.switchOn, !amOrganizer && styles.disabled]}
          >
            <Text style={[styles.switchLabel, teams.redrawAtTurn && styles.switchLabelOn]}>
              {teams.redrawAtTurn ? 'ON' : 'OFF'}
            </Text>
          </Pressable>
        </View>

        {teamSegments.length > 1 && (
          <View style={styles.segRow}>
            {teamSegments.map((s, i) => (
              <Pressable
                key={s.label}
                onPress={() => setTeamSegIndex(i)}
                style={[styles.segBtn, i < teamSegments.length - 1 && styles.segDivider]}
              >
                <Text style={[styles.segLabel, i === teamSegIndex && styles.segLabelOn]}>{s.label}</Text>
                {i === teamSegIndex && <View style={styles.segUnderline} />}
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.sectionLabel}>The draw · {segment?.label ?? ''}</Text>

        {/* The teams below are a suggestion until somebody says so. That used to
            be six grey words in the section label, which is nowhere near enough
            for something that decides whether the leaderboard has a TEAMS tab
            at all — you'd set the round up, see teams on screen, and find the
            board reporting none drawn. */}
        {teams.enabled && !teamDrawSaved && (
          <View style={styles.unsavedBox}>
            <Text style={styles.unsavedTitle}>These teams are only a suggestion</Text>
            <Text style={styles.unsavedBody}>
              Nothing is drawn until you accept it, so the leaderboard won't show teams and no team bet is on. Move
              anyone you like first — accepting saves whatever is on screen.
            </Text>
            {amOrganizer && (
              <Pressable onPress={() => run(() => teamAcceptDraw(), 'save the draw')} style={styles.unsavedBtn}>
                <Text style={styles.unsavedBtnLabel}>USE THESE TEAMS</Text>
                <Text style={styles.unsavedBtnArrow}>→</Text>
              </Pressable>
            )}
          </View>
        )}

        {amOrganizer && (
          <View style={styles.actionRow}>
            <Pressable onPress={() => run(() => teamAutoDraw(), 'draw the teams')} style={styles.actionBtn}>
              <Text style={styles.actionLabel}>AUTO DRAW</Text>
            </Pressable>
            <Pressable onPress={() => run(() => teamRedraw(), 're-draw the teams')} style={styles.actionBtn}>
              <Text style={styles.actionLabel}>RE-DRAW</Text>
            </Pressable>
            {teamDrawSaved && (
              <Pressable onPress={confirmClear} style={styles.actionBtn}>
                <Text style={styles.actionLabel}>CLEAR</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text style={styles.note}>
          Auto draw balances the teams by handicap — lowest with highest, so no team is stacked. Re-draw gives different
          partners, taking the fairest arrangement that actually changes who plays with whom. With only four players
          there are three possible pairings and one of them is the fair one, so a re-draw there costs some balance;
          nothing can avoid that.
        </Text>
        {amOrganizer && (
          <Text style={styles.note}>
            You can always set the teams by hand instead, and a hand-made team is never overwritten unless you tap auto
            draw or re-draw again. Tap a player to pick them up, then tap a team to put them there — or tap "take off
            their team" to move them to nobody. To swap two players, move the first across and then move one of the
            others back; a team can hold more than its size for as long as it takes you.
          </Text>
        )}

        {picked && (
          <View style={styles.pickedBar}>
            <Text style={styles.pickedText}>{nameOf(picked)} — now tap a team</Text>
            <Pressable onPress={() => setPicked(null)} hitSlop={8}>
              <Text style={styles.pickedCancel}>CANCEL</Text>
            </Pressable>
          </View>
        )}

        {teamRoster.map((ids, i) => {
          const standing = teamStandings.find((s) => s.teamIndex === i);
          const combined = ids.reduce((n, id) => n + hcpOf(id), 0);
          return (
            <View key={i} style={styles.teamBlock}>
              <Pressable onPress={() => tapTeam(i)} disabled={!amOrganizer || !picked} style={styles.teamHead}>
                <Text style={styles.teamLetter}>{standing?.letter ?? String.fromCharCode(65 + i)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.teamName}>Team {String.fromCharCode(65 + i)}</Text>
                  <Text style={styles.teamMeta}>
                    {ids.length
                      ? `${ids.length} player${ids.length === 1 ? '' : 's'} · combined HCP ${combined}`
                      : 'Empty'}
                  </Text>
                </View>
                {teams.enabled && standing && (
                  <View style={styles.teamScoreCol}>
                    <Text
                      style={[
                        styles.teamToPar,
                        { color: (standing.toPar ?? 0) < 0 ? colors.accent : colors.text },
                      ]}
                    >
                      {standing.toPar == null ? '–' : fmtToPar(standing.toPar)}
                    </Text>
                    <Text style={styles.teamThru}>
                      {standing.holesCounted ? `${standing.holesCounted} in` : 'no holes in'}
                    </Text>
                  </View>
                )}
                {amOrganizer && picked && <Text style={styles.dropHint}>PUT HERE ›</Text>}
              </Pressable>
              {ids.map((id) => (
                <Pressable
                  key={id}
                  onPress={() => tapPlayer(id)}
                  disabled={!amOrganizer}
                  style={[styles.memberRow, picked === id && styles.memberPicked]}
                >
                  <Text style={styles.memberName}>
                    {nameOf(id)}
                    {id === myId ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.memberHcp}>HCP {hcpOf(id)}</Text>
                </Pressable>
              ))}
            </View>
          );
        })}

        <Text style={styles.sectionLabel}>Not on a team · {teamUnassigned.length}</Text>
        {/* The drop target has to be here even when the pool is empty, or a full
            set of teams has no way to take somebody off one — with four players
            in two pairs that was every swap you'd actually want to make. */}
        {(teamUnassigned.length > 0 || (amOrganizer && picked)) && (
          <Pressable onPress={() => tapTeam(-1)} disabled={!amOrganizer || !picked} style={styles.poolHead}>
            <Text style={[styles.poolLabel, picked && amOrganizer && styles.poolLabelActive]}>
              {picked && amOrganizer ? 'TAKE OFF THEIR TEAM ›' : 'Waiting for a team'}
            </Text>
          </Pressable>
        )}
        {teamUnassigned.length === 0 && !picked && <Text style={styles.note}>Everybody has a team.</Text>}
        {teamUnassigned.map((id) => (
          <Pressable
            key={id}
            onPress={() => tapPlayer(id)}
            disabled={!amOrganizer}
            style={[styles.memberRow, picked === id && styles.memberPicked]}
          >
            <Text style={styles.memberName}>
              {nameOf(id)}
              {id === myId ? ' (you)' : ''}
            </Text>
            <Text style={styles.memberHcp}>HCP {hcpOf(id)}</Text>
          </Pressable>
        ))}

        {teams.enabled && (
          <>
            <Text style={styles.sectionLabel}>
              Standings · {formatName(teams.format)} · {handicapName(teams.handicapMode)}
            </Text>
            {teamStandings.map((s, i) => (
              <View key={s.teamIndex} style={styles.standingRow}>
                <Text style={styles.pos}>{s.toPar == null ? '–' : i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.standingName}>
                    Team {String.fromCharCode(65 + s.teamIndex)}
                    {myId && s.playerIds.includes(myId) ? ' (yours)' : ''}
                  </Text>
                  <Text style={styles.standingMeta}>
                    {s.playerIds.length ? s.playerIds.map(nameOf).join(' · ') : 'Nobody on it'}
                  </Text>
                </View>
                <View style={styles.teamScoreCol}>
                  <Text style={[styles.teamToPar, { color: (s.toPar ?? 0) < 0 ? colors.accent : colors.text }]}>
                    {s.toPar == null ? '–' : fmtToPar(s.toPar)}
                  </Text>
                  <Text style={styles.teamThru}>
                    {s.strokes == null ? '–' : `${s.strokes} strokes`}
                  </Text>
                </View>
              </View>
            ))}
            <Text style={styles.note}>
              A hole counts once every player on the team has posted it — half a best ball is not a best ball, and the
              number would drop the moment the last player posts. To-par is measured over the holes that counted, so a
              team two holes behind isn't flattered by the ones it hasn't played.
              {teams.format === 'total' ? " A team total is measured against par for every card, not one." : ''}
              {teams.handicapMode === 'gross'
                ? ' Gross: handicaps are not applied.'
                : ` Played ${handicapName(teams.handicapMode)}: each score has that player’s strokes for the hole taken off before the team’s is worked out.`}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  error: { fontFamily: font.body, fontSize: 12, color: colors.accent, paddingHorizontal: 20, paddingTop: 12 },
  screen: { flex: 1, backgroundColor: colors.bg },
  headerInSetup: { paddingTop: 18 },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  kicker: { fontFamily: font.bodySemi, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.accent },
  title: { fontFamily: font.heading, fontSize: 28, letterSpacing: -0.6, marginTop: 8, color: colors.text },
  doneBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 4 },
  doneLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.6, color: colors.accent },
  doneArrow: { fontFamily: font.heading, fontSize: 14, color: colors.accent },
  readOnlyBar: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 2, borderBottomWidth: 2, borderColor: colors.divider },
  readOnlyText: { fontFamily: font.body, fontSize: 11.5, lineHeight: 17, color: colors.muted },
  sectionLabel: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  note: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, paddingHorizontal: 20, paddingTop: 12 },
  unsavedBox: {
    marginHorizontal: 20,
    borderWidth: 2,
    borderColor: colors.accent,
    padding: 16,
    marginBottom: 4,
  },
  unsavedTitle: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  unsavedBody: { fontFamily: font.body, fontSize: 11.5, lineHeight: 18, color: colors.muted, marginTop: 8 },
  unsavedBtn: {
    marginTop: 14,
    height: 56,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  unsavedBtnLabel: { fontFamily: font.heading, fontSize: 14, letterSpacing: 0.4, color: '#fff' },
  unsavedBtnArrow: { fontFamily: font.heading, fontSize: 18, color: '#fff' },
  warnText: { fontFamily: font.body, fontSize: 11.5, lineHeight: 17, color: colors.accent, paddingHorizontal: 20, paddingTop: 10 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 2,
    borderColor: colors.divider,
    marginTop: 16,
  },
  toggleTitle: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  toggleNote: { fontFamily: font.body, fontSize: 11, lineHeight: 16, color: colors.muted, marginTop: 5 },
  switch: { borderWidth: 2, borderColor: colors.text, paddingVertical: 9, paddingHorizontal: 14, minWidth: 58, alignItems: 'center' },
  switchOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  switchLabel: { fontFamily: font.heading, fontSize: 11, letterSpacing: 0.9, color: colors.text },
  switchLabelOn: { color: '#fff' },
  disabled: { opacity: 0.35 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  optionOn: { backgroundColor: 'rgba(236,48,19,0.06)' },
  radio: { width: 12, height: 12, borderWidth: 2, borderColor: colors.text, marginTop: 3 },
  radioOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  optionLabel: { fontFamily: font.heading, fontSize: 13, letterSpacing: 0.4, color: colors.text },
  optionNote: { fontFamily: font.body, fontSize: 11, lineHeight: 16, color: colors.muted, marginTop: 5 },
  sizeRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10 },
  sizeBtn: { flex: 1, borderWidth: 2, borderColor: colors.divider, paddingVertical: 14, alignItems: 'center' },
  modeBtn: { flex: 1, borderWidth: 2, borderColor: colors.divider, paddingVertical: 15, alignItems: 'center' },
  modeLabel: { fontFamily: font.heading, fontSize: 13, letterSpacing: 0.8, color: colors.text },
  sizeBtnOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  sizeLabel: { fontFamily: font.heading, fontSize: 18, color: colors.text },
  sizeLabelOn: { color: '#fff' },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: colors.divider,
    marginTop: 16,
  },
  stepBtn: { borderWidth: 2, borderColor: colors.text, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontFamily: font.heading, fontSize: 18, color: colors.text },
  counterVal: { fontFamily: font.heading, fontSize: 24, color: colors.text, minWidth: 34, textAlign: 'center' },
  segRow: { flexDirection: 'row', borderTopWidth: 2, borderBottomWidth: 2, borderColor: colors.divider, marginTop: 16 },
  segBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
  segDivider: { borderRightWidth: 1, borderRightColor: colors.divider },
  segLabel: { fontFamily: font.heading, fontSize: 11, letterSpacing: 0.5, color: colors.mutedFaint },
  segLabelOn: { color: colors.text },
  segUnderline: { height: 3, backgroundColor: colors.accent, marginTop: 9 },
  actionRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10 },
  actionBtn: { flex: 1, borderWidth: 2, borderColor: colors.text, paddingVertical: 13, alignItems: 'center' },
  actionLabel: { fontFamily: font.heading, fontSize: 11, letterSpacing: 0.8, color: colors.text },
  pickedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.text,
    paddingHorizontal: 20,
    paddingVertical: 13,
    marginTop: 16,
  },
  pickedText: { fontFamily: font.heading, fontSize: 12.5, color: '#fff' },
  pickedCancel: { fontFamily: font.heading, fontSize: 10.5, letterSpacing: 0.9, color: colors.accent },
  teamBlock: { borderTopWidth: 2, borderColor: colors.divider, marginTop: 16 },
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 13 },
  teamLetter: { fontFamily: font.heading, fontSize: 22, color: colors.accent, width: 24 },
  teamName: { fontFamily: font.heading, fontSize: 15, color: colors.text },
  teamMeta: { fontFamily: font.body, fontSize: 11, color: colors.muted, marginTop: 4 },
  teamScoreCol: { alignItems: 'flex-end' },
  teamToPar: { fontFamily: font.heading, fontSize: 20 },
  teamThru: { fontFamily: font.body, fontSize: 10, color: colors.muted, marginTop: 4 },
  dropHint: { fontFamily: font.heading, fontSize: 10, letterSpacing: 0.8, color: colors.accent },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingLeft: 56,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  memberPicked: { backgroundColor: 'rgba(236,48,19,0.12)' },
  memberName: { fontFamily: font.bodySemi, fontSize: 13.5, color: colors.text },
  memberHcp: { fontFamily: font.body, fontSize: 11, color: colors.muted },
  poolHead: { paddingHorizontal: 20, paddingVertical: 11, borderTopWidth: 2, borderColor: colors.divider },
  poolLabel: { fontFamily: font.heading, fontSize: 10.5, letterSpacing: 0.9, color: colors.muted },
  poolLabelActive: { color: colors.accent },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  pos: { fontFamily: font.heading, fontSize: 13, width: 22, color: colors.mutedFaint },
  standingName: { fontFamily: font.heading, fontSize: 14.5, color: colors.text },
  standingMeta: { fontFamily: font.body, fontSize: 11, color: colors.muted, marginTop: 4 },
});

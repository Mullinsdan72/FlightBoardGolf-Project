import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlayerPicker } from '@/components/PlayerPicker';
import { useRound } from '@/context/RoundContext';
import { holeGameName, holeGameShortName, type HoleGameType } from '@/lib/sideGames';
import { matchStateLabel } from '@/lib/teamChallenge';
import { fmtMoney, parThreeDraw } from '@/lib/wolf';
import { SetupBar, useInSetup } from '@/components/SetupBar';
import { colors, font } from '@/theme';

type Tab = 'standings' | 'setup' | 'holes' | 'challenge';

const TAB_LABEL: Record<Tab, string> = {
  standings: 'WOLF',
  holes: 'CTP · LD',
  challenge: 'TEAMS',
  setup: 'SET UP',
};

const MULTIPLIERS = [2, 3, 4];
const HOLE_GAME_TYPES: HoleGameType[] = ['ctp', 'ld'];
const WAGER_STEPS = [100, 200, 500, 1000, 2000];

export default function GamesScreen() {
  const {
    myId,
    choose,
    userId,
    claimPlayer,
    amOrganizer,
    organizerId,
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
    holeGames,
    holeGamesLoaded,
    holeGameLedgers,
    addHoleGame,
    removeHoleGame,
    updateHoleGame,
    setHoleGameWinner,
    teams,
    teamSegments,
    teamDrawSavedFor,
    challenge,
    challengeFor,
    setChallengeSettings,
  } = useRound();
  const inSetup = useInSetup();
  const [tab, setTab] = useState<Tab | null>(null);
  const [newType, setNewType] = useState<HoleGameType>('ctp');
  const [newWager, setNewWager] = useState(500);
  const [newHoles, setNewHoles] = useState<number[]>([]);

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown';
  const firstNameOf = (id: string) => nameOf(id).split(' ')[0];

  // The ledger marks your own holes and your own swing, so it needs to know who
  // you are before it can render anything honestly.
  if (!wolfLoaded || myId === undefined) return <View style={styles.screen} />;
  if (!myId) return <PlayerPicker players={players} onChoose={choose} userId={userId} onClaim={claimPlayer} />;

  const canPlay = players.length >= 3;
  const par3s = parThreeDraw(wolfOrder, holes, wolfDecisions);

  // Everyone can read the terms — you're owed that if you're in the bet — but
  // only the organizer sets them. Changing the stake or the rotation mid-round
  // changes what people are playing for, which isn't a player's call.
  //
  // Picking a partner or going alone is a different thing entirely: that's the
  // wolf's own decision each hole, gated to whoever has the wolf, not to the
  // organizer. See WolfPrompt.
  const canEdit = amOrganizer;
  const organizerName = organizerId ? players.find((p) => p.id === organizerId)?.name : null;

  // A game nobody has set up doesn't get a tab. Everything here is a bet the
  // organizer opened; until they do, there's nothing for a player to look at,
  // and four tabs of empty screens is worse than none.
  const available: Tab[] = [];
  if (wolf.enabled) available.push('standings');
  if (holeGames.length) available.push('holes');
  if (challenge.enabled) available.push('challenge');
  if (canEdit) available.push('setup');

  // Falls back as games are switched on and off under you.
  const active: Tab | null = tab && available.includes(tab) ? tab : (available[0] ?? null);

  return (
    <View style={styles.screen}>
      <SetupBar step="games" />
      <View style={[styles.header, inSetup && styles.headerInSetup]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>Side games</Text>
            <Text style={styles.title}>
              {active === 'holes'
                ? 'Hole games'
                : active === 'challenge'
                  ? 'Team challenge'
                  : active === 'setup'
                    ? 'Set up the games'
                    : 'Wolf'}
            </Text>
          </View>
          {/* Every game converges here — the money is one screen, not one per game. */}
          <Pressable onPress={() => router.push('/settle')} style={styles.settleBtn} hitSlop={8}>
            <Text style={styles.settleLabel}>SETTLE UP</Text>
            <Text style={styles.settleArrow}>→</Text>
          </Pressable>
        </View>
      </View>

      {available.length > 1 && (
        <View style={styles.tabRow}>
          {available.map((t, i) => (
            <Pressable
              key={t}
              style={[styles.tabBtn, i < available.length - 1 && styles.tabDivider]}
              onPress={() => setTab(t)}
            >
              <Text style={styles.tabLabel} numberOfLines={1}>
                {TAB_LABEL[t]}
              </Text>
              {active === t && <View style={styles.tabUnderline} />}
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView>
        {active === null && (
          <Text style={styles.note}>
            No games are running. Whoever's organizing the round sets them up, and they'll show here the moment they do.
          </Text>
        )}

        {(active === 'challenge' || active === 'setup') && (
          <>
            {!teams.enabled && (
              <Pressable onPress={() => router.push('/teams')} style={styles.linkRow}>
                <Text style={styles.linkText}>
                  Teams aren't switched on. The challenge is played between them, so set them up first.
                </Text>
                <Text style={styles.linkArrow}>›</Text>
              </Pressable>
            )}

            {active === 'challenge' && (
              <>
                <Text style={styles.sectionLabel}>The rules</Text>
                <View style={styles.rulesBlock}>
                  <Text style={styles.rulesText}>
                    Your team plays the other teams over these holes, in whatever format the teams are set to. Three
                    bets run at once: {fmtMoney(challenge.perHoleCents).replace('+', '')} for every hole you finish up,
                    {' '}{fmtMoney(challenge.perNineCents).replace('+', '')} for each nine you win, and{' '}
                    {fmtMoney(challenge.overallCents).replace('+', '')} for the match. Each is per team and splits
                    between its players. A nine pays only once that nine is finished and the match only once the round
                    is.{organizerName ? ` ${organizerName} set the rates.` : ''}
                  </Text>
                </View>
              </>
            )}

            {active === 'setup' && (
              <>
            <Pressable
              disabled={!canEdit}
              onPress={() => setChallengeSettings({ enabled: !challenge.enabled })}
              style={[styles.toggleRow, challenge.enabled && styles.toggleRowOn, !canEdit && styles.readOnly]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>
                  {challenge.enabled ? 'Challenge is running' : 'Challenge is off'}
                </Text>
                <Text style={styles.toggleSub}>
                  {challenge.enabled
                    ? 'Three wagers at once: the holes, each nine, and the match.'
                    : 'Turn it on to play the teams against each other for money.'}
                </Text>
              </View>
              <View style={[styles.switchBox, challenge.enabled && styles.switchBoxOn]}>
                <Text style={[styles.switchMark, challenge.enabled && { color: colors.white }]}>
                  {challenge.enabled ? '✓' : ''}
                </Text>
              </View>
            </Pressable>

            {(
              [
                // A dollar a hole at a time: the per-hole rate is multiplied by
                // the final margin, so a step of five moves the settlement by
                // five times that. The other two are paid once and start
                // higher, so they keep the bigger step.
                { key: 'perHoleCents', label: 'A hole up', value: challenge.perHoleCents, step: 100 },
                { key: 'perNineCents', label: 'Each nine', value: challenge.perNineCents, step: 500 },
                { key: 'overallCents', label: 'The match', value: challenge.overallCents, step: 500 },
              ] as const
            ).map(({ key, label, value, step }) => (
              <View key={key}>
                <Text style={styles.sectionLabel}>{label}</Text>
                <View style={styles.stepper}>
                  <Pressable
                    disabled={!canEdit}
                    onPress={() => setChallengeSettings({ [key]: Math.max(0, value - step) } as any)}
                    style={[styles.stepBtn, styles.stepBtnRight, !canEdit && styles.readOnly]}
                  >
                    <Text style={styles.stepGlyph}>−</Text>
                  </Pressable>
                  <View style={styles.stepValue}>
                    <Text style={styles.stepValueText}>{fmtMoney(value).replace('+', '')}</Text>
                  </View>
                  <Pressable
                    disabled={!canEdit}
                    onPress={() => setChallengeSettings({ [key]: Math.min(100000, value + step) } as any)}
                    style={[styles.stepBtn, styles.stepBtnLeft, !canEdit && styles.readOnly]}
                  >
                    <Text style={styles.stepGlyph}>+</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            <Text style={styles.note}>
              Each wager is per team and splits between its players. A nine pays when that nine is finished and the
              match pays when the round is — neither settles early. The rate per hole runs live, because the margin is
              a fact about the holes already played.
              {teamSegments.length === 1 && holes.length < 18
                ? ' A nine-hole match has no nines inside it, so only the holes and the match are in play.'
                : ''}
            </Text>
              </>
            )}

            {active === 'challenge' && teamSegments.map((segment, seg) => {
              if (!teamDrawSavedFor(seg)) {
                return (
                  <View key={segment.label}>
                    <Text style={styles.sectionLabel}>{segment.label}</Text>
                    <Pressable onPress={() => router.push('/teams')} style={styles.linkRow}>
                      <Text style={styles.linkText}>No teams drawn for these holes yet.</Text>
                      <Text style={styles.linkArrow}>›</Text>
                    </Pressable>
                  </View>
                );
              }
              const ledger = challengeFor(seg);
              return (
                <View key={segment.label}>
                  <Text style={styles.sectionLabel}>
                    {teamSegments.length > 1 ? segment.label : 'The match'}
                  </Text>
                  {!ledger.matches.length && (
                    <Text style={styles.note}>Needs two teams with players on them.</Text>
                  )}
                  {ledger.matches.map((m) => {
                    const letterA = String.fromCharCode(65 + m.teamA);
                    const letterB = String.fromCharCode(65 + m.teamB);
                    return (
                      <View key={`${m.teamA}-${m.teamB}`} style={styles.matchBlock}>
                        <View style={styles.matchHead}>
                          <Text style={styles.matchName}>
                            Team {letterA} v Team {letterB}
                          </Text>
                          <Text style={styles.matchState}>
                            {matchStateLabel(m.up, m.holesPending)}
                            {m.holesPending > 0 ? ` · ${m.holesCounted} in` : ''}
                          </Text>
                        </View>
                        <View style={styles.matchRow}>
                          <Text style={styles.matchLabel}>Holes</Text>
                          <Text style={styles.matchDetail}>
                            {m.holesWonA}–{m.holesWonB}
                            {m.halved ? `, ${m.halved} halved` : ''}
                          </Text>
                          <Text style={styles.matchAmt}>{fmtMoney(m.breakdown.holes)}</Text>
                        </View>
                        {m.nines.map((nine) => (
                          <View key={nine.label} style={styles.matchRow}>
                            <Text style={styles.matchLabel}>{nine.label} nine</Text>
                            <Text style={styles.matchDetail}>
                              {!nine.complete
                                ? 'still out there'
                                : nine.winner === 'halved'
                                  ? 'halved'
                                  : `${nine.winner === 'a' ? letterA : letterB} took it ${Math.max(nine.wonA, nine.wonB)}–${Math.min(nine.wonA, nine.wonB)}`}
                            </Text>
                            <Text style={styles.matchAmt}>
                              {nine.complete ? fmtMoney(nine.winner === 'a' ? challenge.perNineCents : nine.winner === 'b' ? -challenge.perNineCents : 0) : '–'}
                            </Text>
                          </View>
                        ))}
                        <View style={styles.matchRow}>
                          <Text style={styles.matchLabel}>Match</Text>
                          <Text style={styles.matchDetail}>
                            {m.overall == null
                              ? 'still being played'
                              : m.overall === 'halved'
                                ? 'halved'
                                : `Team ${m.overall === 'a' ? letterA : letterB}`}
                          </Text>
                          <Text style={styles.matchAmt}>
                            {m.overall == null ? '–' : fmtMoney(m.breakdown.overall)}
                          </Text>
                        </View>
                        <View style={[styles.matchRow, styles.matchTotal]}>
                          <Text style={styles.matchLabel}>Team {letterA}</Text>
                          <Text style={styles.matchDetail} />
                          <Text
                            style={[
                              styles.matchAmt,
                              { color: m.centsA > 0 ? colors.accent : colors.text, fontSize: 16 },
                            ]}
                          >
                            {fmtMoney(m.centsA)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}

                  {Object.keys(ledger.playerCents).length > 0 && (
                    <>
                      <Text style={styles.sectionLabel}>Split between players</Text>
                      {players.map((p) => {
                        const cents = ledger.playerCents[p.id];
                        if (cents === undefined) return null;
                        return (
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
                              {fmtMoney(cents)}
                            </Text>
                          </View>
                        );
                      })}
                    </>
                  )}
                </View>
              );
            })}
          </>
        )}

        {(active === 'holes' || active === 'setup') && (
          <>
            {active === 'holes' && !holeGamesLoaded && <Text style={styles.note}>Loading…</Text>}

            {active === 'holes' && holeGames.map((game) => {
              const ledger = holeGameLedgers.find((l) => l.gameId === game.id);
              return (
                <View key={game.id} style={styles.gameBlock}>
                  <View style={styles.gameHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.gameName}>{holeGameName(game.type)}</Text>
                      <Text style={styles.gameMeta}>
                        {game.holes.length} hole{game.holes.length === 1 ? '' : 's'} ·{' '}
                        {fmtMoney(game.wagerCents).replace('+', '')} a man a hole ·{' '}
                        {ledger?.holesSettled ?? 0} settled
                      </Text>
                    </View>
                    {canEdit && (
                      <Pressable
                        onPress={() =>
                          Alert.alert('Remove this game?', 'Its winners and money go with it. Scores are untouched.', [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: async () => {
                                const msg = await removeHoleGame(game.id);
                                if (msg) Alert.alert('Could not remove that game', msg);
                              },
                            },
                          ])
                        }
                        style={styles.removeBtn}
                        hitSlop={6}
                      >
                        <Text style={styles.removeLabel}>×</Text>
                      </Pressable>
                    )}
                  </View>

                  {game.holes.map((hole) => {
                    const outcome = ledger?.outcomes.find((o) => o.hole === hole);
                    return (
                      <View key={hole} style={styles.holeRow}>
                        <Text style={styles.holeNum}>{hole}</Text>
                        <View style={styles.winnerRow}>
                          {players.map((p) => {
                            const won = outcome?.winnerId === p.id;
                            return (
                              <Pressable
                                key={p.id}
                                onPress={() => setHoleGameWinner(game.id, hole, won ? null : p.id)}
                                style={[styles.winnerChip, won && styles.winnerChipOn]}
                              >
                                <Text style={[styles.winnerName, won && { color: colors.white }]} numberOfLines={1}>
                                  {firstNameOf(p.id)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <Text style={styles.holePot}>
                          {outcome?.settled ? fmtMoney(outcome.potCents).replace('+', '') : '–'}
                        </Text>
                      </View>
                    );
                  })}

                  {ledger && (
                    <View style={styles.gameTotals}>
                      {players.map((p) => (
                        <View key={p.id} style={styles.totalCell}>
                          <Text style={styles.totalName} numberOfLines={1}>
                            {firstNameOf(p.id)}
                          </Text>
                          <Text
                            style={[
                              styles.totalAmt,
                              {
                                color:
                                  (ledger.positions[p.id] ?? 0) > 0
                                    ? colors.accent
                                    : (ledger.positions[p.id] ?? 0) < 0
                                      ? colors.text
                                      : colors.mutedFaint,
                              },
                            ]}
                          >
                            {fmtMoney(ledger.positions[p.id] ?? 0)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            {active === 'holes' && !holeGames.length && holeGamesLoaded && (
              <Text style={styles.note}>
                No hole games yet. Closest to the pin on every par 3 is one game with several payouts, not one game per
                hole.
              </Text>
            )}

            {active === 'holes' && (
            <Text style={styles.note}>
              Tap a name to record who won a hole; tap them again to clear it. A hole nobody won pays nothing — the
              antes stay in your pockets rather than going to the least-bad miss. Anyone in the group can record a
              result; only whoever's running the round adds or removes a game.
            </Text>
            )}

            {active === 'setup' && canEdit && (
              <>
                <Text style={styles.sectionLabel}>Add a hole game</Text>
                <View style={styles.multRow}>
                  {HOLE_GAME_TYPES.map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => setNewType(t)}
                      style={[styles.multBtn, newType === t && styles.multBtnOn]}
                    >
                      <Text style={[styles.multLabel, newType === t && { color: colors.white }]}>
                        {holeGameShortName(t).toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.sectionLabel}>A man, a hole</Text>
                <View style={styles.multRow}>
                  {WAGER_STEPS.map((cents) => (
                    <Pressable
                      key={cents}
                      onPress={() => setNewWager(cents)}
                      style={[styles.multBtn, newWager === cents && styles.multBtnOn]}
                    >
                      <Text style={[styles.multLabel, newWager === cents && { color: colors.white }]}>
                        {fmtMoney(cents).replace('+', '')}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>Which holes</Text>
                  <Pressable
                    onPress={() =>
                      setNewHoles(
                        newType === 'ctp'
                          ? holes.filter((h) => h.par === 3).map((h) => h.hole)
                          : holes.filter((h) => h.par >= 5).map((h) => h.hole),
                      )
                    }
                    style={styles.shuffleBtn}
                  >
                    <Text style={styles.shuffleLabel}>{newType === 'ctp' ? 'ALL PAR 3s' : 'ALL PAR 5s'}</Text>
                  </Pressable>
                </View>
                <View style={styles.holeGrid}>
                  {holes.map((h) => {
                    const on = newHoles.includes(h.hole);
                    return (
                      <Pressable
                        key={h.hole}
                        onPress={() =>
                          setNewHoles((prev) =>
                            prev.includes(h.hole) ? prev.filter((x) => x !== h.hole) : [...prev, h.hole].sort((a, b) => a - b),
                          )
                        }
                        style={[styles.holeCell, on && styles.holeCellOn]}
                      >
                        <Text style={[styles.holeCellNum, on && { color: colors.white }]}>{h.hole}</Text>
                        <Text style={[styles.holeCellPar, on && { color: colors.white }]}>par {h.par}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  disabled={!newHoles.length}
                  onPress={async () => {
                    const msg = await addHoleGame(newType, newHoles, newWager);
                    if (msg) Alert.alert('Could not add that game', msg);
                    else setNewHoles([]);
                  }}
                  style={[styles.addBtn, !newHoles.length && styles.addBtnDisabled]}
                >
                  <Text style={styles.addBtnLabel}>
                    {newHoles.length
                      ? `ADD ${holeGameShortName(newType).toUpperCase()} ON ${newHoles.length} HOLE${newHoles.length === 1 ? '' : 'S'}`
                      : 'PICK SOME HOLES'}
                  </Text>
                  <Text style={styles.addBtnArrow}>→</Text>
                </Pressable>
                <Text style={styles.note}>
                  Everyone in the round is in, at {fmtMoney(newWager).replace('+', '')} a hole. With {players.length}{' '}
                  playing, each hole pays its winner{' '}
                  {fmtMoney(newWager * Math.max(0, players.length - 1)).replace('+', '')}.
                </Text>
              </>
            )}
          </>
        )}

        {!canPlay && active !== 'holes' && (
          <Text style={styles.note}>
            Wolf needs at least three players — one wolf and two to play against. Add players on the PLAYERS tab. Closest
            to the pin and longest drive work with two.
          </Text>
        )}

        {active === 'setup' && (
          <>
            {!canEdit && (
              <View style={styles.lockBanner}>
                <View style={styles.lockDot} />
                <Text style={styles.lockText}>
                  {organizerName
                    ? `${organizerName} is running this round and sets the terms. You can see them here, but changing the stake or the rotation isn't a player's call.`
                    : "Nobody has said they're running this round yet, so the terms are locked. Whoever is can say so on the PLAYERS tab."}
                </Text>
              </View>
            )}

            <Pressable
              disabled={!canEdit}
              onPress={() => wolfSetSettings({ enabled: !wolf.enabled })}
              style={[styles.toggleRow, wolf.enabled && styles.toggleRowOn, !canEdit && styles.readOnly]}
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
                disabled={!canEdit}
                onPress={() => wolfSetSettings({ stake: Math.max(0, wolf.stake - 1) })}
                style={[styles.stepBtn, styles.stepBtnRight, !canEdit && styles.readOnly]}
              >
                <Text style={styles.stepGlyph}>−</Text>
              </Pressable>
              <View style={styles.stepValue}>
                <Text style={styles.stepValueText}>${wolf.stake}</Text>
              </View>
              <Pressable
                disabled={!canEdit}
                onPress={() => wolfSetSettings({ stake: Math.min(500, wolf.stake + 1) })}
                style={[styles.stepBtn, styles.stepBtnLeft, !canEdit && styles.readOnly]}
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
                    disabled={!canEdit}
                    onPress={() => wolfSetSettings({ loneMultiplier: m })}
                    style={[styles.multBtn, on && styles.multBtnOn, !canEdit && !on && styles.readOnly]}
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
              {canEdit && (
                <Pressable onPress={wolfShuffleOrder} style={styles.shuffleBtn}>
                  <Text style={styles.shuffleLabel}>SHUFFLE</Text>
                </Pressable>
              )}
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

        {active === 'standings' && (
          <>
            <Text style={styles.sectionLabel}>The rules</Text>
            <View style={styles.rulesBlock}>
              <Text style={styles.rulesText}>
                The wolf tees off last, watches the drives, then picks a partner — or goes alone. Partners play the
                other {Math.max(0, players.length - 2)} for{' '}
                {fmtMoney(wolf.stake * 100).replace('+', '')} a man a hole; going alone is worth{' '}
                {wolf.loneMultiplier}× that against everybody. A hole pays only once every player has posted it, and a
                tie on best ball is a push that moves nothing. The wolf rotates every hole.
                {organizerName ? ` ${organizerName} set the stake.` : ''}
              </Text>
            </View>

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
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.divider,
  },
  linkText: { flex: 1, fontFamily: font.body, fontSize: 11.5, lineHeight: 17, color: colors.muted },
  linkArrow: { fontFamily: font.heading, fontSize: 18, color: colors.ghost },
  rulesBlock: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 2, borderColor: colors.divider },
  rulesText: { fontFamily: font.body, fontSize: 12, lineHeight: 19, color: colors.text },
  matchBlock: { borderTopWidth: 2, borderColor: colors.divider },
  matchHead: { paddingHorizontal: 20, paddingVertical: 12 },
  matchName: { fontFamily: font.heading, fontSize: 16, color: colors.text },
  matchState: { fontFamily: font.body, fontSize: 11.5, color: colors.muted, marginTop: 5 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  matchTotal: { borderTopWidth: 2, borderColor: colors.text },
  matchLabel: { fontFamily: font.bodySemi, fontSize: 12, color: colors.text, width: 84 },
  matchDetail: { flex: 1, fontFamily: font.body, fontSize: 11, color: colors.muted },
  matchAmt: { fontFamily: font.heading, fontSize: 13.5, color: colors.text, minWidth: 62, textAlign: 'right' },
  settleBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 4 },
  settleLabel: { fontFamily: font.heading, fontSize: 12, letterSpacing: 0.6, color: colors.accent },
  settleArrow: { fontFamily: font.heading, fontSize: 14, color: colors.accent },
  gameBlock: { borderTopWidth: 2, borderColor: colors.divider, marginTop: 16 },
  gameHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 13 },
  gameName: { fontFamily: font.heading, fontSize: 16, color: colors.text },
  gameMeta: { fontFamily: font.body, fontSize: 11, color: colors.muted, marginTop: 5 },
  removeBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.divider },
  removeLabel: { fontFamily: font.heading, fontSize: 18, color: colors.mutedFaint },
  holeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: colors.divider,
  },
  holeNum: { fontFamily: font.heading, fontSize: 15, width: 26, color: colors.text },
  winnerRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  winnerChip: { borderWidth: 1, borderColor: colors.divider, paddingVertical: 6, paddingHorizontal: 9 },
  winnerChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  winnerName: { fontFamily: font.bodySemi, fontSize: 11, color: colors.text, maxWidth: 74 },
  holePot: { fontFamily: font.heading, fontSize: 13, color: colors.muted, width: 52, textAlign: 'right' },
  gameTotals: { flexDirection: 'row', borderTopWidth: 2, borderColor: colors.divider },
  totalCell: { flex: 1, paddingVertical: 11, paddingHorizontal: 8, borderRightWidth: 1, borderColor: colors.divider },
  totalName: { fontFamily: font.body, fontSize: 10, color: colors.muted },
  totalAmt: { fontFamily: font.heading, fontSize: 14, marginTop: 5 },
  holeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 },
  holeCell: { borderWidth: 2, borderColor: colors.divider, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center', minWidth: 52 },
  holeCellOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  holeCellNum: { fontFamily: font.heading, fontSize: 14, color: colors.text },
  holeCellPar: { fontFamily: font.body, fontSize: 9, color: colors.muted, marginTop: 3 },
  addBtn: {
    marginTop: 20,
    height: 68,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  addBtnDisabled: { opacity: 0.35 },
  addBtnLabel: { fontFamily: font.heading, fontSize: 14, letterSpacing: 0.3, color: '#fff' },
  addBtnArrow: { fontFamily: font.heading, fontSize: 20, color: '#fff' },
  screen: { flex: 1, backgroundColor: colors.bg },
  headerInSetup: { paddingTop: 18 },
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
  readOnly: { opacity: 0.45 },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderColor: colors.divider,
  },
  lockDot: { width: 8, height: 8, backgroundColor: colors.accent, marginTop: 4 },
  lockText: { flex: 1, fontFamily: font.body, fontSize: 11.5, lineHeight: 17, color: colors.muted },

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

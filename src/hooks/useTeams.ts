import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  allowanceFor,
  draftTeams,
  segmentsFor,
  strokesLookupFor,
  teamStandings,
  unassignedFrom,
  moveToTeam,
  maxTeamsFor,
  NO_STROKES,
  type DraftPlayer,
  type HandicapMode,
  type Segment,
  type TeamFormat,
  type TeamStanding,
} from '@/lib/teams';
import { challengeLedger, type ChallengeLedger, type ChallengeTerms } from '@/lib/teamChallenge';
import type { ScoreMap } from '@/lib/scoreOutbox';
import type { Hole } from '@/data/seed';

export type TeamsState = {
  enabled: boolean;
  format: TeamFormat;
  size: number;
  count: number;
  redrawAtTurn: boolean;
};

const DEFAULTS: TeamsState = {
  enabled: false,
  format: 'bestball',
  size: 2,
  count: 2,
  redrawAtTurn: false,
};

/** Assignments per segment: segment index -> team index -> player ids. */
type Assignments = Record<number, string[][]>;

export type ChallengeState = ChallengeTerms & { enabled: boolean };

const CHALLENGE_DEFAULTS: ChallengeState = {
  enabled: false,
  perHoleCents: 500,
  perNineCents: 2000,
  overallCents: 5000,
};

// Teams for the round. `team_games` holds the terms and `team_members` the
// assignments; every figure is derived in src/lib/teams.ts so nothing stored can
// drift from the scores it came from.
export function useTeams(
  roundId: string | null | undefined,
  players: DraftPlayer[],
  holes: Hole[],
  scores: ScoreMap,
  /**
   * Gross, net or off the low man — handed in from the round rather than owned
   * here. It used to live on `team_games`, where it governed team standings and
   * nothing else, so "net" meant one number in the standings and a different one
   * on your own card. One number, one source (rule 3).
   */
  scoringMode: HandicapMode,
) {
  const [state, setState] = useState<TeamsState>(DEFAULTS);
  const [assignments, setAssignments] = useState<Assignments>({});
  const [loaded, setLoaded] = useState(!isSupabaseConfigured);
  const [segIndex, setSegIndex] = useState(0);
  const [challenge, setChallenge] = useState<ChallengeState>(CHALLENGE_DEFAULTS);

  const loadChallenge = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !roundId) return;
    const { data } = await supabase
      .from('team_challenge')
      .select('enabled, per_hole_cents, per_nine_cents, overall_cents')
      .eq('round_id', roundId)
      .maybeSingle();
    if (!data) return;
    const c = data as any;
    setChallenge({
      enabled: !!c.enabled,
      perHoleCents: Number(c.per_hole_cents) || 0,
      perNineCents: Number(c.per_nine_cents) || 0,
      overallCents: Number(c.overall_cents) || 0,
    });
  }, [roundId]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !roundId) return;
    const [gameRes, memberRes] = await Promise.all([
      supabase
        .from('team_games')
        .select('enabled, format, team_size, team_count, redraw_at_turn')
        .eq('round_id', roundId)
        .maybeSingle(),
      supabase
        .from('team_members')
        .select('segment, team_index, player_id')
        .eq('round_id', roundId),
    ]);
    if (gameRes.data) {
      const g = gameRes.data as any;
      setState({
        enabled: !!g.enabled,
        format: g.format === 'total' ? 'total' : 'bestball',
        size: Number(g.team_size) || 2,
        count: Number(g.team_count) || 2,
        redrawAtTurn: !!g.redraw_at_turn,
      });
    }
    const next: Assignments = {};
    for (const row of (memberRes.data ?? []) as any[]) {
      const seg = Number(row.segment) || 0;
      const ti = Number(row.team_index) || 0;
      if (!next[seg]) next[seg] = [];
      while (next[seg].length <= ti) next[seg].push([]);
      next[seg][ti].push(row.player_id);
    }
    setAssignments(next);
    await loadChallenge();
    setLoaded(true);
  }, [roundId, loadChallenge]);

  // Teams belong to one round; reset before refetching so one round's draw can
  // never show against another's scores.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    setState(DEFAULTS);
    setAssignments({});
    setSegIndex(0);
    setChallenge(CHALLENGE_DEFAULTS);
    setLoaded(false);
  }, [roundId]);

  useEffect(() => {
    load();
  }, [load]);

  // The organizer draws the teams on their phone; everyone playing in them needs
  // to see it without reloading.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !roundId) return;
    const client = supabase;
    const channel = client
      .channel(`teams:${roundId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_games', filter: `round_id=eq.${roundId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members', filter: `round_id=eq.${roundId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_challenge', filter: `round_id=eq.${roundId}` }, () => loadChallenge())
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [roundId, load, loadChallenge]);

  const segments: Segment[] = useMemo(
    () => segmentsFor(holes, state.redrawAtTurn),
    [holes, state.redrawAtTurn],
  );

  // Turning the re-draw off collapses two segments into one, so a stored index
  // of 1 would point past the end.
  const activeSeg = Math.min(segIndex, segments.length - 1);

  const playerIds = useMemo(() => players.map((p) => p.id), [players]);

  /**
   * The teams for a segment. Falls back to the balanced draft when nothing has
   * been saved, so the screen always shows a workable draw rather than an empty
   * grid — but it isn't written until somebody accepts it.
   */
  const teamsForSegment = useCallback(
    (seg: number): string[][] => {
      const stored = assignments[seg];
      const wanted = Math.max(1, state.count);
      if (stored) {
        const sized = stored.slice(0, wanted);
        while (sized.length < wanted) sized.push([]);
        // Drop anyone no longer in the round — removed on another device.
        return sized.map((t) => t.filter((id) => playerIds.includes(id)));
      }
      return draftTeams(players, state.size, wanted, seg);
    },
    [assignments, players, playerIds, state.count, state.size],
  );

  const teams = useMemo(() => teamsForSegment(activeSeg), [teamsForSegment, activeSeg]);
  const unassigned = useMemo(() => unassignedFrom(playerIds, teams), [playerIds, teams]);
  const isSaved = assignments[activeSeg] !== undefined;

  const persistSettings = useCallback(
    async (patch: Partial<TeamsState>) => {
      setState((prev) => ({ ...prev, ...patch }));
      if (!isSupabaseConfigured || !supabase || !roundId) return;
      const row: Record<string, unknown> = { round_id: roundId };
      // Switching teams on is what creates the row, and an upsert of one column
      // lets the *database's* defaults fill the rest — which quietly beat the
      // app's. Send the whole settled state on that first write so what the
      // screen shows is what gets stored; after that, patch as normal.
      const seeding = patch.enabled === true;
      const full = { ...state, ...patch };
      const src = seeding ? full : patch;
      if (src.enabled !== undefined) row.enabled = src.enabled;
      if (src.format !== undefined) row.format = src.format;
      if (src.size !== undefined) row.team_size = src.size;
      if (src.count !== undefined) row.team_count = src.count;
      if (src.redrawAtTurn !== undefined) row.redraw_at_turn = src.redrawAtTurn;
      const { error } = await supabase.from('team_games').upsert(row, { onConflict: 'round_id' });
      if (error) console.warn('team settings save failed:', error.message);
    },
    [roundId, state],
  );

  /** Replace a segment's teams outright. Deleting first keeps removals honest. */
  const saveTeams = useCallback(
    async (seg: number, next: string[][]): Promise<string | null> => {
      setAssignments((prev) => ({ ...prev, [seg]: next }));
      if (!isSupabaseConfigured || !supabase || !roundId) return null;
      const { error: delErr } = await supabase
        .from('team_members')
        .delete()
        .eq('round_id', roundId)
        .eq('segment', seg);
      if (delErr) {
        console.warn('clearing the old draw failed:', delErr.message);
        return delErr.message;
      }
      const rows = next.flatMap((ids, teamIndex) =>
        ids.map((player_id) => ({ round_id: roundId, segment: seg, team_index: teamIndex, player_id })),
      );
      if (!rows.length) return null;
      const { error } = await supabase.from('team_members').insert(rows);
      if (error) {
        console.warn('saving the draw failed:', error.message);
        return error.message;
      }
      return null;
    },
    [roundId],
  );

  /** Draw balanced teams for this segment and save them. */
  const autoDraw = useCallback(
    (seg: number = activeSeg) => saveTeams(seg, draftTeams(players, state.size, Math.max(1, state.count), seg)),
    [activeSeg, players, state.size, state.count, saveTeams],
  );

  /**
   * Draw again, differently. The segment index seeds the draw, so a re-draw has
   * to move past it — otherwise "re-draw" hands back the same teams.
   */
  const redraw = useCallback(
    (seg: number = activeSeg) => {
      const current = teamsForSegment(seg);
      const key = (t: string[][]) => t.map((x) => x.slice().sort().join('+')).sort().join('|');
      for (let bump = 1; bump <= 8; bump++) {
        const next = draftTeams(players, state.size, Math.max(1, state.count), seg + bump);
        if (key(next) !== key(current)) return saveTeams(seg, next);
      }
      // Some shapes have only one possible draw (one team, or a full team of
      // everyone). Saving the same thing is honest; pretending otherwise isn't.
      return saveTeams(seg, draftTeams(players, state.size, Math.max(1, state.count), seg));
    },
    [activeSeg, players, state.size, state.count, teamsForSegment, saveTeams],
  );

  const assign = useCallback(
    (playerId: string, teamIndex: number) => saveTeams(activeSeg, moveToTeam(teams, playerId, teamIndex)),
    [activeSeg, teams, saveTeams],
  );

  /**
   * Accept the draw that's on screen — the suggested one — as the real one.
   *
   * Everything else here saves as a side effect of changing something. Nothing
   * committed a draw you were already happy with, so the only way to accept a
   * suggestion was to re-draw it into something else and back again.
   */
  const acceptShown = useCallback(() => saveTeams(activeSeg, teams), [activeSeg, teams, saveTeams]);

  const clearSegment = useCallback(
    async (seg: number = activeSeg) => {
      setAssignments((prev) => {
        const next = { ...prev };
        delete next[seg];
        return next;
      });
      if (!isSupabaseConfigured || !supabase || !roundId) return null;
      const { error } = await supabase.from('team_members').delete().eq('round_id', roundId).eq('segment', seg);
      if (error) {
        console.warn('clearing the draw failed:', error.message);
        return error.message;
      }
      return null;
    },
    [activeSeg, roundId],
  );

  const scoreFor = useCallback(
    (hole: number, playerId: string) => scores[hole]?.[playerId] ?? null,
    [scores],
  );

  /**
   * Strokes for a segment. Gross short-circuits to no strokes at all, so the
   * scoring code has one path rather than a branch at every comparison.
   *
   * Off the low man, the baseline is the best handicap **among the players
   * actually on a team in this segment** — not the whole roster. Someone sitting
   * out isn't in the game, and letting them set the baseline would hand the
   * whole field strokes they hadn't won.
   */
  const strokesForSegment = useCallback(
    (seg: number) => {
      if (scoringMode === 'gross') return NO_STROKES;
      const inGame = new Set(teamsForSegment(seg).flat());
      const pool = players.filter((p) => inGame.has(p.id));
      return strokesLookupFor(holes, allowanceFor(pool.length ? pool : players, scoringMode));
    },
    [scoringMode, teamsForSegment, players, holes],
  );

  const strokesFor = useMemo(() => strokesForSegment(activeSeg), [strokesForSegment, activeSeg]);

  const standings: TeamStanding[] = useMemo(
    () => teamStandings(teams, state.format, segments[activeSeg]?.holes ?? [], holes, scoreFor, strokesFor),
    [teams, state.format, segments, activeSeg, holes, scoreFor, strokesFor],
  );

  /**
   * Standings for any segment, not just the one being edited.
   *
   * The leaderboard needs every segment at once: re-drawing at the turn makes
   * the two halves separate contests between different teams, so there is no
   * honest way to add them into one table.
   */
  const standingsFor = useCallback(
    (seg: number) =>
      teamStandings(
        teamsForSegment(seg),
        state.format,
        segments[seg]?.holes ?? [],
        holes,
        scoreFor,
        strokesForSegment(seg),
      ),
    [teamsForSegment, state.format, segments, holes, scoreFor, strokesForSegment],
  );

  /** Whether a segment's teams were actually drawn, rather than just suggested. */
  const drawSavedFor = useCallback((seg: number) => assignments[seg] !== undefined, [assignments]);

  const persistChallenge = useCallback(
    async (patch: Partial<ChallengeState>) => {
      setChallenge((prev) => ({ ...prev, ...patch }));
      if (!isSupabaseConfigured || !supabase || !roundId) return;
      const row: Record<string, unknown> = { round_id: roundId };
      if (patch.enabled !== undefined) row.enabled = patch.enabled;
      if (patch.perHoleCents !== undefined) row.per_hole_cents = patch.perHoleCents;
      if (patch.perNineCents !== undefined) row.per_nine_cents = patch.perNineCents;
      if (patch.overallCents !== undefined) row.overall_cents = patch.overallCents;
      const { error } = await supabase.from('team_challenge').upsert(row, { onConflict: 'round_id' });
      if (error) console.warn('challenge settings save failed:', error.message);
    },
    [roundId],
  );

  /**
   * The challenge over one segment. A re-draw at the turn makes each half its own
   * match between different teams, which is the only honest reading — you can't
   * carry a margin across a change of partner.
   */
  const challengeFor = useCallback(
    (seg: number): ChallengeLedger =>
      challengeLedger(
        teamsForSegment(seg),
        segments[seg]?.holes ?? [],
        state.format,
        scoreFor,
        strokesForSegment(seg),
        challenge,
      ),
    [teamsForSegment, segments, state.format, scoreFor, strokesForSegment, challenge],
  );

  /** Every segment's challenge added together, per player — what settle-up needs. */
  const challengePositions = useMemo(() => {
    const totals: Record<string, number> = {};
    if (!challenge.enabled) return totals;
    segments.forEach((_, seg) => {
      // Only a drawn segment is a real match; a suggested draft isn't a bet.
      if (!drawSavedFor(seg)) return;
      const { playerCents } = challengeFor(seg);
      for (const [id, cents] of Object.entries(playerCents)) {
        totals[id] = (totals[id] ?? 0) + cents;
      }
    });
    return totals;
  }, [challenge.enabled, segments, drawSavedFor, challengeFor]);

  return {
    teams: { ...state, handicapMode: scoringMode },
    teamsLoaded: loaded,
    challenge,
    challengeFor,
    challengePositions,
    setChallengeSettings: persistChallenge,
    teamSegments: segments,
    teamSegIndex: activeSeg,
    setTeamSegIndex: setSegIndex,
    teamRoster: teams,
    teamUnassigned: unassigned,
    teamDrawSaved: isSaved,
    teamDrawSavedFor: drawSavedFor,
    teamStandings: standings,
    teamStandingsFor: standingsFor,
    teamsForSegment,
    teamMaxCount: maxTeamsFor(players.length, state.size),
    teamStrokesFor: strokesFor,
    teamSetSettings: persistSettings,
    teamAutoDraw: autoDraw,
    teamAcceptDraw: acceptShown,
    teamRedraw: redraw,
    teamAssign: assign,
    teamClear: clearSegment,
  };
}

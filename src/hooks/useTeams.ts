import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  draftTeams,
  segmentsFor,
  teamStandings,
  unassignedFrom,
  moveToTeam,
  maxTeamsFor,
  type DraftPlayer,
  type Segment,
  type TeamFormat,
  type TeamStanding,
} from '@/lib/teams';
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

// Teams for the round. `team_games` holds the terms and `team_members` the
// assignments; every figure is derived in src/lib/teams.ts so nothing stored can
// drift from the scores it came from.
export function useTeams(
  roundId: string | null | undefined,
  players: DraftPlayer[],
  holes: Hole[],
  scores: ScoreMap,
) {
  const [state, setState] = useState<TeamsState>(DEFAULTS);
  const [assignments, setAssignments] = useState<Assignments>({});
  const [loaded, setLoaded] = useState(!isSupabaseConfigured);
  const [segIndex, setSegIndex] = useState(0);

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
    setLoaded(true);
  }, [roundId]);

  // Teams belong to one round; reset before refetching so one round's draw can
  // never show against another's scores.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    setState(DEFAULTS);
    setAssignments({});
    setSegIndex(0);
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
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [roundId, load]);

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
      if (patch.enabled !== undefined) row.enabled = patch.enabled;
      if (patch.format !== undefined) row.format = patch.format;
      if (patch.size !== undefined) row.team_size = patch.size;
      if (patch.count !== undefined) row.team_count = patch.count;
      if (patch.redrawAtTurn !== undefined) row.redraw_at_turn = patch.redrawAtTurn;
      const { error } = await supabase.from('team_games').upsert(row, { onConflict: 'round_id' });
      if (error) console.warn('team settings save failed:', error.message);
    },
    [roundId],
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

  const standings: TeamStanding[] = useMemo(
    () => teamStandings(teams, state.format, segments[activeSeg]?.holes ?? [], holes, scoreFor),
    [teams, state.format, segments, activeSeg, holes, scoreFor],
  );

  return {
    teams: state,
    teamsLoaded: loaded,
    teamSegments: segments,
    teamSegIndex: activeSeg,
    setTeamSegIndex: setSegIndex,
    teamRoster: teams,
    teamUnassigned: unassigned,
    teamDrawSaved: isSaved,
    teamStandings: standings,
    teamMaxCount: maxTeamsFor(players.length, state.size),
    teamSetSettings: persistSettings,
    teamAutoDraw: autoDraw,
    teamRedraw: redraw,
    teamAssign: assign,
    teamClear: clearSegment,
  };
}

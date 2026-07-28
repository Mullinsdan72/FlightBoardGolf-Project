import { useCallback, useEffect, useMemo, useState } from 'react';
import { HOLES as FALLBACK_HOLES, ROUND_ID, type Hole } from '@/data/seed';
import type { CourseDetail, TeeSet } from '@/lib/courseApi';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type HolesInPlay = 'all18' | 'front9' | 'back9';

export type SavedCourse = {
  id: string;
  clubName: string;
  courseName: string;
  location: string;
  source: string;
  isFavorite: boolean;
  tees: TeeSet[];
};

export type RoundCourse = {
  courseId: string | null;
  courseName: string;
  courseMeta: string;
  teeName: string | null;
  teeGender: string;
};

const teeRowToSet = (r: any): TeeSet => ({
  teeName: r.tee_name,
  gender: r.gender === 'female' ? 'female' : 'male',
  totalYards: r.total_yards ?? null,
  parTotal: r.par_total ?? null,
  courseRating: r.course_rating != null ? Number(r.course_rating) : null,
  slopeRating: r.slope_rating ?? null,
  holes: Array.isArray(r.holes) ? (r.holes as Hole[]) : [],
});

// Owns the round's card: which course and tee it's played on, and the
// resulting 18 (or 9) holes. `holes` is the round's own snapshot from
// round_holes, not the course record — see the note on that table in
// supabase/schema.sql for why those are deliberately separate.
export function useRoundCourse(myId: string | null | undefined) {
  const [allHoles, setAllHoles] = useState<Hole[]>(FALLBACK_HOLES);
  const [holesInPlay, setHolesInPlayState] = useState<HolesInPlay>('all18');
  const [course, setCourse] = useState<RoundCourse | null>(null);
  const [savedCourses, setSavedCourses] = useState<SavedCourse[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRound = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    const [roundRes, holesRes] = await Promise.all([
      supabase
        .from('rounds')
        .select('course_id, course_name, course_meta, tee_name, tee_gender, holes_in_play')
        .eq('id', ROUND_ID)
        .maybeSingle(),
      supabase.from('round_holes').select('hole, par, yards, handicap').eq('round_id', ROUND_ID).order('hole'),
    ]);

    if (roundRes.data) {
      const r = roundRes.data as any;
      setCourse({
        courseId: r.course_id ?? null,
        courseName: r.course_name ?? '',
        courseMeta: r.course_meta ?? '',
        teeName: r.tee_name ?? null,
        teeGender: r.tee_gender ?? 'male',
      });
      setHolesInPlayState((r.holes_in_play as HolesInPlay) ?? 'all18');
    }
    if (holesRes.data?.length) setAllHoles(holesRes.data as Hole[]);
    setLoading(false);
  }, []);

  const loadSavedCourses = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    const [coursesRes, teesRes, favRes] = await Promise.all([
      supabase.from('courses').select('id, source, club_name, course_name, location'),
      supabase.from('course_tees').select('*'),
      myId
        ? supabase.from('favorite_courses').select('course_id').eq('player_id', myId)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    if (!coursesRes.data) return;
    const favIds = new Set((favRes.data ?? []).map((f: any) => f.course_id));
    const teesByCourse = new Map<string, TeeSet[]>();
    for (const row of (teesRes.data ?? []) as any[]) {
      const list = teesByCourse.get(row.course_id) ?? [];
      list.push(teeRowToSet(row));
      teesByCourse.set(row.course_id, list);
    }
    setSavedCourses(
      (coursesRes.data as any[]).map((c) => ({
        id: c.id,
        clubName: c.club_name ?? '',
        courseName: c.course_name ?? '',
        location: c.location ?? '',
        source: c.source ?? 'golfcourseapi',
        isFavorite: favIds.has(c.id),
        tees: teesByCourse.get(c.id) ?? [],
      })),
    );
  }, [myId]);

  useEffect(() => {
    loadRound();
  }, [loadRound]);

  useEffect(() => {
    loadSavedCourses();
  }, [loadSavedCourses]);

  // Follow course changes made on another phone — the organizer picking a
  // course has to reach everyone already in the round.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    const channel = client
      .channel(`round-card:${ROUND_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_holes', filter: `round_id=eq.${ROUND_ID}` }, () =>
        loadRound(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `id=eq.${ROUND_ID}` }, () =>
        loadRound(),
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [loadRound]);

  // The holes that actually count for this round's scoring and totals.
  const holes = useMemo(() => {
    if (holesInPlay === 'front9') return allHoles.slice(0, 9);
    if (holesInPlay === 'back9') return allHoles.slice(-9);
    return allHoles;
  }, [allHoles, holesInPlay]);

  const setHolesInPlay = useCallback(async (value: HolesInPlay) => {
    setHolesInPlayState(value);
    if (!isSupabaseConfigured || !supabase) return;
    const { error } = await supabase.from('rounds').update({ holes_in_play: value }).eq('id', ROUND_ID);
    if (error) console.warn('setHolesInPlay failed:', error.message);
  }, []);

  // Writes a fetched course into the permanent cache. After this the course
  // costs zero API calls forever, which is the whole caching strategy.
  const cacheCourse = useCallback(async (detail: CourseDetail): Promise<string | null> => {
    if (!isSupabaseConfigured || !supabase) return null;
    const id = `gca:${detail.externalId}`;
    const { error: courseErr } = await supabase.from('courses').upsert(
      {
        id,
        source: 'golfcourseapi',
        club_name: detail.clubName,
        course_name: detail.courseName,
        location: detail.location,
        raw: detail.raw as any,
      },
      { onConflict: 'id' },
    );
    if (courseErr) {
      console.warn('cacheCourse failed:', courseErr.message);
      return null;
    }
    const rows = detail.tees.map((t) => ({
      course_id: id,
      tee_name: t.teeName,
      gender: t.gender,
      total_yards: t.totalYards,
      par_total: t.parTotal,
      course_rating: t.courseRating,
      slope_rating: t.slopeRating,
      holes: t.holes as any,
    }));
    if (rows.length) {
      const { error: teeErr } = await supabase
        .from('course_tees')
        .upsert(rows, { onConflict: 'course_id,tee_name,gender' });
      if (teeErr) console.warn('cacheCourse tees failed:', teeErr.message);
    }
    await loadSavedCourses();
    return id;
  }, [loadSavedCourses]);

  // Point the round at a course/tee and stamp its card into round_holes.
  const selectCourseTee = useCallback(
    async (courseId: string, tee: TeeSet, display: { clubName: string; courseName: string; location: string }) => {
      if (!tee.holes.length) throw new Error('That tee has no hole data.');
      const meta = [display.location, tee.teeName, tee.parTotal ? `par ${tee.parTotal}` : null]
        .filter(Boolean)
        .join(' · ');
      const name = display.courseName || display.clubName;

      setAllHoles(tee.holes);
      setCourse({ courseId, courseName: name, courseMeta: meta, teeName: tee.teeName, teeGender: tee.gender });

      if (!isSupabaseConfigured || !supabase) return;
      const { error: roundErr } = await supabase
        .from('rounds')
        .update({
          course_id: courseId,
          course_name: name,
          course_meta: meta,
          tee_name: tee.teeName,
          tee_gender: tee.gender,
        })
        .eq('id', ROUND_ID);
      if (roundErr) console.warn('selectCourseTee (round) failed:', roundErr.message);

      // Replace the round's card wholesale — a different tee is a different
      // set of yardages, and leaving stale holes behind would mix two cards.
      const { error: delErr } = await supabase.from('round_holes').delete().eq('round_id', ROUND_ID);
      if (delErr) console.warn('selectCourseTee (clear holes) failed:', delErr.message);
      const { error: insErr } = await supabase.from('round_holes').insert(
        tee.holes.map((h) => ({
          round_id: ROUND_ID,
          hole: h.hole,
          par: h.par,
          yards: h.yards,
          handicap: h.handicap,
        })),
      );
      if (insErr) console.warn('selectCourseTee (write holes) failed:', insErr.message);
      await loadRound();
    },
    [loadRound],
  );

  // Returns a message on failure, null on success. A star that silently does
  // nothing is impossible to diagnose from the outside, so callers surface this.
  const toggleFavorite = useCallback(
    async (courseId: string): Promise<string | null> => {
      if (!myId) {
        return 'Pick which player you are first — favourites are saved to your account.';
      }
      const current = savedCourses.find((c) => c.id === courseId);
      const nextFav = !current?.isFavorite;
      setSavedCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, isFavorite: nextFav } : c)));
      if (!isSupabaseConfigured || !supabase) return null;
      const { error } = nextFav
        ? await supabase.from('favorite_courses').upsert(
            { player_id: myId, course_id: courseId },
            { onConflict: 'player_id,course_id' },
          )
        : await supabase.from('favorite_courses').delete().eq('player_id', myId).eq('course_id', courseId);
      if (error) {
        console.warn('toggleFavorite failed:', error.message);
        await loadSavedCourses();
        return error.message;
      }
      return null;
    },
    [myId, savedCourses, loadSavedCourses],
  );

  // Star a course straight from search results without making it the round's
  // course. Search already carries the full card, so this caches it (no extra
  // API call) and then favourites it.
  const favoriteFromSearch = useCallback(
    async (detail: CourseDetail): Promise<string | null> => {
      if (!myId) {
        return 'Pick which player you are first — favourites are saved to your account.';
      }
      const courseId = await cacheCourse(detail);
      if (!courseId) return 'Could not save that course. Check your connection.';
      if (!isSupabaseConfigured || !supabase) return null;
      const { error } = await supabase
        .from('favorite_courses')
        .upsert({ player_id: myId, course_id: courseId }, { onConflict: 'player_id,course_id' });
      if (error) {
        console.warn('favoriteFromSearch failed:', error.message);
        return error.message;
      }
      await loadSavedCourses();
      return null;
    },
    [myId, cacheCourse, loadSavedCourses],
  );

  // The "course not listed?" path — type the card once and it becomes a
  // permanent course record like any other.
  const saveManualCourse = useCallback(
    async (input: { courseName: string; location: string; teeName: string; holes: Hole[] }): Promise<string | null> => {
      const parTotal = input.holes.reduce((a, h) => a + h.par, 0);
      const totalYards = input.holes.reduce((a, h) => a + (h.yards || 0), 0);
      const tee: TeeSet = {
        teeName: input.teeName || 'Default',
        gender: 'male',
        totalYards: totalYards || null,
        parTotal,
        courseRating: null,
        slopeRating: null,
        holes: input.holes,
      };
      if (!isSupabaseConfigured || !supabase) {
        setAllHoles(input.holes);
        setCourse({
          courseId: null,
          courseName: input.courseName,
          courseMeta: [input.location, tee.teeName, `par ${parTotal}`].filter(Boolean).join(' · '),
          teeName: tee.teeName,
          teeGender: 'male',
        });
        return null;
      }
      const { data, error } = await supabase
        .from('courses')
        .insert({
          id: `manual:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
          source: 'manual',
          club_name: input.courseName,
          course_name: input.courseName,
          location: input.location,
        })
        .select('id')
        .single();
      if (error || !data) {
        console.warn('saveManualCourse failed:', error?.message);
        return null;
      }
      const { error: teeErr } = await supabase.from('course_tees').insert({
        course_id: data.id,
        tee_name: tee.teeName,
        gender: 'male',
        total_yards: tee.totalYards,
        par_total: tee.parTotal,
        holes: tee.holes as any,
      });
      if (teeErr) {
        console.warn('saveManualCourse (tee) failed:', teeErr.message);
        return null;
      }
      await loadSavedCourses();
      await selectCourseTee(data.id, tee, {
        clubName: input.courseName,
        courseName: input.courseName,
        location: input.location,
      });
      return data.id;
    },
    [loadSavedCourses, selectCourseTee],
  );

  return {
    holes,
    allHoles,
    holesInPlay,
    setHolesInPlay,
    course,
    savedCourses,
    courseLoading: loading,
    cacheCourse,
    selectCourseTee,
    toggleFavorite,
    favoriteFromSearch,
    saveManualCourse,
    refreshCourses: loadSavedCourses,
  };
}

import type { Hole } from '@/data/seed';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

// Talks to the `courses` Edge Function, never to GolfCourseAPI directly — the
// API key lives on Supabase, not in this bundle. See supabase/functions/README.md.
//
// Field extraction below is deliberately tolerant: the upstream API's exact
// field names vary a little by endpoint (yardage vs yards, handicap vs stroke
// index), and a course with a missing yardage should still be usable rather
// than crashing the screen. Anything genuinely unrecognisable is surfaced as an
// error with the raw payload logged, so a shape change is diagnosable instead
// of silently producing an empty list.

export type CourseSearchResult = {
  externalId: string;
  clubName: string;
  courseName: string;
  location: string;
};

export type TeeSet = {
  teeName: string;
  gender: 'male' | 'female';
  totalYards: number | null;
  parTotal: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  holes: Hole[];
};

export type CourseDetail = {
  externalId: string;
  clubName: string;
  courseName: string;
  location: string;
  tees: TeeSet[];
  raw: unknown;
};

type Json = Record<string, any>;

const str = (...vals: unknown[]): string => {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim();
  return '';
};

const num = (...vals: unknown[]): number | null => {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
};

function locationOf(c: Json): string {
  const loc = c.location ?? c.address ?? null;
  if (typeof loc === 'string') return loc.trim();
  if (loc && typeof loc === 'object') {
    const address = str(loc.address);
    if (address) return address;
    const parts = [str(loc.city), str(loc.state), str(loc.country)].filter(Boolean);
    return parts.join(', ');
  }
  const parts = [str(c.city), str(c.state), str(c.country)].filter(Boolean);
  return parts.join(', ');
}

// The Supabase client throws FunctionsHttpError for any non-2xx and hands back
// `data: null`, which would throw away the specific reason the function put in
// the body ("quota exhausted", "key not set"). It does keep the raw Response on
// `error.context`, so dig the real message out of there — a vague "Edge Function
// returned a non-2xx status code" is useless when a lookup fails at the tee.
async function messageFromError(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).text === 'function') {
    try {
      const text = await (ctx as Response).clone().text();
      try {
        const parsed = JSON.parse(text) as Json;
        if (typeof parsed?.error === 'string') return parsed.error;
      } catch {
        // not JSON — fall through to the raw text
      }
      if (text.trim()) return text.slice(0, 300);
    } catch {
      // context wasn't readable; fall through
    }
  }
  const message = (error as { message?: unknown })?.message;
  return typeof message === 'string' && message ? message : 'Course lookup failed.';
}

async function callFunction(params: Record<string, string>): Promise<Json> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured, so course lookup is unavailable.');
  }
  const query = new URLSearchParams(params).toString();
  const { data, error } = await supabase.functions.invoke(`courses?${query}`, { method: 'GET' });
  if (error) throw new Error(await messageFromError(error));
  const body = data as Json | null;
  if (body && typeof body.error === 'string') throw new Error(body.error);
  if (!body) throw new Error('Course lookup returned nothing.');
  return body;
}

// The upstream wraps its list under different keys depending on endpoint; take
// whichever array of course-shaped objects is present.
function courseArray(body: Json): Json[] {
  for (const key of ['courses', 'results', 'data', 'items']) {
    if (Array.isArray(body[key])) return body[key] as Json[];
  }
  if (Array.isArray(body)) return body as unknown as Json[];
  return [];
}

export async function searchCourses(query: string): Promise<CourseSearchResult[]> {
  const body = await callFunction({ q: query });
  const rows = courseArray(body);
  if (!rows.length) return [];
  return rows
    .map((c) => ({
      externalId: str(c.id, c.course_id, c.courseId),
      clubName: str(c.club_name, c.clubName, c.club),
      courseName: str(c.course_name, c.courseName, c.name),
      location: locationOf(c),
    }))
    .filter((c) => c.externalId && (c.courseName || c.clubName));
}

function parseHoles(raw: unknown): Hole[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h: Json, i) => {
      const par = num(h?.par);
      if (par == null) return null;
      return {
        hole: num(h?.hole, h?.hole_number, h?.number) ?? i + 1,
        par,
        yards: num(h?.yardage, h?.yards, h?.length, h?.distance) ?? 0,
        // Stroke index — how hard the hole ranks, 1 = hardest. Drives net
        // scoring, so a course without it falls back to hole order rather
        // than pretending every hole is equally hard.
        handicap: num(h?.handicap, h?.stroke_index, h?.strokeIndex, h?.hcp, h?.si) ?? i + 1,
      };
    })
    .filter((h): h is Hole => h != null);
}

function parseTees(raw: unknown, gender: 'male' | 'female'): TeeSet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: Json) => ({
      teeName: str(t?.tee_name, t?.teeName, t?.name, t?.color) || 'Tee',
      gender,
      totalYards: num(t?.total_yards, t?.totalYards, t?.yardage, t?.yards),
      parTotal: num(t?.par_total, t?.parTotal, t?.par),
      courseRating: num(t?.course_rating, t?.courseRating, t?.rating),
      slopeRating: num(t?.slope_rating, t?.slopeRating, t?.slope),
      holes: parseHoles(t?.holes),
    }))
    .filter((t) => t.holes.length > 0);
}

export async function fetchCourseDetail(externalId: string): Promise<CourseDetail> {
  const body = await callFunction({ id: externalId });
  const c: Json = (body.course as Json) ?? (body.data as Json) ?? body;

  const teesRaw = c.tees ?? c.tee_sets ?? null;
  let tees: TeeSet[] = [];
  if (Array.isArray(teesRaw)) {
    tees = parseTees(teesRaw, 'male');
  } else if (teesRaw && typeof teesRaw === 'object') {
    tees = [
      ...parseTees((teesRaw as Json).male, 'male'),
      ...parseTees((teesRaw as Json).female, 'female'),
    ];
  }

  if (!tees.length) {
    // Better to say so plainly than to hand back a course whose card is empty.
    console.warn('No usable tee/hole data in course payload:', JSON.stringify(body).slice(0, 1200));
    throw new Error(
      'That course came back without hole data (par and yardage per tee). Try another course, or enter the card by hand.',
    );
  }

  return {
    externalId: str(c.id, c.course_id, externalId) || externalId,
    clubName: str(c.club_name, c.clubName, c.club),
    courseName: str(c.course_name, c.courseName, c.name),
    location: locationOf(c),
    tees,
    raw: body,
  };
}

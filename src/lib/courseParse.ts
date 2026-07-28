import type { Hole } from '@/data/seed';

// Pure parsing of GolfCourseAPI payloads — no network, no Supabase, so it can
// be exercised directly against a recorded response. See
// scripts/check-course-parse.js, which runs this over a real payload.
//
// The shape this parses, confirmed against a real response:
//
//   { "courses": [ {
//       "id": 7260,                       // a NUMBER, not a string
//       "club_name": "...", "course_name": "...",
//       "location": { "address": "...", "city": "...", "state": "..." },
//       "tees": {
//         "male":   [ { "tee_name": "Blue", "course_rating": 70.5,
//                       "slope_rating": 129, "total_yards": 6433, "par_total": 72,
//                       "holes": [ { "par": 4, "yardage": 428, "handicap": 4 }, ... ] } ],
//         "female": [ ... ]
//       } } ] }
//
// Holes carry no hole number, only order, so the number comes from position.
// Extraction stays tolerant of alternative field names (yardage vs yards,
// handicap vs stroke_index) so a small upstream change doesn't take the screen
// down.

export type TeeSet = {
  teeName: string;
  gender: 'male' | 'female';
  totalYards: number | null;
  parTotal: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  holes: Hole[];
};

export type ParsedCourse = {
  externalId: string;
  clubName: string;
  courseName: string;
  location: string;
  tees: TeeSet[];
  raw: unknown;
};

export type Json = Record<string, any>;

// Accepts numbers too — the upstream `id` is numeric (7260), and a
// string-only guard here silently dropped every search result.
export const str = (...vals: unknown[]): string => {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
};

export const num = (...vals: unknown[]): number | null => {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
};

export function locationOf(c: Json): string {
  const loc = c.location ?? c.address ?? null;
  if (typeof loc === 'string') return loc.trim();
  if (loc && typeof loc === 'object') {
    const address = str((loc as Json).address);
    if (address) return address;
    const parts = [str((loc as Json).city), str((loc as Json).state), str((loc as Json).country)].filter(Boolean);
    return parts.join(', ');
  }
  const parts = [str(c.city), str(c.state), str(c.country)].filter(Boolean);
  return parts.join(', ');
}

export function parseHoles(raw: unknown): Hole[] {
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

export function parseTees(raw: unknown, gender: 'male' | 'female'): TeeSet[] {
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

// Tees arrive keyed by gender ({male:[...], female:[...]}); tolerate a plain
// array too. Tee names repeat across genders (Gladstan has a male Gold and a
// female Gold at different ratings), so gender is part of a tee's identity
// everywhere downstream, including its database key.
export function teesOf(c: Json): TeeSet[] {
  const raw = c.tees ?? c.tee_sets ?? null;
  if (Array.isArray(raw)) return parseTees(raw, 'male');
  if (raw && typeof raw === 'object') {
    return [...parseTees((raw as Json).male, 'male'), ...parseTees((raw as Json).female, 'female')];
  }
  return [];
}

// The upstream wraps its list under different keys depending on endpoint; take
// whichever array of course-shaped objects is present.
export function courseArray(body: Json): Json[] {
  for (const key of ['courses', 'results', 'data', 'items']) {
    if (Array.isArray(body[key])) return body[key] as Json[];
  }
  if (Array.isArray(body)) return body as unknown as Json[];
  return [];
}

export function parseCourse(c: Json): ParsedCourse {
  return {
    externalId: str(c.id, c.course_id, c.courseId),
    clubName: str(c.club_name, c.clubName, c.club),
    courseName: str(c.course_name, c.courseName, c.name),
    location: locationOf(c),
    tees: teesOf(c),
    raw: c,
  };
}

export function parseSearchBody(body: Json): ParsedCourse[] {
  return courseArray(body)
    .map(parseCourse)
    .filter((c) => c.externalId && (c.courseName || c.clubName));
}

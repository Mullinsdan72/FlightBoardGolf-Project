import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { type Json, type ParsedCourse, type TeeSet, parseCourse, parseSearchBody, teesOf } from '@/lib/courseParse';

// Talks to the `courses` Edge Function, never to GolfCourseAPI directly — the
// API key lives on Supabase, not in this bundle. See supabase/functions/README.md.
//
// Payload parsing lives in courseParse.ts so it can be tested without a network
// (scripts/check-course-parse.js). This file is only transport.

export type { TeeSet };

export type CourseSearchResult = ParsedCourse;
export type CourseDetail = ParsedCourse;

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
    throw new Error(
      'Course lookup needs Supabase configured and the `courses` function deployed. See supabase/functions/README.md.',
    );
  }
  const query = new URLSearchParams(params).toString();
  const { data, error } = await supabase.functions.invoke(`courses?${query}`, { method: 'GET' });
  if (error) throw new Error(await messageFromError(error));
  const body = data as Json | null;
  if (body && typeof body.error === 'string') throw new Error(body.error);
  if (!body) throw new Error('Course lookup returned nothing.');
  return body;
}

// Search returns the *whole* card, tees and all — so picking a result needs no
// second lookup. That matters: the free tier is 300 lookups a day, and fetching
// detail for something already in hand would double the cost of every course.
export async function searchCourses(query: string): Promise<CourseSearchResult[]> {
  return parseSearchBody(await callFunction({ q: query }));
}

// Only needed when a search result arrives without tees — search normally
// includes the full card, so this is the exception, not the path.
export async function fetchCourseDetail(externalId: string): Promise<CourseDetail> {
  const body = await callFunction({ id: externalId });
  const c: Json = (body.course as Json) ?? (body.data as Json) ?? body;
  const parsed = parseCourse(c);

  if (!teesOf(c).length) {
    // Better to say so plainly than to hand back a course whose card is empty.
    console.warn('No usable tee/hole data in course payload:', JSON.stringify(body).slice(0, 1200));
    throw new Error(
      'That course came back without hole data (par and yardage per tee). Try another course, or enter the card by hand.',
    );
  }
  return { ...parsed, externalId: parsed.externalId || externalId };
}

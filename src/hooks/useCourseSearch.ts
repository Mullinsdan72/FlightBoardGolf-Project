import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { searchCourses, type CourseSearchResult } from '@/lib/courseApi';
import type { SavedCourse } from '@/hooks/useRoundCourse';

/**
 * Course search, with the quota brakes on.
 *
 * Every API lookup costs one of 300 a day, and type-ahead is the fastest way
 * ever invented to spend a quota — a call per keystroke burns two dozen typing
 * "Pebble Beach" twice. Four guards, all load-bearing:
 *
 *   1. Nothing fires until you stop typing for 500ms.
 *   2. Under three letters never searches at all.
 *   3. Answers are cached per query for the session, so backspacing a letter
 *      and retyping it is free, as is searching the same club twice.
 *   4. A sequence number drops replies that land out of order — without it a
 *      slow "Pebb" overwrites the "Pebble Beach" you are actually reading.
 *
 * Courses already on the phone match instantly and for free, and are returned
 * separately so a screen can show them first.
 *
 * Extracted from the Course tab so the setup screen can search without a second
 * copy of the brakes. Two implementations of this would mean one of them
 * quietly lacks a guard.
 */
export function useCourseSearch(savedCourses: SavedCourse[]) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CourseSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef(new Map<string, CourseSearchResult[]>());
  const seqRef = useRef(0);

  /** Already cached on the phone. Free, instant, works with no signal. */
  const localMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return savedCourses
      .filter((c) => `${c.clubName} ${c.courseName} ${c.location}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, savedCourses]);

  const notFound = (q: string) => `Nothing found for “${q}”. Try the club name, or enter the card by hand.`;

  const search = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (q.length < 3) return;

    const key = q.toLowerCase();
    const hit = cacheRef.current.get(key);
    if (hit) {
      seqRef.current += 1;
      setResults(hit);
      setError(hit.length ? null : notFound(q));
      setSearching(false);
      return;
    }

    const mine = (seqRef.current += 1);
    setSearching(true);
    setError(null);
    try {
      const found = await searchCourses(q);
      cacheRef.current.set(key, found);
      if (seqRef.current !== mine) return; // a later query owns the screen now
      setResults(found);
      if (!found.length) setError(notFound(q));
    } catch (err) {
      if (seqRef.current !== mine) return;
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      if (seqRef.current === mine) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      // Clearing the box clears the results with it, rather than leaving the
      // last search stranded under an empty field.
      seqRef.current += 1;
      setResults(null);
      setError(null);
      setSearching(false);
      return;
    }
    const timer = setTimeout(() => search(q), 500);
    return () => clearTimeout(timer);
  }, [query, search]);

  const clear = useCallback(() => setQuery(''), []);

  return { query, setQuery, clear, searching, results, error, localMatches, searchNow: () => search(query) };
}

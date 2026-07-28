// Supabase Edge Function: a thin proxy in front of GolfCourseAPI.
//
// Why this exists: the API key is tied to the account's 300-lookups-a-day quota.
// An EXPO_PUBLIC_ env var is compiled into the app bundle, where anyone who
// installs the app can read it out and spend that quota. Keeping the key here
// means it never leaves Supabase's servers.
//
// This deliberately does no parsing — it forwards the upstream JSON unchanged.
// Response-shape handling lives in the app (src/lib/courseApi.ts), so adjusting
// it is a reload rather than a redeploy.
//
// Deploy: see supabase/functions/README.md
//
// GET /courses?q=gladstan   -> search by course or club name
// GET /courses?id=1234      -> one course, with its tees and per-hole data

const API_BASE = 'https://api.golfcourseapi.com/v1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const apiKey = Deno.env.get('GOLFCOURSE_API_KEY');
  if (!apiKey) {
    return json({ error: 'GOLFCOURSE_API_KEY is not set on this function. See supabase/functions/README.md.' }, 500);
  }

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim();
  const id = url.searchParams.get('id')?.trim();

  let upstream: string;
  if (id) {
    upstream = `${API_BASE}/courses/${encodeURIComponent(id)}`;
  } else if (q) {
    upstream = `${API_BASE}/search?search_query=${encodeURIComponent(q)}`;
  } else {
    return json({ error: 'Pass ?q= to search or ?id= for one course.' }, 400);
  }

  try {
    const res = await fetch(upstream, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await res.text();

    // Surface upstream failures as-is rather than pretending they're empty
    // results — "no courses found" and "quota exhausted" must not look alike.
    if (!res.ok) {
      return json({ error: `Course API returned ${res.status}`, status: res.status, body: text.slice(0, 500) }, 502);
    }

    try {
      return json(JSON.parse(text));
    } catch {
      return json({ error: 'Course API returned a non-JSON body', body: text.slice(0, 500) }, 502);
    }
  } catch (err) {
    return json({ error: `Could not reach the course API: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }
});

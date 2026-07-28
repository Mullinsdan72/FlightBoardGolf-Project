# Deploying the `courses` Edge Function

This function is the proxy that keeps the GolfCourseAPI key off people's phones.
Deploying it is a one-time setup, then a single command whenever the function changes.

## One-time setup

1. **Install the Supabase CLI.** On a Mac with [Homebrew](https://brew.sh):

   ```bash
   brew install supabase/tap/supabase
   ```

   No Homebrew? `npx supabase` works for every command below — just write
   `npx supabase ...` instead of `supabase ...`.

2. **Log in.** This opens a browser to authorize the CLI:

   ```bash
   supabase login
   ```

3. **Link this repo to your project.** The project ref is the random-looking part of
   your Supabase URL — for `https://qlppsnypfbwiefsajwcv.supabase.co` it's
   `qlppsnypfbwiefsajwcv`. You can also find it under Project Settings → General.

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

   It will ask for your database password (the one set when the project was created).

4. **Give the function the API key.** This stores it as a secret on Supabase — it is
   *not* in this repo and never reaches the app:

   ```bash
   supabase secrets set GOLFCOURSE_API_KEY=your_golfcourseapi_key
   ```

## Deploy

```bash
supabase functions deploy courses --no-verify-jwt
```

`--no-verify-jwt` is here because the app has no sign-in yet, so there's no user token to
verify. **Revisit this when phone auth lands** — at that point drop the flag so only
signed-in users can spend your API quota. Until then the function is protected only by
being an unadvertised URL, which is thin: anyone who found it could burn the 300/day.

## Checking it works

```bash
curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/courses?q=gladstan" \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY"
```

You should get JSON back. If you get `GOLFCOURSE_API_KEY is not set`, step 4 didn't take —
re-run it, then redeploy.

## Watching what it does

```bash
supabase functions logs courses
```

Useful when the app says a lookup failed and you want to know whether the upstream API
refused it (quota, bad key) or something else went wrong.

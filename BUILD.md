# Making Flight Board a real app

Everything so far has run inside **Expo Go**, which is a preview harness: it loads
this project from a dev server on your laptop. That's why the app can't be opened
without a QR code, why it breaks whenever your laptop's IP changes, why
`flightboard://` invite links resolve to nothing, and why there's no Flight Board
icon on the home screen.

A **development build** is the fix. It's a real app, signed and installed, with the
icon, the `flightboard://` scheme and the contacts permission compiled in. It opens
with a tap, anywhere, with no server running.

Two things it is *not*: it isn't the App Store, and it isn't final. It's the app
installed directly on known phones. Code changes still reload the same way.

## What it costs

| Path | Cost | Runs on | Can friends use it? |
| --- | --- | --- | --- |
| iOS device | Apple Developer Program, **$99/year** | your iPhone | yes, up to 100 devices, or unlimited via TestFlight |
| iOS simulator | free | your Mac only | no |
| Android | free | any Android phone | yes, send them the .apk |

There is no free way to put an iOS app on a physical iPhone for longer than 7 days.
Apple's free provisioning expires after a week and can't be shared, which is why the
$99 membership is the real gate for an iPhone group.

## Before the first build

1. **An Expo account** (free) — `eas login`, or sign up at expo.dev.
2. **The dev client package**, which is what makes the build loadable:
   ```
   npx expo install expo-dev-client
   ```
3. **The Supabase keys as EAS environment variables.** `.env` is gitignored, so it is
   *not* uploaded to the build servers — without this the built app has no backend
   and every screen falls back to local-only state:
   ```
   eas env:create --name EXPO_PUBLIC_SUPABASE_URL      --value "<url>"       --environment development --visibility plaintext
   eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>"  --environment development --visibility sensitive
   ```
   Both already ship inside the bundle by design — that's what `EXPO_PUBLIC_` means,
   and the anon key is meant to be public. **The GolfCourseAPI key must never be set
   here**; it lives only as a Supabase Edge Function secret, and an `EXPO_PUBLIC_`
   copy would hand the 300-a-day quota to anyone who unzipped the app.

## Building

```
npm install -g eas-cli
eas login
eas build:configure      # only needed once; eas.json is already committed
eas build --profile development --platform ios
```

The build runs on Expo's servers, takes 10–20 minutes, and ends with a URL. Open that
URL on the iPhone to install.

For the simulator instead (free, no Apple account):

```
eas build --profile development --platform simulator
```

## Identifiers

`ios.bundleIdentifier` and `android.package` are both `com.prolook.flightboard`.
**Don't change them casually** — the bundle identifier is the app's identity to Apple.
Changing it after a TestFlight release makes it a different app, and existing installs
won't update.

## After it's installed

Start the dev server as usual, but the phone opens the **Flight Board** icon instead
of Expo Go:

```
npx expo start --dev-client
```

The invite links start working at this point with no change to what's sent — the SMS
copy in `src/lib/invite.ts` already contains `flightboard://join?round=<id>`, which
has simply had nothing to resolve to until now.

`APP_STORE_URL` in `src/lib/invite.ts` stays **null** until Flight Board is actually
published. A plausible-looking dead store link in a text message is worse than none.

import { useEffect, useRef, useState } from 'react';
import { router, Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { useRound } from '@/context/RoundContext';
import { useSignoffs } from '@/hooks/useSignoff';
import { opensOnRoundTab } from '@/lib/opening';
import { colors, font } from '@/theme';

// One word each, and no sub-labels. At four tabs "LEADERBOARD" already
// truncated to "LEADERBO…" on a real phone; at six there is no room at all, and
// a truncated tab is a tab nobody taps.
const TAB_META: Record<string, { label: string }> = {
  index: { label: 'SCORE' },
  board: { label: 'BOARD' },
  card: { label: 'CARD' },
  activity: { label: 'ACTIVITY' },
  round: { label: 'ROUND' },
  me: { label: 'ME' },
  games: { label: 'GAMES' },
  // Reachable, never a tab: PLAYERS and COURSE are opened from ROUND.
  players: { label: 'PLAYERS' },
  course: { label: 'COURSE' },
};

function ModernistTabBar({ state, navigation, visible }: any) {
  const insets = useSafeAreaInsets();
  // Hidden routes stay mounted and navigable — the leaderboard opens a player's
  // card by pushing to it, and a route missing from the navigator would break
  // that. They're only left out of the bar.
  const routes = state.routes.filter((r: any) => visible.includes(r.name));
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {routes.map((route: any, i: number) => {
        const focused = state.routes[state.index]?.key === route.key;
        const meta = TAB_META[route.name] ?? { label: route.name.toUpperCase(), sub: '' };
        const label = route.name === 'board' && routes.length <= 4 ? 'LEADERBOARD' : meta.label;
        return (
          <Pressable
            key={route.key}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={[styles.tab, i < routes.length - 1 && styles.tabDivider]}
          >
            <View style={[styles.topBar, { backgroundColor: focused ? colors.accent : 'transparent' }]} />
            <View style={styles.tabInner}>
              <Text style={[styles.label, { color: focused ? colors.text : colors.mutedFaint }]} numberOfLines={1}>
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  const {
    activeRoundId,
    roundsLoaded,
    roundsError,
    amOrganizer,
    wolf,
    challenge,
    holeGames,
    myId,
    players,
    playersLoaded,
    scores,
    scoresHydrated,
    invites,
    invitesReady,
    organizerId,
    authStage,
    myOwnedLoaded,
  } = useRound();
  const { signoffs } = useSignoffs(activeRoundId);

  // Which tab a cold start lands on, decided once and never revisited.
  //
  // Once, because this is an opening move, not a rule about where you may be. A
  // layout that kept re-deciding would haul you off ROUND the moment somebody
  // posted a hole, and off SCORE the moment the last card was signed — the app
  // taking the screen you chose away from you.
  //
  // **It moves after the navigator is up, never instead of it.** The first
  // version returned `<Redirect href="/(tabs)/round" />` from this layout, which
  // is a route *inside* the navigator this layout renders — so the navigator
  // never mounted, the target could not resolve, and the app bundled cleanly and
  // then showed nothing at all. Not a crash, no error in the log: the worst kind
  // of failure, and it shipped.
  //
  // `initialRouteName` can't do this job either: a cold start opens the URL `/`,
  // and `/` *is* the Score tab, so the navigator's initial route loses to the
  // link every time. So the tabs render, and one effect moves once.
  const [opening, setOpening] = useState<'index' | 'round' | null>(null);
  const moved = useRef(false);
  const scoreState = scores as Record<number, Record<string, number>>;
  // `playersLoaded` and `scoresHydrated` only ever settle for a round that
  // exists — with no round, `useRoundPlayers.refresh` returns before setting
  // its flag and `useLiveScores` sets hydrated false and stops. Waiting on them
  // in that state is a permanent blank screen for a first-time user, which is
  // the exact bug this file has now shipped twice.
  //
  // **Auth has to have answered before this decides anything.** These effects
  // run whatever the component returns, so the render gate below does not
  // protect them: with a session still restoring, `userId` is null,
  // `my_invitations()` is never called, `invitesReady` goes true carrying an
  // empty list, and the decision was made — and locked — on the basis that
  // nobody had invited you. Whether that happened came down to whether a local
  // session read beat a network round trip, which is why the same build worked
  // on some phones and not others on the same morning.
  //
  // Both flags settle on every path, including failure, so waiting on them
  // cannot hang: `authStage` always leaves 'loading', and `myOwnedLoaded` is
  // set even on a refused read.
  const decidable =
    roundsLoaded &&
    authStage !== 'loading' &&
    myOwnedLoaded &&
    !!signoffs &&
    invitesReady &&
    (!activeRoundId || (playersLoaded && scoresHydrated));
  const hasInvites = !!invites && invites.length > 0;

  useEffect(() => {
    if (opening !== null || !decidable) return;
    setOpening(
      opensOnRoundTab({
        hasRound: !!activeRoundId,
        // Posted scores come off local disk first, so this is what the phone
        // knows before the network answers. On a phone that has never seen the
        // round it reads as unplayed and opens on ROUND — one tap wrong, and far
        // better than holding the whole app on a network call at a tee.
        holesPosted: Object.values(scoreState).filter((byPlayer) => Object.keys(byPlayer).length > 0).length,
        fieldSize: players.length,
        cardsSigned: Object.keys(signoffs ?? {}).length,
      })
        ? 'round'
        : 'index',
    );
  }, [opening, decidable, activeRoundId, scoreState, players.length, signoffs]);

  // The one move, once the tabs exist to move within.
  //
  // An invitation outranks the opening tab: somebody has already built a round
  // with you in it, and handing that person START ROUND is how a group ends up
  // on two leaderboards arguing about which is real.
  useEffect(() => {
    if (moved.current || opening === null) return;
    moved.current = true;
    if (hasInvites) router.replace('/invited');
    else if (opening === 'round') router.replace('/(tabs)/round');
  }, [opening, hasInvites]);

  // Nothing to score against until a round exists, so send a first-time user
  // (or anyone who just deleted their last round) to create one.
  // A blank screen is the worst thing this layout can render, and returning
  // null while loading is one failed fetch away from doing it forever. If the
  // round list actually failed, say so — the message is the database's own, and
  // it names the problem in one line where silence named nothing.
  if (roundsError && !activeRoundId) {
    return (
      <View style={loadStyles.wrap}>
        <Text style={loadStyles.kicker}>Could not load your rounds</Text>
        <Text style={loadStyles.body}>{roundsError}</Text>
        <Text style={loadStyles.hint}>
          Usually the phone has no connection to the database. Check signal, then close and reopen the app.
        </Text>
      </View>
    );
  }
  // Deliberately does *not* wait on the opening decision. Holding the render
  // until it lands would avoid one frame of SCORE before the jump to ROUND, and
  // buy that with a whole app that shows nothing if any input never settles.
  // This file has shipped that blank screen twice; one frame is the cheaper bug.
  // Also waits for auth to answer and for `my_players()` to come back.
  //
  // Without that, a signed-in phone with a claimed player was thrown to the
  // first-run welcome in the window before either resolved — and the welcome's
  // START A ROUND then tried to mint a *second* player, which the policies
  // refuse because the session had not restored yet either. Two confusing
  // failures, both from concluding "this phone has no player" too early.
  //
  // Both settle even when they fail: `authStage` leaves 'loading' either way,
  // and `myOwnedLoaded` is set on every path including a refused read.
  if (
    activeRoundId === undefined ||
    !roundsLoaded ||
    myId === undefined ||
    authStage === 'loading' ||
    !myOwnedLoaded
  ) {
    return null;
  }
  // A phone with no player and no round has never been used. Send it to the
  // welcome rather than to a form asking it to name a round — and creating one
  // there mints the player too, which is what stops the organizer-less dead end.
  // Not for a guest with an invitation waiting: they are exactly a phone with
  // no player and no round, so welcome would catch the one person the
  // invitation screen was built for.
  //
  // **`invitesReady` is load-bearing, and leaving it out threw people out.**
  // This runs on every render, not once. A signed-in guest who has claimed
  // nothing has no player and no round for as long as `my_invitations()` is in
  // flight — so without waiting for the answer, the render that happens while
  // the network is still working concludes "nothing waiting" and redirects to
  // welcome. Nothing brings them back. That is the second half of why closing
  // and reopening the app fixed this for some people and not others.
  //
  // It settles on every path and is `[]` immediately when signed out, so a
  // genuine first-time user still reaches welcome without a pause.
  if (activeRoundId === null && !myId && invitesReady && !hasInvites) return <Redirect href="/welcome" />;

  // No redirect for "round is null" any more. It pointed at /rounds, which was
  // deleted when ROUND became the round's home — so it sent anyone with no
  // round to a route that no longer exists. The opening decision below already
  // lands them on ROUND, which is the screen /rounds was standing in for.

  // Setting the round up is the organizer's job, so the roster and the course
  // are their tabs. A player gets the four screens they actually use, which is
  // most of the point — six tabs of which two do nothing for you is clutter.
  //
  // This is a tidier screen, not a permission. With no sign-in any device can
  // pick any player and become the organizer, and the routes stay reachable by
  // URL. The real boundary arrives with accounts and RLS.
  const anyGame = wolf.enabled || challenge.enabled || holeGames.length > 0;
  // ROUND is the round's home and ME is who this phone is; both are always
  // available, including before a round exists — which is what makes the old
  // redirect-to-/rounds dance unnecessary.
  //
  // ROUND is the exception, and it is the organizer's. Joining somebody else's
  // round makes you a player in it: the course, the tees, the field, the format
  // and the games are all theirs to set, and a tab full of settings you may not
  // change is worse than no tab. A round nobody organizes, or one with an empty
  // field, still shows it — an unclaimed round belongs to whoever turns up, and
  // that rule predates this one.
  //
  // Not a trap: ACTIVITY's + NEW ROUND makes you the organizer of your own
  // round, which brings the tab back. That is the standing rule — hiding a tab
  // must never hide the last way to something — and this is the door.
  const runsIt = amOrganizer || organizerId === null || players.length === 0;
  const visible = runsIt ? ['index', 'board', 'activity', 'round', 'me'] : ['index', 'board', 'activity', 'me'];
  // A game nobody has set up isn't worth a tab; the organizer keeps it to set
  // one up with.
  // Only while something is actually being played for. GAMES is set up from
  // the tile on ROUND, so the organizer no longer needs it standing empty.
  if (anyGame) visible.splice(3, 0, 'games');
  // Hiding these two is tidiness for a player, and a trap for anyone else. A
  // round nobody has claimed, or one with an empty field, has to be set up by
  // whoever is holding the phone — and the picker's own advice is "open the
  // PLAYERS tab", which isn't there to open. Same rule as `canSetUp` on /setup:
  // an unclaimed round belongs to whoever turns up.
  // Nothing else. PLAYERS and COURSE both came off the bar because /start is
  // the round's home now — course, tee, holes, scoring, players, teams and
  // games are all tiles on one screen, reached by tapping the round name on
  // SCORE. Four tabs, the same four for everyone, because the organizer's job
  // stopped needing tabs of its own.
  //
  // Both routes still exist and /start links to both, which is the whole reason
  // this is safe: hiding a tab must never hide the last way to something.

  return (
    <Tabs
      tabBar={(props) => <ModernistTabBar {...props} visible={visible} />}
      screenOptions={{ headerShown: false }}
    >
        <Tabs.Screen name="index" options={{ title: 'Score' }} />
        <Tabs.Screen name="board" options={{ title: 'Board' }} />
        <Tabs.Screen name="card" options={{ title: 'Card' }} />
        <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
        <Tabs.Screen name="round" options={{ title: 'Round' }} />
        <Tabs.Screen name="me" options={{ title: 'Me' }} />
        <Tabs.Screen name="players" options={{ title: 'Players' }} />
        <Tabs.Screen name="course" options={{ title: 'Course' }} />
      <Tabs.Screen name="games" options={{ title: 'Games' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderTopWidth: 2,
    borderTopColor: colors.divider,
  },
  tab: { flex: 1 },
  tabDivider: { borderRightWidth: 1, borderRightColor: colors.divider },
  topBar: { height: 3 },
  // Tight, because six tabs across a phone leaves about 60pt each and ACTIVITY
  // is eight characters. Centred so short labels (ME) don't look adrift.
  tabInner: { paddingHorizontal: 2, paddingTop: 13, paddingBottom: 10, alignItems: 'center' },
  label: { fontFamily: font.heading, fontSize: 9.5, letterSpacing: 0 },
});

const loadStyles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingTop: 96, paddingHorizontal: 24 },
  kicker: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  body: { fontFamily: font.heading, fontSize: 20, color: colors.text, marginTop: 10 },
  hint: { fontFamily: font.body, fontSize: 12.5, lineHeight: 19, color: colors.muted, marginTop: 14 },
});

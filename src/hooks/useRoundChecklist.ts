import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = (roundId: string) => `flightboard.checklist.${roundId}`;

/**
 * Which setup tiles this phone has opened, for this round.
 *
 * The ROUND tab reads as a checklist: a tile you haven't dealt with is
 * highlighted, and one you have carries a check. Most tiles can answer that from
 * their own value — a tee is picked or it isn't — but HOLES and SCORING always
 * hold a working default, so they would sit highlighted forever or checked from
 * the start, and neither is true. Opening one is the only signal that you looked
 * at the default and kept it.
 *
 * Per round, because the checklist is about *this* round's setup. Per phone,
 * because it records what you looked at, not a fact about the round — two
 * organizers sharing a round have separately not looked at things.
 *
 * Deliberately not in Postgres. It is preference, not data: losing it costs a
 * highlight, and syncing it would put a write on the network every time somebody
 * taps a tile.
 */
export function useRoundChecklist(roundId: string | null | undefined) {
  const [opened, setOpened] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Clear first. Carrying the last round's ticks into a new one is a checklist
    // that says a round is set up when nothing has been touched.
    setOpened(new Set());
    if (!roundId) return;
    let cancelled = false;
    AsyncStorage.getItem(KEY(roundId))
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setOpened(new Set(parsed.filter((x) => typeof x === 'string')));
        } catch {
          // Corrupt storage just means nothing is ticked yet.
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [roundId]);

  const markOpened = useCallback(
    (key: string) => {
      if (!roundId) return;
      setOpened((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev).add(key);
        // Fire and forget: the tick is already on screen, and a failed write
        // costs one highlight next launch rather than anything real.
        AsyncStorage.setItem(KEY(roundId), JSON.stringify([...next])).catch(() => {});
        return next;
      });
    },
    [roundId],
  );

  return { openedTiles: opened, markOpened };
}

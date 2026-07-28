import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'flightboard.myPlayerId';

// Stands in for phone sign-in (Build Guide Phase 2). Each device picks which
// of the seeded players it is, once, and remembers it — so score entry knows
// whose +/- buttons it's driving and the leaderboard knows which row is you.
export function usePlayerIdentity() {
  const [myId, setMyId] = useState<string | null | undefined>(undefined); // undefined = still loading

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setMyId(v));
  }, []);

  const choose = async (id: string) => {
    await AsyncStorage.setItem(KEY, id);
    setMyId(id);
  };

  const clear = async () => {
    await AsyncStorage.removeItem(KEY);
    setMyId(null);
  };

  return { myId, choose, clear };
}

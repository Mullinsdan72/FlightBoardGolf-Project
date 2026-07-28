// Seed data for the sample round, matching design/prototype exactly (the
// Gladstan Grudge Match). This is what gets inserted into Supabase so the
// app has something real to score against; nothing here is hardcoded into
// the screens themselves.

export const ROUND_ID = '11111111-1111-4111-8111-111111111111';
export const ROUND_NAME = 'Gladstan Grudge Match';
export const COURSE_NAME = 'Gladstan Golf Club';
export const COURSE_META = 'Payson UT · Blue · par 72';

export type Hole = { hole: number; par: number; yards: number; handicap: number };

export const HOLES: Hole[] = [
  { hole: 1, par: 4, yards: 372, handicap: 9 },
  { hole: 2, par: 4, yards: 401, handicap: 3 },
  { hole: 3, par: 3, yards: 168, handicap: 17 },
  { hole: 4, par: 5, yards: 512, handicap: 7 },
  { hole: 5, par: 4, yards: 355, handicap: 13 },
  { hole: 6, par: 4, yards: 418, handicap: 1 },
  { hole: 7, par: 3, yards: 196, handicap: 11 },
  { hole: 8, par: 4, yards: 344, handicap: 15 },
  { hole: 9, par: 5, yards: 498, handicap: 5 },
  { hole: 10, par: 4, yards: 389, handicap: 8 },
  { hole: 11, par: 3, yards: 152, handicap: 18 },
  { hole: 12, par: 4, yards: 427, handicap: 2 },
  { hole: 13, par: 5, yards: 531, handicap: 6 },
  { hole: 14, par: 4, yards: 361, handicap: 12 },
  { hole: 15, par: 4, yards: 402, handicap: 4 },
  { hole: 16, par: 3, yards: 174, handicap: 16 },
  { hole: 17, par: 4, yards: 338, handicap: 14 },
  { hole: 18, par: 5, yards: 505, handicap: 10 },
];

export type SeedPlayer = { id: string; name: string; handicap: number };

// Matches design/prototype's PLAYERS — group 12, four hard-coded golfers.
export const PLAYERS: SeedPlayer[] = [
  { id: '22222222-2222-4222-8222-222222222221', name: 'Tanner Wells', handicap: 8 },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Deke Farr', handicap: 2 },
  { id: '22222222-2222-4222-8222-222222222223', name: 'Marcus Vela', handicap: 11 },
  { id: '22222222-2222-4222-8222-222222222224', name: 'Ray Okafor', handicap: 16 },
];

// The rest of the field, for the leaderboard's Field tab — static demo rows
// until a real tournament (many groups, many devices) exists. Clearly a
// stand-in: nobody is actually scoring these from a phone yet.
export const FIELD_DEMO_ROWS: Array<{ name: string; club: string; toPar: number; thru: number | 'F' }> = [
  { name: 'Sol Whitaker', club: 'Group 41', toPar: -5, thru: 'F' },
  { name: 'Rhett Sandoval', club: 'Group 15', toPar: -2, thru: 16 },
  { name: 'Bo Latimer', club: 'Group 11', toPar: -1, thru: 15 },
  { name: 'Vic Marchetti', club: 'Group 14', toPar: 0, thru: 13 },
  { name: 'Hollis Ward', club: 'Group 13', toPar: 1, thru: 'F' },
  { name: 'June Tavares', club: 'Group 15', toPar: 3, thru: 12 },
];

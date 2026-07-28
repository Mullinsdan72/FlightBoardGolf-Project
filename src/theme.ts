// Modernist design system tokens, ported from design/prototype/_ds — the
// Claude Design export this app is built from. Keep these in sync with that
// source rather than hand-tuning colors elsewhere.
export const colors = {
  bg: '#f3f2f2',
  text: '#201e1d',
  accent: '#ec3013',
  accentPressed: '#ae1800',
  divider: 'rgba(32,30,29,0.4)',
  dividerFaint: 'rgba(32,30,29,0.12)',
  muted: 'rgba(32,30,29,0.55)',
  mutedFaint: 'rgba(32,30,29,0.45)',
  ghost: 'rgba(32,30,29,0.3)',
  white: '#f3f2f2',
};

export const font = {
  heading: 'Archivo_800ExtraBold',
  headingSemi: 'Archivo_600SemiBold',
  body: 'Archivo_400Regular',
  bodySemi: 'Archivo_600SemiBold',
};

// Traditional card notation: circle = under par, square = over,
// doubled ring = two-or-more. See CLAUDE.md — never store this, always derive
// it from the score and par at render time.
export type ScoreMark = {
  ringWidth: number;
  ringColor: string;
  innerRingWidth: number;
  innerRingColor: string;
  radius: number; // 0 or 999 (circle)
  color: string;
};

export function markForScore(strokes: number, par: number): ScoreMark {
  const d = strokes - par;
  const on = colors.text;
  const off = 'transparent';
  if (d <= -2) return { ringWidth: 2, ringColor: on, innerRingWidth: 2, innerRingColor: on, radius: 999, color: colors.accent };
  if (d === -1) return { ringWidth: 2, ringColor: off, innerRingWidth: 2, innerRingColor: on, radius: 999, color: colors.accent };
  if (d === 0) return { ringWidth: 2, ringColor: off, innerRingWidth: 2, innerRingColor: off, radius: 0, color: colors.text };
  if (d === 1) return { ringWidth: 2, ringColor: off, innerRingWidth: 2, innerRingColor: on, radius: 0, color: colors.text };
  return { ringWidth: 2, ringColor: on, innerRingWidth: 2, innerRingColor: on, radius: 0, color: colors.text };
}

export function scoreName(strokes: number, par: number): string {
  const d = strokes - par;
  if (strokes === 1) return 'ACE';
  if (d <= -3) return 'ALBATROSS';
  if (d === -2) return 'EAGLE';
  if (d === -1) return 'BIRDIE';
  if (d === 0) return 'PAR';
  if (d === 1) return 'BOGEY';
  if (d === 2) return 'DOUBLE';
  return '+' + d;
}

export function fmtToPar(n: number): string {
  return n === 0 ? 'E' : n > 0 ? '+' + n : String(n);
}

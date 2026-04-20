/**
 * Word/token-level diff between a baseline string and the current string.
 * Returns segments with three states: equal / insert (in current) / delete (only in baseline).
 * Uses LCS over /\S+|\s+/g tokens; falls back to a single "insert" block when too large.
 */

export type DiffOp = 'equal' | 'insert' | 'delete';
export type DiffSegment = { text: string; op: DiffOp };

/** Back-compat: old callers used `changed: boolean` (true when op !== 'equal'). */
export type LegacyDiffSegment = { text: string; changed: boolean };

const MAX_LCS = 450; // max tokens per side — avoid O(n*m) blow-ups

function tokenize(s: string): string[] {
  return s.match(/\S+|\s+/g) ?? [];
}

function mergeAdjacent(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.op === seg.op) last.text += seg.text;
    else out.push({ text: seg.text, op: seg.op });
  }
  return out;
}

/**
 * LCS backtrack over tokens. Produces a combined list in original reading order
 * where `insert` comes from `b` (current) and `delete` comes from `a` (baseline).
 */
function lcsDiff(a: string[], b: string[]): DiffSegment[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  let i = n;
  let j = m;
  const rev: DiffSegment[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      rev.push({ text: b[j - 1], op: 'equal' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rev.push({ text: b[j - 1], op: 'insert' });
      j--;
    } else {
      rev.push({ text: a[i - 1], op: 'delete' });
      i--;
    }
  }
  rev.reverse();

  // Collapse pure-whitespace inserts/deletes into the surrounding equal block so that
  // highlighting does not paint leading / trailing spaces between otherwise-equal words.
  for (let k = 0; k < rev.length; k++) {
    const seg = rev[k];
    if (seg.op !== 'equal' && /^\s+$/.test(seg.text)) seg.op = 'equal';
  }
  return mergeAdjacent(rev);
}

/**
 * Compare `current` (AI rewrite) to the saved `baseline` (scraped original).
 * Returns insert/delete/equal segments suitable for inline rendering.
 */
export function diffCurrentAgainstBaseline(baseline: string, current: string): DiffSegment[] {
  if (baseline === current) return [{ text: current, op: 'equal' }];
  if (!current)  return baseline ? [{ text: baseline, op: 'delete' }] : [{ text: '', op: 'equal' }];
  if (!baseline) return [{ text: current, op: 'insert' }];

  const a = tokenize(baseline);
  const b = tokenize(current);
  if (a.length > MAX_LCS || b.length > MAX_LCS || a.length * b.length > 120_000) {
    return [
      { text: baseline, op: 'delete' },
      { text: current,  op: 'insert' },
    ];
  }
  return lcsDiff(a, b);
}

/** Legacy helper — keeps older call sites (`seg.changed`) working. */
export function toLegacySegments(segments: DiffSegment[]): LegacyDiffSegment[] {
  return segments
    .filter((s) => s.op !== 'delete')
    .map((s) => ({ text: s.text, changed: s.op !== 'equal' }));
}

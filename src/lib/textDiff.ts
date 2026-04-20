/**
 * Word/token-level diff for highlighting how `current` text differs from `baseline`.
 * Uses LCS on tokens from /\S+|\s+/g (keeps whitespace). Falls back when too large.
 */

export type DiffSegment = { text: string; changed: boolean };

const MAX_LCS = 450; // max tokens per side — avoid O(n*m) blow-ups

function tokenize(s: string): string[] {
  return s.match(/\S+|\s+/g) ?? [];
}

function mergeAdjacent(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.changed === seg.changed) last.text += seg.text;
    else out.push({ text: seg.text, changed: seg.changed });
  }
  return out;
}

/** Myers LCS backtrack on token arrays — marks tokens in `b` that are not aligned as changed. */
function myersTokens(a: string[], b: string[]): DiffSegment[] {
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
      rev.push({ text: b[j - 1], changed: false });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rev.push({ text: b[j - 1], changed: true });
      j--;
    } else {
      i--;
    }
  }
  rev.reverse();
  return mergeAdjacent(rev);
}

/**
 * Compare `current` to saved baseline (e.g. TinyFish snapshot). Returns segments for
 * rendering `current` with `changed: true` where content diverges.
 */
export function diffCurrentAgainstBaseline(baseline: string, current: string): DiffSegment[] {
  if (baseline === current) return [{ text: current, changed: false }];
  if (!current) return [{ text: '', changed: false }];
  if (!baseline) return [{ text: current, changed: true }];

  const a = tokenize(baseline);
  const b = tokenize(current);
  if (a.length > MAX_LCS || b.length > MAX_LCS || a.length * b.length > 120_000) {
    return [{ text: current, changed: true }];
  }
  return myersTokens(a, b);
}

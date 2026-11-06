/**
 * Level matching between a client and a session's level range.
 * Positions are ordinal indexes of levels sorted by rank within the program
 * (Beginner = 0, Elementary = 1, …), so `tolerance` means "N levels outside the
 * range" no matter how ranks are numbered.
 * Enforcement is configurable: "block" rejects the booking, "warn" allows it but
 * tells the client, "off" disables the check.
 */
export type LevelEnforcement = 'off' | 'warn' | 'block';

export interface LevelCheckInput {
  clientPosition: number | null;
  minPosition: number | null;
  maxPosition: number | null;
  tolerance: number;
}

export type LevelCheckResult = { ok: true } | { ok: false; reason: 'TOO_LOW' | 'TOO_HIGH' };

export function checkLevel(input: LevelCheckInput): LevelCheckResult {
  // Unknown client level: nothing to compare against.
  if (input.clientPosition === null) return { ok: true };
  const slack = Math.max(0, input.tolerance);
  if (input.minPosition !== null && input.clientPosition < input.minPosition - slack) {
    return { ok: false, reason: 'TOO_LOW' };
  }
  if (input.maxPosition !== null && input.clientPosition > input.maxPosition + slack) {
    return { ok: false, reason: 'TOO_HIGH' };
  }
  return { ok: true };
}

/** Ordinal positions of level ids, ordered by rank. */
export function levelPositions(levels: Array<{ id: string; rank: number }>): Map<string, number> {
  return new Map([...levels].sort((a, b) => a.rank - b.rank).map((level, index) => [level.id, index]));
}

/** "Intermediate", "Pre-Intermediate+", "Elementary – Intermediate" or "All levels". */
export function levelRangeLabel(
  min: { name: string; rank: number } | null,
  max: { name: string; rank: number } | null,
): string {
  if (!min && !max) return 'All levels';
  if (min && max) return min.rank === max.rank ? min.name : `${min.name} – ${max.name}`;
  if (min) return `${min.name}+`;
  return `Up to ${max!.name}`;
}

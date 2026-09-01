/**
 * Mines Math — client-side display calculations.
 *
 * These functions mirror the server-side multiplier formula so the UI can
 * show the current and next-tile multiplier in real time. The server RPC
 * is always authoritative; these are for display only.
 *
 * Formula: multiplier = (1 / P(safe)) * RTP
 *   where P(safe) = C(total - mines, picks) / C(total, picks)
 *   simplified to iterative product: prod_{k=0}^{picks-1} (total - mines - k) / (total - k)
 */

export interface MinesConfig {
  totalTiles: number;
  mineCount: number;
  rtp: number;
}

export function calculateMinesMultiplier(
  safePicks: number,
  totalTiles: number,
  mineCount: number,
  rtp: number
): number {
  if (safePicks === 0) return 1;
  const safeTiles = totalTiles - mineCount;
  if (safePicks > safeTiles) return 0;

  let numerator = 1;
  let denominator = 1;
  for (let k = 0; k < safePicks; k++) {
    numerator *= (totalTiles - mineCount - k);
    denominator *= (totalTiles - k);
  }
  if (numerator <= 0) return 0;
  return Math.round((denominator / numerator) * rtp * 10000) / 10000;
}

export function getNextMultiplier(
  currentSafePicks: number,
  totalTiles: number,
  mineCount: number,
  rtp: number
): number {
  return calculateMinesMultiplier(currentSafePicks + 1, totalTiles, mineCount, rtp);
}

export function getMaxPayout(
  betAmount: number,
  totalTiles: number,
  mineCount: number,
  rtp: number,
  maxPayoutCap: number
): { multiplier: number; payout: number } {
  const maxSafePicks = totalTiles - mineCount;
  const multiplier = calculateMinesMultiplier(maxSafePicks, totalTiles, mineCount, rtp);
  const payout = Math.min(betAmount * multiplier, maxPayoutCap);
  return { multiplier, payout };
}

export function getMineCountRange(totalTiles: number): { min: number; max: number } {
  return { min: 1, max: Math.floor(totalTiles * 0.9) - 1 };
}

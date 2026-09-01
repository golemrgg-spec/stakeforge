/**
 * Dice Math — client-side display calculations.
 *
 * Multiplier = RTP / (winChance / 100)
 * Target (under) = winChance
 * Target (over)  = 100 - winChance
 *
 * The server RPC is always authoritative; these mirror the formula for
 * live UI display before the roll is confirmed.
 */

export interface DiceConfig {
  rtp: number;
  minWinChance: number;
  maxWinChance: number;
}

export function calculateDiceMultiplier(winChance: number, rtp: number): number {
  if (winChance <= 0 || winChance >= 100) return 0;
  return Math.round((rtp / (winChance / 100)) * 10000) / 10000;
}

export function getDiceTarget(winChance: number, direction: 'over' | 'under'): number {
  if (direction === 'under') return Math.round(winChance * 100) / 100;
  return Math.round((100 - winChance) * 100) / 100;
}

export function isWin(rolled: number, target: number, direction: 'over' | 'under'): boolean {
  if (direction === 'under') return rolled < target;
  return rolled > target;
}

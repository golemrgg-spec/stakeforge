/**
 * Payout Engine — configurable payout calculations.
 *
 * Each future game provides a PayoutConfig that defines its RTP, house edge,
 * probability tables, and payout multipliers. The engine computes the
 * correct payout for a given outcome without hardcoding win chances.
 */

export interface PayoutConfig {
  gameType: string;
  rtp: number;
  houseEdge: number;
  probabilityTable: Record<string, number>;
  payoutTable: Record<string, number>;
}

export interface PayoutResult {
  multiplier: number;
  payout: number;
  profit: number;
  isWin: boolean;
}

export function calculatePayout(
  betAmount: number,
  outcome: string,
  config: PayoutConfig
): PayoutResult {
  const probability = config.probabilityTable[outcome] ?? 0;
  const multiplier = config.payoutTable[outcome] ?? 0;
  const payout = betAmount * multiplier;
  const profit = payout - betAmount;

  return {
    multiplier,
    payout,
    profit,
    isWin: probability > 0 && payout > 0,
  };
}

export function validateConfig(config: PayoutConfig): string[] {
  const errors: string[] = [];

  if (config.rtp < 0 || config.rtp > 1) {
    errors.push('RTP must be between 0 and 1');
  }
  if (config.houseEdge < 0 || config.houseEdge > 1) {
    errors.push('House edge must be between 0 and 1');
  }
  if (config.rtp + config.houseEdge > 1.001) {
    errors.push('RTP + house edge must not exceed 1');
  }

  const probSum = Object.values(config.probabilityTable).reduce((a, b) => a + b, 0);
  if (Math.abs(probSum - 1) > 0.001) {
    errors.push('Probabilities must sum to 1');
  }

  return errors;
}

export function expectedValue(config: PayoutConfig, betAmount: number): number {
  let ev = 0;
  for (const [outcome, prob] of Object.entries(config.probabilityTable)) {
    const multiplier = config.payoutTable[outcome] ?? 0;
    ev += prob * (betAmount * multiplier - betAmount);
  }
  return ev;
}

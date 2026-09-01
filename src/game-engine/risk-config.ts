/**
 * Risk Configuration — per-game mathematical parameters.
 *
 * Each future game registers its risk configuration here. This drives
 * the payout engine and is managed via the admin panel.
 */

export interface RiskConfig {
  gameType: string;
  minBet: number;
  maxBet: number;
  maxPayout: number;
  rtp: number;
  houseEdge: number;
  probabilityTable: Record<string, number>;
  payoutTable: Record<string, number>;
  custom: Record<string, unknown>;
}

export const DEFAULT_RISK_CONFIGS: Record<string, RiskConfig> = {};

export function registerRiskConfig(config: RiskConfig): void {
  DEFAULT_RISK_CONFIGS[config.gameType] = config;
}

export function getRiskConfig(gameType: string): RiskConfig | undefined {
  return DEFAULT_RISK_CONFIGS[gameType];
}

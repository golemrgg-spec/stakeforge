/**
 * Game Engine — the central module that all future games plug into.
 *
 * A game implements the GameDefinition interface and registers itself.
 * The engine handles session creation, bet placement, and payout —
 * the game only provides the outcome logic.
 */

import type { GameSession, Bet } from '@/types';
import type { PayoutConfig } from './payout-engine';
import type { RiskConfig } from './risk-config';

export interface GameContext {
  session: GameSession;
  bet: Bet;
  rngResults: number[];
  config: Record<string, unknown>;
}

export interface GameOutcome {
  result: Record<string, unknown>;
  payout: number;
  isWin: boolean;
  multiplier: number;
}

export interface GameDefinition {
  type: string;
  name: string;
  description: string;
  icon: string;
  minBet: number;
  maxBet: number;
  defaultConfig: Record<string, unknown>;
  riskConfig: RiskConfig;
  payoutConfig: PayoutConfig;
  computeOutcome: (context: GameContext) => GameOutcome;
  validateConfig: (config: Record<string, unknown>) => string[];
}

const registeredGames = new Map<string, GameDefinition>();

export function registerGame(game: GameDefinition): void {
  registeredGames.set(game.type, game);
}

export function getGame(type: string): GameDefinition | undefined {
  return registeredGames.get(type);
}

export function getAllGames(): GameDefinition[] {
  return Array.from(registeredGames.values());
}

export function isGameAvailable(type: string): boolean {
  return registeredGames.has(type);
}

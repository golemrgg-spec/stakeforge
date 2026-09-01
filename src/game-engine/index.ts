export type {
  GameDefinition,
  GameContext,
  GameOutcome,
} from './game-engine';
export {
  registerGame,
  getGame,
  getAllGames,
  isGameAvailable,
} from './game-engine';

export type { PayoutConfig, PayoutResult } from './payout-engine';
export {
  calculatePayout,
  validateConfig,
  expectedValue,
} from './payout-engine';

export type { RiskConfig } from './risk-config';
export {
  registerRiskConfig,
  getRiskConfig,
} from './risk-config';

export type { RNGRequest, RNGResponse } from './rng';
export { requestRNG } from './rng';

export {
  sha256,
  verifyServerSeed,
  generateProvablyFairFloat,
  generateProvablyFairFloats,
  provablyFairShuffle,
  generateClientSeed,
} from './provably-fair';

export type { ProvablyFairResult } from './provably-fair';

export {
  createSession,
  getSession,
  getUserSessions,
  updateSessionResult,
} from './session-manager';

export type { MinesConfig } from './mines-math';
export {
  calculateMinesMultiplier,
  getNextMultiplier,
  getMaxPayout,
  getMineCountRange,
} from './mines-math';

export type { DiceConfig } from './dice-math';
export {
  calculateDiceMultiplier,
  getDiceTarget,
  isWin,
} from './dice-math';

export type { GameConfig } from './game-config-service';
export {
  getGameConfig,
  getAllGameConfigs,
  updateGameConfig,
  clearConfigCache,
} from './game-config-service';

export type {
  MinesStartResult,
  MinesRevealResult,
  MinesCashoutResult,
  DicePlayResult,
  ProvablyFairRecord,
} from './game-service';
export {
  startMinesGame,
  revealMinesTile,
  cashoutMinesGame,
  playDiceGame,
  getProvablyFairRecord,
} from './game-service';

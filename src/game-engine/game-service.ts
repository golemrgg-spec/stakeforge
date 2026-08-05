import { supabase } from '@/lib/supabase';
import { generateClientSeed } from './provably-fair';
import type { GameSession } from '@/types';

export interface MinesStartResult {
  session_id: string;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  mine_count: number;
  total_tiles: number;
  pf_id: string;
}

export interface MinesRevealResult {
  is_mine: boolean;
  revealed: number[];
  multiplier: number;
  payout: number;
  safe_count: number;
  mine_indices?: number[];
  server_seed?: string;
}

export interface MinesCashoutResult {
  payout: number;
  profit: number;
  multiplier: number;
  server_seed: string;
  mine_indices: number[];
}

export async function startMinesGame(
  userId: string,
  betAmount: number,
  mineCount: number,
  totalTiles: number
): Promise<MinesStartResult> {
  const clientSeed = generateClientSeed();
  const { data, error } = await supabase.rpc('start_mines_game', {
    p_user_id: userId,
    p_bet_amount: betAmount,
    p_client_seed: clientSeed,
    p_mine_count: mineCount,
    p_total_tiles: totalTiles,
  });

  if (error) throw new Error(error.message);
  return data as MinesStartResult;
}

export async function revealMinesTile(
  userId: string,
  sessionId: string,
  tileIndex: number
): Promise<MinesRevealResult> {
  const { data, error } = await supabase.rpc('reveal_mines_tile', {
    p_user_id: userId,
    p_session_id: sessionId,
    p_tile_index: tileIndex,
  });

  if (error) throw new Error(error.message);
  return data as MinesRevealResult;
}

export async function cashoutMinesGame(
  userId: string,
  sessionId: string
): Promise<MinesCashoutResult> {
  const { data, error } = await supabase.rpc('cashout_mines_game', {
    p_user_id: userId,
    p_session_id: sessionId,
  });

  if (error) throw new Error(error.message);
  return data as MinesCashoutResult;
}

export interface DicePlayResult {
  session_id: string;
  rolled: number;
  target: number;
  is_win: boolean;
  multiplier: number;
  payout: number;
  profit: number;
  server_seed: string;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  pf_id: string;
}

export async function playDiceGame(
  userId: string,
  betAmount: number,
  winChance: number,
  direction: 'over' | 'under'
): Promise<DicePlayResult> {
  const clientSeed = generateClientSeed();
  const { data, error } = await supabase.rpc('play_dice_game', {
    p_user_id: userId,
    p_bet_amount: betAmount,
    p_client_seed: clientSeed,
    p_win_chance: winChance,
    p_direction: direction,
  });

  if (error) throw new Error(error.message);
  return data as DicePlayResult;
}

export interface CrashStartResult {
  session_id: string;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  started_at: number;
  new_balance: number;
  dev_mode: boolean;
}

export interface CrashResolveResult {
  status: 'active' | 'crashed' | 'cashed_out';
  multiplier?: number;
  crash_point?: number;
  payout?: number;
  server_seed?: string;
  new_balance?: number;
}

export async function startCrashGame(betAmount: number): Promise<CrashStartResult> {
  const clientSeed = generateClientSeed();
  const { data, error } = await supabase.rpc('start_crash_game', {
    p_bet_amount: betAmount,
    p_client_seed: clientSeed,
  });
  if (error) throw new Error(error.message);
  return data as CrashStartResult;
}

export async function resolveCrashGame(
  sessionId: string,
  doCashout: boolean,
  target?: number
): Promise<CrashResolveResult> {
  const { data, error } = await supabase.rpc('resolve_crash_game', {
    p_session_id: sessionId,
    p_do_cashout: doCashout,
    p_target: target ?? null,
  });
  if (error) throw new Error(error.message);
  return data as CrashResolveResult;
}

export interface BjCard {
  rank: number;
  suit: number;
}

export interface BjHand {
  cards: BjCard[];
  bet: number;
  actions: string[];
  done: boolean;
  doubled: boolean;
  result: string | null;
  payout: number;
}

export interface BjState {
  session_id?: string;
  settled: boolean;
  hands: BjHand[];
  dealer: BjCard[];
  active: number;
  dealer_value?: number;
  payout?: number;
  profit?: number;
  server_seed?: string;
  server_seed_hash?: string;
  client_seed?: string;
  nonce?: number;
  new_balance?: number;
  dev_mode?: boolean;
}

export async function blackjackDeal(betAmount: number): Promise<BjState> {
  const clientSeed = generateClientSeed();
  const { data, error } = await supabase.rpc('blackjack_deal', {
    p_bet_amount: betAmount,
    p_client_seed: clientSeed,
  });
  if (error) throw new Error(error.message);
  return data as BjState;
}

export async function blackjackAction(
  sessionId: string,
  action: 'hit' | 'stand' | 'double' | 'split'
): Promise<BjState> {
  const { data, error } = await supabase.rpc('blackjack_action', {
    p_session_id: sessionId,
    p_action: action,
  });
  if (error) throw new Error(error.message);
  return data as BjState;
}

export interface CrashMultiplayerBetResult {
  round_id: string;
  round_number: number;
  bet_amount: number;
  new_balance: number;
}

export async function crashPlaceBet(betAmount: number): Promise<CrashMultiplayerBetResult> {
  const { data, error } = await supabase.rpc('crash_place_bet', { p_bet_amount: betAmount });
  if (error) throw new Error(error.message);
  return data as CrashMultiplayerBetResult;
}

export interface CrashCashoutResult {
  status: 'cashed_out';
  multiplier: number;
  payout: number;
  profit: number;
  new_balance: number;
}

export async function crashCashout(roundId: string): Promise<CrashCashoutResult> {
  const { data, error } = await supabase.rpc('crash_cashout', { p_round_id: roundId });
  if (error) throw new Error(error.message);
  return data as CrashCashoutResult;
}

export async function crashEnsureRunning(): Promise<void> {
  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crash-engine`;
  await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ action: 'ensure_running' }),
  });
}

export interface CoinflipPlayResult {
  session_id: string;
  outcome: 'heads' | 'tails';
  won: boolean;
  payout: number;
  profit: number;
  multiplier: number;
  server_seed: string;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  new_balance: number;
  dev_mode: boolean;
}

export async function playCoinflipGame(
  betAmount: number,
  choice: 'heads' | 'tails'
): Promise<CoinflipPlayResult> {
  const clientSeed = generateClientSeed();
  const { data, error } = await supabase.rpc('play_coinflip_game', {
    p_bet_amount: betAmount,
    p_choice: choice,
    p_client_seed: clientSeed,
  });
  if (error) throw new Error(error.message);
  return data as CoinflipPlayResult;
}

export async function getActiveSession(gameType: string): Promise<GameSession | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('game_type', gameType)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as GameSession | null;
}

export interface ProvablyFairRecord {
  id: string;
  session_id: string;
  user_id: string;
  game_type: string;
  server_seed: string | null;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  hmac: string | null;
  created_at: string;
  revealed_at: string | null;
}

export async function getProvablyFairRecord(sessionId: string): Promise<ProvablyFairRecord | null> {
  const { data, error } = await supabase
    .from('provably_fair')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ProvablyFairRecord | null;
}

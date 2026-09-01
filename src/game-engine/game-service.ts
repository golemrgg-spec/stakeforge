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

// ─── PLINKO ──────────────────────────────────────────────────────────────────

export interface PlinkoPlayResult {
  session_id: string;
  slot: number;
  path: number[];
  multiplier: number;
  payout: number;
  profit: number;
  server_seed: string;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  new_balance: number;
  dev_mode: boolean;
}

export async function playPlinkoGame(
  betAmount: number,
  risk: 'easy' | 'normal' | 'hard'
): Promise<PlinkoPlayResult> {
  const clientSeed = generateClientSeed();
  const { data, error } = await supabase.rpc('play_plinko_game', {
    p_bet_amount: betAmount,
    p_risk: risk,
    p_client_seed: clientSeed,
  });
  if (error) throw new Error(error.message);
  return data as PlinkoPlayResult;
}

// ─── TOWERS ──────────────────────────────────────────────────────────────────

export interface TowersStartResult {
  session_id: string;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  columns: number;
  multipliers: number[];
  new_balance: number;
  dev_mode: boolean;
}

export interface TowersPickResult {
  busted: boolean;
  level: number;
  completed: boolean;
  multiplier?: number;
  payout?: number;
  cashout_value?: number;
  bomb_column?: number;
  bombs?: number[][];
  server_seed?: string;
  new_balance?: number;
}

export async function startTowersGame(
  betAmount: number,
  difficulty: 'easy' | 'normal' | 'hard'
): Promise<TowersStartResult> {
  const clientSeed = generateClientSeed();
  const { data, error } = await supabase.rpc('start_towers_game', {
    p_bet_amount: betAmount,
    p_difficulty: difficulty,
    p_client_seed: clientSeed,
  });
  if (error) throw new Error(error.message);
  return data as TowersStartResult;
}

export async function pickTowersTile(
  sessionId: string,
  column: number
): Promise<TowersPickResult> {
  const { data, error } = await supabase.rpc('pick_towers_tile', {
    p_session_id: sessionId,
    p_column: column,
  });
  if (error) throw new Error(error.message);
  return data as TowersPickResult;
}

export async function cashoutTowersGame(
  sessionId: string
): Promise<TowersPickResult> {
  const { data, error } = await supabase.rpc('cashout_towers_game', {
    p_session_id: sessionId,
  });
  if (error) throw new Error(error.message);
  return data as TowersPickResult;
}

// ─── ROULETTE ────────────────────────────────────────────────────────────────

export interface RoulettePlayResult {
  session_id: string;
  roll: number;
  color: 'red' | 'purple' | 'yellow';
  won: boolean;
  payout: number;
  profit: number;
  server_seed: string;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  new_balance: number;
  dev_mode: boolean;
}

export async function playRouletteGame(
  betAmount: number,
  choice: 'red' | 'purple' | 'yellow'
): Promise<RoulettePlayResult> {
  const clientSeed = generateClientSeed();
  const { data, error } = await supabase.rpc('play_roulette_game', {
    p_bet_amount: betAmount,
    p_choice: choice,
    p_client_seed: clientSeed,
  });
  if (error) throw new Error(error.message);
  return data as RoulettePlayResult;
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

// ─── CASE BATTLE ──────────────────────────────────────────────────────────────

export interface CaseCatalogItem {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  image_url: string | null;
}

export interface CaseItem {
  id: string;
  case_id: string;
  name: string;
  rarity: string;
  value: number;
  probability: number;
  image_url: string | null;
}

export async function getCaseCatalog(): Promise<CaseCatalogItem[]> {
  const { data, error } = await supabase.from('case_catalog').select('*').order('price');
  if (error) throw new Error(error.message);
  return data as CaseCatalogItem[];
}

export async function getCaseItems(caseSlug: string): Promise<CaseItem[]> {
  const { data: caseData } = await supabase.from('case_catalog').select('id').eq('slug', caseSlug).maybeSingle();
  if (!caseData) return [];
  const { data, error } = await supabase.from('case_items').select('*').eq('case_id', caseData.id).order('value');
  if (error) throw new Error(error.message);
  return data as CaseItem[];
}

export interface CaseBattle {
  id: string;
  creator_id: string;
  status: string;
  mode: string;
  format: string;
  fast_mode: boolean;
  entry_cost: number;
  rounds_config: string[];
  total_rounds: number;
  current_round: number;
  winner_id: string | null;
  winner_team: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface CaseBattleParticipant {
  id: string;
  battle_id: string;
  user_id: string;
  team: string;
  slot: number;
  is_bot: boolean;
  bot_name: string | null;
  joined_at: string;
}

export async function getOpenBattles(): Promise<CaseBattle[]> {
  const { data, error } = await supabase
    .from('case_battles')
    .select('*')
    .eq('status', 'waiting')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CaseBattle[];
}

export async function getBattleParticipants(battleId: string): Promise<CaseBattleParticipant[]> {
  const { data, error } = await supabase
    .from('case_battle_participants')
    .select('*')
    .eq('battle_id', battleId)
    .order('slot');
  if (error) throw new Error(error.message);
  return (data ?? []) as CaseBattleParticipant[];
}

export async function createCaseBattle(
  mode: string, format: string, fastMode: boolean,
  roundsConfig: string[], entryCost: number
): Promise<{ battle_id: string; new_balance: number }> {
  const { data, error } = await supabase.rpc('create_case_battle', {
    p_mode: mode, p_format: format, p_fast_mode: fastMode,
    p_rounds_config: roundsConfig, p_entry_cost: entryCost,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function joinCaseBattle(
  battleId: string, team: string, slot: number
): Promise<{ new_balance: number }> {
  const { data, error } = await supabase.rpc('join_case_battle', {
    p_battle_id: battleId, p_team: team, p_slot: slot,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelCaseBattle(battleId: string): Promise<{ new_balance: number }> {
  const { data, error } = await supabase.rpc('cancel_case_battle', { p_battle_id: battleId });
  if (error) throw new Error(error.message);
  return data;
}

export async function callCaseBattleBot(
  battleId: string, team: string, slot: number
): Promise<{ bot_name: string; status: string }> {
  const { data, error } = await supabase.rpc('call_case_battle_bot', {
    p_battle_id: battleId, p_team: team, p_slot: slot,
  });
  if (error) throw new Error(error.message);
  return data;
}

export interface CasePullResult {
  item: { name: string; rarity: string; value: number; image_url: string | null };
  roll: number;
  server_seed: string;
  server_seed_hash: string;
}

export async function generateCasePull(
  caseSlug: string, clientSeed: string, nonce: number
): Promise<CasePullResult> {
  const { data, error } = await supabase.rpc('generate_case_pull', {
    p_case_slug: caseSlug, p_client_seed: clientSeed, p_nonce: nonce,
  });
  if (error) throw new Error(error.message);
  return data as CasePullResult;
}

export async function settleCaseBattle(battleId: string): Promise<{
  winner_team: string; winner_id: string; payout: number;
}> {
  const { data, error } = await supabase.rpc('settle_case_battle', { p_battle_id: battleId });
  if (error) throw new Error(error.message);
  return data;
}

export async function recordCasePull(
  roundId: string, participantId: string,
  itemName: string, itemRarity: string, itemValue: number,
  itemImageUrl: string | null, rollIndex: number
): Promise<void> {
  const { error } = await supabase.from('case_battle_pulls').insert({
    round_id: roundId, participant_id: participantId,
    item_name: itemName, item_rarity: itemRarity, item_value: itemValue,
    item_image_url: itemImageUrl, roll_index: rollIndex,
  });
  if (error) throw new Error(error.message);
}

export async function createBattleRound(
  battleId: string, roundNumber: number, caseSlug: string
): Promise<string> {
  const { data, error } = await supabase.from('case_battle_rounds').insert({
    battle_id: battleId, round_number: roundNumber, case_slug: caseSlug,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function getBattlePulls(roundId: string): Promise<Array<{
  id: string; participant_id: string; item_name: string;
  item_rarity: string; item_value: number; item_image_url: string | null;
}>> {
  const { data, error } = await supabase
    .from('case_battle_pulls')
    .select('*')
    .eq('round_id', roundId)
    .order('roll_index');
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string; participant_id: string; item_name: string;
    item_rarity: string; item_value: number; item_image_url: string | null;
  }>;
}

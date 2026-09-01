import { supabase } from '@/lib/supabase';

export interface GameConfig {
  game_type: string;
  house_edge: number;
  rtp: number;
  min_bet: number;
  max_bet: number;
  max_payout: number;
  custom: Record<string, unknown>;
  updated_at?: string;
}

const configCache = new Map<string, GameConfig>();
let cachePromise: Promise<void> | null = null;

async function loadAllConfigs(): Promise<void> {
  const { data, error } = await supabase
    .from('game_configs')
    .select('*');

  if (error || !data) return;

  configCache.clear();
  for (const cfg of data as GameConfig[]) {
    configCache.set(cfg.game_type, cfg);
  }
}

export async function getGameConfig(gameType: string): Promise<GameConfig | null> {
  if (configCache.has(gameType)) {
    return configCache.get(gameType)!;
  }
  if (!cachePromise) {
    cachePromise = loadAllConfigs();
  }
  await cachePromise;
  cachePromise = null;
  return configCache.get(gameType) ?? null;
}

export async function getAllGameConfigs(): Promise<GameConfig[]> {
  if (configCache.size === 0) {
    if (!cachePromise) cachePromise = loadAllConfigs();
    await cachePromise;
    cachePromise = null;
  }
  return Array.from(configCache.values());
}

export async function updateGameConfig(
  gameType: string,
  updates: Partial<Pick<GameConfig, 'house_edge' | 'rtp' | 'min_bet' | 'max_bet' | 'max_payout' | 'custom'>>
): Promise<void> {
  const { error } = await supabase
    .from('game_configs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('game_type', gameType);

  if (error) throw new Error(error.message);
  configCache.delete(gameType);

  // Audit log entry is created automatically by the trg_audit_game_config trigger
}

export function clearConfigCache(): void {
  configCache.clear();
  cachePromise = null;
}

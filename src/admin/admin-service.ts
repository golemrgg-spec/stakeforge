import { supabase } from '@/lib/supabase';
import type { Profile, Wallet, WalletTransaction, AuditLog, AdminLog } from '@/types';

export async function getAllProfiles(limit = 50, offset = 0): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return data as Profile[];
}

export async function getProfileCount(): Promise<number> {
  const { count, error } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getAllWallets(limit = 50, offset = 0): Promise<Array<Wallet & { username: string }>> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*, profiles!inner(username)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return data.map((w) => ({
    ...w,
    username: (w.profiles as unknown as { username: string }).username,
  })) as Array<Wallet & { username: string }>;
}

export async function getAllTransactions(limit = 50, offset = 0): Promise<Array<WalletTransaction & { username: string }>> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*, profiles!inner(username)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return data.map((t) => ({
    ...t,
    username: (t.profiles as unknown as { username: string }).username,
  })) as Array<WalletTransaction & { username: string }>;
}

export async function getAuditLogs(limit = 50, offset = 0): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return data as AuditLog[];
}

export async function getAdminLogs(limit = 50, offset = 0): Promise<AdminLog[]> {
  const { data, error } = await supabase
    .from('admin_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return data as AdminLog[];
}

export interface PlatformStats {
  totalUsers: number;
  totalBalance: number;
  totalWagered: number;
  totalTransactions: number;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const [usersRes, walletsRes, txCountRes] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('wallets').select('balance, total_wagered'),
    supabase.from('wallet_transactions').select('*', { count: 'exact', head: true }),
  ]);

  const wallets = walletsRes.data ?? [];
  const totalBalance = wallets.reduce((sum, w) => sum + (w.balance ?? 0), 0);
  const totalWagered = wallets.reduce((sum, w) => sum + (w.total_wagered ?? 0), 0);

  return {
    totalUsers: usersRes.count ?? 0,
    totalBalance,
    totalWagered,
    totalTransactions: txCountRes.count ?? 0,
  };
}

// =========================================================
// R Coins admin functions (server-authoritative via RPC)
// =========================================================

export interface UserProfileSummary {
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    role: string;
    status: string;
    created_at: string;
    updated_at: string;
    last_login_at: string | null;
  };
  email: string | null;
  wallet: {
    id: string;
    balance: number;
    locked_balance: number;
    total_wagered: number;
    lifetime_pnl: number;
    lifetime_wins: number;
    lifetime_losses: number;
  } | null;
  game_stats: {
    total_games: number;
    total_wagered: number;
    wins: number;
    losses: number;
  };
}

export interface TimelineItem {
  source: 'wallet' | 'game' | 'admin';
  id: string;
  event_type: string;
  amount: number | null;
  balance_before: number | null;
  balance_after: number | null;
  reference_type: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface GameHistoryItem {
  id: string;
  game_type: string;
  status: string;
  bet_amount: number;
  payout: number | null;
  profit: number | null;
  client_seed: string;
  server_seed: string | null;
  server_seed_hash: string;
  config: Record<string, unknown>;
  result: Record<string, unknown> | null;
  created_at: string;
  ended_at: string | null;
}

export interface SearchUserResult {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
  email: string | null;
  balance: number | null;
  locked_balance: number | null;
}

export async function getUserProfileSummary(userId: string): Promise<UserProfileSummary> {
  const { data, error } = await supabase.rpc('get_user_profile_summary', { p_user_id: userId });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as UserProfileSummary;
}

export async function getUserActivityTimeline(
  userId: string,
  limit = 50,
  offset = 0,
  typeFilter?: 'wallet' | 'game' | 'admin'
): Promise<TimelineItem[]> {
  const { data, error } = await supabase.rpc('get_user_activity_timeline', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
    p_type_filter: typeFilter ?? null,
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return (data?.items ?? []) as TimelineItem[];
}

export async function getUserGameHistory(
  userId: string,
  limit = 50,
  offset = 0
): Promise<GameHistoryItem[]> {
  const { data, error } = await supabase.rpc('get_user_game_history', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return (data?.items ?? []) as GameHistoryItem[];
}

export async function adminSearchUsers(
  query: string,
  role?: string,
  status?: string,
  limit = 50,
  offset = 0
): Promise<{ items: SearchUserResult[]; count: number }> {
  const { data, error } = await supabase.rpc('admin_search_users', {
    p_query: query,
    p_role: role ?? null,
    p_status: status ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return { items: data?.items ?? [], count: data?.count ?? 0 };
}

export async function getRecentAdminWalletActions(limit = 10): Promise<Array<{
  id: string;
  admin_id: string;
  target_user_id: string;
  action: string;
  amount: number | null;
  reason: string;
  created_at: string;
}>> {
  const { data, error } = await supabase
    .from('admin_wallet_actions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data;
}

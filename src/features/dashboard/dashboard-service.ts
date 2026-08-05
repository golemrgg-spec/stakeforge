import { supabase } from '@/lib/supabase';

export interface RecentWin {
  id: string;
  username: string;
  game_type: string;
  payout: number;
  profit: number;
  created_at: string;
}

export interface LeaderboardPreviewEntry {
  user_id: string;
  username: string;
  value: number;
  rank: number | null;
}

export async function getRecentWins(limit = 10): Promise<RecentWin[]> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select(`
      id,
      game_type,
      payout,
      profit,
      created_at,
      profiles!inner(username)
    `)
    .eq('status', 'completed')
    .gt('payout', 0)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    username: (row.profiles as unknown as { username: string }).username,
    game_type: row.game_type,
    payout: row.payout ?? 0,
    profit: row.profit ?? 0,
    created_at: row.created_at,
  }));
}

export async function getLeaderboardPreview(
  metric = 'profit',
  period = 'all_time',
  limit = 5
): Promise<LeaderboardPreviewEntry[]> {
  const { data, error } = await supabase
    .from('leaderboards')
    .select(`
      user_id,
      value,
      rank,
      profiles!inner(username)
    `)
    .eq('metric', metric)
    .eq('period', period)
    .order('rank', { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    user_id: row.user_id,
    username: (row.profiles as unknown as { username: string }).username,
    value: row.value,
    rank: row.rank,
  }));
}

import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data as Profile | null;
}

export async function updateProfile(
  userId: string,
  updates: { display_name?: string; avatar_url?: string | null }
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data as Profile;
}

export async function getLeaderboard(
  metric: string = 'profit',
  period: string = 'all_time',
  limit: number = 100
): Promise<Array<{ user_id: string; value: number; rank: number | null }>> {
  const { data, error } = await supabase
    .from('leaderboards')
    .select('user_id, value, rank')
    .eq('metric', metric)
    .eq('period', period)
    .order('rank', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

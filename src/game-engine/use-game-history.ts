import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/authentication/auth-context';
import type { GameSession } from '@/types';

export function useGameHistory(gameType?: string, limit = 20) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) {
      setSessions([]);
      setLoading(false);
      return;
    }
    let query = supabase
      .from('game_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (gameType) {
      query = query.eq('game_type', gameType);
    }
    const { data, error } = await query;
    if (!error && data) {
      setSessions(data as GameSession[]);
    }
    setLoading(false);
  }, [user, gameType, limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { sessions, loading, refresh: fetch };
}

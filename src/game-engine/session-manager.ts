/**
 * Game Session Manager — manages the lifecycle of a game round.
 *
 * State machine: created → active → completed | cancelled
 *
 * The client creates a session, the Edge Function processes the bet and
 * updates the session to completed. This module provides the client-side
 * service for session operations.
 */

import { supabase } from '@/lib/supabase';
import type { GameSession } from '@/types';

export async function createSession(params: {
  userId: string;
  gameType: string;
  betAmount: number;
  clientSeed: string;
  serverSeedHash: string;
  config: Record<string, unknown>;
}): Promise<GameSession> {
  const { data, error } = await supabase
    .from('game_sessions')
    .insert({
      user_id: params.userId,
      game_type: params.gameType,
      status: 'created',
      bet_amount: params.betAmount,
      client_seed: params.clientSeed,
      server_seed_hash: params.serverSeedHash,
      config: params.config,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data as GameSession;
}

export async function getSession(sessionId: string): Promise<GameSession | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data as GameSession | null;
}

export async function getUserSessions(
  userId: string,
  limit = 20,
  offset = 0
): Promise<GameSession[]> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(error.message);
  }
  return data as GameSession[];
}

export async function updateSessionResult(
  sessionId: string,
  result: {
    status: 'completed' | 'cancelled';
    payout: number;
    profit: number;
    serverSeed: string;
    result: Record<string, unknown>;
    endedAt: string;
  }
): Promise<GameSession> {
  const { data, error } = await supabase
    .from('game_sessions')
    .update({
      status: result.status,
      payout: result.payout,
      profit: result.profit,
      server_seed: result.serverSeed,
      result: result.result,
      ended_at: result.endedAt,
    })
    .eq('id', sessionId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data as GameSession;
}

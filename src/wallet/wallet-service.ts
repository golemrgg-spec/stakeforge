import { supabase } from '@/lib/supabase';
import type { WalletTransaction, WalletTxType } from '@/types';

export interface TransactionFilter {
  type?: WalletTxType;
  limit?: number;
}

export async function getWallet(userId: string) {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function getTransactions(
  userId: string,
  filter: TransactionFilter = {}
): Promise<WalletTransaction[]> {
  let query = supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (filter.type) {
    query = query.eq('type', filter.type);
  }
  if (filter.limit) {
    query = query.limit(filter.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }
  return data as WalletTransaction[];
}

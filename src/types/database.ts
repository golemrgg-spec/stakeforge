export type UserRole = 'player' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'banned';
export type WalletTxType =
  | 'deposit'
  | 'withdrawal'
  | 'bet'
  | 'win'
  | 'refund'
  | 'bonus'
  | 'adjustment';
export type GameSessionStatus = 'created' | 'active' | 'completed' | 'cancelled';

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  locked_balance: number;
  total_wagered: number;
  lifetime_pnl: number;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  user_id: string;
  type: WalletTxType;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface GameSession {
  id: string;
  user_id: string;
  game_type: string;
  status: GameSessionStatus;
  bet_amount: number;
  payout: number | null;
  profit: number | null;
  client_seed: string;
  server_seed_hash: string;
  server_seed: string | null;
  nonce: number;
  config: Record<string, unknown>;
  result: Record<string, unknown> | null;
  created_at: string;
  ended_at: string | null;
}

export interface Bet {
  id: string;
  session_id: string;
  user_id: string;
  game_type: string;
  amount: number;
  payout: number;
  multiplier: number;
  result: Record<string, unknown>;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Settings {
  id: string;
  user_id: string;
  theme: string;
  notifications_enabled: boolean;
  email_notifications: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface AdminLog {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Leaderboard {
  id: string;
  user_id: string;
  metric: string;
  period: string;
  value: number;
  rank: number | null;
  created_at: string;
}

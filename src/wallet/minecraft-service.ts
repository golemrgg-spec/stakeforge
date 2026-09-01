import { supabase } from '@/lib/supabase';

export interface MinecraftLinkInfo {
  linked: boolean;
  minecraft_uuid?: string;
  minecraft_ign?: string;
  verified_at?: string;
}

export interface GamingWalletInfo {
  user_id: string;
  balance: number;
  updated_at: string;
}

export interface WalletTransferInfo {
  id: string;
  direction: 'minecraft_to_web' | 'web_to_minecraft';
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  completed_at: string | null;
}

export interface WithdrawResult {
  status: string;
  transfer_id: string;
  balance: number;
  idempotency_key: string;
}

function getFunctionUrl(slug: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${slug}`;
}

function getAuthHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  };
}

function getAuthenticatedHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

async function callLinkFunction(accessToken: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(getFunctionUrl('minecraft-link'), {
    method: 'POST',
    headers: getAuthenticatedHeaders(accessToken),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `Request failed (${response.status})`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function generateLinkCode(accessToken: string, minecraftIgn: string): Promise<{ code: string; expires_in_minutes: number }> {
  const data = await callLinkFunction(accessToken, { action: 'generate_code', minecraft_ign: minecraftIgn });
  return {
    code: data.code as string,
    expires_in_minutes: data.expires_in_minutes as number,
  };
}

export async function getMinecraftLink(accessToken: string): Promise<MinecraftLinkInfo> {
  const data = await callLinkFunction(accessToken, { action: 'get_link' });
  return data as unknown as MinecraftLinkInfo;
}

export async function getGamingWallet(accessToken: string): Promise<GamingWalletInfo> {
  const data = await callLinkFunction(accessToken, { action: 'get_wallet' });
  return data as unknown as GamingWalletInfo;
}

export async function withdrawToMinecraft(accessToken: string, amount: number): Promise<WithdrawResult> {
  const data = await callLinkFunction(accessToken, { action: 'withdraw', amount });
  return data as unknown as WithdrawResult;
}

export async function getWalletTransfers(accessToken: string, limit = 50): Promise<WalletTransferInfo[]> {
  const data = await callLinkFunction(accessToken, { action: 'get_transfers', limit });
  return (data.transfers as WalletTransferInfo[]) ?? [];
}

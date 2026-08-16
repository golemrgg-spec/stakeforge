/**
 * RNG Service — client-side interface to the server-side RNG.
 *
 * The actual cryptographically secure random generation happens in an Edge
 * Function using Web Crypto's `crypto.getRandomValues`. This module provides
 * the type definitions and client-side helpers that future games use to
 * request randomness from the server.
 *
 * NEVER use Math.random() in game logic. All randomness must flow through
 * the Provably Fair system.
 */

export interface RNGRequest {
  clientSeed: string;
  serverSeedHash: string;
  nonce: number;
  gameType: string;
  config: Record<string, unknown>;
}

export interface RNGResponse {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  results: number[];
  hmac: string;
}

/**
 * Calls the server-side RNG edge function to generate provably-fair random
 * values. The server reveals the seed only after the round is committed.
 */
export async function requestRNG(request: RNGRequest): Promise<RNGResponse> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rng`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    throw new Error(`RNG request failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data.results || !data.serverSeed || !data.hmac) {
    throw new Error('Invalid RNG response: missing required fields');
  }
  return data as RNGResponse;
}

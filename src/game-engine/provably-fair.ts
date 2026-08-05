/**
 * Provably Fair engine — client-side verification utilities.
 *
 * The server generates a secret server seed and sends only its SHA-256 hash
 * to the client before the round. After the round ends, the server reveals
 * the original seed so the client can verify the hash matches and that the
 * outcome was deterministic given (clientSeed, serverSeed, nonce).
 *
 * The actual RNG runs server-side in an Edge Function using crypto.getRandomValues.
 * This module provides verification logic so players can confirm fairness.
 */

const SUBMISSIONS = 25;

export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyServerSeed(serverSeed: string, serverSeedHash: string): Promise<boolean> {
  const computed = await sha256(serverSeed);
  return computed === serverSeedHash;
}

export interface ProvablyFairResult {
  /**
   * A float in [0, 1) derived deterministically from the seeds + nonce.
   */
  float: number;
  /**
   * The HMAC-SHA256 hex string used as the basis for the float.
   */
  hmac: string;
}

export async function generateProvablyFairFloat(
  clientSeed: string,
  serverSeed: string,
  nonce: number
): Promise<ProvablyFairResult> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(serverSeed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const message = new TextEncoder().encode(`${clientSeed}:${nonce}`);
  const signature = await crypto.subtle.sign('HMAC', key, message);
  const hmacHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const float = hexToFloat(hmacHex);
  return { float, hmac: hmacHex };
}

function hexToFloat(hex: string): number {
  // Take the first 8 hex chars (32 bits) and normalize to [0, 1)
  const chunk = hex.substring(0, 8);
  const intVal = parseInt(chunk, 16);
  return intVal / 0x100000000;
}

/**
 * Returns an array of N provably-fair floats for games that need multiple
 * random values per round (e.g. Mines tile placement).
 */
export async function generateProvablyFairFloats(
  clientSeed: string,
  serverSeed: string,
  nonce: number,
  count: number
): Promise<ProvablyFairResult[]> {
  const results: ProvablyFairResult[] = [];
  for (let i = 0; i < count; i++) {
    const result = await generateProvablyFairFloat(clientSeed, serverSeed, nonce + i);
    results.push(result);
  }
  return results;
}

/**
 * Fisher-Yates shuffle seeded by provably-fair floats.
 * Used for games like Mines where positions must be randomized deterministically.
 */
export async function provablyFairShuffle(
  clientSeed: string,
  serverSeed: string,
  nonce: number,
  items: number[]
): Promise<number[]> {
  const result = [...items];
  const floats = await generateProvablyFairFloats(clientSeed, serverSeed, nonce, result.length);

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(floats[i].float * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function generateClientSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SUBMISSIONS));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

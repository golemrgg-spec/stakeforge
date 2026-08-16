import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GROWTH_HALF_LIFE = 8;
const COUNTDOWN_SECONDS = 15;
const ROUND_END_DELAY_MS = 4000;
const TICK_INTERVAL_MS = 200;

function multiplierAt(elapsedSec: number): number {
  return Math.floor(Math.pow(2, elapsedSec / GROWTH_HALF_LIFE) * 100) / 100;
}

async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const buf = new Uint8Array(hash);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateCrashPoint(serverSeed: string, clientSeed: string, nonce: number, houseEdge: number): Promise<number> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(serverSeed),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const message = new TextEncoder().encode(`${clientSeed}:${nonce}`);
  const sig = await crypto.subtle.sign("HMAC", key, message);
  const hmacHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const chunk = hmacHex.substring(0, 8);
  const intVal = parseInt(chunk, 16);
  const f = intVal / 0x100000000;
  const clamped = Math.min(f, 0.999999);
  return Math.max(1.0, Math.floor((100 * (1 - houseEdge)) / (1 - clamped)) / 100);
}

function randomHexSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function createNewRound(supabase: ReturnType<typeof createClient>, prevRound: Record<string, unknown> | null) {
  const { data: cfg } = await supabase
    .from("game_configs")
    .select("*")
    .eq("game_type", "crash")
    .maybeSingle();

  const houseEdge = cfg ? parseFloat(cfg.house_edge as string) : 0.01;

  const { data: lastRound } = await supabase
    .from("crash_rounds")
    .select("round_number")
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const roundNumber = (lastRound?.round_number ?? 0) + 1;

  const serverSeed = randomHexSeed();
  const serverSeedHash = await sha256Hex(serverSeed);
  const clientSeed = randomHexSeed().substring(0, 16);
  const nonce = 0;
  const crashPoint = await generateCrashPoint(serverSeed, clientSeed, nonce, houseEdge);

  const countdownEnds = new Date(Date.now() + COUNTDOWN_SECONDS * 1000).toISOString();

  await supabase.from("crash_rounds").insert({
    round_number: roundNumber,
    phase: "betting",
    countdown_ends_at: countdownEnds,
    crash_point: crashPoint,
    multiplier: 1.0,
    server_seed: serverSeed,
    server_seed_hash: serverSeedHash,
    client_seed: clientSeed,
    nonce: nonce,
    prev_server_seed: prevRound?.server_seed ?? null,
    prev_server_seed_hash: prevRound?.server_seed_hash ?? null,
    prev_crash_point: prevRound?.crash_point ?? null,
  });

  return { roundNumber, crashPoint, serverSeed, serverSeedHash, clientSeed, nonce };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { action } = await req.json();

    if (action === "ensure_running") {
      const { data: active } = await supabase
        .from("crash_rounds")
        .select("id, phase")
        .in("phase", ["betting", "running"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (active) {
        return json({ status: "already_running" });
      }

      const roundInfo = await createNewRound(supabase, null);
      runRoundLifecycle(supabase, roundInfo.serverSeed, roundInfo.roundNumber).catch((e) =>
        console.error("Round lifecycle error:", e)
      );

      return json({ status: "started", round_number: roundInfo.roundNumber });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

async function runRoundLifecycle(supabase: ReturnType<typeof createClient>, _serverSeed: string, roundNumber: number) {
  for (let i = 0; i < COUNTDOWN_SECONDS; i++) {
    await sleep(1000);
  }

  const { data: round } = await supabase
    .from("crash_rounds")
    .select("*")
    .eq("round_number", roundNumber)
    .maybeSingle();

  if (!round || round.phase !== "betting") return;

  await supabase.from("crash_rounds").update({
    phase: "running",
    started_at: new Date().toISOString(),
  }).eq("id", round.id);

  const crashPoint = parseFloat(round.crash_point as string);
  const startTime = Date.now();

  while (true) {
    const elapsed = (Date.now() - startTime) / 1000;
    const m = multiplierAt(elapsed);

    if (m >= crashPoint) {
      await supabase.from("crash_bets").update({ status: "crashed" })
        .eq("round_id", round.id).eq("status", "active");

      await supabase.from("crash_rounds").update({
        phase: "crashed",
        multiplier: crashPoint,
        ended_at: new Date().toISOString(),
      }).eq("id", round.id);

      break;
    }

    await supabase.from("crash_rounds").update({ multiplier: m }).eq("id", round.id);
    await sleep(TICK_INTERVAL_MS);
  }

  await sleep(ROUND_END_DELAY_MS);

  const prevRoundData = {
    server_seed: round.server_seed,
    server_seed_hash: round.server_seed_hash,
    crash_point: round.crash_point,
  };

  const nextRound = await createNewRound(supabase, prevRoundData);
  runRoundLifecycle(supabase, nextRound.serverSeed, nextRound.roundNumber).catch((e) =>
    console.error("Next round lifecycle error:", e)
  );
}

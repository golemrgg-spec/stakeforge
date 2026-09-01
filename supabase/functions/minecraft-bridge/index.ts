import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Server-Token",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Read server token from database
  const { data: tokenData, error: tokenError } = await supabase
    .from("minecraft_server_config")
    .select("value")
    .eq("key", "server_token")
    .maybeSingle();

  if (tokenError || !tokenData) {
    return json({ error: "Server not configured" }, 500);
  }

  const serverToken = tokenData.value;
  const providedToken = req.headers.get("X-Server-Token");
  if (!providedToken || providedToken !== serverToken) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "verify_link") {
      const { code, minecraft_uuid, minecraft_ign } = body;
      if (!code || !minecraft_uuid || !minecraft_ign) {
        return json({ error: "Missing required fields" }, 400);
      }

      const { data, error } = await supabase.rpc("verify_minecraft_link", {
        p_code: code,
        p_minecraft_uuid: minecraft_uuid,
        p_minecraft_ign: minecraft_ign,
      });

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json({ success: true, verified: data });
    }

    if (action === "deposit") {
      const { transfer_id, minecraft_uuid, amount, idempotency_key } = body;
      if (!transfer_id || !minecraft_uuid || !amount || !idempotency_key) {
        return json({ error: "Missing required fields" }, 400);
      }

      const amountCents = Math.round(amount * 100);
      if (amountCents <= 0) {
        return json({ error: "Invalid amount" }, 400);
      }

      const { data, error } = await supabase.rpc("minecraft_deposit", {
        p_transfer_id: transfer_id,
        p_minecraft_uuid: minecraft_uuid,
        p_amount: amountCents,
        p_idempotency_key: idempotency_key,
      });

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json(data);
    }

    if (action === "get_pending_withdrawals") {
      const { data, error } = await supabase.rpc("minecraft_get_pending_withdrawals");

      if (error) {
        return json({ error: error.message }, 500);
      }

      return json({ withdrawals: data });
    }

    if (action === "acknowledge_withdrawal") {
      const { transfer_id, idempotency_key, success } = body;
      if (!transfer_id || !idempotency_key || success === undefined) {
        return json({ error: "Missing required fields" }, 400);
      }

      const { data, error } = await supabase.rpc("minecraft_acknowledge_withdrawal", {
        p_transfer_id: transfer_id,
        p_idempotency_key: idempotency_key,
        p_success: success,
      });

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json(data);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const { action, minecraft_ign } = body;

    if (action === "generate_code") {
      if (!minecraft_ign || minecraft_ign.trim().length < 3) {
        return json({ error: "Invalid Minecraft username" }, 400);
      }

      const { data, error } = await supabase.rpc("generate_link_code", {
        p_minecraft_ign: minecraft_ign.trim(),
      });

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json({ code: data, expires_in_minutes: 10 });
    }

    if (action === "get_link") {
      const { data, error } = await supabase.rpc("get_minecraft_link");
      if (error) {
        return json({ error: error.message }, 400);
      }
      return json(data);
    }

    if (action === "get_wallet") {
      const { data, error } = await supabase.rpc("get_gaming_wallet");
      if (error) {
        return json({ error: error.message }, 400);
      }
      return json(data);
    }

    if (action === "withdraw") {
      const { amount } = body;
      if (!amount || amount <= 0) {
        return json({ error: "Invalid amount" }, 400);
      }

      const amountCents = Math.round(amount * 100);

      const { data, error } = await supabase.rpc("minecraft_withdraw", {
        p_amount: amountCents,
      });

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json(data);
    }

    if (action === "get_transfers") {
      const { limit } = body;
      const { data, error } = await supabase.rpc("get_wallet_transfers", {
        p_limit: limit || 50,
      });

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json({ transfers: data });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

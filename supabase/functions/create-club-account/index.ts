import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Mot de passe temporaire lisible (sans caracteres ambigus) que l'admin
// transmettra au club ; le club le changera ensuite.
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Seule la federation (admin) peut creer un compte de club.
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await caller.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: prof } = await admin
      .from("profiles").select("role").eq("id", user.id).single();
    if (prof?.role !== "admin") return json({ error: "forbidden" }, 403);

    const payload = await req.json().catch(() => ({}));
    const email = (payload?.email ?? "").toString().trim().toLowerCase();
    const teamId = (payload?.team_id ?? "").toString();
    const fullName = (payload?.full_name ?? "").toString().trim();
    const provided = typeof payload?.password === "string" ? payload.password : "";
    if (!email || !teamId) return json({ error: "email and team_id required" }, 400);

    // Le club doit exister.
    const { data: team } = await admin.from("teams").select("id").eq("id", teamId).maybeSingle();
    if (!team) return json({ error: "unknown team" }, 400);

    const password = provided.length >= 6 ? provided : generatePassword();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created?.user) {
      return json({ error: createErr?.message ?? "could not create account" }, 400);
    }
    const uid = created.user.id;

    // Rattache le compte au club. En cas d'echec, on supprime le compte pour ne
    // pas laisser un utilisateur orphelin sans club.
    const { error: linkErr } = await admin.from("club_members").insert({ user_id: uid, team_id: teamId });
    if (linkErr) {
      await admin.auth.admin.deleteUser(uid);
      return json({ error: linkErr.message }, 400);
    }

    return json({ user_id: uid, email, password, generated: provided.length < 6 });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Identifie l'appelant
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await caller.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    // Client admin (service role)
    const admin = createClient(url, serviceKey);
    const { data: prof } = await admin
      .from("profiles").select("role").eq("id", user.id).single();
    const isAdmin = prof?.role === "admin";

    const payload = await req.json().catch(() => ({}));
    const { title, body, team_ids, data } = payload ?? {};
    if (!title || !body) return json({ error: "title and body required" }, 400);

    // Autorisation. L'admin notifie qui il veut. Un dirigeant de club ne peut
    // notifier QUE les abonnes des clubs qu'il gere : jamais un envoi global,
    // jamais les abonnes d'un autre club.
    if (!isAdmin) {
      if (!Array.isArray(team_ids) || team_ids.length === 0) {
        return json({ error: "forbidden" }, 403);
      }
      const { data: mine } = await admin
        .from("club_members").select("team_id").eq("user_id", user.id);
      const managed = new Set((mine ?? []).map((r: any) => r.team_id));
      if (!team_ids.every((id: any) => managed.has(id))) {
        return json({ error: "forbidden" }, 403);
      }
    }

    let tokens: string[] = [];
    if (Array.isArray(team_ids) && team_ids.length > 0) {
      const { data: favs } = await admin
        .from("favorites").select("user_id").in("team_id", team_ids);
      const userIds = [...new Set((favs ?? []).map((f: any) => f.user_id))];
      if (userIds.length > 0) {
        const { data: profs } = await admin
          .from("profiles").select("push_token").in("id", userIds).not("push_token", "is", null);
        tokens = (profs ?? []).map((p: any) => p.push_token).filter(Boolean);
      }
    } else {
      const { data: profs } = await admin
        .from("profiles").select("push_token").not("push_token", "is", null);
      tokens = (profs ?? []).map((p: any) => p.push_token).filter(Boolean);
    }

    tokens = [...new Set(tokens)];
    if (tokens.length === 0) return json({ sent: 0, message: "no recipients" });

    const messages = tokens.map((to) => ({ to, sound: "default", title, body, data: data ?? {} }));
    let sent = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(chunk),
      });
      if (res.ok) sent += chunk.length;
    }
    return json({ sent });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

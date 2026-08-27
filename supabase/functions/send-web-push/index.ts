// Edge Function « send-web-push » — Feature 07 (canal WEB) : notifie les abonnés
// d'un club via Web Push (VAPID) quand celui-ci publie depuis le site.
// Distinct de « send-push » (canal mobile, jetons Expo) — les deux cohabitent.
// Appelée par le responsable du club (JWT vérifié). Lit les abonnés (favorites)
// + leurs abonnements navigateur (push_subscriptions) en service_role, puis
// envoie un message Web Push chiffré et signé VAPID à chaque appareil.
//
// Secrets requis (Dashboard → Edge Functions → Secrets) :
//   VAPID_KEYS    = JSON {"publicKey":{...},"privateKey":{...}} (généré hors-ligne)
//   VAPID_SUBJECT = mailto:infos@feguiba.org  (optionnel, défaut ci-dessous)
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY sont fournis.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const teamId = payload.team_id as string | undefined;
  const title = String(payload.title ?? "").slice(0, 120).trim();
  const body = String(payload.body ?? "").slice(0, 300).trim();
  const url = String(payload.url ?? "/");
  if (!teamId || !title) return json({ error: "team_id_and_title_required" }, 400);

  // 1) Identifier l'appelant, puis vérifier qu'il dirige ce club (ou est admin).
  // Même schéma d'autorisation que « send-push » (mobile), sans dépendre d'un
  // droit d'exécution sur manages_team.
  const caller = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await caller.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (prof?.role !== "admin") {
    const { data: mine } = await admin.from("club_members").select("team_id").eq("user_id", user.id).eq("team_id", teamId);
    if (!mine || mine.length === 0) return json({ error: "not_authorized" }, 403);
  }

  // 2) VAPID
  const vapidRaw = Deno.env.get("VAPID_KEYS");
  if (!vapidRaw) return json({ error: "vapid_not_configured" }, 503);
  let appServer: webpush.ApplicationServer;
  try {
    const keys = await webpush.importVapidKeys(JSON.parse(vapidRaw), { extractable: false });
    appServer = await webpush.ApplicationServer.new({
      contactInformation: Deno.env.get("VAPID_SUBJECT") ?? "mailto:infos@feguiba.org",
      vapidKeys: keys,
    });
  } catch (e) {
    return json({ error: "vapid_invalid", detail: String(e) }, 500);
  }

  // 3) Abonnés (favorites) puis leurs abonnements push navigateur (service_role)
  const { data: favs, error: fErr } = await admin.from("favorites").select("user_id").eq("team_id", teamId);
  if (fErr) return json({ error: "followers_query_failed", detail: fErr.message }, 500);
  const userIds = [...new Set((favs ?? []).map((f) => f.user_id))];
  if (userIds.length === 0) return json({ sent: 0, failed: 0, total: 0, followers: 0 });

  const { data: subs, error: sErr } = await admin.from("push_subscriptions").select("*").in("user_id", userIds);
  if (sErr) return json({ error: "subscriptions_query_failed", detail: sErr.message }, 500);
  const list = subs ?? [];

  const msg = JSON.stringify({
    title, body, url,
    icon: "/assets/icon.png",
    badge: "/assets/favicon.png",
  });

  let sent = 0, failed = 0;
  const stale: string[] = [];
  for (const s of list) {
    try {
      const subscriber = appServer.subscribe({
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      });
      await subscriber.pushTextMessage(msg, {});
      sent++;
    } catch (e) {
      failed++;
      // deno-lint-ignore no-explicit-any
      const status = (e as any)?.response?.status ?? (e as any)?.status;
      if (status === 404 || status === 410) stale.push(s.id);
    }
  }
  if (stale.length) await admin.from("push_subscriptions").delete().in("id", stale);

  return json({ sent, failed, total: list.length, followers: userIds.length, cleaned: stale.length });
});

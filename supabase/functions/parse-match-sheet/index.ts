// ─────────────────────────────────────────────────────────────
// Edge Function : parse-match-sheet
//
// À partir d'une PHOTO de feuille de match (FIBA / box score), Gemini (vision)
// extrait les statistiques de chaque joueur, équipe par équipe. L'admin vérifie
// et corrige, puis enregistre. Réservé aux administrateurs (fédération).
//
// IA : Google Gemini (comme AfriSwap) — modèle gemini-2.5-flash, repli
//      gemini-2.5-flash-lite. Sortie JSON structurée (responseSchema).
// Secret : GEMINI_API_KEY (le même compte Google que AfriSwap peut être réutilisé).
//
// Contrat inchangé côté app :
//   Entrée  : { image_base64: string, media_type?: string }
//   Sortie  : { result: { teams: [...], notes } }  ou  { error: string }
// ─────────────────────────────────────────────────────────────
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const MODELES = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

const PROMPT =
  "Tu es un officiel de table de basket-ball. Analyse cette feuille de match (feuille FIBA ou box " +
  "score) et extrais les statistiques de chaque joueur inscrit, équipe par équipe : nom, numéro de " +
  "maillot, points, rebonds, passes décisives, interceptions, contres, fautes, tirs réussis/tentés, " +
  "3 points réussis/tentés, lancers francs réussis/tentés. Si une statistique n'apparaît pas, mets 0. " +
  "Si le numéro est illisible, mets null. N'invente jamais de données : n'extrais que ce qui est " +
  "réellement lisible. Dans \"notes\", signale les zones illisibles ou incertaines.";

// Schéma Gemini (sous-ensemble OpenAPI) : pas de additionalProperties ; les
// champs nullables utilisent `nullable: true` plutôt qu'un anyOf.
const playerProps: Record<string, unknown> = {
  name: { type: "string" },
  number: { type: "integer", nullable: true },
  points: { type: "integer" }, rebounds: { type: "integer" }, assists: { type: "integer" },
  steals: { type: "integer" }, blocks: { type: "integer" }, fouls: { type: "integer" },
  fg_made: { type: "integer" }, fg_att: { type: "integer" },
  three_made: { type: "integer" }, three_att: { type: "integer" },
  ft_made: { type: "integer" }, ft_att: { type: "integer" },
};
const SCHEMA = {
  type: "object",
  properties: {
    teams: {
      type: "array",
      items: {
        type: "object",
        properties: {
          team_name: { type: "string" },
          players: {
            type: "array",
            items: { type: "object", properties: playerProps, required: Object.keys(playerProps) },
          },
        },
        required: ["team_name", "players"],
      },
    },
    notes: { type: "string" },
  },
  required: ["teams", "notes"],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function genererAvecGemini(apiKey: string, parts: unknown[]) {
  let dernier: { status: number; detail: string } = { status: 0, detail: "" };
  for (const model of MODELES) {
    for (let essai = 0; essai < 2; essai++) {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: SCHEMA,
            // La lecture de tableau ne demande pas de raisonnement : on coupe le
            // « thinking » de Flash 2.5 pour ne pas épuiser le budget de sortie.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const txt =
          data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
        if (txt) return { txt };
        dernier = { status: 502, detail: "réponse vide" };
      } else {
        dernier = { status: r.status, detail: (await r.text()).slice(0, 200) };
        console.error("Gemini error:", model, r.status, dernier.detail);
        if (![429, 500, 502, 503].includes(r.status)) return { error: dernier };
        await sleep(500);
      }
    }
  }
  return { error: dernier };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Réservé aux administrateurs (fédération).
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await caller.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);
    const admin = createClient(url, serviceKey);
    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (prof?.role !== "admin") return json({ error: "forbidden" }, 403);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "GEMINI_API_KEY non configurée dans les secrets de la fonction." }, 500);

    const { image_base64, media_type } = await req.json().catch(() => ({}));
    if (!image_base64) return json({ error: "image manquante" }, 400);
    if (typeof image_base64 !== "string" || image_base64.length > 8_000_000) {
      return json({ error: "Image trop volumineuse (max ~6 Mo). Réduis la qualité de la photo." }, 413);
    }

    const parts = [
      { text: PROMPT },
      { inline_data: { mime_type: media_type ?? "image/jpeg", data: image_base64 } },
    ];

    const res = await genererAvecGemini(apiKey, parts);
    if ((res as { error?: unknown }).error) {
      return json({ error: "Erreur du service IA (Gemini).", detail: (res as { error: unknown }).error }, 502);
    }

    let parsed;
    try {
      parsed = JSON.parse((res as { txt: string }).txt);
    } catch {
      return json({ error: "Réponse IA illisible.", raw: (res as { txt: string }).txt }, 502);
    }
    return json({ result: parsed });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

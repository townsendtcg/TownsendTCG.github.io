// Townsend TCG card scanner relay (Cloudflare Worker)
// Keeps the Gemini key off the public site. Only townsendtcg.github.io may call it.
// Needs a secret named GEMINI_API_KEY (Settings > Variables and Secrets).
// Optional plain variable GEMINI_MODELS (comma separated, tried in order) to change models later.

const ALLOWED = ["https://townsendtcg.github.io"];

const SCHEMA = {
  type: "OBJECT",
  properties: {
    cards: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          set: { type: "STRING" },
          number: { type: "STRING" },
          printing: { type: "STRING", enum: ["Normal", "Holo", "Reverse", "1st Ed"] },
          graded: { type: "BOOLEAN" },
          grade: { type: "STRING" },
          kind: { type: "STRING", enum: ["single", "sealed"] },
          language: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["name", "number", "printing", "kind", "confidence"],
      },
    },
    cash: { type: "NUMBER" },
  },
  required: ["cards"],
};

const PROMPT = `You are reading a photo of Pokemon trading cards for a card vendor's inventory.
List every distinct physical card or sealed product you can see, one entry per physical item (two copies = two entries).
For each card:
- name: the English card name exactly as printed, including suffixes like "ex", "V", "VMAX", "GX", "EX" (e.g. "Charizard ex", "Umbreon VMAX").
- number: the collector number exactly as printed in the bottom corner, including the set total when shown (e.g. "199/165", "TG05/TG30", "SWSH050"). Use "" if you truly cannot read it.
- set: the set name if you can tell it from the set symbol, set code, or context; otherwise "".
- printing: "Reverse" if the card body (not the art box) has holo foil, "Holo" if the art box is holo, "1st Ed" if it has a 1st Edition stamp, else "Normal".
- graded: true if the card is in a grading slab; put the grader and grade in grade (e.g. "PSA 10").
- kind: "sealed" for packs, boxes and tins, else "single".
- language: the card's language, e.g. "English", "Japanese".
- confidence: "low" if glare, blur, sleeves or angle make the name or number uncertain.
Do not guess numbers you cannot see.`;

const DEAL_EXTRA = `
This photo is from a trade or sale at the table. Also estimate the total US dollars of visible cash in "cash" (0 if none; bills may overlap, so be conservative).`;

// Tried in order. Full Flash first for accuracy, Lite models as backup when Google is busy.
const modelList = (env) =>
  String(env.GEMINI_MODELS || env.GEMINI_MODEL || "gemini-flash-latest,gemini-3.5-flash,gemini-flash-lite-latest,gemini-3.5-flash-lite")
    .split(",").map((s) => s.trim()).filter(Boolean);

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json" } });

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = ALLOWED.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };

    if (req.method === "OPTIONS") return new Response(null, { status: allowed ? 204 : 403, headers: cors });

    // Health check: open the Worker URL in a browser to confirm it's running and the key is set.
    if (req.method === "GET") {
      const u = new URL(req.url);
      // TCGplayer price data from TCGCSV (free daily dump). Browsers can't call it directly,
      // so the register asks through here. Only the Pokemon groups/products/prices files.
      if (u.searchParams.has("csv")) {
        if (!allowed) return json({ error: "forbidden" }, 403, cors);
        const path = u.searchParams.get("csv") || "";
        if (!/^tcgplayer\/3\/(groups|\d+\/(products|prices))$/.test(path)) return json({ error: "bad path" }, 400, cors);
        const r = await fetch(`https://tcgcsv.com/${path}`, {
          headers: { "User-Agent": "TownsendTCG-BoothBook/1.0 (townsendtcg.github.io)" },
          cf: { cacheTtl: 21600, cacheEverything: true },
        });
        return new Response(r.body, { status: r.status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=21600" } });
      }
      if (u.searchParams.has("models") && env.GEMINI_API_KEY) {
        const lr = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
        const ld = await lr.json().catch(() => ({}));
        const names = (ld.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name.replace("models/", ""));
        return json({ ok: lr.ok, models: names, error: ld?.error?.message }, 200, cors);
      }
      return json({ ok: true, keySet: !!env.GEMINI_API_KEY, models: modelList(env) }, 200, cors);
    }

    if (!allowed) return json({ error: "forbidden" }, 403, cors);
    if (req.method !== "POST") return json({ error: "POST only" }, 405, cors);
    if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY secret is not set" }, 500, cors);

    let body;
    try { body = await req.json(); } catch { return json({ error: "bad request" }, 400, cors); }
    const image = String(body.image || "").replace(/^data:image\/\w+;base64,/, "");
    if (!image) return json({ error: "no image" }, 400, cors);
    if (image.length > 7_000_000) return json({ error: "image too large" }, 413, cors);

    const payload = JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: image } },
          { text: PROMPT + (body.mode === "deal" ? DEAL_EXTRA : "") },
        ],
      }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
    });

    // Try each model in order; move on when one is overloaded, rate limited, or unavailable.
    let data = {}, lastErr = "", lastStatus = 502, usedModel = "";
    for (const model of modelList(env)) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: payload,
      });
      data = await r.json().catch(() => ({}));
      if (r.ok) { usedModel = model; break; }
      lastErr = data?.error?.message || `Gemini error ${r.status}`;
      lastStatus = r.status;
      if (![404, 429, 500, 503].includes(r.status)) break;
      data = {};
    }
    if (!usedModel) return json({ error: lastErr }, lastStatus === 429 ? 429 : 502, cors);
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    let parsed;
    try { parsed = JSON.parse(text || "{}"); } catch { parsed = {}; }
    return json({ cards: Array.isArray(parsed.cards) ? parsed.cards : [], cash: Number(parsed.cash) || 0, model: usedModel }, 200, cors);
  },
};

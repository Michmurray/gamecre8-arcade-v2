// api/generate.js — fail-safe prompt→assets with debug info
export default async function handler(req, res) {
  try {
    const prompt = String((req.query && req.query.prompt) || "");
    const P = prompt.toLowerCase();

    const words = new Set(
      P.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean)
    );
    const has = (...arr) => arr.some(w => words.has(w));

    // Synonym buckets
    const B = {
      space:   ["space","galaxy","cosmos","moon","astro","star","sci-fi","scifi"],
      night:   ["night","dark","noir","midnight"],
      forest:  ["forest","woods","trees","woodland","grass"],
      grass:   ["grass","field","meadow","plain","plains"],
      desert:  ["desert","sand","dunes","hot"],
      fall:    ["fall","autumn","orange","leaf","leaves"],
      castle:  ["castle","medieval","keep","fortress","stone"],
      water:   ["water","ocean","sea","underwater","river","lake"],
      // players
      zombie:  ["zombie","undead","ghoul","horror"],
      soldier: ["soldier","army","military","troop","rifle","gun"],
      enemy:   ["enemy","alien","ufo","ship","spaceship","fighter","plane","jet","bug","monster","boss","drone","bird"]
    };

    // Gameplay knobs
    let speed = has("fast","speed","runner","dash","quick") ? 5 : (has("slow","chill","cozy") ? 2.5 : 3);
    let gravity = 0.7; if (has(...B.space)) gravity = 0.4; if (has(...B.water)) gravity = 0.5; if (has("heavy","hardcore")) gravity = 0.9;
    let theme = (has(...B.night, ...B.space) || has("horror")) ? "dark" : "light";
    let platformRate = has("platformer","parkour","jump") ? 0.08 : 0.06;
    let coinRate = has("collect","coin","ring","rings","gems","collectibles","kids","kid","cozy") ? 0.08 : 0.05;
    let hazardRate = has("lava","spike","enemy","bullet","trap","hard","difficult") ? 0.05 : (has("kids","kid","cozy") ? 0.015 : 0.03);
    let jump = has("parkour","ninja","high","bouncy") ? 14 : 12; if (gravity < 0.6) jump = Math.max(jump,13);

    // Load manifest
    const proto = (req.headers["x-forwarded-proto"] || "https");
    const host  = req.headers.host;
    const url   = `${proto}://${host}/assets/manifest.json`;
    let manifest = null;
    try { const r = await fetch(url); if (r.ok) manifest = await r.json(); } catch {}

    const bgs = Array.isArray(manifest?.backgrounds) ? manifest.backgrounds : [];
    const pls = Array.isArray(manifest?.players)     ? manifest.players     : [];

    // Scoring
    function score(tags=[]) {
      let s = 0;
      for (const t of tags.map(x => String(x||"").toLowerCase())) {
        if (words.has(t)) s += 1;
        for (const bucket of Object.values(B)) { if (bucket.includes(t)) { s += 1; break; } }
      }
      return s;
    }
    function pick(items, bias=[]) {
      if (!items.length) return null;
      let best = items[0], bestS = -1;
      for (const it of items) {
        const s = score([...(it.tags||[]), ...bias]);
        if (s > bestS) { bestS = s; best = it; }
      }
      return best;
    }
    const first = arr => (arr && arr.length ? arr[0] : null);

    const bgBias = []
      .concat(has(...B.space)  ? ["space"]  : [])
      .concat(has(...B.night)  ? ["night"]  : [])
      .concat(has(...B.forest) ? ["forest"] : [])
      .concat(has(...B.grass)  ? ["grass"]  : [])
      .concat(has(...B.desert) ? ["desert"] : [])
      .concat(has(...B.fall)   ? ["fall"]   : [])
      .concat(has(...B.castle) ? ["castle"] : [])
      .concat(has(...B.water)  ? ["water"]  : []);

    const plBias = []
      .concat(has(...B.zombie)  ? ["zombie"]  : [])
      .concat(has(...B.soldier) ? ["soldier"] : [])
      .concat(has(...B.enemy)   ? ["enemy","alien","ship","drone","bird"] : []);

    const chosenBg     = pick(bgs, bgBias) || first(bgs);
    const chosenPlayer = pick(pls, plBias) || first(pls);

    const config = {
      speed, gravity, theme, platformRate, coinRate, hazardRate, jump,
      assets: {
        background: chosenBg?.path || null,
        player:     chosenPlayer?.path || null,
        playerFrame: chosenPlayer?.frame || null
      }
    };

    // Tilesheet fallback
    if (!config.assets.playerFrame && (config.assets.player || "").toLowerCase().includes("tilesheet")) {
      config.assets.playerFrame = { cols: 8, rows: 1 };
    }

    res.status(200).json({
      ok:true, message:"Config+assets generated from prompt", prompt,
      config,
      debug: {
        counts: { backgrounds: bgs.length, players: pls.length },
        chosen: { background: chosenBg?.id || null, player: chosenPlayer?.id || null }
      },
      ts:new Date().toISOString()
    });
  } catch {
    res.status(200).json({
      ok:true, message:"Default config (API error handled)",
      prompt:String((req.query && req.query.prompt) || ""),
      config:{ speed:3, gravity:0.7, theme:'light', platformRate:0.06, coinRate:0.05, hazardRate:0.03, jump:12,
        assets:{ background:null, player:null, playerFrame:null } },
      ts:new Date().toISOString()
    });
  }
}

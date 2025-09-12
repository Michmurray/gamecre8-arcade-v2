// api/generate.js
// Prompt -> config, with AI mode support (?ai=1 or empty prompt).
export default async function handler(req, res) {
  try {
    const prompt = String((req.query && req.query.prompt) || "");
    const useAI  = (String(req.query?.ai||"") === "1") || !prompt.trim();
    const proto  = (req.headers["x-forwarded-proto"] || "https");
    const host   = req.headers.host;

    // load manifest
    let manifest=null;
    try{ const r=await fetch(`${proto}://${host}/assets/manifest.json`); if(r.ok) manifest=await r.json(); }catch{}
    const bgs = Array.isArray(manifest?.backgrounds)?manifest.backgrounds:[];
    const pls = Array.isArray(manifest?.players)?manifest.players:[];

    // if AI mode, ask /api/design for a spec
    let design=null;
    if (useAI) {
      try{
        const r = await fetch(`${proto}://${host}/api/design?prompt=${encodeURIComponent(prompt)}`);
        if (r.ok) { const j=await r.json(); design=j.design||null; }
      }catch{}
    }

    // helper: pick by id or fallback to first
    const byId = (arr,id)=>arr.find(x=>x.id===id) || null;
    const firstOr = (arr, v=null)=> (arr && arr.length? arr[0] : v);

    // basic word scoring for non-AI path
    const P = prompt.toLowerCase();
    const words = new Set(P.replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(Boolean));
    const buckets = {
      space:["space","galaxy","cosmos","star","sci-fi","scifi"],
      night:["night","dark","noir","midnight"],
      forest:["forest","woods","trees","grass"],
      grass:["grass","field","meadow","plains"],
      desert:["desert","sand","dunes","hot"],
      fall:["fall","autumn","orange","leaf","leaves"],
      castle:["castle","medieval","keep","fortress","stone"],
      water:["water","ocean","sea","underwater","river","lake"],
      zombie:["zombie","undead","ghoul","horror"],
      soldier:["soldier","army","military","troop","rifle","gun"],
      enemy:["enemy","alien","ufo","ship","spaceship","fighter","plane","jet","bug","monster","boss","drone","bird"]
    };
    const hasAny = (arr)=>arr.some(w=>words.has(w));

    function score(tags=[]){
      let s=0;
      for(const t of tags.map(x=>String(x||"").toLowerCase())){
        if (words.has(t)) s+=1;
        for(const list of Object.values(buckets)){ if(list.includes(t)){ s+=1; break; } }
      }
      return s;
    }
    function pick(items,bias=[]){
      if(!items.length) return null;
      let best=items[0], bestS=-1;
      for(const it of items){
        const s = score([...(it.tags||[]), ...bias]);
        if(s>bestS){ bestS=s; best=it; }
      }
      return best;
    }

    // Choose assets
    let chosenBg=null, chosenPl=null;
    if (design) {
      chosenBg = (design.chosen?.backgroundId) ? byId(bgs, design.chosen.backgroundId) : null;
      chosenPl = (design.chosen?.playerId)     ? byId(pls, design.chosen.playerId)     : null;
      if (!chosenBg) chosenBg = pick(bgs, design.tags?.bg || []) || firstOr(bgs);
      if (!chosenPl) chosenPl = pick(pls, design.tags?.player || []) || firstOr(pls);
    } else {
      const bgBias=[]
        .concat(hasAny(buckets.space)?["space"]:[])
        .concat(hasAny(buckets.night)?["night"]:[])
        .concat(hasAny(buckets.forest)?["forest"]:[])
        .concat(hasAny(buckets.grass)?["grass"]:[])
        .concat(hasAny(buckets.desert)?["desert"]:[])
        .concat(hasAny(buckets.fall)?["fall"]:[])
        .concat(hasAny(buckets.castle)?["castle"]:[])
        .concat(hasAny(buckets.water)?["water"]:[]);
      const plBias=[]
        .concat(hasAny(buckets.zombie)?["zombie"]:[])
        .concat(hasAny(buckets.soldier)?["soldier"]:[])
        .concat(hasAny(buckets.enemy)?["enemy","alien","ship","drone","bird"]:[]);
      chosenBg = pick(bgs, bgBias) || firstOr(bgs);
      chosenPl = pick(pls, plBias) || firstOr(pls);
    }

    // Gameplay knobs
    let speed = /fast|speed|runner|dash|quick/.test(P) ? 5 : (/slow|chill|cozy/.test(P) ? 2.5 : 3);
    let gravity = 0.7;
    let themeMode = (hasAny(buckets.night)||hasAny(buckets.space)||/horror/.test(P)) ? "dark" : "light";
    let platformRate = /platformer|parkour|jump/.test(P) ? 0.08 : 0.06;
    let coinRate = /collect|coin|ring|rings|gems|collectibles|kids|kid|cozy/.test(P) ? 0.08 : 0.05;
    let hazardRate = /lava|spike|enemy|bullet|trap|hard|difficult/.test(P) ? 0.05 : (/kids|kid|cozy/.test(P)?0.015:0.03);
    let jump = /parkour|ninja|high|bouncy/.test(P) ? 14 : 12; if (gravity<0.6) jump = Math.max(jump,13);
    if (design && design.knobs) { ({speed, gravity, platformRate, coinRate, hazardRate, jump} = {...{speed,gravity,platformRate,coinRate,hazardRate,jump}, ...design.knobs}); themeMode = design.knobs.theme || themeMode; }

    const config = {
      speed, gravity, theme: themeMode, platformRate, coinRate, hazardRate, jump,
      assets:{
        background: chosenBg?.path || null,
        player:     chosenPl?.path || null,
        playerFrame: chosenPl?.frame || null
      }
    };
    if (!config.assets.playerFrame && (config.assets.player||"").toLowerCase().includes("tilesheet")) {
      config.assets.playerFrame = { cols: 8, rows: 1 };
    }

    res.status(200).json({
      ok:true, message: useAI ? "AI design -> config" : "Config+assets generated from prompt",
      prompt,
      config,
      debug:{
        ai: useAI,
        counts:{ backgrounds:bgs.length, players:pls.length },
        chosen:{ background: chosenBg?.id || null, player: chosenPl?.id || null },
        design: design || null
      },
      ts: new Date().toISOString()
    });
  } catch {
    res.status(200).json({
      ok:true, message:"Default config (API error handled)",
      prompt:String((req.query && req.query.prompt) || ""),
      config:{
        speed:3, gravity:0.7, theme:'light',
        platformRate:0.06, coinRate:0.05, hazardRate:0.03, jump:12,
        assets:{ background:null, player:null, playerFrame:null }
      },
      ts:new Date().toISOString()
    });
  }
}

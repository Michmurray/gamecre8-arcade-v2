// api/generate.js
// Prompt → config + assets. Pulls /assets/manifest.json built by the Action.
// Smarter scoring (synonyms/weights) + tilesheet fallback (8x1).

export default async function handler(req, res) {
  try {
    const prompt = String((req.query?.prompt ?? '') || '');
    const p = prompt.toLowerCase();

    // ---------- tokenization ----------
    const words = new Set(
      p.replace(/[^a-z0-9\s]/g, " ")
       .split(/\s+/)
       .filter(Boolean)
    );
    const has = (...ws) => ws.some(w => words.has(w));

    // ---------- synonyms / tag buckets ----------
    const TAGS = {
      space:   ['space','galaxy','cosmos','moon','astro','star','sci-fi','scifi'],
      night:   ['night','dark','noir','midnight'],
      forest:  ['forest','woods','trees','woodland'],
      grass:   ['grass','field','meadow','plains'],
      desert:  ['desert','sand','sandy','dunes','hot'],
      fall:    ['fall','autumn','orange','leaf','leaves'],
      castle:  ['castle','medieval','keep','fortress','stone'],
      water:   ['water','ocean','sea','underwater','swim'],
      zombie:  ['zombie','undead','horror','ghoul'],
      soldier: ['soldier','army','military','troop','rifle','gun']
    };

    function bagScore(str) {
      const t = str.toLowerCase();
      let s = 0;
      for (const arr of Object.values(TAGS)) {
        if (arr.some(w => t.includes(w))) s += 1;
      }
      // bonus for exact word hits
      for (const w of words) if (t.includes(w)) s += 0.25;
      return s;
    }

    // ---------- gameplay knobs ----------
    let speed = 3;
    if (has('fast','speed','runner','dash','quick')) speed = 5;
    if (has('slow','chill','cozy')) speed = 2.5;

    let gravity = 0.7;
    if (has(...TAGS.space)) gravity = 0.4;
    if (has(...TAGS.water)) gravity = 0.5;
    if (has('heavy','hardcore')) gravity = 0.9;

    let theme = (has(...TAGS.night, ...TAGS.space, 'horror') ? 'dark' : 'light');

    let platformRate = 0.06;
    if (has('platformer','parkour','jump')) platformRate = 0.08;

    let coinRate = 0.05;
    if (has('collect','coin','ring','rings','gems','collectibles')) coinRate = 0.08;
    if (has('easy','kids','kid','cozy')) coinRate = 0.09;

    let hazardRate = 0.03;
    if (has('lava','spike','enemy','bullet','trap','hard','difficult')) hazardRate = 0.05;
    if (has('easy','kids','kid','cozy')) hazardRate = 0.015;

    let jump = 12;
    if (has('parkour','ninja','high','bouncy')) jump = 14;
    if (gravity < 0.6) jump = Math.max(jump, 13);

    // ---------- fetch manifest ----------
    const proto = (req.headers['x-forwarded-proto'] || 'https');
    const host  = req.headers.host;
    const url   = `${proto}://${host}/assets/manifest.json`;
    let manifest = null;
    try {
      const r = await fetch(url);
      if (r.ok) manifest = await r.json();
    } catch {}

    // ---------- choose assets ----------
    function pick(items, biasTags=[]) {
      if (!Array.isArray(items) || items.length === 0) return null;
      let best = items[0], bestS = -1;
      for (const it of items) {
        const label = (it.tags || []).concat(biasTags).join(' ');
        const s = bagScore(label);
        if (s > bestS) { bestS = s; best = it; }
      }
      return best;
    }

    const chosenBg = manifest ? pick(manifest.backgrounds, [
      has(...TAGS.space)   ? 'space'   : '',
      has(...TAGS.night)   ? 'night'   : '',
      has(...TAGS.forest)  ? 'forest'  : '',
      has(...TAGS.grass)   ? 'grass'   : '',
      has(...TAGS.desert)  ? 'desert'  : '',
      has(...TAGS.fall)    ? 'fall'    : '',
      has(...TAGS.castle)  ? 'castle'  : '',
      has(...TAGS.water)   ? 'water'   : ''
    ]) : null;

    const chosenPlayer = manifest ? pick(manifest.players, [
      has(...TAGS.zombie)  ? 'zombie'  : '',
      has(...TAGS.soldier) ? 'soldier' : ''
    ]) : null;

    const config = {
      speed, gravity, theme, platformRate, coinRate, hazardRate, jump,
      assets: {
        background: chosenBg?.path || null,
        player:     chosenPlayer?.path || null,
        playerFrame: chosenPlayer?.frame || null
      }
    };

    // tilesheet fallback (8x1) if no frame grid provided
    if (!config.assets.playerFrame && (config.assets.player || '').toLowerCase().includes('tilesheet')) {
      config.assets.playerFrame = { cols: 8, rows: 1 };
    }

    res.status(200).json({ ok:true, message:'Config+assets generated from prompt', prompt, config, ts:new Date().toISOString() });
  } catch {
    res.status(200).json({
      ok:true,
      message:'Default config (API error handled)',
      prompt:String(req.query?.prompt ?? ''),
      config:{
        speed:3, gravity:0.7, theme:'light',
        platformRate:0.06, coinRate:0.05, hazardRate:0.03, jump:12,
        assets:{ background:null, player:null, playerFrame:null }
      },
      ts:new Date().toISOString()
    });
  }
}
